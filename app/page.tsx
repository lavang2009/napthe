'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updateProfile, User } from 'firebase/auth';
import { auth } from '@/lib/firebase-client';

type Tx = { requestId:string; telco:string; declaredAmount:number; realValue:number; receiveAmount:number; creditedAmount:number; status:string; providerStatus:number; statusLabel:string; providerMessage:string; createdAt:string|null; updatedAt:string|null };
type Me = { uid:string; email:string; displayName:string; balance:number; isAdmin:boolean };

const amounts = [10000,20000,50000,100000,200000,500000];

async function api(path:string, init:RequestInit = {}) {
  const user = auth.currentUser;
  const token = user ? await user.getIdToken() : '';
  const headers = new Headers(init.headers);
  headers.set('content-type','application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);
  const res = await fetch(path, {...init, headers});
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export default function Home(){
  const [user,setUser] = useState<User|null>(null);
  const [mode,setMode] = useState<'login'|'register'>('login');
  const [email,setEmail] = useState('');
  const [password,setPassword] = useState('');
  const [displayName,setDisplayName] = useState('');
  const [me,setMe] = useState<Me|null>(null);
  const [history,setHistory] = useState<Tx[]>([]);
  const [telco,setTelco] = useState('VIETTEL');
  const [amount,setAmount] = useState('100000');
  const [code,setCode] = useState('');
  const [serial,setSerial] = useState('');
  const [busy,setBusy] = useState(false);
  const [msg,setMsg] = useState('');
  const [result,setResult] = useState<any>(null);

  useEffect(() => onAuthStateChanged(auth, u => setUser(u)), []);

  useEffect(() => {
    if (!user) { setMe(null); setHistory([]); return; }
    (async() => {
      try { await api('/api/auth/sync',{method:'POST',body:JSON.stringify({displayName})}); } catch {}
      await refresh();
    })();
  }, [user]);

  async function refresh(){
    try { const m = await api('/api/me'); setMe(m); const h = await api('/api/history?limit=30'); setHistory(h.rows || []); } catch(e) { setMsg(e instanceof Error ? e.message : 'Không tải được dữ liệu. Server Firebase Admin có thể chưa cấu hình.'); }
  }

  function firebaseError(e: unknown) {
    const code = typeof e === 'object' && e && 'code' in e ? String((e as {code?: unknown}).code) : '';
    const map: Record<string,string> = {
      'auth/email-already-in-use': 'Email này đã được đăng ký. Hãy đăng nhập hoặc dùng email khác.',
      'auth/invalid-email': 'Email không hợp lệ.',
      'auth/weak-password': 'Mật khẩu quá yếu. Hãy dùng ít nhất 6 ký tự.',
      'auth/operation-not-allowed': 'Firebase chưa bật Đăng nhập bằng Email/Mật khẩu.',
      'auth/invalid-credential': 'Email hoặc mật khẩu không đúng.',
      'auth/user-not-found': 'Không tìm thấy tài khoản này.',
      'auth/wrong-password': 'Mật khẩu không đúng.',
      'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'Firebase API key không hợp lệ hoặc biến môi trường NEXT_PUBLIC_FIREBASE_* chưa đúng.',
      'auth/network-request-failed': 'Không kết nối được Firebase. Hãy kiểm tra mạng và cấu hình Firebase.',
    };
    return map[code] || (e instanceof Error ? e.message : 'Thao tác Firebase thất bại.');
  }

  async function authSubmit(e:FormEvent){
    e.preventDefault(); setBusy(true); setMsg('');
    try {
      if (!email.trim()) throw new Error('Vui lòng nhập email.');
      if (!password) throw new Error('Vui lòng nhập mật khẩu.');
      if (mode==='register' && password.length < 6) throw new Error('Mật khẩu phải có ít nhất 6 ký tự.');
      if (mode==='login') {
        await signInWithEmailAndPassword(auth,email.trim(),password);
        setMsg('Đăng nhập thành công.');
      } else {
        if (displayName.trim().length < 2) throw new Error('Vui lòng nhập tên hiển thị từ 2 ký tự.');
        const cred = await createUserWithEmailAndPassword(auth,email.trim(),password);
        await updateProfile(cred.user,{displayName: displayName.trim()});
        try {
          await api('/api/auth/sync',{method:'POST',body:JSON.stringify({displayName:displayName.trim()})});
        } catch {
          // Firebase account is already created; Firestore profile can be synced later.
        }
        setMsg('Tạo tài khoản thành công.');
      }
      setPassword('');
    } catch(e) { setMsg(firebaseError(e)); }
    finally { setBusy(false); }
  }

  async function submit(e:FormEvent){
    e.preventDefault(); setBusy(true); setMsg('Đang gửi thẻ tới NAPPAY...'); setResult(null);
    try {
      if(!auth.currentUser) throw new Error('Vui lòng đăng nhập trước.');
      const data = await api('/api/charge',{method:'POST',body:JSON.stringify({telco,amount:Number(amount),code:code.trim(),serial:serial.trim()})});
      setResult(data); setMsg(data.status===99 ? 'Thẻ đang chờ xử lý. Hệ thống sẽ tự kiểm tra lại.' : 'Đã nhận phản hồi từ NAPPAY.');
      setCode(''); setSerial(''); await refresh();
    } catch(e) { setMsg(e instanceof Error ? e.message : 'Có lỗi xảy ra.'); }
    finally { setBusy(false); }
  }

  async function check(requestId:string){
    setBusy(true); setMsg('Đang kiểm tra lại giao dịch...');
    try { const data = await api('/api/check',{method:'POST',body:JSON.stringify({request_id:requestId})}); setResult(data); await refresh(); setMsg(data.credited ? 'Giao dịch hợp lệ và đã cộng tiền.' : `Trạng thái: ${data.statusLabel}`); }
    catch(e){ setMsg(e instanceof Error ? e.message : 'Không kiểm tra được giao dịch.'); }
    finally{ setBusy(false); }
  }

  useEffect(() => {
    if(!user) return;
    const id = window.setInterval(async() => {
      const pending = history.filter(x => x.status==='pending' && x.requestId).slice(0,3);
      if(!pending.length) return;
      for(const tx of pending) { try { await api('/api/check',{method:'POST',body:JSON.stringify({request_id:tx.requestId})}); } catch {} }
      await refresh();
    }, 7000);
    return () => window.clearInterval(id);
  }, [user, history]);

  const money = useMemo(() => new Intl.NumberFormat('vi-VN').format(me?.balance || 0), [me?.balance]);

  if(!user) return <main className="wrap"><section className="hero"><div><div className="eyebrow">NAPPAY · VERCEL</div><h1 className="title">Nạp thẻ cào tự động</h1><p className="sub">Đăng nhập tài khoản, gửi thẻ qua NAPPAY và nhận số dư tự động khi giao dịch thành công.</p></div><span className="pill">Firebase Auth + Firestore</span></section><form className="auth card" onSubmit={authSubmit} noValidate><h2>{mode==='login'?'Đăng nhập':'Tạo tài khoản'}</h2>{mode==='register'&&<><label>Tên hiển thị</label><input type="text" value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Nguyễn Văn A" autoComplete="name"/></>}<label>Email</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required/><label>Mật khẩu</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Ít nhất 6 ký tự" autoComplete={mode==='login'?'current-password':'new-password'} required/><button type="submit" disabled={busy}>{busy?'Đang xử lý…':mode==='login'?'Đăng nhập':'Đăng ký'}</button>{msg&&<div className="result">{msg}</div>}<button type="button" className="secondary" onClick={()=>{setMode(mode==='login'?'register':'login');setMsg('')}}>{mode==='login'?'Tạo tài khoản mới':'Tôi đã có tài khoản'}</button></form></main>;

  return <main className="wrap"><section className="hero"><div><div className="eyebrow">NAPPAY · CARD TOPUP</div><h1 className="title">Xin chào {me?.displayName || user.email}</h1><p className="sub">Số dư hiện tại: <strong>{money} ₫</strong></p></div><div className="hero-actions"><span className="pill">{me?.isAdmin?'ADMIN':'USER'}</span>{me?.isAdmin&&<a className="pill link" href="/admin">Quản trị</a>}<button className="secondary small" onClick={()=>signOut(auth)}>Đăng xuất</button></div></section><div className="grid"><form className="card" onSubmit={submit}><h2>Nạp thẻ</h2><div className="row"><div><label>Nhà mạng</label><select value={telco} onChange={e=>setTelco(e.target.value)}><option>VIETTEL</option><option>VINAPHONE</option><option>MOBIFONE</option><option>VNMOBI</option></select></div><div><label>Mệnh giá</label><select value={amount} onChange={e=>setAmount(e.target.value)}>{amounts.map(x=><option key={x} value={x}>{new Intl.NumberFormat('vi-VN').format(x)}</option>)}</select></div></div><label>Mã thẻ</label><input inputMode="numeric" value={code} onChange={e=>setCode(e.target.value)} placeholder="Nhập mã thẻ" required/><label>Serial</label><input value={serial} onChange={e=>setSerial(e.target.value)} placeholder="Nhập serial" required/><button disabled={busy}>{busy?'Đang xử lý…':'Gạch thẻ'}</button>{msg&&<div className="result">{msg}</div>}{result&&<div className="result"><b>{result.statusLabel}</b>{result.message&&<div>{result.message}</div>}{result.status===99&&<button type="button" className="secondary" onClick={()=>check(result.request_id)} disabled={busy}>Kiểm tra lại</button>}{result.credited&&<div className="okline">Đã cộng {new Intl.NumberFormat('vi-VN').format(result.creditedAmount||0)} ₫</div>}</div>}</form><aside className="card"><div className="history-head"><h2>Lịch sử nạp</h2><button className="secondary small" type="button" onClick={refresh}>Làm mới</button></div><div className="history">{history.length===0?<p className="note">Chưa có giao dịch.</p>:history.map(tx=><div className="tx" key={tx.requestId}><div><strong>{tx.telco}</strong><span>{new Intl.NumberFormat('vi-VN').format(tx.declaredAmount)} ₫</span></div><div><span className={tx.status==='credited'?'ok':tx.status==='pending'?'warn':'err'}>{tx.statusLabel}</span><span className="mono">{tx.requestId}</span></div>{tx.status==='pending'&&<button className="secondary small" type="button" onClick={()=>check(tx.requestId)}>Kiểm tra</button>}</div>)}</div></aside></div><div className="footer">NAPPAY Charging API v2 · Số dư chỉ được cộng ở server sau khi NAPPAY xác nhận giao dịch thành công.</div></main>;
}
