import { db, FieldValue } from '@/lib/firebase-admin';
import { checkSign, chargingSign, nappayRequest, statusLabel } from '@/lib/nappay';
import { decryptSecret } from '@/lib/security';

export const TELCOS = new Set(['VIETTEL','VINAPHONE','MOBIFONE','VNMOBI']);
export const AMOUNTS = new Set([5000,10000,20000,30000,50000,100000,200000,300000,500000,1000000,2000000,5000000]);

function num(v: unknown) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

export async function saveProviderState(requestId: string, providerData: Record<string,unknown>, extra: Record<string,unknown> = {}) {
  const ref = db().collection('cardTransactions').doc(requestId);
  const existing = await ref.get();
  const status = num(providerData.status);
  const patch: Record<string,unknown> = {
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
  } else if (status === 99) patch.status = 'pending';
  else if (status === 1) patch.status = 'provider_success';
  else patch.status = 'failed';
  await ref.set(patch, {merge:true});
}

export async function creditIfValid(requestId: string, providerData: Record<string,unknown>) {
  if (num(providerData.status) !== 1) return {credited:false, alreadyCredited:false, amount:0};
  const amount = num(providerData.amount);
  const value = num(providerData.value);
  if (amount <= 0) throw new Error('NAPPAY_SUCCESS_WITHOUT_AMOUNT');

  const txRef = db().collection('cardTransactions').doc(requestId);
  return db().runTransaction(async tx => {
    const txSnap = await tx.get(txRef);
    if (!txSnap.exists) throw new Error('TRANSACTION_NOT_FOUND');
    const txData = txSnap.data() || {};
    if (txData.creditedAt || txData.status === 'credited') {
      return {credited:false, alreadyCredited:true, amount:num(txData.creditedAmount)};
    }
    const uid = String(txData.uid || '').trim();
    if (!uid) throw new Error('TRANSACTION_USER_MISSING');
    const userRef = db().collection('users').doc(uid);
    const userSnap = await tx.get(userRef);
    const current = num(userSnap.data()?.balance);
    const newBalance = current + amount;
    tx.set(userRef, {uid, balance:newBalance, updatedAt:FieldValue.serverTimestamp()}, {merge:true});
    tx.update(txRef, {
      status:'credited', providerStatus:1, statusLabel:'VALID_CARD', creditedAmount:amount,
      realValue:value, creditedAt:FieldValue.serverTimestamp(), updatedAt:FieldValue.serverTimestamp(),
      providerMessage:String(providerData.message || ''), transId:providerData.trans_id ?? null,
    });
    return {credited:true, alreadyCredited:false, amount, newBalance};
  });
}

export async function checkProvider(requestId: string) {
  const partnerId = process.env.NAPPAY_PARTNER_ID?.trim();
  const partnerKey = process.env.NAPPAY_PARTNER_KEY?.trim();
  if (!partnerId || !partnerKey) throw new Error('NAPPAY_NOT_CONFIGURED');
  const sign = checkSign({partnerKey, partnerId, requestId});
  const {httpStatus, data} = await nappayRequest({command:'check',partner_id:partnerId,request_id:requestId,sign});
  if (httpStatus >= 400) throw new Error(String(data.message || `NAPPAY_HTTP_${httpStatus}`));
  await saveProviderState(requestId, data);
  const credit = await creditIfValid(requestId, data);
  return {data, credit};
}

export function decryptCardCode(encrypted: string) { return decryptSecret(encrypted); }
export { chargingSign };
