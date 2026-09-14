import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, db } from '@/lib/firebase-admin';
import { requireUser } from '@/lib/auth-server';
export const runtime='nodejs';

export async function POST(req:NextRequest){
  try{
    const user=await requireUser(req);
    const body=await req.json().catch(()=>({}));
    const displayName=String(body.displayName||user.name||user.email?.split('@')[0]||'Người dùng').trim().slice(0,80);
    const ref=db().collection('users').doc(user.uid);
    const snap=await ref.get();
    await ref.set({uid:user.uid,email:user.email||'',displayName,balance:Number(snap.data()?.balance||0),createdAt:snap.exists?snap.data()?.createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()},{merge:true});
    return NextResponse.json({ok:true,uid:user.uid});
  }catch(e){
    const m=e instanceof Error?e.message:'SERVER_ERROR';
    return NextResponse.json({error:m==='UNAUTHENTICATED'?'Bạn chưa đăng nhập.':m},{status:m==='UNAUTHENTICATED'?401:500});
  }
}
