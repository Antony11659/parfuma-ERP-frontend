import { useEffect, useRef, useState } from 'react'
import { erpApi } from './auth'

function BrandEditor({ brand, busy, onClose, onSave }) {
  const [name, setName] = useState(brand?.name ?? '')
  const [country, setCountry] = useState(brand?.country ?? '')
  const [error, setError] = useState('')
  const dirty = name !== (brand?.name ?? '') || country !== (brand?.country ?? '')

  function save() {
    if (!name.trim()) {
      setError('Enter a brand name.')
      return
    }
    const fields = { name: name.trim(), country: country.trim() || null }
    const changed = brand
      ? Object.fromEntries(Object.entries(fields).filter(([field, value]) => value !== brand[field]))
      : fields
    if (Object.keys(changed).length) onSave(changed)
    else onClose()
  }

  return (
    <fieldset className="editor-brand" disabled={busy}>
      <legend>{brand ? 'Edit selected brand' : 'Add brand'}</legend>
      <label>Brand name<input value={name} maxLength={200} onChange={event => setName(event.target.value)} /></label>
      <label>Country<input value={country} maxLength={200} onChange={event => setCountry(event.target.value)} /></label>
      {error && <p role="alert">{error}</p>}
      <div className="editor-actions">
        <button type="button" onClick={() => {
          if (!dirty || window.confirm('Discard unsaved brand changes?')) onClose()
        }}>Cancel brand</button>
        <button type="button" onClick={save}>{busy ? 'Saving…' : 'Save brand'}</button>
      </div>
    </fieldset>
  )
}

