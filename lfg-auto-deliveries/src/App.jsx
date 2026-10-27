import {useState} from 'react'
import ObserverPortal from './pages/ObserverPortal'
import SetPassword from './pages/SetPassword'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Deliveries from './pages/Deliveries'
import Drivers from './pages/Drivers'
import Archive from './pages/Archive'
import Photos from './pages/Photos'
import Reports from './pages/Reports'
import TVBoard from './pages/TVBoard'
import DriverPortal from './pages/DriverPortal'

function Splash({ text = 'Loading…' }) {
  return <div style={{ display:'grid', placeItems:'center', height:'100vh', color:'#9a9a93' }}>{text}</div>
}

export default function App() {
  const { session, profile, loading, isAdmin, isDriver, isObserver, signOut } = useAuth()
  const [passwordSetup,setPasswordSetup]=useState(window.location.pathname==='/set-password'||/type=(invite|recovery)/.test(window.location.hash))

  if (loading) return <Splash />
  if(passwordSetup)return <SetPassword session={session} onDone={()=>setPasswordSetup(false)}/>
  if (!session) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    )
  }
  // Signed in but profile row not ready yet
  if (!profile) return <Splash text="Setting up your account…" />

  if(profile.status!=='active')return <div className="login"><div className="card"><h1>Use your personal driver login</h1><p>The shared driver login has been retired. Sign in with your own email and password.</p><button className="btn gold" onClick={signOut}>Sign out</button></div></div>

  // TV board is shared (no chrome). Available to any signed-in user.
  return (
    <Routes>
      {isObserver && <Route path="/monitor" element={<ObserverPortal />} />}
      {isAdmin && <Route path="/board" element={<TVBoard />} />}

      {isAdmin && (
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/deliveries" element={<Deliveries />} />
          <Route path="/drivers" element={<Drivers />} />
          <Route path="/archive" element={<Archive />} />
          <Route path="/photos" element={<Photos />} />
          <Route path="/reports" element={<Reports />} />
        </Route>
      )}

      {(isDriver || isAdmin) && <Route path="/driver" element={<DriverPortal />} />}

      <Route path="*" element={<Navigate to={isObserver ? '/monitor' : isAdmin ? '/' : '/driver'} replace />} />
    </Routes>
  )
}

