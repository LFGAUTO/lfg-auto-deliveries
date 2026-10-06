import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Deliveries from './pages/Deliveries'
import Drivers from './pages/Drivers'
import Archive from './pages/Archive'
import Reports from './pages/Reports'
import TVBoard from './pages/TVBoard'
import DriverPortal from './pages/DriverPortal'

function Splash({ text = 'Loading…' }) {
  return <div style={{ display:'grid', placeItems:'center', height:'100vh', color:'#9a9a93' }}>{text}</div>
}

export default function App() {
  const { session, profile, loading, isAdmin, isDriver } = useAuth()

  if (loading) return <Splash />
  if (!session) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    )
  }
  // Signed in but profile row not ready yet
  if (!profile) return <Splash text="Setting up your account…" />

  // TV board is shared (no chrome). Available to any signed-in user.
  return (
    <Routes>
      <Route path="/board" element={<TVBoard />} />

      {isAdmin && (
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/deliveries" element={<Deliveries />} />
          <Route path="/drivers" element={<Drivers />} />
          <Route path="/archive" element={<Archive />} />
          <Route path="/reports" element={<Reports />} />
        </Route>
      )}

      {isDriver && <Route path="/driver" element={<DriverPortal />} />}

      <Route path="*" element={<Navigate to={isAdmin ? '/' : '/driver'} replace />} />
    </Routes>
  )
}
