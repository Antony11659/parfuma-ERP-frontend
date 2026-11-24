import { useEffect, useRef, useState } from 'react'
import { erpApi } from './auth'
import { ReadState, Table, useCatalogRead } from './catalogState'
import { MappingVolume, PerfumePicker } from './SkuEditor'
import PerfumeEditor from './PerfumeEditor'

const shopPath = '/erp/marketplaces/shops'
const labels = {
  matched: 'Matched', unmatched: 'Unmatched', otherShop: 'Registered under another shop',
  inactive: 'Inactive mapping', archived: 'Archived mapping', ambiguous: 'Ambiguous mapping',
  catalogConflict: 'Duplicate marketplace SKU',
}
const states = { notSynced: 'Not synchronized', syncing: 'Synchronizing…', error: 'Sync failed',
  unsupported: 'Unsupported marketplace', ready: 'Synchronized' }
const formatNumber = value => value.toLocaleString('en')

function useShopStatus() {
  const [shops, setShops] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const version = useRef(0)
  const syncing = shops?.some(shop => shop.state === 'syncing')

  useEffect(() => {
    if (shops && !syncing) return
    const controller = new AbortController()
    const before = version.current
    async function poll() {
      try {
        const data = await erpApi.request(shopPath, { signal: controller.signal })
        if (before === version.current && !controller.signal.aborted) {
          setShops(data)
          setError('')
          if (data.some(shop => shop.state === 'syncing')) timer = window.setTimeout(poll, 1500)
        }
      } catch (failure) {
        if (!controller.signal.aborted && before === version.current) {
          setError(failure.message)
          if (syncing) timer = window.setTimeout(poll, 3000)
        }
      }
    }
    let timer = window.setTimeout(poll, shops ? 1500 : 0)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [shops, syncing])

  async function request(path, options) {
    const current = ++version.current
    setBusy(true)
    setError('')
    try {
      const data = await erpApi.request(path, options)
      if (current === version.current) setShops(data)
    } catch (failure) {
      if (current === version.current) {
        setError(failure.message)
        // Restart polling if a failed request invalidated an in-flight poll.
        setShops(list => list ? [...list] : list)
      }
    } finally {
      if (current === version.current) setBusy(false)
    }
  }

  return {
    shops, error, busy, refreshing: syncing,
    refresh: () => request(shopPath),
    sync: shopId => request('/erp/marketplaces/sync', { method: 'POST', body: shopId ? { shopId } : {} }),
  }
}

function ShopMetrics({ shop }) {
  const metrics = shop.stats
  return (
    <>
      <p>{states[shop.state]}{shop.message ? ` · ${shop.message}` : ''}</p>
      <dl className="shop-metrics">
        {[['Total SKUs', metrics?.total], ['Matched', metrics?.matched], ['Unmatched', metrics?.unmatched],
          ['Mapping conflicts', metrics?.conflicts], ['Completion', metrics ? `${metrics.completion}%` : undefined]]
          .map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{typeof value === 'number' ? formatNumber(value) : value ?? '—'}</dd></div>)}
      </dl>
      <p>Last successful sync {shop.lastSync ? new Date(shop.lastSync).toLocaleString() : '—'}</p>
    </>
  )
}

function MarketplaceOverview({ model }) {
  return (
    <>
      <header className="catalog-heading">
        <h1>Marketplace overview</h1>
        <button className="primary" disabled={model.busy || model.refreshing || !model.shops?.some(shop => shop.state !== 'unsupported')}
          onClick={() => model.sync()}>Synchronize all shops</button>
      </header>
      <p className="catalog-note">Counts cover distinct primary SKUs from visible marketplace listings. Conflicts include mappings under another shop and inactive, archived, or ambiguous mappings.</p>
      <div className="shop-overview">
        {model.shops?.map(shop => (
          <section key={shop.id} className="shop-card">
            <h2>{shop.name}</h2><p>{shop.marketplace}{shop.is_active ? '' : ' · Inactive shop'}</p>
            <ShopMetrics shop={shop} />
            <div className="editor-actions">
              <button type="button" disabled={model.busy || ['syncing', 'unsupported'].includes(shop.state)} onClick={() => model.sync(shop.id)}>Refresh</button>
              <a className="catalog-link" href={`#marketplaces/matching?shop=${shop.id}`}>Open SKU matching</a>
            </div>
          </section>
        ))}
      </div>
      {model.shops?.length === 0 && <p>No marketplace shops are configured.</p>}
    </>
  )
}

