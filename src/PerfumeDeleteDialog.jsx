import { useEffect, useRef, useState } from 'react'
import { erpApi } from './auth'
import { ReadState, useCatalogRead } from './catalogState'

const reasons = [
  ['websiteOrderItems', 'Historical website order items still reference its variants.'],
  ['images', 'A registered image or publication reservation protects this perfume.'],
  ['unverifiedForeignKeys', 'The database relationships differ from the reviewed schema.'],
]

export default function PerfumeDeleteDialog({ perfume, onClose, onDeleted }) {
  const dialog = useRef(null)
  const pending = useRef(false)
  const path = `/erp/perfumes/${perfume.id}`
  const preview = useCatalogRead(`${path}/dependencies`)
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
    if (!eligible || pending.current) return
    pending.current = true
    setBusy(true)
    try {
      await erpApi.request(path, { method: 'DELETE' })
    } catch (error) {
      setFailure(error)
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
            <p>{dependencies.skuMappings} {dependencies.skuMappings === 1 ? 'SKU will' : 'SKUs will'} become unmatched if you delete this perfume.</p>
            {dependencies.canDelete ? (
              <p>This permanently deletes the perfume and its volume variants.</p>
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
        <div className="editor-actions">
          <button type="button" onClick={onClose} disabled={busy} autoFocus>Cancel</button>
          <button className="variant-delete" disabled={!eligible || busy}>{busy ? 'Deleting…' : 'Delete permanently'}</button>
        </div>
      </form>
    </dialog>
  )
}
