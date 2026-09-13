import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, db } from '@/lib/firebase-admin';
import { requireUser } from '@/lib/auth-server';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const displayName = String(body.displayName || user.name || user.email?.split('@')[0] || 'Người dùng').trim().slice(0, 80);
    const userRef = db().collection('users').doc(user.uid);
    const existing = await userRef.get();
    await userRef.set({ uid: user.uid, email: user.email || '', displayName, balance: Number(existing.get('balance') || 0), createdAt: existing.exists ? existing.get('createdAt') : FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return NextResponse.json({ ok: true, uid: user.uid });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error';
    return NextResponse.json({ error: msg === 'UNAUTHENTICATED' ? 'Bạn chưa đăng nhập.' : msg }, { status: msg === 'UNAUTHENTICATED' ? 401 : 500 });
  }
}