function Correction({ draft, onClose, onApply }) {
  const [perfume, setPerfume] = useState(draft.perfume)
  const [volume, setVolume] = useState(String(draft.volume ?? ''))
  const dialog = useRef(null)
  useEffect(() => {
    const element = dialog.current
    element.showModal()
    return () => { if (element.open) element.close() }
  }, [])
  return (
    <dialog className="perfume-editor" ref={dialog} aria-labelledby="sku-correction-title" onCancel={event => { event.preventDefault(); onClose() }}>
      <h2 id="sku-correction-title">Correct match</h2>
      <form onSubmit={event => {
        event.preventDefault()
        if (perfume && volume) onApply({ perfume, volume: Number(volume) })
      }}>
        <p>{draft.row.name} · SKU {draft.row.sku}</p>
        <PerfumePicker value={perfume} onChange={next => { setPerfume(next); setVolume('') }} />
        <MappingVolume perfumeId={perfume?.id} value={volume} onChange={setVolume} />
        <div className="editor-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={!perfume || !volume}>Use match</button>
        </div>
      </form>
    </dialog>
  )
}

function fromSuggestion(row) {
  const value = row.suggestion
  return {
    perfume: value?.perfumeId
      ? { id: value.perfumeId, name: value.perfumeName, brand: value.brandName ? { name: value.brandName } : null }
      : undefined,
    volume: value?.volumeMl ?? null,
  }
}

