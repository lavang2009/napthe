import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { requireAdmin } from '@/lib/auth-server';
export const runtime='nodejs';
export async function GET(req:NextRequest){
  try{await requireAdmin(req);const snap=await db().collection('cardTransactions').get();let credited=0,pending=0,totalAmount=0,successRate=0;for(const d of snap.docs){const x=d.data();if(x.status==='credited'){credited++;totalAmount+=Number(x.creditedAmount||0);}if(x.status==='pending')pending++;}if(snap.size)successRate=Math.round((credited/snap.size)*10000)/100;return NextResponse.json({ok:true,stats:{total:snap.size,credited,pending,creditedAmount:totalAmount,successRate}});}catch(e){const m=e instanceof Error?e.message:'SERVER_ERROR';const s=m==='UNAUTHENTICATED'?401:m==='FORBIDDEN'?403:500;return NextResponse.json({error:m},{status:s});}
}
