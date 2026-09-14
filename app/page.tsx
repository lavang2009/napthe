'use client';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut, updateProfile, User } from 'firebase/auth';
import { auth } from '@/lib/firebase-client';

type Tx={requestId:string;telco:string;declaredAmount:number;realValue:number;receiveAmount:number;creditedAmount:number;status:string;providerStatus:number;statusLabel:string;providerMessage:string;createdAt:string|null;updatedAt:string|null};
type Me={uid:string;email:string;displayName:string;balance:number;isAdmin:boolean};
const amounts=[10000,20000,50000,100000,200000,500000];

async function api(path:string,init:RequestInit={}){
  const user=auth.currentUser;
  const token=user?await user.getIdToken():'';
  const h=new Headers(init.headers);
  if(init.body)h.set('content-type','application/json');
  if(token)h.set('authorization',`Bearer ${token}`);
  const r=await fetch(path,{...init,headers:h,cache:'no-store'});
  const d=await r.json().catch(()=>({error:`HTTP ${r.status}`}));
  if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);
  return d;
}

function friendlyError(e:unknown){
  const code=typeof e==='object'&&e&&'code'in e?String((e as any).code):'';
  const map:any={
    'auth/email-already-in-use':'Email đã được đăng ký.',
    'auth/invalid-email':'Email không hợp lệ.',
    'auth/weak-password':'Mật khẩu phải có ít nhất 6 ký tự.',
    'auth/operation-not-allowed':'Firebase chưa bật Email/Password.',
    'auth/invalid-credential':'Email hoặc mật khẩu không đúng.',
    'auth/network-request-failed':'Không kết nối được Firebase.',
  };
  return map[code]||(e instanceof Error?e.message:'Thao tác thất bại.');
}

