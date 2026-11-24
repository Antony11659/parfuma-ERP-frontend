import { useEffect, useRef, useState } from 'react'
import { erpApi } from './auth'
import { ReadState, useCatalogRead } from './catalogState'

const counts = [
  ['Volume variants', 'variants'],
  ['Marketplace SKU mappings', 'skuMappings'],
  ['Historical website order items', 'websiteOrderItems'],
  ['Registered perfume images', 'images'],
]
const reasons = [
  ['skuMappings', 'Marketplace mappings still reference this perfume.'],
  ['websiteOrderItems', 'Historical website order items still reference its variants.'],
  ['images', 'Registered images must be handled before deletion to avoid orphaning Timeweb files.'],
  ['unverifiedForeignKeys', 'The database relationships differ from the reviewed schema.'],
]

export default function PerfumeDeleteDialog({ perfume, onClose, onDeleted }) {
  const dialog = useRef(null)
  const pending = useRef(false)
  const path = `/erp/perfumes/${perfume.id}`
  const preview = useCatalogRead(`${path}/dependencies`)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)
  const dependencies = failure?.dependencies ?? preview.data
  const eligible = dependencies?.canDelete === true && !failure

  useEffect(() => {
    const element = dialog.current
    element.showModal()
    return () => { if (element.open) element.close() }
  }, [])

  async function submit(event) {
    event.preventDefault()
    if (!eligible || !confirmed || pending.current) return
    pending.current = true
    setBusy(true)
    try {
      await erpApi.request(path, { method: 'DELETE' })
    } catch (error) {
      setFailure(error)
      setConfirmed(false)
      return
    } finally {
      pending.current = false
      setBusy(false)
    }
    onDeleted()
  }

  return (
    <dialog ref={dialog} className="perfume-editor" aria-labelledby="delete-perfume-title" onCancel={event => {
      event.preventDefault()
      if (!pending.current) onClose()
    }}>
      <h2 id="delete-perfume-title">Delete perfume</h2>
      <form onSubmit={submit}>
        <p>{perfume.name}</p>
        <ReadState read={preview} loading="Checking dependencies…" />
        {failure && <p role="alert">{failure.message}</p>}
        {dependencies && (
          <>
            <dl className="catalog-fields perfume-dependency-counts">
              {counts.map(([label, key]) => <div key={key}><dt>{label}</dt><dd>{dependencies[key]}</dd></div>)}
              {dependencies.unverifiedForeignKeys > 0 && <div><dt>Unverified foreign-key definitions</dt><dd>{dependencies.unverifiedForeignKeys}</dd></div>}
            </dl>
            {dependencies.canDelete ? (
              <p>Deleting this perfume permanently removes it and its unused volume variants.</p>
            ) : (
              <div className="mapping-warning" role="status">
                <strong>Deletion blocked</strong>
                <ul>{reasons.filter(([key]) => dependencies[key] > 0).map(([key, reason]) => <li key={key}>{reason}</li>)}</ul>
              </div>
            )}
          </>
        )}
        {failure && (
          <button type="button" onClick={() => {
            setFailure(null)
            preview.retry()
          }}>Check dependencies again</button>
        )}
        {eligible && (
          <label className="perfume-delete-confirm">
            <input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />
            I understand this deletion is permanent.
          </label>
        )}
        <div className="editor-actions">
          <button type="button" onClick={onClose} disabled={busy} autoFocus>Cancel</button>
          <button className="variant-delete" disabled={!eligible || !confirmed || busy}>{busy ? 'Deleting…' : 'Delete permanently'}</button>
        </div>
      </form>
    </dialog>
  )
}
