import { useCallback, useEffect, useRef, useState } from 'react'
import { Archive, ArchiveRestore, Eye, Pencil, Plus, Trash2, X } from 'lucide-react'
import { erpApi } from './auth'
import PerfumeEditor from './PerfumeEditor'
import PerfumeDeleteDialog from './PerfumeDeleteDialog'
import PerfumeArchiveDialog from './PerfumeArchiveDialog'
import { ReadState, Table, useCatalogRead } from './catalogState'
import { SkuDialog } from './SkuEditor'
import './catalog.css'

export const perfumeTabs = { general: 'General', variants: 'Variants', skus: 'SKUs', images: 'Images' }
const genders = { M: 'Men', W: 'Women', U: 'Unisex' }
const dateTime = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' })

function genderLabel(gender) {
  return genders[gender] ?? gender ?? '—'
}

function ImagePreview({ url, alt, className }) {
  return /^https?:\/\//i.test(url)
    ? <img className={className} src={url} alt={alt} loading="lazy" referrerPolicy="no-referrer" />
    : <span>Preview unavailable</span>
}

function PerfumeStatus({ perfume }) {
  return <span className={`perfume-status ${perfume.is_archived ? 'is-archived' : ''}`}>
    {perfume.is_archived ? 'Archived' : 'Active'}
  </span>
}

function CatalogSearch({ applied, query, change }) {
  const input = useRef(null)
  const [draft, setDraft] = useState({ query, value: applied })
  // Restore the URL's value on navigation without remounting the focused input.
  const value = draft.query === query ? draft.value : applied
  if (draft.query !== query) setDraft({ query, value: applied })

  useEffect(() => {
    const q = value.trim()
    if (!q || q === applied) return
    const hash = query ? `#perfumes?${query}` : '#perfumes'
    const timer = window.setTimeout(() => {
      if (window.location.hash === hash) change({ q })
    }, 350)
    return () => window.clearTimeout(timer)
  }, [applied, change, query, value])

  function update(value) {
    const empty = !value.trim()
    setDraft({ query, value: empty ? '' : value })
    if (empty) change({ q: '' })
  }

  return (
    <div className="catalog-search">
      <label htmlFor="catalog-search">Search perfumes, brands or SKUs</label>
      <div className="catalog-search-field">
        <input id="catalog-search" ref={input} type="search" value={value} maxLength={100} placeholder="Enter a name or SKU"
          onChange={event => update(event.target.value)} />
        {value && <button type="button" aria-label="Clear search" onClick={() => {
          update('')
          input.current.focus()
        }}><X size={16} aria-hidden="true" /></button>}
      </div>
    </div>
  )
}

const sorts = [
  ['name:asc', 'Name A–Z'], ['name:desc', 'Name Z–A'], ['brand:asc', 'Brand A–Z'],
  ['brand:desc', 'Brand Z–A'], ['updated:desc', 'Recently updated'], ['updated:asc', 'Oldest updated'],
]

