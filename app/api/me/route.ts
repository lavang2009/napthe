import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { requireUser } from '@/lib/auth-server';
export const runtime='nodejs';
export async function GET(req:NextRequest){
  try{
    const user=await requireUser(req); const snap=await db().collection('users').doc(user.uid).get();
    const d=snap.data()||{}; const email=String(user.email||'').toLowerCase();
    const admins=String(process.env.ADMIN_EMAILS||'').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean);
    return NextResponse.json({ok:true,uid:user.uid,email:user.email||'',displayName:d.displayName||user.name||email.split('@')[0]||'Người dùng',balance:Number(d.balance||0),isAdmin:user.admin===true||admins.includes(email)});
  }catch(e){ const m=e instanceof Error?e.message:'SERVER_ERROR'; return NextResponse.json({error:m==='UNAUTHENTICATED'?'Bạn chưa đăng nhập.':m},{status:m==='UNAUTHENTICATED'?401:500}); }
}
