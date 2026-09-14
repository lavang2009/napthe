import crypto from 'node:crypto';

export type NappayResponse = {
  status?: number | string;
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

const DEFAULT_ENDPOINT = 'https://app.nappay.vn/chargingws/v2';

function md5(value: string) { return crypto.createHash('md5').update(value, 'utf8').digest('hex'); }

export function chargingSign(args: {partnerKey:string;code:string;partnerId:string;requestId:string;serial:string;telco:string}) {
  return md5(args.partnerKey + args.code + 'charging' + args.partnerId + args.requestId + args.serial + args.telco);
}
export function checkSign(args: {partnerKey:string;partnerId:string;requestId:string}) {
  return md5(args.partnerKey + 'check' + args.partnerId + args.requestId);
}
export function callbackSign(args: {partnerKey:string;code:string;serial:string}) {
  return md5(args.partnerKey + args.code + args.serial);
}

export function statusLabel(status: number) {
  const labels: Record<number,string> = {
    1:'VALID_CARD', 2:'CARD_WRONG_VALUE', 3:'INVALID_CARD', 4:'MAINTENANCE', 99:'PENDING'
  };
  return labels[status] || `ERROR_${status}`;
}

export async function nappayRequest(payload: Record<string,string>) {
  const endpoint = process.env.NAPPAY_ENDPOINT?.trim() || DEFAULT_ENDPOINT;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {'content-type':'application/x-www-form-urlencoded', 'accept':'application/json,text/plain,*/*'},
      body: new URLSearchParams(payload).toString(),
      cache: 'no-store', signal: controller.signal,
    });
    const text = await res.text();
    let data: NappayResponse;
    try { data = JSON.parse(text); }
    catch { throw new Error(`NAPPAY_NON_JSON_HTTP_${res.status}`); }
    return {httpStatus:res.status, data};
  } finally { clearTimeout(timeout); }
}
