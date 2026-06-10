import { useRef, useEffect } from 'react'

export default function SignaturePad({ onChange }) {
  const canvasRef = useRef(null)
  const ctxRef = useRef(null)
  const drawing = useRef(false)
  const empty = useRef(true)

  useEffect(() => {
    const canvas = canvasRef.current
    const ratio = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * ratio
    canvas.height = rect.height * ratio
    const ctx = canvas.getContext('2d')
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#0a0a0a'
    ctxRef.current = ctx
  }, [])

  const pos = (e) => {
    const r = canvasRef.current.getBoundingClientRect()
    const p = e.touches ? e.touches[0] : e
    return { x: p.clientX - r.left, y: p.clientY - r.top }
  }
  const start = (e) => { e.preventDefault(); drawing.current = true; const { x, y } = pos(e); ctxRef.current.beginPath(); ctxRef.current.moveTo(x, y) }
  const move = (e) => { if (!drawing.current) return; e.preventDefault(); const { x, y } = pos(e); ctxRef.current.lineTo(x, y); ctxRef.current.stroke(); empty.current = false; onChange?.(canvasRef.current.toDataURL('image/png')) }
  const end = () => { drawing.current = false }
  const clear = () => { const c = canvasRef.current; ctxRef.current.clearRect(0, 0, c.width, c.height); empty.current = true; onChange?.(null) }

  return (
    <div>
      <div className="sigwrap">
        <canvas ref={canvasRef}
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
      </div>
      <button type="button" className="btn ghost sm" style={{ marginTop: 8 }} onClick={clear}>Clear Signature</button>
    </div>
  )
}
