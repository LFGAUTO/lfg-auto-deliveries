import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Layout() {
  const { userName, signOut } = useAuth()
  const nav = useNavigate()

  const tabs = [
    { to: '/', icon: '📊', label: 'Dashboard', end: true },
    { to: '/deliveries', icon: '🚗', label: 'Deliveries' },
    { to: '/drivers', icon: '👤', label: 'Drivers' },
    { to: '/archive', icon: '🗄️', label: 'Archive' },
    { to: '/reports', icon: '🧾', label: 'Reports' },
    { to: '/board', icon: '📺', label: 'TV Board' },
  ]

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand"><span className="mark">L</span> LFG <span className="gold">AUTO</span></div>
        <div className="row" style={{ alignItems:'center', gap:12 }}>
          <span className="who">{userName}</span>
          <button className="btn ghost sm" onClick={async () => { await signOut(); nav('/') }}>Sign Out</button>
        </div>
      </div>

      <div className="content"><Outlet /></div>

      <nav className="nav">
        {tabs.map(t => (
          <NavLink key={t.to} to={t.to} end={t.end}
            className={({ isActive }) => isActive ? 'active' : ''}
            target={t.to === '/board' ? '_blank' : undefined}>
            <span className="ic">{t.icon}</span>{t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
