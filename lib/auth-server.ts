import { NextRequest } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';

export async function requireUser(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('UNAUTHENTICATED');
  return adminAuth().verifyIdToken(token, true);
}

export async function requireAdmin(req: NextRequest) {
  const decoded = await requireUser(req);
  const email = String(decoded.email || '').trim().toLowerCase();
  const allowed = String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  if (!email || !allowed.includes(email)) throw new Error('FORBIDDEN');
  return decoded;
}
