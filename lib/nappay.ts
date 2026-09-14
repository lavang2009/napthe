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

const DEFAULT_ENDPOINTS = [
  // Current NAPPAY Charging v2 endpoint from the Merchant API documentation.
  'https://app.nappay.vn/chargingws/v2',
  // Legacy/fallback host kept only for compatibility.
  'https://nappay.vn/chargingws/v2',
];

function md5(value: string) {
  return crypto.createHash('md5').update(value, 'utf8').digest('hex');
}

export function chargingSign(args: { partnerKey: string; code: string; partnerId: string; requestId: string; serial: string; telco: string }) {
  return md5(args.partnerKey + args.code + 'charging' + args.partnerId + args.requestId + args.serial + args.telco);
}

export function checkSign(args: { partnerKey: string; partnerId: string; requestId: string }) {
  return md5(args.partnerKey + 'check' + args.partnerId + args.requestId);
}

export function callbackSign(args: { partnerKey: string; code: string; serial: string }) {
  return md5(args.partnerKey + args.code + args.serial);
}

export function statusLabel(status: number) {
  const labels: Record<number, string> = {
    1: 'VALID_CARD',
    2: 'CARD_WRONG_VALUE',
    3: 'INVALID_CARD',
    4: 'MAINTENANCE',
    99: 'PENDING',
    100: 'REQUEST_ERROR',
    101: 'TRANSACTION_NOT_FOUND',
    102: 'AUTH_OR_DATA_ERROR',
    103: 'PROVIDER_EXCEPTION',
    104: 'INVALID_COMMAND',
  };
  return labels[status] || `ERROR_${status}`;
}

function endpoints() {
  const configured = (process.env.NAPPAY_ENDPOINTS || process.env.NAPPAY_ENDPOINT || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  return [...new Set([...configured, ...DEFAULT_ENDPOINTS])];
}

function networkErrorMessage(error: unknown) {
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: unknown }).cause;
    if (cause instanceof Error && cause.message) return `${error.message}: ${cause.message}`;
    if (typeof cause === 'string' && cause) return `${error.message}: ${cause}`;
    return error.message;
  }
  return 'NETWORK_ERROR';
}

export async function nappayRequest(payload: Record<string, string>, preferredEndpoint?: string) {
  const timeoutMs = Math.min(Math.max(Number(process.env.NAPPAY_TIMEOUT_MS || 15000), 5000), 30000);
  const attempts: Array<{ endpoint: string; error?: string; httpStatus?: number; status?: number | string }> = [];

  const allEndpoints = endpoints();
  const orderedEndpoints = preferredEndpoint
    ? [preferredEndpoint, ...allEndpoints.filter((endpoint) => endpoint !== preferredEndpoint)]
    : allEndpoints;

  for (const endpoint of orderedEndpoints) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
          accept: 'application/json, text/plain, */*',
          'user-agent': 'NAPPAY-Vercel-Client/2.1',
        },
        body: new URLSearchParams(payload).toString(),
        cache: 'no-store',
        signal: controller.signal,
      });
      const text = await res.text();
      let data: NappayResponse;
      try {
        data = JSON.parse(text) as NappayResponse;
      } catch {
        attempts.push({ endpoint, httpStatus: res.status, error: `NON_JSON_RESPONSE_${res.status}` });
        if (res.status >= 500) continue;
        throw new Error(`NAPPAY_NON_JSON_HTTP_${res.status}`);
      }

      attempts.push({ endpoint, httpStatus: res.status, status: data.status });

      // A stateful check can legitimately return 101 on one host when the original
      // charging request was recorded by the other host. Try the next host for CHECK
      // before accepting TRANSACTION_NOT_FOUND. Never do this for CHARGING.
      if (payload.command === 'check' && Number(data.status) === 101 && orderedEndpoints.length > 1) {
        continue;
      }

      if (res.status >= 500 && orderedEndpoints.length > 1) continue;
      return { httpStatus: res.status, data, endpoint, attempts };
    } catch (error) {
      const message = networkErrorMessage(error);
      attempts.push({ endpoint, error: message });
      continue;
    } finally {
      clearTimeout(timeout);
    }
  }

  const detail = attempts.map((a) => `${a.endpoint} => ${a.error || `HTTP_${a.httpStatus}_${String(a.status ?? '')}`}`).join(' | ');
  const error = new Error(`NAPPAY_NETWORK_UNAVAILABLE${detail ? `: ${detail}` : ''}`);
  (error as Error & { attempts?: typeof attempts }).attempts = attempts;
  throw error;
}
