export default function Modal({ title, onClose, children, wide }) {
  return (
    <div className="modalbg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={wide ? { maxWidth: 720 } : undefined}>
        <button className="x" onClick={onClose}>×</button>
        {title && <div className="h1" style={{ marginBottom: 14, paddingRight: 24 }}>{title}</div>}
        {children}
      </div>
    </div>
  )
}
