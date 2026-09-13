import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { requireAdmin } from '@/lib/auth-server';
export const runtime = 'nodejs';
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get('limit') || 100), 1), 300);
    const snap = await db().collection('cardTransactions').orderBy('createdAt', 'desc').limit(limit).get();
    const rows = snap.docs.map((d) => { const x = d.data(); return { requestId: d.id, uid: x.uid || '', telco: x.telco || '', declaredAmount: Number(x.declaredAmount || 0), realValue: Number(x.realValue || 0), receiveAmount: Number(x.receiveAmount || 0), creditedAmount: Number(x.creditedAmount || 0), providerStatus: Number(x.providerStatus ?? -1), status: x.status || '', statusLabel: x.statusLabel || '', providerMessage: x.providerMessage || '', transId: x.transId ?? null, createdAt: x.createdAt?.toDate?.()?.toISOString?.() || null, updatedAt: x.updatedAt?.toDate?.()?.toISOString?.() || null }; });
    return NextResponse.json({ ok: true, rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error';
    const code = msg === 'UNAUTHENTICATED' ? 401 : msg === 'FORBIDDEN' ? 403 : 500;
    return NextResponse.json({ error: code === 403 ? 'Tài khoản không có quyền quản trị.' : code === 401 ? 'Bạn chưa đăng nhập.' : msg }, { status: code });
  }
}
