import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthCtx = createContext(null)
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(userId) {
    if (!userId) { setProfile(null); return }
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    setProfile(data || null)
  }

  useEffect(() => {
    // Never await another Supabase call inside the auth callback: it holds
    // the session lock needed by database requests and token renewal.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setLoading(false)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    let current = true
    setProfile(null)
    if (session?.user?.id) {
      supabase.from('profiles').select('*').eq('id', session.user.id).single()
        .then(({data}) => { if (current) setProfile(data || null) })
    }
    return () => { current = false }
  }, [session?.user?.id])

  const value = {
    session, profile, loading,
    isAdmin: profile?.role === 'admin',
    isDriver: profile?.role === 'driver',
    userName: profile ? [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.username : '',
    signOut: () => supabase.auth.signOut(),
    refreshProfile: () => loadProfile(session?.user?.id),
  }
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}
