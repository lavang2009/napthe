import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { requireAdmin } from '@/lib/auth-server';
export const runtime='nodejs';
export async function GET(req:NextRequest){try{await requireAdmin(req);const snap=await db().collection('cardTransactions').get();let credited=0,creditedAmount=0;for(const d of snap.docs){const x=d.data();if(x.status==='credited')credited++;creditedAmount+=Number(x.creditedAmount||0)}return NextResponse.json({ok:true,stats:{total:snap.size,credited,creditedAmount}})}catch(e){const m=e instanceof Error?e.message:'Server error';return NextResponse.json({error:m==='FORBIDDEN'?'Tài khoản không có quyền quản trị.':m},{status:m==='FORBIDDEN'?403:500})}}
