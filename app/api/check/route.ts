import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { requireUser } from '@/lib/auth-server';
import { checkProvider } from '@/lib/topup';
export const runtime='nodejs';

export async function GET(){return NextResponse.json({ok:true,message:'Check endpoint online. Use POST with request_id and Firebase Bearer token.'});}

export async function POST(req:NextRequest){
  try{
    const user=await requireUser(req); const body=await req.json().catch(()=>({})); const requestId=String(body.request_id||'').trim();
    if(!/^NAPTHE_[A-Za-z0-9_\-]+$/.test(requestId)) return NextResponse.json({error:'request_id không hợp lệ.'},{status:400});
    const ref=db().collection('cardTransactions').doc(requestId); const snap=await ref.get();
    if(!snap.exists || snap.data()?.uid!==user.uid) return NextResponse.json({error:'Không tìm thấy giao dịch.'},{status:404});
    if(snap.data()?.status==='credited') return NextResponse.json({ok:true,request_id:requestId,status:1,statusLabel:'VALID_CARD',credited:true,creditedAmount:Number(snap.data()?.creditedAmount||0),message:'Giao dịch đã được cộng tiền.'});
    const out=await checkProvider(requestId); const d=out.data; const latest=(await ref.get()).data()||{}; const status=Number(d.status??-1);
    return NextResponse.json({ok:true,request_id:requestId,status,statusLabel:latest.statusLabel||String(status),message:String(d.message||''),value:Number(d.value||0),amount:Number(d.amount||0),trans_id:d.trans_id??null,credited:latest.status==='credited',creditedAmount:Number(latest.creditedAmount||0)});
  }catch(e){ const m=e instanceof Error?e.message:'SERVER_ERROR'; const s=m==='UNAUTHENTICATED'?401:m==='TRANSACTION_NOT_FOUND'?404:500; return NextResponse.json({ok:false,error:m==='UNAUTHENTICATED'?'Bạn chưa đăng nhập.':m},{status:s}); }
}
