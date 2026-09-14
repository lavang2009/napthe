import { db, FieldValue } from '@/lib/firebase-admin';
import { checkSign, nappayRequest, statusLabel } from '@/lib/nappay';
import { decryptSecret, encryptSecret } from '@/lib/security';

export const TELCOS = new Set(['VIETTEL', 'VINAPHONE', 'MOBIFONE', 'VNMOBI']);
export const AMOUNTS = new Set([5000, 10000, 20000, 30000, 50000, 100000, 200000, 300000, 500000, 1000000, 2000000, 5000000]);

function num(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}


export async function createCardTransaction(args: {
  requestId: string;
  uid: string;
  telco: string;
  declaredAmount: number;
  code: string;
  serial: string;
  fingerprint: string;
}) {
  const txRef = db().collection('cardTransactions').doc(args.requestId);
  const lockRef = db().collection('cardFingerprints').doc(args.fingerprint);

  return db().runTransaction(async (tx) => {
    const existingLock = await tx.get(lockRef);
    if (existingLock.exists) {
      const existing = existingLock.data() || {};
      throw new Error(`CARD_ALREADY_SUBMITTED:${String(existing.requestId || '')}`);
    }

    tx.create(txRef, {
      uid: args.uid,
      provider: 'nappay',
      requestId: args.requestId,
      telco: args.telco,
      declaredAmount: args.declaredAmount,
      cardFingerprint: args.fingerprint,
      codeEncrypted: encryptSecret(args.code),
      serialEncrypted: encryptSecret(args.serial),
      codeMasked: `${args.code.slice(0, 2)}••••${args.code.slice(-2)}`,
      serialMasked: `${args.serial.slice(0, 2)}••••${args.serial.slice(-2)}`,
      status: 'submitted',
      providerStatus: 0,
      statusLabel: 'SUBMITTED',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    tx.create(lockRef, {
      requestId: args.requestId,
      uid: args.uid,
      createdAt: FieldValue.serverTimestamp(),
    });

    return true;
  });
}

export async function saveProviderState(requestId: string, providerData: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const ref = db().collection('cardTransactions').doc(requestId);
  const existing = await ref.get();
  const status = num(providerData.status);
  const patch: Record<string, unknown> = {
    providerStatus: status,
    statusLabel: statusLabel(status),
    providerMessage: String(providerData.message || ''),
    transId: providerData.trans_id ?? null,
    realValue: num(providerData.value),
    receiveAmount: num(providerData.amount),
    declaredValueFromProvider: num(providerData.declared_value),
    updatedAt: FieldValue.serverTimestamp(),
    ...extra,
  };

  if (existing.exists && existing.get('status') === 'credited') {
    delete patch.statusLabel;
    delete patch.status;
  } else if (status === 99) {
    patch.status = 'pending';
  } else if (status === 1) {
    patch.status = 'provider_success';
  } else {
    patch.status = 'failed';
  }

  await ref.set(patch, { merge: true });
}

export async function markUnknown(requestId: string, message: string) {
  await db().collection('cardTransactions').doc(requestId).set({
    status: 'provider_unknown',
    statusLabel: 'PROVIDER_UNKNOWN',
    providerMessage: message.slice(0, 500),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

export async function creditIfValid(requestId: string, providerData: Record<string, unknown>) {
  if (num(providerData.status) !== 1) return { credited: false, alreadyCredited: false, amount: 0 };

  const amount = num(providerData.amount);
  const value = num(providerData.value);
  if (amount <= 0) throw new Error('NAPPAY_SUCCESS_WITHOUT_AMOUNT');

  const txRef = db().collection('cardTransactions').doc(requestId);
  return db().runTransaction(async (tx) => {
    const txSnap = await tx.get(txRef);
    if (!txSnap.exists) throw new Error('TRANSACTION_NOT_FOUND');
    const txData = txSnap.data() || {};

    if (txData.creditedAt || txData.status === 'credited') {
      return { credited: false, alreadyCredited: true, amount: num(txData.creditedAmount) };
    }

    const uid = String(txData.uid || '').trim();
    if (!uid) throw new Error('TRANSACTION_USER_MISSING');

    const userRef = db().collection('users').doc(uid);
    const userSnap = await tx.get(userRef);
    const current = num(userSnap.data()?.balance);
    const newBalance = current + amount;

    tx.set(userRef, {
      uid,
      balance: newBalance,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    tx.update(txRef, {
      status: 'credited',
      providerStatus: 1,
      statusLabel: 'VALID_CARD',
      creditedAmount: amount,
      realValue: value,
      creditedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      providerMessage: String(providerData.message || ''),
      transId: providerData.trans_id ?? null,
    });

    return { credited: true, alreadyCredited: false, amount, newBalance };
  });
}

export async function checkProvider(requestId: string) {
  const partnerId = process.env.NAPPAY_PARTNER_ID?.trim();
  const partnerKey = process.env.NAPPAY_PARTNER_KEY?.trim();
  if (!partnerId || !partnerKey) throw new Error('NAPPAY_NOT_CONFIGURED');

  const ref = db().collection('cardTransactions').doc(requestId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('TRANSACTION_NOT_FOUND');
  const tx = snap.data() || {};
  const preferredEndpoint = typeof tx.providerEndpoint === 'string' ? tx.providerEndpoint.trim() : undefined;

  const sign = checkSign({ partnerKey, partnerId, requestId });
  const result = await nappayRequest(
    { command: 'check', partner_id: partnerId, request_id: requestId, sign },
    preferredEndpoint,
  );
  const data = result.data;

  await saveProviderState(requestId, data, {
    lastCheckedAt: FieldValue.serverTimestamp(),
    providerEndpoint: result.endpoint,
  });
  const credit = await creditIfValid(requestId, data);
  return { ...result, credit };
}

export function decryptCardCode(encrypted: string) { return decryptSecret(encrypted); }
