import crypto from 'node:crypto';

export type NappayResponse = {
  status: number;
  message?: string;
  trans_id?: number | string;
  request_id?: string;
  amount?: number | string;
  value?: number | string;
  declared_value?: number | string;
  telco?: string;
  serial?: string;
  code?: string;
  callback_sign?: string;
  [key: string]: unknown;
};

function md5(value: string) {
  return crypto.createHash('md5').update(value).digest('hex');
}

export function makeChargingSign(args: { partnerKey: string; code: string; command: string; partnerId: string; requestId: string; serial: string; telco: string; }) {
  return md5(args.partnerKey + args.code + args.command + args.partnerId + args.requestId + args.serial + args.telco);
}

export function makeCheckSign(args: { partnerKey: string; command: string; partnerId: string; requestId: string; }) {
  return md5(args.partnerKey + args.command + args.partnerId + args.requestId);
}

export async function nappayRequest(payload: Record<string, string>) {
  const endpoint = process.env.NAPPAY_ENDPOINT || 'https://app.nappay.vn/chargingws/v2';
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(payload).toString(),
    cache: 'no-store'
  });
  const text = await res.text();
  let data: NappayResponse;
  try { data = JSON.parse(text); } catch { throw new Error(`NAPPAY returned non-JSON (${res.status})`); }
  return { httpStatus: res.status, data };
}

export function statusLabel(status: number) {
  return ({99:'PENDING',1:'VALID_CARD',2:'CARD_WRONG_VALUE',3:'INVALID_CARD',4:'MAINTENANCE'} as Record<number,string>)[status] || `ERROR_${status}`;
}
