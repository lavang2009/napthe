'use client';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase-client';

async function api(path:string){
  const user=auth.currentUser;
  const token=user?await user.getIdToken():'';
  const res=await fetch(path,{headers:{authorization:`Bearer ${token}`}});
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error||`HTTP ${res.status}`);
  return data;
}

export default function Admin(){
  const [rows,setRows]=useState<any[]>([]);
  const [stats,setStats]=useState<any>(null);
  const [error,setError]=useState('');
  async function load(){
    try{
      const [a,b]=await Promise.all([api('/api/admin/transactions?limit=200'),api('/api/admin/stats')]);
      setRows(a.rows||[]); setStats(b.stats||null); setError('');
    }catch(e){setError(e instanceof Error?e.message:'Không tải được dữ liệu quản trị.');}
  }
  useEffect(()=>onAuthStateChanged(auth,u=>{if(u) void load()}),[]);
  return <main className="wrap">
    <section className="hero"><div><div className="eyebrow">ADMIN</div><h1 className="title">Quản lý giao dịch</h1><p className="sub">Theo dõi các giao dịch nạp thẻ được xử lý qua NAPPAY.</p></div><a className="pill link" href="/">← Trang chủ</a></section>
    {error&&<div className="result errbox">{error}</div>}
    {stats&&<div className="stats"><div className="card stat"><span>Tổng giao dịch</span><strong>{stats.total}</strong></div><div className="card stat"><span>Đã cộng tiền</span><strong>{stats.credited}</strong></div><div className="card stat"><span>Tổng tiền đã cộng</span><strong>{new Intl.NumberFormat('vi-VN').format(stats.creditedAmount)} ₫</strong></div></div>}
    <section className="card table-card"><div className="history-head"><h2>Giao dịch</h2><button className="secondary small" onClick={load}>Làm mới</button></div><div className="table-scroll"><table><thead><tr><th>Request ID</th><th>UID</th><th>Nhà mạng</th><th>Khai báo</th><th>Đã cộng</th><th>Trạng thái</th><th>Thời gian</th></tr></thead><tbody>{rows.map(r=><tr key={r.requestId}><td className="mono">{r.requestId}</td><td className="mono">{r.uid}</td><td>{r.telco}</td><td>{new Intl.NumberFormat('vi-VN').format(r.declaredAmount)} ₫</td><td>{new Intl.NumberFormat('vi-VN').format(r.creditedAmount)} ₫</td><td>{r.statusLabel}</td><td>{r.createdAt?new Date(r.createdAt).toLocaleString('vi-VN'):'—'}</td></tr>)}</tbody></table></div></section>
  </main>;
}
