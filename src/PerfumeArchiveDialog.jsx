import { useEffect, useRef, useState } from 'react'
import { erpApi } from './auth'

export default function PerfumeArchiveDialog({ perfumes, onClose, onSaved }) {
  const dialog = useRef(null)
  const pending = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const bulk = perfumes.length > 1
  const restore = !bulk && perfumes[0].is_archived
  const action = restore ? 'Restore' : 'Archive'
  const title = bulk ? `Archive ${perfumes.length} perfumes` : `${action} perfume`

  useEffect(() => {
    const element = dialog.current
    element.showModal()
    return () => { if (element.open) element.close() }
  }, [])

  async function submit(event) {
    event.preventDefault()
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    const path = bulk ? '/erp/perfumes/bulk-archive'
      : `/erp/perfumes/${perfumes[0].id}/${restore ? 'restore' : 'archive'}`
    let result
    try {
      result = await erpApi.request(path, {
        method: 'POST',
        body: bulk ? { ids: perfumes.map(perfume => perfume.id) } : undefined,
      })
    } catch (failure) {
      setError(failure.message)
      return
    } finally {
      setBusy(false)
      pending.current = false
    }
    onSaved(bulk ? 'Selected perfumes archived.' : restore ? 'Perfume restored.' : 'Perfume archived.', result.changed)
  }

  return (
    <dialog ref={dialog} className="perfume-editor" aria-labelledby="archive-title" onCancel={event => {
      event.preventDefault()
      if (!pending.current) onClose()
    }}>
      <h2 id="archive-title">{title}</h2>
      <form onSubmit={submit}>
        {!bulk && <p><strong>{perfumes[0].name}</strong></p>}
        {restore
          ? <p>This perfume will return to the active assortment.</p>
          : <p>Archived perfumes are hidden from the storefront and unavailable for new orders. Variants, mappings, images and past orders are kept. You can restore archived perfumes at any time.</p>}
        {error && <p role="alert">{error}</p>}
        <div className="editor-actions">
          <button type="button" autoFocus disabled={busy} onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy}>{busy ? 'Saving…' : title}</button>
        </div>
      </form>
    </dialog>
  )
}
