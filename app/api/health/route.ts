import { NextResponse } from 'next/server';
import { getApps } from 'firebase-admin/app';
import { validateEncryptionKey } from '@/lib/security';
export const runtime='nodejs';
export async function GET(){
  let encryptionKey=false, encryptionKeyError='';
  try{validateEncryptionKey(); encryptionKey=true;}catch(e){encryptionKeyError=e instanceof Error?e.message:'INVALID';}
  const firebaseClient=Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY&&process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID&&process.env.NEXT_PUBLIC_FIREBASE_APP_ID);
  const firebaseAdmin=Boolean(process.env.FIREBASE_PROJECT_ID&&process.env.FIREBASE_CLIENT_EMAIL&&process.env.FIREBASE_PRIVATE_KEY);
  const nappay=Boolean(process.env.NAPPAY_PARTNER_ID&&process.env.NAPPAY_PARTNER_KEY);
  return NextResponse.json({ok:firebaseClient&&firebaseAdmin&&nappay&&encryptionKey,firebaseClient,firebaseAdmin,nappay,encryptionKey,encryptionKeyError:encryptionKeyError||undefined,initializedAdmin:getApps().length>0});
}
