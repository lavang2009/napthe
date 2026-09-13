import { NextResponse } from 'next/server';
import { getApps } from 'firebase-admin/app';

export const runtime = 'nodejs';

export async function GET() {
  const publicFirebase = Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
  const adminFirebase = Boolean(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);
  const nappay = Boolean(process.env.NAPPAY_PARTNER_ID && process.env.NAPPAY_PARTNER_KEY);
  return NextResponse.json({
    ok: publicFirebase && adminFirebase && nappay,
    firebaseClient: publicFirebase,
    firebaseAdmin: adminFirebase,
    nappay: nappay,
    initializedAdmin: getApps().length > 0,
  });
}
