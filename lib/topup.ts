import { db, FieldValue } from '@/lib/firebase-admin';
import { makeCheckSign, makeChargingSign, nappayRequest, statusLabel } from '@/lib/nappay';
import { decryptSecret } from '@/lib/security';

export const TELCOS = new Set(['VIETTEL', 'VINAPHONE', 'MOBIFONE', 'VNMOBI']);
export const AMOUNTS = new Set([5000, 10000, 20000, 30000, 50000, 100000, 200000, 300000, 500000, 1000000, 2000000, 5000000]);

export async function creditIfValid(params: {
  requestId: string;
  providerData: Record<string, unknown>;
}) {
  const { requestId, providerData } = params;
  if (Number(providerData.status) !== 1) return { credited: false, amount: 0 };
  const amount = Number(providerData.amount || 0);
  const value = Number(providerData.value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return { credited: false, amount: 0 };

  const txRef = db().collection('cardTransactions').doc(requestId);
  return db().runTransaction(async (tx) => {
    const txSnap = await tx.get(txRef);
    if (!txSnap.exists) throw new Error('TRANSACTION_NOT_FOUND');
    const txData = txSnap.data() || {};
    if (txData.creditedAt || txData.status === 'credited') {
      return { credited: false, alreadyCredited: true, amount: Number(txData.creditedAmount || 0) };
    }
    const uid = String(txData.uid || '');
    if (!uid) throw new Error('TRANSACTION_USER_MISSING');
    const userRef = db().collection('users').doc(uid);
    const userSnap = await tx.get(userRef);
    const current = Number(userSnap.get('balance') || 0);
    const newBalance = current + amount;
    tx.set(userRef, {
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

export async function saveProviderState(requestId: string, providerData: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const ref = db().collection('cardTransactions').doc(requestId);
  const existing = await ref.get();
  const patch: Record<string, unknown> = {
    providerStatus: Number(providerData.status ?? -1),
    statusLabel: statusLabel(Number(providerData.status ?? -1)),
    providerMessage: String(providerData.message || ''),
    transId: providerData.trans_id ?? null,
    realValue: Number(providerData.value || 0),
    receiveAmount: Number(providerData.amount || 0),
    updatedAt: FieldValue.serverTimestamp(),
    ...extra,
  };
  if (existing.get('status') === 'credited') {
    delete patch.statusLabel;
  }
  await ref.set(patch, { merge: true });
}

export async function checkProvider(requestId: string) {
  const partnerId = process.env.NAPPAY_PARTNER_ID;
  const partnerKey = process.env.NAPPAY_PARTNER_KEY;
  if (!partnerId || !partnerKey) throw new Error('NAP_PAY_NOT_CONFIGURED');
  const sign = makeCheckSign({ partnerKey, command: 'check', partnerId, requestId });
  const { data } = await nappayRequest({ command: 'check', partner_id: partnerId, request_id: requestId, sign });
  await saveProviderState(requestId, data);
  const credit = await creditIfValid({ requestId, providerData: data });
  return { data, credit };
}

export function chargingSign(args: { partnerKey: string; code: string; partnerId: string; requestId: string; serial: string; telco: string }) {
  return makeChargingSign({ ...args, command: 'charging' });
}

export function decryptCardCode(encrypted: string) {
  return decryptSecret(encrypted);
}
