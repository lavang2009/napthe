import { NextRequest, NextResponse } from 'next/server';
import { db, FieldValue } from '@/lib/firebase-admin';
import { creditIfValid, saveProviderState } from '@/lib/topup';
import { decryptSecret } from '@/lib/security';
import crypto from 'node:crypto';
export const runtime = 'nodejs';
function md5(value: string) { return crypto.createHash('md5').update(value).digest('hex'); }
async function readBody(req: NextRequest) { const type = req.headers.get('content-type') || ''; if (type.includes('application/json')) return await req.json(); return Object.fromEntries(new URLSearchParams(await req.text()).entries()); }
export async function GET() { return NextResponse.json({ ok: true, message: 'NAPPAY callback endpoint is online. Use POST for callbacks.' }); }

export async function POST(req: NextRequest) {
  try {
    const body = await readBody(req); const requestId = String(body.request_id || '').trim(); const callbackSign = String(body.callback_sign || body.sign || '').trim().toLowerCase();
    if (!requestId) return NextResponse.json({ ok:false, error:'missing_request_id' }, { status:400 });
    const ref = db().collection('cardTransactions').doc(requestId); const snap = await ref.get(); if (!snap.exists) return NextResponse.json({ ok:false, error:'transaction_not_found' }, { status:404 });
    const data = snap.data() || {};
    if (data.status === 'credited') return NextResponse.json({ ok:true, credited:true, alreadyCredited:true, creditedAmount:Number(data.creditedAmount || 0) });
    const originalCode = decryptSecret(String(data.codeEncrypted || '')); const originalSerial = String(data.serial || ''); const expected = md5(`${process.env.NAPPAY_PARTNER_KEY || ''}${originalCode}${originalSerial}`);
    const actual = Buffer.from(callbackSign), expectedBuf = Buffer.from(expected); if (actual.length !== expectedBuf.length || !crypto.timingSafeEqual(actual, expectedBuf)) return NextResponse.json({ ok:false, error:'invalid_signature' }, { status:403 });
    const providerData: Record<string, unknown> = { status:Number(body.status ?? -1), message:body.message || '', trans_id:body.trans_id ?? null, request_id:requestId, value:body.value ?? 0, amount:body.amount ?? 0, telco:body.telco || data.telco };
    await saveProviderState(requestId, providerData, { callbackReceivedAt: FieldValue.serverTimestamp() });
    const credit = await creditIfValid({ requestId, providerData });
    if (Number(providerData.status) !== 1) await ref.set({ status:Number(providerData.status) === 99 ? 'pending' : 'failed' }, { merge:true });
    return NextResponse.json({ ok:true, credited:credit.credited, creditedAmount:credit.amount || 0 });
  } catch (e) { return NextResponse.json({ ok:false, error:e instanceof Error ? e.message : 'callback_error' }, { status:500 }); }
}
