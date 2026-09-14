import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { requireAdmin } from '@/lib/auth-server';
export const runtime='nodejs';
export async function GET(req:NextRequest){
  try{
    await requireAdmin(req); const limit=Math.min(Math.max(Number(req.nextUrl.searchParams.get('limit')||200),1),500);
    const snap=await db().collection('cardTransactions').limit(limit).get();
    const rows=snap.docs.map(d=>{const x=d.data();return {requestId:d.id,uid:String(x.uid||''),telco:String(x.telco||''),declaredAmount:Number(x.declaredAmount||0),realValue:Number(x.realValue||0),receiveAmount:Number(x.receiveAmount||0),creditedAmount:Number(x.creditedAmount||0),status:String(x.status||''),statusLabel:String(x.statusLabel||''),providerStatus:Number(x.providerStatus??-1),providerMessage:String(x.providerMessage||''),transId:x.transId??null,createdAt:x.createdAt?.toDate?.()?.toISOString?.()||null,updatedAt:x.updatedAt?.toDate?.()?.toISOString?.()||null};}).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
    return NextResponse.json({ok:true,rows});
  }catch(e){const m=e instanceof Error?e.message:'SERVER_ERROR';const s=m==='UNAUTHENTICATED'?401:m==='FORBIDDEN'?403:500;return NextResponse.json({error:m==='FORBIDDEN'?'Không có quyền quản trị.':m},{status:s});}
}
