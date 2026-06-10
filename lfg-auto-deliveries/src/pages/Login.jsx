import { useState } from 'react'
import { supabase, usernameToEmail } from '../lib/supabase'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setErr(''); setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    })
    setBusy(false)
    if (error) setErr('Wrong username or password.')
  }

  return (
    <div className="login">
      <div style={{ textAlign:'center', marginBottom:18 }}>
        <div className="brand" style={{ justifyContent:'center', fontSize:18 }}>
          <span className="mark">L</span> LFG <span className="gold">AUTO</span>
        </div>
      </div>
      <div className="card">
        <h1>LFG AUTO <span className="gold">DELIVERIES</span></h1>
        <div className="sub">Sign in to continue</div>
        <form onSubmit={submit}>
          <label className="fld"><span>Username</span>
            <input value={username} onChange={e => setUsername(e.target.value)} autoCapitalize="none" autoCorrect="off" placeholder="Username" /></label>
          <label className="fld"><span>Password</span>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" /></label>
          {err && <div style={{ color:'#e88', fontSize:14, marginBottom:10 }}>{err}</div>}
          <button className="btn gold" disabled={busy}>{busy ? 'Signing in…' : 'Sign In'}</button>
        </form>
      </div>
      <p className="muted" style={{ textAlign:'center', fontSize:12, marginTop:14 }}>Luxury concierge delivery operations</p>
    </div>
  )
}