function MatchingWorkspace({ shop, refreshShops }) {
  const [status, setStatus] = useState('unmatched')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [corrections, setCorrections] = useState({})
  const [approved, setApproved] = useState({})
  const [editing, setEditing] = useState(null)
  const [creating, setCreating] = useState(null)
  const [saving, setSaving] = useState(false)
  const [outcome, setOutcome] = useState(null)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const enabled = shop.state === 'ready'
  const path = `${shopPath}/${shop.id}`
  const params = new URLSearchParams({ page: String(page), q: query })
  if (status) params.set('status', status)
  const results = useCatalogRead(enabled ? `${path}/matching?${params}` : null)
  const brands = useCatalogRead(creating ? '/erp/brands' : null, true)
  const volumes = useCatalogRead(creating ? '/erp/volumes' : null)
  const selected = Object.values(approved)

  function toggle(sku, choice, checked) {
    setApproved(current => {
      const next = { ...current }
      if (checked && Object.keys(current).length < 50) {
        next[sku] = { sku, perfume_id: choice.perfume.id, volume_ml: choice.volume }
      } else if (!checked) delete next[sku]
      return next
    })
  }

  async function register() {
    if (!selected.length || pending.current || !enabled) return
    if (!window.confirm(`Register ${selected.length} approved internal mappings?`)) return
    pending.current = true
    setSaving(true)
    setOutcome(null)
    setError('')
    try {
      const response = await erpApi.request(`${path}/mappings/batch`, {
        method: 'POST', body: { records: selected }, timeoutMs: 60000,
      })
      setOutcome(response)
      setApproved(previous => {
        const next = { ...previous }
        for (const result of response.results) if (['registered', 'alreadyRegistered'].includes(result.status)) delete next[result.sku]
        return next
      })
      if (response.comparisonRefreshed) {
        setPage(1)
        results.retry()
        refreshShops()
      }
    } catch (failure) {
      setError(failure.message)
    } finally {
      pending.current = false
      setSaving(false)
    }
  }

  if (!enabled) return <p>Select Refresh to synchronize this shop before matching.</p>
  return (
    <>
      <div className="catalog-filters sku-filters">
        <label>Search marketplace products<input type="search" value={query} maxLength={100}
          onChange={event => { setQuery(event.target.value); setPage(1) }} /></label>
        <label>Matching status<select value={status} onChange={event => { setStatus(event.target.value); setPage(1) }}>
          <option value="">All statuses</option>
          {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
      </div>
      <div className="variant-toolbar">
        <p>{selected.length} approved · maximum 50 per batch</p>
        <button className="primary" disabled={!selected.length || saving} onClick={register}>{saving ? 'Registering…' : 'Register approved mappings'}</button>
        {selected.length > 0 && <button disabled={saving} onClick={() => setApproved({})}>Clear approvals</button>}
      </div>
      {error && <p role="alert">{error}</p>}
      {outcome && (
        <section className="shop-card" aria-label="Batch registration results">
          <h2>Registration results</h2>
          {!outcome.comparisonRefreshed && <p role="alert">Results are saved below. Refresh the shop to update the comparison.</p>}
          <ul className="batch-results">{outcome.results.map(result => <li key={result.sku}>
            <strong>{result.sku}</strong> · {result.status === 'alreadyRegistered' ? 'Already registered' :
              result.status === 'registered' ? 'Registered' : result.message}
          </li>)}</ul>
        </section>
      )}
      <ReadState read={results} loading="Loading marketplace results…" />
      {results.data?.items.length === 0 && <p>No products match these filters.</p>}
      {results.data?.items.length > 0 && (
        <Table label="Marketplace product matching" headings={['Marketplace product', 'SKU', 'Offer ID', 'Suggested or selected match', 'Status', 'Approval']}>
          {results.data.items.map(row => {
            const choice = corrections[row.sku] ?? fromSuggestion(row)
            const available = row.status === 'unmatched'
            return (
              <tr key={row.sku}>
                <th scope="row"><span className="catalog-name">
                  {row.imageUrl && <img className="catalog-thumb" src={row.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />}
                  {row.name}
                </span></th>
                <td>{row.sku}</td><td>{row.offerId || '—'}</td>
                <td>{choice.perfume ? <>{choice.perfume.name}{choice.perfume.brand?.name ? ` · ${choice.perfume.brand.name}` : ''}
                  <br />{choice.volume ? `${choice.volume} ml` : 'Choose registered volume'}</>
                  : row.suggestion?.extractedVolume ? `${row.suggestion.extractedVolume} ml detected · choose perfume` : '—'}</td>
                <td>{labels[row.status]}</td>
                <td>{available && (
                  <div className="matching-row-actions">
                    <label><input type="checkbox" checked={Boolean(approved[row.sku])} disabled={saving || !choice.perfume || !choice.volume
                      || (!approved[row.sku] && selected.length >= 50)}
                    onChange={event => toggle(row.sku, choice, event.target.checked)} /> Approve</label>
                    <button disabled={saving} onClick={() => setEditing({ row, ...choice })}>Correct</button>
                    <button disabled={saving} onClick={() => setCreating(row)}>Add perfume</button>
                  </div>
                )}</td>
              </tr>
            )
          })}
        </Table>
      )}
      {results.data && results.data.total > results.data.pageSize && (
        <nav className="catalog-pagination" aria-label="Marketplace result pages">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span>Page {page} of {Math.ceil(results.data.total / results.data.pageSize)}</span>
          <button disabled={page * results.data.pageSize >= results.data.total} onClick={() => setPage(page + 1)}>Next</button>
        </nav>
      )}
      {editing && <Correction draft={editing} onClose={() => setEditing(null)} onApply={choice => {
        setCorrections(previous => ({ ...previous, [editing.row.sku]: choice }))
        toggle(editing.row.sku, choice, false)
        setEditing(null)
      }} />}
      {creating && (
        <>
          <ReadState read={brands} loading="Loading brands…" /><ReadState read={volumes} loading="Loading volumes…" />
          {brands.data && volumes.data ? (
            <PerfumeEditor brands={brands.data} volumes={volumes.data} onBrandSaved={brands.retry} onClose={() => setCreating(null)}
              onSaved={value => {
                const brand = brands.data.find(item => item.id === value.brand_id)
                setEditing({ row: creating, perfume: { id: value.id, name: value.name, brand }, volume: null })
                setCreating(null)
              }} />
          ) : <button onClick={() => setCreating(null)}>Cancel perfume creation</button>}
        </>
      )}
    </>
  )
}

export default function MarketplaceMatching({ matching, shopId }) {
  const model = useShopStatus()
  const shop = model.shops?.find(item => item.id === shopId) ?? model.shops?.[0]
  return (
    <>
      {!model.shops && !model.error && <p role="status">Loading marketplace shops…</p>}
      {model.error && <div className="catalog-error"><p role="alert">{model.error}</p><button onClick={model.refresh}>Retry</button></div>}
      {matching ? (
        <>
          <header className="catalog-heading"><h1>SKU matching</h1></header>
          <p className="catalog-note">Approve mappings explicitly. Registration only changes internal Supabase mappings.</p>
          {model.shops && (
            <div className="catalog-filters sku-filters">
              <label>Marketplace shop<select value={shop?.id ?? ''} onChange={event => {
                window.location.hash = `marketplaces/matching?shop=${event.target.value}`
              }}>
                {model.shops.map(item => <option key={item.id} value={item.id}>{item.name} · {item.marketplace}</option>)}
              </select></label>
            </div>
          )}
          {shop && (
            <>
              <section className="shop-card">
                <div className="variant-toolbar"><h2>{shop.name}</h2>
                  <button disabled={model.busy || ['syncing', 'unsupported'].includes(shop.state)} onClick={() => model.sync(shop.id)}>Refresh shop</button>
                </div>
                <ShopMetrics shop={shop} />
              </section>
              <MatchingWorkspace key={shop.id + ':' + shop.lastSync} shop={shop} refreshShops={model.refresh} />
            </>
          )}
        </>
      ) : <MarketplaceOverview model={model} />}
    </>
  )
}