export default function PerfumeEditor({ perfume, brands = [], volumes = [], onClose, onSaved, onBrandSaved }) {
  const isNew = !perfume
  const [name, setName] = useState(perfume?.name ?? '')
  const [brandId, setBrand] = useState(perfume?.brand.id ?? '')
  const [gender, setGender] = useState(perfume?.gender ?? '')
  const [family, setFamily] = useState(perfume?.fragrance_family ?? '')
  const [selectedVolumes, setVolumes] = useState([])
  const [search, setSearch] = useState('')
  const [brandMode, setBrandMode] = useState('')
  const [localBrands, setLocalBrands] = useState([])
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const pending = useRef(false)
  const exitApproved = useRef(false)
  const dialog = useRef(null)
  const dirty = name !== (perfume?.name ?? '') || brandId !== (perfume?.brand.id ?? '')
    || gender !== (perfume?.gender ?? '') || family !== (perfume?.fragrance_family ?? '')
    || selectedVolumes.length > 0 || Boolean(brandMode)

  const choices = [...new Map([...(perfume ? [perfume.brand] : []), ...brands, ...localBrands]
    .map(brand => [brand.id, brand])).values()]
    .sort((a, b) => a.name.localeCompare(b.name))
  const selectedBrand = choices.find(brand => brand.id === brandId)
  const matches = choices.filter(brand => brand.id === brandId || brand.name.toLowerCase().includes(search.trim().toLowerCase()))

  useEffect(() => {
    const element = dialog.current
    element.showModal()
    return () => { if (element.open) element.close() }
  }, [])

  useEffect(() => {
    const currentHash = window.location.hash
    function beforeUnload(event) {
      if (!dirty && !pending.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    function hashChange() {
      if (exitApproved.current || window.location.hash === currentHash) return
      if (pending.current || (dirty && !window.confirm('Discard unsaved changes?'))) {
        window.history.replaceState(window.history.state, '', currentHash)
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    window.addEventListener('hashchange', hashChange, true)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      window.removeEventListener('hashchange', hashChange, true)
    }
  }, [dirty])

  function close() {
    if (!pending.current && (!dirty || window.confirm('Discard unsaved changes?'))) {
      exitApproved.current = true
      onClose()
    }
  }

  async function saveBrand(body) {
    if (pending.current) return
    pending.current = true
    setBusy('brand')
    setError('')
    setMessage('')
    const edit = brandMode === 'edit'
    try {
      const brand = await erpApi.request(edit ? `/erp/brands/${brandId}` : '/erp/brands', {
        method: edit ? 'PATCH' : 'POST', body,
      })
      setLocalBrands(current => [...current, brand])
      setBrand(brand.id)
      setSearch('')
      setBrandMode('')
      setMessage(edit ? 'Brand updated.' : 'Brand added.')
      onBrandSaved?.()
    } catch (failure) {
      setError(failure.message)
    } finally {
      pending.current = false
      setBusy('')
    }
  }

  async function save(event) {
    event.preventDefault()
    if (pending.current || brandMode) return
    setError('')
    if (!name.trim() || !brandId || (isNew && (!gender || !selectedVolumes.length))) {
      setError('Enter a perfume name, select a brand and complete the required fields.')
      return
    }
    const fields = {
      name: name.trim(), brand_id: brandId, gender: gender || null, fragrance_family: family.trim() || null,
    }
    const previous = perfume && { ...perfume, brand_id: perfume.brand.id }
    const body = isNew ? { ...fields, volumes: selectedVolumes } : Object.fromEntries(
      Object.entries(fields).filter(([field, value]) => value !== previous[field]),
    )
    if (Object.keys(body).length === 0) {
      exitApproved.current = true
      onClose()
      return
    }
    pending.current = true
    setBusy('perfume')
    let saved
    try {
      saved = await erpApi.request(isNew ? '/erp/perfumes' : `/erp/perfumes/${perfume.id}`, {
        method: isNew ? 'POST' : 'PATCH', body,
      })
    } catch (failure) {
      setError(failure.message)
      return
    } finally {
      pending.current = false
      setBusy('')
    }
    exitApproved.current = true
    onSaved(saved)
  }

  return (
    <dialog ref={dialog} className="perfume-editor" aria-labelledby="perfume-editor-title" onCancel={event => {
      event.preventDefault()
      close()
    }}>
      <h2 id="perfume-editor-title">{isNew ? 'Add perfume' : 'Edit perfume'}</h2>
      <form onSubmit={save}>
        <fieldset disabled={Boolean(busy)}>
          <label>Perfume name<input required maxLength={200} value={name} onChange={event => setName(event.target.value)} /></label>
          <div className="editor-grid">
            <label>Search brands<input value={search} onChange={event => setSearch(event.target.value)} /></label>
            <label>Brand<select required value={brandId} onChange={event => setBrand(event.target.value)} disabled={Boolean(brandMode)}>
              <option value="">Select a brand</option>
              {matches.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
            </select></label>
          </div>
          <div className="editor-actions editor-brand-actions">
            <button type="button" onClick={() => { setError(''); setBrandMode('add') }} disabled={Boolean(brandMode)}>Add brand</button>
            {!isNew && <button type="button" onClick={() => { setError(''); setBrandMode('edit') }} disabled={!selectedBrand || Boolean(brandMode)}>Edit selected brand</button>}
          </div>
          {brandMode && <BrandEditor brand={brandMode === 'edit' ? selectedBrand : null} busy={busy === 'brand'}
            onClose={() => { setBrandMode(''); setError('') }} onSave={saveBrand} />}
          <div className="editor-grid">
            <label>Gender<select required={isNew} value={gender} onChange={event => setGender(event.target.value)}>
              <option value="">{isNew ? 'Select gender' : 'Unspecified'}</option>
              {gender && !['M', 'W', 'U'].includes(gender) && <option value={gender}>{gender}</option>}
              <option value="M">Men</option><option value="W">Women</option><option value="U">Unisex</option>
            </select></label>
            <label>Fragrance family<input maxLength={200} value={family} onChange={event => setFamily(event.target.value)} /></label>
          </div>
          {isNew && <fieldset className="editor-volumes"><legend>Initial volume variants</legend>
            <div>
              {volumes.map(({ volume_ml }) => <label key={volume_ml}>
                <input type="checkbox" checked={selectedVolumes.includes(volume_ml)}
                  onChange={event => setVolumes(current => event.target.checked
                    ? [...current, volume_ml] : current.filter(value => value !== volume_ml))} />
                {volume_ml} ml
              </label>)}
            </div>
          </fieldset>}
        </fieldset>
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        <div className="editor-actions">
          <button type="button" onClick={close} disabled={Boolean(busy)}>Cancel</button>
          <button className="primary" disabled={Boolean(busy || brandMode)}>{busy === 'perfume' ? 'Saving…' : 'Save perfume'}</button>
        </div>
      </form>
    </dialog>
  )
}
