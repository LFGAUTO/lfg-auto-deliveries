import { useEffect, useRef } from 'react'
// Polling also works when Supabase Realtime has not been enabled for the project.
export default function useRefresh(load, interval = 30000) {
  const latest = useRef(load)
  latest.current = load
  useEffect(() => {
    let active = true, running = false
    async function refresh() {
      if (!active || running) return
      running = true
      try { await latest.current() } finally { running = false }
    }
    refresh()
    const timer = setInterval(refresh, interval)
    const focus = () => { if (!document.hidden) refresh() }
    window.addEventListener('focus', focus)
    document.addEventListener('visibilitychange', focus)
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', focus) }
  }, [interval])
}
