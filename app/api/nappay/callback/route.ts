import { NextRequest, NextResponse } from 'next/server';
import { db, FieldValue } from '@/lib/firebase-admin';
import { callbackSign } from '@/lib/nappay';
import { decryptSecret, safeEqualHex } from '@/lib/security';
import { creditIfValid, saveProviderState } from '@/lib/topup';

export const runtime = 'nodejs';

async function readBody(req: NextRequest) {
  const type = req.headers.get('content-type') || '';
  if (type.includes('application/json')) return await req.json() as Record<string, unknown>;
  return Object.fromEntries(new URLSearchParams(await req.text()).entries()) as Record<string, unknown>;
}

export async function GET() {
  return NextResponse.json({ ok: true, message: 'NAPPAY callback endpoint is online. POST is used for callbacks.' });
}

export async function POST(req: NextRequest) {
  try {
    const data = await readBody(req);
    const requestId = String(data.request_id || '').trim();
    if (!requestId) return NextResponse.json({ ok: false, error: 'missing_request_id' }, { status: 400 });

    const ref = db().collection('cardTransactions').doc(requestId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ ok: false, error: 'transaction_not_found' }, { status: 404 });

    const tx = snap.data() || {};
    if (tx.status === 'credited') {
      return NextResponse.json({ ok: true, credited: true, alreadyCredited: true, creditedAmount: Number(tx.creditedAmount || 0) });
    }

    const partnerKey = process.env.NAPPAY_PARTNER_KEY?.trim();
    if (!partnerKey) return NextResponse.json({ ok: false, error: 'NAPPAY_NOT_CONFIGURED' }, { status: 500 });

    const code = decryptSecret(String(tx.codeEncrypted || ''));
    const serial = tx.serialEncrypted ? decryptSecret(String(tx.serialEncrypted)) : String(tx.serial || '');
    const expected = callbackSign({ partnerKey, code, serial });
    const actual = String(data.callback_sign || data.sign || '').trim().toLowerCase();

    if (!safeEqualHex(actual, expected)) return NextResponse.json({ ok: false, error: 'invalid_signature' }, { status: 403 });

    const providerData = {
      status: Number(data.status ?? -1),
      message: data.message || '',
      trans_id: data.trans_id ?? null,
      request_id: requestId,
      value: data.value ?? 0,
      amount: data.amount ?? 0,
      declared_value: data.declared_value ?? 0,
      telco: data.telco || tx.telco,
    };

    await saveProviderState(requestId, providerData, { callbackReceivedAt: FieldValue.serverTimestamp() });
    const credit = await creditIfValid(requestId, providerData);

    return NextResponse.json({ ok: true, credited: credit.credited, alreadyCredited: credit.alreadyCredited, creditedAmount: credit.amount || 0 });
  } catch (e) {
    console.error('[nappay/callback]', e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'CALLBACK_ERROR' }, { status: 500 });
  }
}
