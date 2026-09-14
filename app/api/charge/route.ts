import { NextRequest, NextResponse } from 'next/server';
import { db, FieldValue } from '@/lib/firebase-admin';
import { requireUser } from '@/lib/auth-server';
import { encryptSecret, randomRequestId, validateEncryptionKey } from '@/lib/security';
import { AMOUNTS, TELCOS, chargingSign, creditIfValid, saveProviderState } from '@/lib/topup';
import { nappayRequest, statusLabel } from '@/lib/nappay';
export const runtime='nodejs';

function fail(e:unknown){return e instanceof Error?e.message:'UNEXPECTED_SERVER_ERROR';}

export async function GET(){return NextResponse.json({ok:true,message:'Charge endpoint online. Use POST with Firebase Bearer token to submit a card.'});}

export async function POST(req:NextRequest){
  let stage='start'; let requestId='';
  try{
    stage='auth'; const user=await requireUser(req);
    stage='parse_body'; const body=await req.json();
    const telco=String(body.telco||'').toUpperCase().trim();
    const code=String(body.code||'').trim(); const serial=String(body.serial||'').trim(); const amount=Number(body.amount);
    if(!TELCOS.has(telco)) return NextResponse.json({error:'Nhà mạng không hợp lệ.'},{status:400});
    if(!AMOUNTS.has(amount)) return NextResponse.json({error:'Mệnh giá không hợp lệ.'},{status:400});
    if(!/^\d{8,25}$/.test(code) || !/^[A-Za-z0-9]{5,35}$/.test(serial)) return NextResponse.json({error:'Mã thẻ hoặc serial không hợp lệ.'},{status:400});

    stage='config'; const partnerId=process.env.NAPPAY_PARTNER_ID?.trim(); const partnerKey=process.env.NAPPAY_PARTNER_KEY?.trim();
    if(!partnerId||!partnerKey) throw new Error('NAPPAY_NOT_CONFIGURED');
    stage='validate_encryption_key'; validateEncryptionKey();
    stage='create_transaction'; requestId=randomRequestId();
    const ref=db().collection('cardTransactions').doc(requestId);
    await ref.create({uid:user.uid,provider:'nappay',requestId,telco,declaredAmount:amount,serial,codeEncrypted:encryptSecret(code),serialEncrypted:encryptSecret(serial),codeMasked:`${code.slice(0,2)}••••${code.slice(-2)}`,serialMasked:`${serial.slice(0,2)}••••${serial.slice(-2)}`,status:'submitted',providerStatus:0,statusLabel:'SUBMITTED',createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});

    stage='sign'; const sign=chargingSign({partnerKey,code,partnerId,requestId,serial,telco});
    stage='nappay_request'; const {httpStatus,data}=await nappayRequest({command:'charging',partner_id:partnerId,request_id:requestId,telco,amount:String(amount),serial,code,sign});
    if(httpStatus>=400){
      await ref.set({status:'failed',providerStatus:Number(data.status??-1),statusLabel:statusLabel(Number(data.status??-1)),providerMessage:String(data.message||`NAPPAY_HTTP_${httpStatus}`),updatedAt:FieldValue.serverTimestamp()},{merge:true});
      return NextResponse.json({ok:false,error:String(data.message||`NAPPAY_HTTP_${httpStatus}`),request_id:requestId,providerStatus:Number(data.status??-1)},{status:502});
    }
    stage='save_response'; await saveProviderState(requestId,data);
    stage='credit'; const credit=await creditIfValid(requestId,data);
    const status=Number(data.status??-1);
    return NextResponse.json({ok:true,request_id:requestId,status,statusLabel:statusLabel(status),message:String(data.message||''),value:data.value??null,amount:data.amount??null,trans_id:data.trans_id??null,credited:credit.credited||credit.alreadyCredited,creditedAmount:credit.amount||0});
  }catch(e){
    const message=fail(e); console.error('[api/charge]',{stage,requestId,error:message});
    const code=message==='UNAUTHENTICATED'?401:message.startsWith('NAPPAY_HTTP')?502:500;
    return NextResponse.json({ok:false,error:message==='UNAUTHENTICATED'?'Bạn chưa đăng nhập.':message,stage,request_id:requestId||undefined},{status:code});
  }
}
