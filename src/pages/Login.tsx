import {useState,type FormEvent} from 'react'
import {Link,Navigate,useLocation,useNavigate} from 'react-router-dom'
import {useAuth} from '../hooks/useAuth'
import {VERSION_LABEL} from '../config/version'

export default function Login(){
 const{session,login,loading}=useAuth()
 const location=useLocation()
 const navigate=useNavigate()
 const[email,setEmail]=useState('')
 const[password,setPassword]=useState('')
 const[busy,setBusy]=useState(false)
 const[error,setError]=useState('')
 const from=(location.state as {from?:string}|null)?.from||'/'
 if(!loading&&session)return <Navigate to={from} replace/>
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{await login(email,password);navigate(from,{replace:true})}catch(x){setError(x instanceof Error?x.message:'Sign in failed.')}finally{setBusy(false)}}
 return <main className="grid min-h-screen place-items-center bg-slate-950 p-6 text-slate-100">
  <section className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
   <div className="mb-7 rounded-2xl bg-white px-6 py-5 shadow-sm"><img src="/brand/ivm-optim-logo.png" alt="IVM Optim" className="mx-auto h-auto w-full max-w-[300px]"/></div>
   <h1 className="text-2xl font-bold">Sign in to IVM Optim</h1>
   <p className="mt-2 text-sm text-slate-400">Use your authorized account to access intelligent vending optimization and decision support.</p>
   <form className="mt-7 space-y-5" onSubmit={submit}>
    <input className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3" type="email" placeholder="Email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/>
    <input className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3" type="password" placeholder="Password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/>
    {error&&<div className="rounded-xl border border-red-900 bg-red-950/50 p-3 text-sm text-red-200">{error}</div>}
    <button className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold" disabled={busy}>{busy?'Signing in…':'Sign In'}</button>
   </form>
   <div className="mt-6 text-center text-sm"><Link className="text-blue-400" to="/forgot-password">Forgot password?</Link></div>
   <p className="mt-8 text-center text-xs text-slate-500">IVM Optim {VERSION_LABEL}</p>
  </section>
 </main>
}
