import { NextResponse } from 'next/server';
import { getApps } from 'firebase-admin/app';
import { validateEncryptionKey } from '@/lib/security';
export const runtime='nodejs';
export async function GET(){
  let encryptionKey=false,encryptionKeyError='';
  try{validateEncryptionKey();encryptionKey=true;}catch(e){encryptionKeyError=e instanceof Error?e.message:'INVALID';}
  const firebaseClient=Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY&&process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID&&process.env.NEXT_PUBLIC_FIREBASE_APP_ID);
  const firebaseAdmin=Boolean(process.env.FIREBASE_PROJECT_ID&&process.env.FIREBASE_CLIENT_EMAIL&&process.env.FIREBASE_PRIVATE_KEY);
  const nappay=Boolean(process.env.NAPPAY_PARTNER_ID&&process.env.NAPPAY_PARTNER_KEY);
  const endpoints=(process.env.NAPPAY_ENDPOINTS||process.env.NAPPAY_ENDPOINT||'https://nappay.vn/chargingws/v2,https://app.nappay.vn/chargingws/v2').split(',').map(v=>v.trim()).filter(Boolean);
  return NextResponse.json({ok:firebaseClient&&firebaseAdmin&&nappay&&encryptionKey,firebaseClient,firebaseAdmin,nappay,encryptionKey,encryptionKeyError:encryptionKeyError||undefined,initializedAdmin:getApps().length>0,nappayEndpoints:endpoints.map(v=>new URL(v).host)});
}
