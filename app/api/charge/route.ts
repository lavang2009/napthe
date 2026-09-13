import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, db } from '@/lib/firebase-admin';
import { requireUser } from '@/lib/auth-server';
import { encryptSecret, randomRequestId, validateEncryptionKey } from '@/lib/security';
import { TELCOS, AMOUNTS, chargingSign, saveProviderState, creditIfValid } from '@/lib/topup';
import { nappayRequest, statusLabel } from '@/lib/nappay';

export const runtime = 'nodejs';

function safeError(e: unknown) {
  if (e instanceof Error) return e.message;
  return 'UNEXPECTED_SERVER_ERROR';
}

export async function POST(req: NextRequest) {
  let stage = 'start';
  let requestId = '';
  try {
    stage = 'auth';
    const user = await requireUser(req);

    stage = 'parse_body';
    const body = await req.json();
    const telco = String(body.telco || '').toUpperCase().trim();
    const code = String(body.code || '').trim();
    const serial = String(body.serial || '').trim();
    const amount = Number(body.amount);

    if (!TELCOS.has(telco)) return NextResponse.json({ error: 'Nhà mạng không hợp lệ.' }, { status: 400 });
    if (!AMOUNTS.has(amount)) return NextResponse.json({ error: 'Mệnh giá không hợp lệ.' }, { status: 400 });
    if (!/^\d{8,20}$/.test(code) || !/^[A-Za-z0-9]{5,30}$/.test(serial)) {
      return NextResponse.json({ error: 'Mã thẻ hoặc serial không hợp lệ.' }, { status: 400 });
    }

    stage = 'config';
    const partnerId = process.env.NAPPAY_PARTNER_ID?.trim();
    const partnerKey = process.env.NAPPAY_PARTNER_KEY?.trim();
    if (!partnerId || !partnerKey) {
      return NextResponse.json({ error: 'Server chưa cấu hình NAPPAY_PARTNER_ID / NAPPAY_PARTNER_KEY.', stage }, { status: 500 });
    }

    stage = 'validate_encryption_key';
    validateEncryptionKey();

    stage = 'create_transaction';
    requestId = randomRequestId();
    const txRef = db().collection('cardTransactions').doc(requestId);
    await txRef.create({
      uid: user.uid,
      provider: 'nappay',
      requestId,
      telco,
      declaredAmount: amount,
      codeEncrypted: encryptSecret(code),
      serial,
      codeMasked: code.length > 4 ? `${code.slice(0, 2)}••••${code.slice(-2)}` : '••••',
      serialMasked: serial.length > 4 ? `${serial.slice(0, 2)}••••${serial.slice(-2)}` : '••••',
      status: 'submitted',
      providerStatus: 0,
      statusLabel: 'SUBMITTED',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    stage = 'nappay_sign';
    const sign = chargingSign({ partnerKey, code, partnerId, requestId, serial, telco });

    stage = 'nappay_request';
    const { httpStatus, data } = await nappayRequest({
      command: 'charging',
      partner_id: partnerId,
      request_id: requestId,
      telco,
      amount: String(amount),
      serial,
      code,
      sign,
    });

    stage = 'save_provider_response';
    if (httpStatus >= 400) {
      await txRef.set({
        status: 'failed',
        providerStatus: Number(data.status ?? -1),
        statusLabel: statusLabel(Number(data.status ?? -1)),
        providerMessage: String(data.message || `NAPPAY HTTP ${httpStatus}`),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return NextResponse.json({
        error: String(data.message || `NAPPAY trả HTTP ${httpStatus}`),
        providerStatus: Number(data.status ?? -1),
        request_id: requestId,
      }, { status: 502 });
    }

    await saveProviderState(requestId, data);

    stage = 'credit_if_valid';
    let credit = { credited: false, amount: 0 } as { credited: boolean; amount: number; alreadyCredited?: boolean; newBalance?: number };
    if (Number(data.status) === 1) {
      credit = await creditIfValid({ requestId, providerData: data });
    } else {
      await txRef.set({
        status: Number(data.status) === 99 ? 'pending' : 'failed',
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    return NextResponse.json({
      ok: true,
      request_id: requestId,
      status: Number(data.status),
      statusLabel: statusLabel(Number(data.status)),
      message: data.message || '',
      value: data.value ?? null,
      amount: data.amount ?? null,
      trans_id: data.trans_id ?? null,
      credited: Boolean(credit.credited),
      creditedAmount: credit.amount || 0,
    });
  } catch (e) {
    const message = safeError(e);
    const status = message === 'UNAUTHENTICATED' ? 401 : 500;
    console.error('[api/charge]', { stage, requestId: requestId || undefined, error: message });
    return NextResponse.json({
      ok: false,
      error: message === 'UNAUTHENTICATED' ? 'Bạn chưa đăng nhập.' : message,
      stage,
      request_id: requestId || undefined,
    }, { status });
  }
}
