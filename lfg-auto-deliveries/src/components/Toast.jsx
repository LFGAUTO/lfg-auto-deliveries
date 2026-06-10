import { createContext, useContext, useState, useCallback } from 'react'
const Ctx = createContext(() => {})
export const useToast = () => useContext(Ctx)
export function ToastProvider({ children }) {
  const [msg, setMsg] = useState('')
  const [show, setShow] = useState(false)
  const toast = useCallback((m) => {
    setMsg(m); setShow(true)
    setTimeout(() => setShow(false), 2200)
  }, [])
  return (
    <Ctx.Provider value={toast}>
      {children}
      <div className={'toast' + (show ? ' show' : '')}>{msg}</div>
    </Ctx.Provider>
  )
}
