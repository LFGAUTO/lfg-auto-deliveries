import { useState } from 'react'
import Modal from './Modal'

export function deliveryPhotos(d, issues = []) {
  const seen = new Set()
  return [
    { url: d.client_photo_url, category: 'Customer' },
    { url: d.trade_photo_url, category: 'Trade / lease return' },
    { url: d.contract_photo_url, category: 'Paperwork' },
    ...(Array.isArray(d.extra_photos) ? d.extra_photos : []).map(url => ({ url, category: 'Additional / vehicle' })),
    ...issues.filter(i => i.delivery_id === d.id).map(i => ({ url: i.photo_url, category: 'Issue' }))
  ].filter(p => { if (typeof p.url !== 'string' || !/^https:\/\//i.test(p.url) || seen.has(p.url)) return false; seen.add(p.url); return true })
}

export function PhotoGallery({ delivery, customerOnly = false, issues = [] }) {
  const photos = deliveryPhotos(delivery, issues).filter(p => !customerOnly || p.category === 'Customer')
  const [files, setFiles] = useState(null), [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  async function prepare(selected) {
    setBusy(true); setMessage(''); setFiles(null)
    try {
      const result = []
      for (const [i, p] of selected.entries()) {
        const response = await fetch(p.url)
        if (!response.ok) throw Error('Could not load an original photo. Use Open original to save it instead.')
        const blob = await response.blob()
        const ext = ({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/heic':'heic'})[blob.type] || 'jpg'
        const name = `${delivery.customer_name || 'delivery'}-${p.category}-${i + 1}`.replace(/[^a-z0-9-]/gi, '-')
        result.push(new File([blob], `${name}.${ext}`, { type: blob.type || 'image/jpeg' }))
      }
      setFiles(result)
    } catch (e) { setMessage(e.message) } finally { setBusy(false) }
  }
  async function save() {
    try {
      if (navigator.canShare?.({ files }) && navigator.share) {
        await navigator.share({ files })
      } else {
        for (const file of files) {
          const url = URL.createObjectURL(file), a = document.createElement('a')
          a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove()
          setTimeout(() => URL.revokeObjectURL(url), 60000)
        }
        setMessage('Download started. On iPhone, use Open original, then touch and hold the photo to save it.')
      }
    } catch (e) { if (e.name !== 'AbortError') setMessage('Sharing is unavailable. Use Open original, then touch and hold the photo to save it.') }
  }
  return <section aria-label="Delivery photos">
    <p className="meta">Save original photos to your phone or share them to another app. On iPhone, choose Save Image in the share sheet.</p>
    {!!photos.length && <button className="btn ghost sm" disabled={busy} onClick={() => prepare(photos)}>{busy ? 'Preparing…' : `Prepare all ${photos.length} photos to save`}</button>}
    {files && <div className="card" style={{ marginTop:12 }}><button className="btn gold" onClick={save}>Save / share {files.length === 1 ? 'photo' : `${files.length} photos`}</button><p className="meta">Choose Save Image / Save Images on iPhone, or select an app. Desktop browsers download the originals.</p></div>}
    {message && <p role="status">{message}</p>}
    {!photos.length && <p className="muted">{delivery.client_photo_refused && customerOnly ? 'Customer declined a photo.' : 'No photos uploaded in this view yet.'}</p>}
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:14, marginTop:14 }}>
      {photos.map(p => <article className="card" key={p.url}>
        <h3>{p.category}</h3>
        <a href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt={`${p.category} photo for ${delivery.customer_name}`} loading="lazy" style={{ width:'100%', height:220, objectFit:'contain', background:'#080909', borderRadius:10 }} /></a>
        <div className="btnrow" style={{ marginTop:10 }}><button className="btn gold sm" disabled={busy} onClick={() => prepare([p])}>Save to phone / share</button><a className="btn ghost sm" href={p.url} target="_blank" rel="noreferrer">Open original</a></div>
      </article>)}
    </div>
  </section>
}

export default function DeliveryPhotos({ delivery, issues = [] }) {
  const [open, setOpen] = useState(false)
  return <><button className="btn ghost sm" onClick={() => setOpen(true)}>Photos ({deliveryPhotos(delivery, issues).length})</button>{open && <Modal wide title={`Photos · ${delivery.customer_name}`} onClose={() => setOpen(false)}><PhotoGallery delivery={delivery} issues={issues}/></Modal>}</>
}
