import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { requireUser } from '@/lib/auth-server';
export const runtime = 'nodejs';
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const snap = await db().collection('users').doc(user.uid).get();
    const data = snap.exists ? snap.data() : {};
    const adminEmails = String(process.env.ADMIN_EMAILS || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
    return NextResponse.json({ ok: true, uid: user.uid, email: user.email || '', displayName: data?.displayName || user.name || user.email?.split('@')[0] || 'Người dùng', balance: Number(data?.balance || 0), isAdmin: adminEmails.includes(String(user.email || '').toLowerCase()) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error';
    return NextResponse.json({ error: msg === 'UNAUTHENTICATED' ? 'Bạn chưa đăng nhập.' : msg }, { status: msg === 'UNAUTHENTICATED' ? 401 : 500 });
  }
}
