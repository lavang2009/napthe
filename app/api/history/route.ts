import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { requireUser } from '@/lib/auth-server';
export const runtime='nodejs';
export async function GET(req:NextRequest){
  try{
    const user=await requireUser(req); const limit=Math.min(Math.max(Number(req.nextUrl.searchParams.get('limit')||50),1),100);
    const snap=await db().collection('cardTransactions').where('uid','==',user.uid).limit(limit).get();
    const rows=snap.docs.map(d=>{const x=d.data();return {requestId:d.id,telco:String(x.telco||''),declaredAmount:Number(x.declaredAmount||0),realValue:Number(x.realValue||0),receiveAmount:Number(x.receiveAmount||0),creditedAmount:Number(x.creditedAmount||0),status:String(x.status||''),providerStatus:Number(x.providerStatus??-1),statusLabel:String(x.statusLabel||''),providerMessage:String(x.providerMessage||''),createdAt:x.createdAt?.toDate?.()?.toISOString?.()||null,updatedAt:x.updatedAt?.toDate?.()?.toISOString?.()||null};}).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
    return NextResponse.json({ok:true,rows});
  }catch(e){const m=e instanceof Error?e.message:'SERVER_ERROR';return NextResponse.json({error:m},{status:m==='UNAUTHENTICATED'?401:500});}
}