export default function Home(){
 const[user,setUser]=useState<User|null>(null),[mode,setMode]=useState<'login'|'register'>('login'),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[displayName,setDisplayName]=useState(''),[me,setMe]=useState<Me|null>(null),[history,setHistory]=useState<Tx[]>([]),[telco,setTelco]=useState('VIETTEL'),[amount,setAmount]=useState('100000'),[code,setCode]=useState(''),[serial,setSerial]=useState(''),[busy,setBusy]=useState(false),[msg,setMsg]=useState(''),[result,setResult]=useState<any>(null);
 useEffect(()=>onAuthStateChanged(auth,setUser),[]);
 useEffect(()=>{if(!user){setMe(null);setHistory([]);return;}void refresh();},[user]);
 async function refresh(){try{const[m,h]=await Promise.all([api('/api/me'),api('/api/history?limit=50')]);setMe(m);setHistory(h.rows||[]);}catch(e){setMsg(friendlyError(e));}}
 useEffect(()=>{if(!user)return;let stopped=false;async function poll(){if(stopped)return;try{const h=await api('/api/history?limit=20');setHistory(h.rows||[]);for(const tx of (h.rows||[]).filter((x:Tx)=>['pending','provider_unknown','submitted'].includes(x.status)).slice(0,5)){try{const d=await api('/api/check',{method:'POST',body:JSON.stringify({request_id:tx.requestId})});if(d.credited)setMsg(`Đã cộng ${new Intl.NumberFormat('vi-VN').format(d.creditedAmount||0)} ₫.`); }catch{/* mạng tạm thời lỗi, lần sau kiểm tra tiếp */}}}finally{if(!stopped)window.setTimeout(poll,7000);}}void poll();return()=>{stopped=true}},[user]);
 async function authSubmit(e:FormEvent){e.preventDefault();if(busy)return;setBusy(true);setMsg('');try{if(!email.trim())throw new Error('Vui lòng nhập email.');if(!password)throw new Error('Vui lòng nhập mật khẩu.');if(mode==='register'){if(password.length<6)throw new Error('Mật khẩu phải có ít nhất 6 ký tự.');if(displayName.trim().length<2)throw new Error('Tên hiển thị phải có ít nhất 2 ký tự.');const c=await createUserWithEmailAndPassword(auth,email.trim(),password);await updateProfile(c.user,{displayName:displayName.trim()});await api('/api/auth/sync',{method:'POST',body:JSON.stringify({displayName:displayName.trim()})});setMsg('Tạo tài khoản thành công.');}else{await signInWithEmailAndPassword(auth,email.trim(),password);setMsg('Đăng nhập thành công.');}setPassword('');}catch(e){setMsg(friendlyError(e));}finally{setBusy(false);}}
 async function submit(e:FormEvent){e.preventDefault();if(busy)return;setBusy(true);setMsg('Đang gửi thẻ tới NAPPAY...');setResult(null);try{const d=await api('/api/charge',{method:'POST',body:JSON.stringify({telco,amount:Number(amount),code:code.trim(),serial:serial.trim()})});setResult(d);setCode('');setSerial('');await refresh();if(d.credited)setMsg(`Đã cộng ${new Intl.NumberFormat('vi-VN').format(d.creditedAmount||0)} ₫.`);else setMsg(d.providerUnknown?'NAPPAY chưa trả phản hồi trực tiếp; hệ thống đang tự kiểm tra giao dịch.':Number(d.status)===99?'Thẻ đang chờ xử lý. Hệ thống tự kiểm tra trạng thái.':String(d.message||d.statusLabel||'Đã nhận phản hồi.'));}catch(e){setMsg(friendlyError(e));}finally{setBusy(false);}}
 async function check(id:string,manual=true){if(manual&&busy)return;if(manual)setBusy(true);try{const d=await api('/api/check',{method:'POST',body:JSON.stringify({request_id:id})});setResult(d);await refresh();if(d.credited)setMsg(`Đã cộng ${new Intl.NumberFormat('vi-VN').format(d.creditedAmount||0)} ₫.`);else if(manual)setMsg(`Trạng thái: ${d.statusLabel}`);}catch(e){if(manual)setMsg(friendlyError(e));}finally{if(manual)setBusy(false);}}
 const money=useMemo(()=>new Intl.NumberFormat('vi-VN').format(me?.balance||0),[me?.balance]);
 if(!user)return <main className="wrap"><section className="hero"><div><div className="eyebrow">NAPPAY · VERCEL</div><h1 className="title">Nạp thẻ cào tự động</h1><p className="sub">Tài khoản Firebase, gạch thẻ NAPPAY và cộng số dư tự động.</p></div><span className="pill">Firebase + NAPPAY</span></section><form className="auth card" onSubmit={authSubmit} noValidate><h2>{mode==='login'?'Đăng nhập':'Tạo tài khoản'}</h2>{mode==='register'&&<><label>Tên hiển thị</label><input value={displayName} onChange={e=>setDisplayName(e.target.value)} autoComplete="name"/></>}<label>Email</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" required/><label>Mật khẩu</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete={mode==='login'?'current-password':'new-password'} required/><button type="submit" disabled={busy}>{busy?'Đang xử lý…':mode==='login'?'Đăng nhập':'Đăng ký'}</button>{msg&&<div className="result">{msg}</div>}<button type="button" className="secondary" onClick={()=>{setMode(mode==='login'?'register':'login');setMsg('')}}>{mode==='login'?'Tạo tài khoản mới':'Tôi đã có tài khoản'}</button></form></main>;
 return <main className="wrap"><section className="hero"><div><div className="eyebrow">NAPPAY · CARD TOPUP</div><h1 className="title">Xin chào {me?.displayName||user.displayName||user.email}</h1><p className="sub">Số dư hiện tại: <strong>{money} ₫</strong></p></div><div className="hero-actions"><span className="pill">{me?.isAdmin?'ADMIN':'USER'}</span>{me?.isAdmin&&<a className="pill link" href="/admin">Quản trị</a>}<button className="secondary small" onClick={()=>signOut(auth)}>Đăng xuất</button></div></section><div className="grid"><form className="card" onSubmit={submit}><h2>Nạp thẻ</h2><div className="row"><div><label>Nhà mạng</label><select value={telco} onChange={e=>setTelco(e.target.value)}><option>VIETTEL</option><option>VINAPHONE</option><option>MOBIFONE</option><option>VNMOBI</option></select></div><div><label>Mệnh giá</label><select value={amount} onChange={e=>setAmount(e.target.value)}>{amounts.map(v=><option key={v} value={v}>{new Intl.NumberFormat('vi-VN').format(v)}</option>)}</select></div></div><label>Mã thẻ</label><input value={code} onChange={e=>setCode(e.target.value)} inputMode="numeric" autoComplete="off" required/><label>Serial</label><input value={serial} onChange={e=>setSerial(e.target.value)} autoComplete="off" required/><button type="submit" disabled={busy}>{busy?'Đang xử lý…':'Gạch thẻ'}</button>{msg&&<div className="result">{msg}</div>}{result&&<div className="result"><b>{result.statusLabel}</b>{result.message&&<div>{result.message}</div>}{result.credited&&<div className="okline">Đã cộng {new Intl.NumberFormat('vi-VN').format(result.creditedAmount||0)} ₫</div>}</div>}</form><aside className="card"><div className="history-head"><h2>Lịch sử nạp</h2><button className="secondary small" type="button" onClick={()=>refresh()}>Làm mới</button></div><div className="history">{history.length===0?<p className="note">Chưa có giao dịch.</p>:history.map(t=><div className="tx" key={t.requestId}><div><strong>{t.telco}</strong><span>{new Intl.NumberFormat('vi-VN').format(t.declaredAmount)} ₫</span></div><div><span className={t.status==='credited'?'ok':['pending','provider_unknown'].includes(t.status)?'warn':'err'}>{t.statusLabel}</span><span className="mono">{t.requestId}</span></div>{['pending','provider_unknown','submitted'].includes(t.status)&&<button className="secondary small" type="button" onClick={()=>void check(t.requestId)} disabled={busy}>Kiểm tra</button>}</div>)}</div></aside></div><div className="footer">Callback NAPPAY + kiểm tra chủ động · Chỉ server mới có quyền cộng số dư.</div></main>;
}
