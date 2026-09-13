import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { requireUser } from '@/lib/auth-server';
export const runtime = 'nodejs';
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get('limit') || 30), 1), 100);
    const snap = await db().collection('cardTransactions').where('uid', '==', user.uid).limit(limit).get();
    const rows = snap.docs.map((d) => {
      const x = d.data();
      return { requestId: d.id, telco: x.telco, declaredAmount: Number(x.declaredAmount || 0), realValue: Number(x.realValue || x.value || 0), receiveAmount: Number(x.receiveAmount || 0), creditedAmount: Number(x.creditedAmount || 0), status: x.status, providerStatus: Number(x.providerStatus ?? -1), statusLabel: x.statusLabel, providerMessage: x.providerMessage || '', createdAt: x.createdAt?.toDate?.()?.toISOString?.() || null, updatedAt: x.updatedAt?.toDate?.()?.toISOString?.() || null };
    }).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return NextResponse.json({ ok: true, rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error';
    return NextResponse.json({ error: msg === 'UNAUTHENTICATED' ? 'Bạn chưa đăng nhập.' : msg }, { status: msg === 'UNAUTHENTICATED' ? 401 : 500 });
  }
}
