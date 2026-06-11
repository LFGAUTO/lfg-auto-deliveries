export default function Modal({ title, onClose, children, wide }) {
  // Clicking outside the box does NOT close it (prevents losing a half-typed form).
  // Close only via the × button or a Cancel button.
  return (
    <div className="modalbg">
      <div className="modal" style={wide ? { maxWidth: 720 } : undefined}>
        <button className="x" onClick={onClose}>×</button>
        {title && <div className="h1" style={{ marginBottom: 14, paddingRight: 24 }}>{title}</div>}
        {children}
      </div>
    </div>
  )
}
