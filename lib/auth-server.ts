import { NextRequest } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';

function bearer(req: NextRequest) {
  return req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || '';
}

export async function requireUser(req: NextRequest) {
  const token = bearer(req);
  if (!token) throw new Error('UNAUTHENTICATED');
  return adminAuth().verifyIdToken(token, true);
}

export async function requireAdmin(req: NextRequest) {
  const decoded = await requireUser(req);
  const email = String(decoded.email || '').trim().toLowerCase();
  const configured = String(process.env.ADMIN_EMAILS || '')
    .split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
  const customClaim = decoded.admin === true;
  if (!customClaim && (!email || !configured.includes(email))) throw new Error('FORBIDDEN');
  return decoded;
}
