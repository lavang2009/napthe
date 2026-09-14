import { NextRequest, NextResponse } from 'next/server';
import { db, FieldValue } from '@/lib/firebase-admin';
import { requireUser } from '@/lib/auth-server';
import { encryptSecret, randomRequestId, validateEncryptionKey, cardFingerprint } from '@/lib/security';
import { AMOUNTS, TELCOS, creditIfValid, saveProviderState, markUnknown, createCardTransaction } from '@/lib/topup';
import { nappayRequest, chargingSign, statusLabel } from '@/lib/nappay';

export const runtime = 'nodejs';

function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : 'UNEXPECTED_SERVER_ERROR';
}

export async function GET() {
  return NextResponse.json({ ok: true, message: 'Charge endpoint online. Use POST with Firebase Bearer token to submit a card.' });
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

    if (!TELCOS.has(telco)) return NextResponse.json({ ok: false, error: 'Nhà mạng không hợp lệ.' }, { status: 400 });
    if (!AMOUNTS.has(amount)) return NextResponse.json({ ok: false, error: 'Mệnh giá không hợp lệ.' }, { status: 400 });
    if (!/^\d{8,25}$/.test(code) || !/^[A-Za-z0-9]{5,35}$/.test(serial)) {
      return NextResponse.json({ ok: false, error: 'Mã thẻ hoặc serial không hợp lệ.' }, { status: 400 });
    }

    stage = 'config';
    const partnerId = process.env.NAPPAY_PARTNER_ID?.trim();
    const partnerKey = process.env.NAPPAY_PARTNER_KEY?.trim();
    if (!partnerId || !partnerKey) throw new Error('NAPPAY_NOT_CONFIGURED');

    stage = 'validate_encryption_key';
    validateEncryptionKey();

    requestId = randomRequestId();
    const fingerprint = cardFingerprint(telco, serial, code);

    stage = 'create_transaction';
    try {
      await createCardTransaction({ requestId, uid: user.uid, telco, declaredAmount: amount, code, serial, fingerprint });
    } catch (e) {
      const message = errorMessage(e);
      if (message.startsWith('CARD_ALREADY_SUBMITTED:')) {
        const existingId = message.split(':')[1] || '';
        return NextResponse.json({
          ok: false,
          error: 'Thẻ này đã được gửi trước đó. Không gửi lại để tránh cộng tiền trùng.',
          request_id: existingId || undefined,
        }, { status: 409 });
      }
      throw e;
    }

    stage = 'sign';
    const sign = chargingSign({ partnerKey, code, partnerId, requestId, serial, telco });

    stage = 'nappay_request';
    try {
      const result = await nappayRequest({
        command: 'charging',
        partner_id: partnerId,
        request_id: requestId,
        telco,
        amount: String(amount),
        serial,
        code,
        sign,
      });

      stage = 'save_response';
      await saveProviderState(requestId, result.data, { providerEndpoint: result.endpoint });

      const providerStatus = Number(result.data.status ?? -1);
      if (providerStatus >= 100) {
        return NextResponse.json({
          ok: false,
          error: String(result.data.message || statusLabel(providerStatus)),
          request_id: requestId,
          status: providerStatus,
          statusLabel: statusLabel(providerStatus),
          endpoint: result.endpoint,
          attempts: result.attempts,
        }, { status: 502 });
      }

      stage = 'credit';
      const credit = await creditIfValid(requestId, result.data);
      return NextResponse.json({
        ok: true,
        request_id: requestId,
        status: providerStatus,
        statusLabel: statusLabel(providerStatus),
        message: String(result.data.message || ''),
        value: result.data.value ?? null,
        amount: result.data.amount ?? null,
        trans_id: result.data.trans_id ?? null,
        credited: credit.credited || credit.alreadyCredited,
        creditedAmount: credit.amount || 0,
      });
    } catch (providerError) {
      // A network timeout can mean NAPPAY received the charging request but the response was lost.
      // Never submit the same card again automatically. Mark as unknown and let /api/check resolve it.
      await markUnknown(requestId, errorMessage(providerError));
      console.error('[api/charge:nappay_request]', {
        stage,
        requestId,
        error: errorMessage(providerError),
        attempts: (providerError as Error & { attempts?: unknown }).attempts,
      });
      return NextResponse.json({
        ok: true,
        request_id: requestId,
        status: 99,
        statusLabel: 'PENDING',
        providerUnknown: true,
        message: 'Không nhận được phản hồi trực tiếp từ NAPPAY. Giao dịch được giữ lại để hệ thống kiểm tra tự động.',
      }, { status: 202 });
    }
  } catch (e) {
    const message = errorMessage(e);
    console.error('[api/charge]', { stage, requestId, error: message });
    const status = message === 'UNAUTHENTICATED' ? 401 : message === 'NAPPAY_NOT_CONFIGURED' || message.startsWith('APP_ENCRYPTION_KEY') ? 500 : 500;
    return NextResponse.json({ ok: false, error: message === 'UNAUTHENTICATED' ? 'Bạn chưa đăng nhập.' : message, stage, request_id: requestId || undefined }, { status });
  }
}
