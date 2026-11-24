import { useEffect, useRef, useState } from 'react'
import { erpApi } from './auth'
import { ReadState, useCatalogRead } from './catalogState'

export function PerfumePicker({ value, onChange }) {
  const [search, setSearch] = useState('')
  const [term, setTerm] = useState('')
  useEffect(() => {
    const timer = window.setTimeout(() => setTerm(search.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [search])
  const list = useCatalogRead(`/erp/perfumes?pageSize=25&q=${encodeURIComponent(term)}`)
  const choices = [...new Map([...(value ? [value] : []), ...(list.data?.items ?? [])].map(item => [item.id, item])).values()]
  return (
    <>
      <label>Find perfume by name or brand
        <input type="search" value={search} maxLength={100} onChange={event => setSearch(event.target.value)} />
      </label>
      <label>Perfume
        <select required value={value?.id ?? ''} onChange={event => onChange(choices.find(item => item.id === event.target.value))}>
          <option value="">Select perfume</option>
          {choices.map(item => <option key={item.id} value={item.id}>{item.name}{item.brand?.name ? ` · ${item.brand.name}` : ''}</option>)}
        </select>
      </label>
      <ReadState read={list} loading="Loading perfumes…" />
    </>
  )
}

export function MappingVolume({ perfumeId, value, onChange }) {
  const volumes = useCatalogRead(perfumeId ? `/erp/perfumes/${perfumeId}/variants` : null)
  return (
    <>
      <label>Registered volume
        <select required value={value} disabled={!volumes.data?.length} onChange={event => onChange(event.target.value)}>
          <option value="">Select volume</option>
          {volumes.data?.map(item => <option key={item.id} value={item.volume_ml}>{item.volume_ml} ml</option>)}
        </select>
      </label>
      {perfumeId && <ReadState read={volumes} loading="Loading registered variants…" />}
      {volumes.data?.length === 0 && <p>No volume variants are registered for this perfume.</p>}
    </>
  )
}

export function SkuDialog({ perfume, mapping, onClose, onSaved }) {
  const dialog = useRef(null)
  const pending = useRef(false)
  const shops = useCatalogRead(mapping ? null : '/erp/shops')
  const [target, setTarget] = useState(perfume)
  const [sku, setSku] = useState(mapping?.sku ?? '')
  const [shop, setShop] = useState(mapping?.shop.id ?? '')
  const [volume, setVolume] = useState(String(mapping?.volume_ml ?? ''))
  const [active, setActive] = useState(mapping?.is_active ?? true)
  const [archived, setArchived] = useState(mapping?.is_archived ?? false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const element = dialog.current
    element.showModal()
    return () => { if (element.open) element.close() }
  }, [])

  async function save(event) {
    event.preventDefault()
    if (pending.current) return
    if (!mapping && (!target || !sku.trim() || !shop || !volume)) {
      setError('Select a perfume, shop and registered volume, then enter the SKU.')
      return
    }
    const flags = { is_active: active, is_archived: archived }
    const path = `/erp/perfumes/${mapping ? perfume.id : target.id}/skus`
    pending.current = true
    setBusy(true)
    setError('')
    try {
      await erpApi.request(mapping ? `${path}/${mapping.id}` : path, {
        method: mapping ? 'PATCH' : 'POST',
        body: mapping ? { ...flags, expected_updated_at: mapping.updated_at }
          : { ...flags, sku: sku.trim(), shop_id: shop, volume_ml: Number(volume) },
      })
      onSaved(mapping ? 'SKU status updated.' : 'SKU registered.')
    } catch (failure) {
      setError(failure.message)
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return (
    <dialog className="perfume-editor" ref={dialog} aria-labelledby="sku-dialog-title"
      onCancel={event => { event.preventDefault(); if (!pending.current) onClose() }}>
      <h2 id="sku-dialog-title">{mapping ? 'Edit SKU mapping' : 'Add SKU'}</h2>
      <form onSubmit={save}>
        <p>Changes apply only to internal Supabase mappings. Marketplace product cards are unaffected.</p>
        <fieldset disabled={busy}>
          {mapping ? <label>Perfume<input value={perfume.name} disabled /></label> : (
            <PerfumePicker value={target} onChange={next => { setTarget(next); setVolume('') }} />
          )}
          <div className="editor-grid">
            {mapping ? <label>Shop<input value={mapping.shop.name} disabled /></label> : (
              <label>Shop<select required value={shop} onChange={event => setShop(event.target.value)}>
                <option value="">Select shop</option>
                {shops.data?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select></label>
            )}
            <label>SKU<input required value={sku} disabled={Boolean(mapping)} maxLength={200} onChange={event => setSku(event.target.value)} /></label>
          </div>
          {mapping ? <label>Registered volume<input value={`${volume} ml`} disabled /></label> : (
            <>
              <ReadState read={shops} loading="Loading shops…" />
              <MappingVolume perfumeId={target?.id} value={volume} onChange={setVolume} />
            </>
          )}
          {mapping && <p>SKU, perfume, shop, and volume are locked. Packaging still resolves inactive and archived mappings by SKU.</p>}
          <div className="sku-flags">
            <label><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} /> Active</label>
            <label><input type="checkbox" checked={archived} onChange={event => setArchived(event.target.checked)} /> Archived</label>
          </div>
        </fieldset>
        {error && <p role="alert">{error}</p>}
        <div className="editor-actions">
          <button type="button" disabled={busy} onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy || (!mapping && (!target || !shop || !volume || !sku.trim()))}>{busy ? 'Saving…' : 'Save SKU'}</button>
        </div>
      </form>
    </dialog>
  )
}