export function Catalog({ query }) {
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [archiving, setArchiving] = useState(null)
  const [selection, setSelection] = useState(null)
  const [notice, setNotice] = useState('')
  const params = new URLSearchParams(query)
  const page = Math.max(1, Number(params.get('page')) || 1)
  const search = params.get('q') ?? ''
  const brands = useCatalogRead('/erp/brands')
  const shops = useCatalogRead('/erp/shops')
  const list = useCatalogRead(`/erp/perfumes?${params}`)
  const volumes = useCatalogRead(adding ? '/erp/volumes' : null)
  const listSuffix = query ? `?${query}` : ''
  const status = params.get('status') ?? 'active'
  const selectedIds = selection?.data === list.data ? selection?.ids : undefined
  const selected = list.data?.items.filter(perfume => !perfume.is_archived && selectedIds?.has(perfume.id)) ?? []

  function toggleSelection(id) {
    const ids = new Set(selectedIds)
    if (ids.has(id)) ids.delete(id)
    else ids.add(id)
    setSelection({ data: list.data, ids })
  }

  const change = useCallback((values, targetPage = 1) => {
    const next = new URLSearchParams(query)
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    if (targetPage > 1) next.set('page', String(targetPage))
    else next.delete('page')
    window.location.hash = next.size ? `perfumes?${next}` : 'perfumes'
  }, [query])

  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1

  return (
    <>
      <header className="catalog-heading">
        <div>
          <h1>All perfumes</h1>
          {list.data && <p role="status">{list.data.total.toLocaleString('en')} matching {list.data.total === 1 ? 'perfume' : 'perfumes'}</p>}
        </div>
        <button className="catalog-add primary" disabled={!brands.data || adding} onClick={() => {
          setNotice('')
          setAdding(true)
        }}><Plus size={18} aria-hidden="true" /> Add perfume</button>
      </header>
      {notice && <p className="catalog-note" role="status">{notice}</p>}
      {adding && !volumes.data && (
        <>
          <ReadState read={volumes} loading="Loading registered volumes…" />
          <button type="button" onClick={() => setAdding(false)}>Cancel</button>
        </>
      )}
      {adding && volumes.data && (
        <PerfumeEditor brands={brands.data} volumes={volumes.data} onClose={() => setAdding(false)}
          onBrandSaved={brands.retry} onSaved={() => {
            setAdding(false)
            setNotice('Perfume added.')
            list.retry()
          }} />
      )}
      {deleting && (
        <PerfumeDeleteDialog perfume={deleting} onClose={() => setDeleting(null)} onDeleted={() => {
          setDeleting(null)
          setNotice('Perfume deleted.')
          const remainingPage = Math.max(1, Math.ceil((list.data.total - 1) / list.data.pageSize))
          if (remainingPage < page) change({}, remainingPage)
          else list.retry()
        }} />
      )}
      {archiving && <PerfumeArchiveDialog perfumes={archiving} onClose={() => setArchiving(null)} onSaved={(message, changed) => {
        setArchiving(null)
        setSelection(null)
        setNotice(message)
        const removed = status !== 'all' ? changed : 0
        const lastPage = Math.max(1, Math.ceil((list.data.total - removed) / list.data.pageSize))
        if (lastPage < page) change({}, lastPage)
        else list.retry()
      }} />}
      <div className="catalog-controls">
        <div className="catalog-tabs" role="group" aria-label="Perfume status filter">
          {[
            ['active', 'Active', list.data?.counts?.active],
            ['archived', 'Archived', list.data?.counts?.archived],
            ['all', 'All', list.data?.counts && list.data.counts.active + list.data.counts.archived],
          ].map(([value, label, count]) => (
            <button key={value} type="button" aria-pressed={status === value}
              onClick={() => change({ status: value === 'active' ? '' : value })}>
              {label}{count !== undefined && ` (${count.toLocaleString('en')})`}
            </button>
          ))}
        </div>
        <CatalogSearch applied={search} query={query} change={change} />
        <div className="catalog-filters">
          <label>Brand
            <select value={params.get('brandId') ?? ''} onChange={event => change({ brandId: event.target.value })} disabled={!brands.data}>
              <option value="">All brands</option>
              {brands.data?.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
            </select>
          </label>
          <label>Gender
            <select value={params.get('gender') ?? ''} onChange={event => change({ gender: event.target.value })}>
              <option value="">All genders</option>
              {Object.entries(genders).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>Shop
            <select value={params.get('shopId') ?? ''} onChange={event => change({ shopId: event.target.value })} disabled={!shops.data}>
              <option value="">All shops</option>
              {shops.data?.map(shop => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
            </select>
          </label>
          <label>Sort by
            <select value={`${params.get('sort') ?? 'name'}:${params.get('direction') ?? 'asc'}`} onChange={event => {
              const [sort, direction] = event.target.value.split(':')
              change({ sort, direction })
            }}>
              {sorts.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
        {brands.error && <ReadState read={brands} />}
        {shops.error && <ReadState read={shops} />}
      </div>
      <ReadState read={list} loading="Loading perfumes…" />
      {list.data && (
        <>
          {list.data.items.length === 0 ? (
            <p role="status">{list.data.total ? 'This page is empty.' : 'No perfumes match your search and filters.'}</p>
          ) : (
            <>
              {status !== 'archived' && <div className="catalog-bulk">
                <button type="button" disabled={!selected.length} onClick={() => setArchiving(selected)}>
                  Archive selected{selected.length ? ` (${selected.length})` : ''}
                </button>
              </div>}
              <Table label="Perfume catalog" className={`perfume-catalog ${status === 'archived' ? '' : 'has-selection'}`} headings={[
                ...(status !== 'archived' ? ['Select'] : []), 'Perfume', 'Gender', 'Status', 'Variants', 'SKUs', 'Actions',
              ]}>
                {list.data.items.map(perfume => (
                  <tr key={perfume.id} role="row">
                    {status !== 'archived' && <td className="perfume-select" role="cell">{!perfume.is_archived && <input type="checkbox"
                      aria-label={`Select ${perfume.name}`} checked={selectedIds?.has(perfume.id) ?? false}
                      onChange={() => toggleSelection(perfume.id)} />}</td>}
                    <th className="perfume-title" role="rowheader" scope="row">
                      <span className="catalog-name">
                        {perfume.primary_master_image
                          ? <ImagePreview className="catalog-thumb" url={perfume.primary_master_image.image_url} alt="" />
                          : <span className="catalog-thumb missing-thumb" aria-label="No primary master image">—</span>}
                        <span className="perfume-identity">
                          <span>{perfume.name}</span>
                          <span className="perfume-brand">{perfume.brand.name}</span>
                        </span>
                      </span>
                    </th>
                    <td className="perfume-gender" role="cell"><span className="perfume-card-label" aria-hidden="true">Gender</span>{genderLabel(perfume.gender)}</td>
                    <td className="perfume-status-cell" role="cell"><PerfumeStatus perfume={perfume} /></td>
                    <td className="perfume-variants" role="cell"><span className="perfume-card-label" aria-hidden="true">Variants</span>{perfume.variant_count}</td>
                    <td className="perfume-skus" role="cell"><span className="perfume-card-label" aria-hidden="true">SKUs</span>{perfume.sku_count}</td>
                    <td className="perfume-actions-cell" role="cell">
                      <div className="catalog-actions">
                        <a href={`#perfumes/${perfume.id}/general${listSuffix}`} aria-label={`View ${perfume.name}`} title="View">
                          <Eye size={18} aria-hidden="true" />
                        </a>
                        <a href={`#perfumes/${perfume.id}/general/edit${listSuffix}`} aria-label={`Edit ${perfume.name}`} title="Edit">
                          <Pencil size={18} aria-hidden="true" />
                        </a>
                        <button type="button" aria-label={`${perfume.is_archived ? 'Restore' : 'Archive'} ${perfume.name}`}
                          title={perfume.is_archived ? 'Restore perfume' : 'Archive perfume'} onClick={() => setArchiving([perfume])}>
                          {perfume.is_archived ? <ArchiveRestore size={18} aria-hidden="true" /> : <Archive size={18} aria-hidden="true" />}
                        </button>
                        <button className="perfume-delete-action" type="button" aria-label={`Delete ${perfume.name}`} title="Check deletion dependencies" onClick={() => {
                          setNotice('')
                          setDeleting(perfume)
                        }}>
                          <Trash2 size={18} aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </Table>
            </>
          )}
          {(list.data.total > 0 || page > 1) && (
            <nav className="catalog-pagination" aria-label="Perfume pagination">
              <button disabled={page <= 1} onClick={() => change({}, page > totalPages ? totalPages : page - 1)}>Previous</button>
              <span>Page {page} of {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => change({}, page + 1)}>Next</button>
            </nav>
          )}
        </>
      )}
    </>
  )
}

function General({ perfume }) {
  const fields = [
    ['Name', perfume.name], ['Brand', perfume.brand.name], ['Gender', genderLabel(perfume.gender)],
    ['Fragrance family', perfume.fragrance_family || '—'],
    ['Status', <PerfumeStatus perfume={perfume} />],
    ...(perfume.archived_at ? [['Archived at', dateTime.format(new Date(perfume.archived_at))]] : []),
    ['Created', dateTime.format(new Date(perfume.created_at))],
    ['Updated', dateTime.format(new Date(perfume.updated_at))],
  ]
  return <dl className="catalog-fields">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
}

function VariantDialog({ path, action, options, onClose, onSaved }) {
  const variant = action.variant
  const remove = action.kind === 'delete'
  const title = { add: 'Add variant', edit: 'Edit variant', delete: 'Delete variant' }[action.kind]
  const [volume, setVolume] = useState(String(variant?.volume_ml ?? ''))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const dialog = useRef(null)

  useEffect(() => {
    const element = dialog.current
    element.showModal()
    return () => { if (element.open) element.close() }
  }, [])

  async function submit(event) {
    event.preventDefault()
    if (pending.current) return
    const selectedVolume = Number(volume)
    if (!remove && (!options.includes(selectedVolume) || selectedVolume === variant?.volume_ml)) {
      setError('Select a different available volume.')
      return
    }
    pending.current = true
    setBusy(true)
    setError('')
    const method = remove ? 'DELETE' : variant ? 'PATCH' : 'POST'
    try {
      await erpApi.request(variant ? `${path}/${variant.id}` : path, {
        method, body: remove ? undefined : { volume_ml: selectedVolume },
      })
    } catch (failure) {
      setError(failure.message)
      return
    } finally {
      pending.current = false
      setBusy(false)
    }
    onSaved({ add: 'Variant added.', edit: 'Variant updated.', delete: 'Variant deleted.' }[action.kind])
  }

  return (
    <dialog ref={dialog} className="perfume-editor variant-dialog" aria-labelledby="variant-dialog-title" onCancel={event => {
      event.preventDefault()
      if (!pending.current) onClose()
    }}>
      <h2 id="variant-dialog-title">{title}</h2>
      <form onSubmit={submit}>
        {remove ? <p>Delete the {variant.volume_ml} ml variant? This action cannot be undone.</p> : (
          <label>Registered volume
            <select required value={volume} disabled={busy} onChange={event => {
              setVolume(event.target.value)
              setError('')
            }}>
              <option value="">Select a volume</option>
              {options.map(option => <option key={option} value={option}>{option} ml</option>)}
            </select>
          </label>
        )}
        {error && <p role="alert">{error}</p>}
        <div className="editor-actions">
          <button type="button" onClick={onClose} disabled={busy} autoFocus={remove}>Cancel</button>
          <button className={remove ? 'variant-delete' : 'primary'}
            disabled={busy || (!remove && (!volume || Number(volume) === variant?.volume_ml))}>
            {busy ? (remove ? 'Deleting…' : 'Saving…') : (remove ? 'Delete variant' : 'Save variant')}
          </button>
        </div>
      </form>
    </dialog>
  )
}

function Variants({ items, path, onSaved }) {
  const volumes = useCatalogRead('/erp/volumes')
  const [action, setAction] = useState(null)
  const registered = volumes.data?.map(item => item.volume_ml) ?? []
  const used = new Set(items.map(item => item.volume_ml))
  const available = registered.filter(volume => !used.has(volume))
  const activeVolume = action?.variant?.volume_ml
  const options = activeVolume === undefined ? available : [...available, activeVolume].sort((a, b) => a - b)

  return (
    <>
      <div className="variant-toolbar">
        <p>Variants used by historical orders or marketplace SKU mappings cannot be changed or deleted.</p>
        <button className="catalog-add primary" type="button" disabled={!available.length}
          onClick={() => setAction({ kind: 'add' })}><Plus size={18} aria-hidden="true" /> Add variant</button>
      </div>
      <ReadState read={volumes} loading="Loading registered volumes…" />
      {volumes.data && !available.length && <p className="catalog-note">All registered volumes are already in use for this perfume.</p>}
      {items.length ? (
        <Table label="Volume variants" headings={['Variant ID', 'Volume', 'Actions']}>
          {items.map(variant => (
            <tr key={variant.id}>
              <th scope="row">{variant.id}</th><td>{variant.volume_ml} ml</td>
              <td><div className="catalog-actions">
                <button type="button" disabled={!available.length} onClick={() => setAction({ kind: 'edit', variant })}
                  aria-label={`Edit ${variant.volume_ml} ml variant`} title="Edit"><Pencil size={18} aria-hidden="true" /></button>
                <button type="button" onClick={() => setAction({ kind: 'delete', variant })}
                  aria-label={`Delete ${variant.volume_ml} ml variant`} title="Delete"><Trash2 size={18} aria-hidden="true" /></button>
              </div></td>
            </tr>
          ))}
        </Table>
      ) : <p>No volume variants are registered.</p>}
      {action && <VariantDialog path={path} action={action} options={options} onClose={() => setAction(null)}
        onSaved={message => { setAction(null); onSaved(message) }} />}
    </>
  )
}

function SkuMappings({ items, perfume, onSaved }) {
  const [shopId, setShop] = useState('')
  const [volume, setVolume] = useState('')
  const [status, setStatus] = useState('')
  const [query, setQuery] = useState('')
  const [editor, setEditor] = useState(null)
  const shops = [...new Map(items.map(item => [item.shop.id, item.shop])).values()]
  const volumes = [...new Set(items.map(item => item.volume_ml))].sort((a, b) => a - b)
  const filtered = items.filter(item => (
    (!shopId || item.shop.id === shopId)
    && (!volume || item.volume_ml === Number(volume))
    && (!status || (status === 'archived' ? item.is_archived : !item.is_archived && item.is_active === (status === 'active')))
    && item.sku.toLowerCase().includes(query.trim().toLowerCase())
  ))

  return (
    <>
      <div className="variant-toolbar">
        <p>Manage internal mappings. Existing SKU identities and permanent deletion are locked for fulfillment safety.</p>
        <button className="catalog-add primary" type="button" onClick={() => setEditor({})}><Plus size={18} aria-hidden="true" /> Add SKU</button>
      </div>
      <div className="catalog-filters sku-filters">
        <label>Search SKU<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <label>Shop
          <select value={shopId} onChange={event => setShop(event.target.value)}>
            <option value="">All shops</option>
            {shops.map(shop => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
          </select>
        </label>
        <label>Volume
          <select value={volume} onChange={event => setVolume(event.target.value)}>
            <option value="">All volumes</option>
            {volumes.map(value => <option key={value} value={value}>{value} ml</option>)}
          </select>
        </label>
        <label>Status
          <select value={status} onChange={event => setStatus(event.target.value)}>
            <option value="">All statuses</option>
            <option value="active">Active</option><option value="inactive">Inactive</option><option value="archived">Archived</option>
          </select>
        </label>
      </div>
      {items.some(item => item.ambiguous) && (
        <p className="mapping-warning">Mapping ambiguity. Multiple active, non-archived SKUs share a shop and volume for this perfume.</p>
      )}
      {items.some(item => item.shop.code.toLowerCase() === 'raspiv') && (
        <p className="catalog-note">Raspiv status changes are locked because website fulfillment uses those flags.</p>
      )}
      {filtered.length ? (
        <Table label="Marketplace SKU mappings" headings={['Marketplace', 'Shop', 'SKU', 'Volume', 'Active', 'Archived', 'Mapping', 'Actions']}>
          {filtered.map(item => (
            <tr key={item.id}>
              <td>{item.shop.marketplace}</td><td>{item.shop.name}</td><th scope="row">{item.sku}</th>
              <td>{item.volume_ml} ml</td><td>{item.is_active ? 'Yes' : 'No'}</td><td>{item.is_archived ? 'Yes' : 'No'}</td>
              <td>{item.ambiguous ? <span className="mapping-warning">Ambiguous</span> : '—'}</td>
              <td><div className="catalog-actions">
                <button type="button" aria-label={`Edit SKU ${item.sku}`} title="Edit internal status"
                  disabled={item.shop.code.toLowerCase() === 'raspiv' || item.shop.marketplace.toLowerCase() !== 'ozon'}
                  onClick={() => setEditor({ mapping: item })}><Pencil size={18} aria-hidden="true" /></button>
                <button type="button" aria-label={`Delete SKU ${item.sku}`} title="Historical usage cannot be verified" disabled>
                  <Trash2 size={18} aria-hidden="true" />
                </button>
              </div></td>
            </tr>
          ))}
        </Table>
      ) : <p role="status">{items.length ? 'No SKU mappings match these filters.' : 'No SKU mappings are registered.'}</p>}
      {editor && <SkuDialog perfume={perfume} mapping={editor.mapping} onClose={() => setEditor(null)}
        onSaved={message => { setEditor(null); onSaved(message) }} />}
    </>
  )
}

function RegisteredImages({ items, perfumeName }) {
  if (!items.length) return <p>No master images are registered for this perfume.</p>

  return (
    <div className="catalog-images">
      {items.map(image => (
        <article key={image.id} className="catalog-image">
          <ImagePreview className="master-preview" url={image.image_url} alt={`Master image for ${perfumeName}`} />
          <dl className="catalog-fields">
            <div><dt>Image ID</dt><dd>{image.id}</dd></div>
            <div><dt>Type</dt><dd>{image.image_type}</dd></div>
            <div><dt>Primary</dt><dd>{image.is_primary ? 'Yes' : 'No'}</dd></div>
            <div><dt>Sort order</dt><dd>{image.sort_order}</dd></div>
            <div><dt>Dimensions</dt><dd>{image.width_px} × {image.height_px} px</dd></div>
            <div><dt>Size</dt><dd>{image.size_bytes.toLocaleString('en')} bytes</dd></div>
            <div><dt>MIME type</dt><dd>{image.mime_type}</dd></div>
            <div><dt>Storage key</dt><dd>{image.storage_key}</dd></div>
          </dl>
        </article>
      ))}
    </div>
  )
}

export function PerfumeDetails({ id, tab, edit, listQuery }) {
  const [notice, setNotice] = useState('')
  const [brandChanged, setBrandChanged] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const path = `/erp/perfumes/${id}`
  const details = useCatalogRead(path)
  const brands = useCatalogRead(edit ? '/erp/brands' : null)
  const section = useCatalogRead(details.data && tab !== 'general' ? `${path}/${tab}` : null, tab === 'skus')
  const suffix = listQuery ? `?${listQuery}` : ''
  const generalHash = `#perfumes/${id}/general${suffix}`

  function closeEditor(saved) {
    window.location.replace(generalHash)
    if (saved || brandChanged) details.retry()
    if (saved) setNotice('Perfume updated.')
    setBrandChanged(false)
  }

  return (
    <>
      <a className="catalog-link" href={`#perfumes${suffix}`}>← All perfumes</a>
      <header className="catalog-heading"><h1>{details.data?.name ?? 'Perfume details'}</h1></header>
      {notice && <p className="catalog-note" role="status">{notice}</p>}
      <ReadState read={details} loading="Loading perfume…" />
      {details.data && (
        <>
          <nav className="catalog-tabs" aria-label="Perfume details">
            {Object.entries(perfumeTabs).map(([key, label]) => (
              <a key={key} href={`#perfumes/${id}/${key}${suffix}`} aria-current={tab === key ? 'page' : undefined}>{label}</a>
            ))}
          </nav>
          {tab === 'general' && (
            <>
              <div className="catalog-general-actions">
                <a className="catalog-link" href={`#perfumes/${id}/general/edit${suffix}`} onClick={() => setNotice('')}>Edit perfume</a>
                <button type="button" disabled={edit} onClick={() => setArchiving(true)}>
                  {details.data.is_archived ? 'Restore perfume' : 'Archive perfume'}
                </button>
              </div>
              {archiving && <PerfumeArchiveDialog perfumes={[details.data]} onClose={() => setArchiving(false)} onSaved={message => {
                setArchiving(false)
                setNotice(message)
                details.retry()
              }} />}
              <General perfume={details.data} />
              {edit && !brands.data && (
                <>
                  <ReadState read={brands} loading="Loading brands…" />
                  <a className="catalog-link" href={generalHash}>Cancel</a>
                </>
              )}
              {edit && brands.data && (
                <PerfumeEditor perfume={details.data} brands={brands.data} onClose={() => closeEditor(false)}
                  onBrandSaved={() => setBrandChanged(true)} onSaved={() => closeEditor(true)} />
              )}
            </>
          )}
          {tab !== 'general' && <ReadState read={section} loading={`Loading ${perfumeTabs[tab].toLowerCase()}…`} />}
          {tab === 'variants' && section.data && (
            <Variants items={section.data} path={`${path}/variants`} onSaved={message => {
              setNotice(message)
              section.retry()
            }} />
          )}
          {tab === 'skus' && section.data && <SkuMappings items={section.data} perfume={details.data} onSaved={message => {
            setNotice(message)
            section.retry()
          }} />}
          {tab === 'images' && (
            <>
              <a className="catalog-link" href="#image-library">Open Image library</a>
              {section.data && <RegisteredImages items={section.data} perfumeName={details.data.name} />}
            </>
          )}
        </>
      )}
    </>
  )
}
