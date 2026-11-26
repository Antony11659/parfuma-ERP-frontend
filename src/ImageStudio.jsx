import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Images } from 'lucide-react'
import { erpApi } from './auth'
import './imageStudio.css'

const base = '/erp/image-studio'
const terminal = ['completed', 'failed']
const labels = {
  queued: 'Queued', preprocessing: 'Preprocessing reference', composing: 'Composing image',
  validating: 'Validating candidate', completed: 'Candidate ready', failed: 'Composition failed',
}

function usePreview(blob, sniff = false) {
  const [preview, setPreview] = useState(null)
  useEffect(() => {
    if (!blob) return
    const url = URL.createObjectURL(sniff ? blob.slice() : blob)
    setPreview({ blob, url })
    return () => URL.revokeObjectURL(url)
  }, [blob, sniff])
  return preview && preview.blob === blob ? preview.url : null
}

function PerfumePicker({ disabled, onSelect, selected }) {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState({ q: '', page: 1 })
  const [result, setResult] = useState(null)
  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ q: query.q, page: query.page, pageSize: 12 })
    erpApi.request(`/erp/image-library/perfumes?${params}`, { signal: controller.signal }).then(
      data => { if (!controller.signal.aborted) setResult({ query, data }) },
      error => { if (!controller.signal.aborted) setResult({ query, error }) },
    )
    return () => controller.abort()
  }, [query])

  const current = result?.query === query ? result : null
  const data = current?.data
  return (
    <fieldset className="studio-panel" disabled={disabled}>
      <legend>Active perfume</legend>
      <form className="studio-search" onSubmit={event => {
        event.preventDefault()
        setQuery({ q: search.trim(), page: 1 })
      }}>
        <label>Search by perfume or brand<input type="search" value={search} maxLength={100} onChange={event => setSearch(event.target.value)} /></label>
        <button type="submit">Search</button>
      </form>
      {selected && <p className="studio-selected">Selected <strong>{selected.name} · {selected.brand.name}</strong></p>}
      {!current && <p role="status">Loading active perfumes…</p>}
      {current?.error && <div className="actions"><p role="alert">{current.error.message}</p><button onClick={() => setQuery({ ...query })}>Try again</button></div>}
      {data && (
        <>
          <ul className="studio-perfumes">
            {data.items.map(perfume => (
              <li key={perfume.id}>
                <button type="button" aria-pressed={selected?.id === perfume.id} onClick={() => onSelect(perfume)}>
                  <strong>{perfume.name}</strong><span>{perfume.brand.name}</span>
                </button>
              </li>
            ))}
          </ul>
          {data.total === 0 ? <p>No active perfumes match this search.</p> : (
            <div className="library-pagination">
              <button disabled={query.page === 1} onClick={() => setQuery({ ...query, page: query.page - 1 })}>Previous</button>
              <span>Page {query.page} of {Math.ceil(data.total / data.pageSize)}</span>
              <button disabled={query.page * data.pageSize >= data.total} onClick={() => setQuery({ ...query, page: query.page + 1 })}>Next</button>
            </div>
          )}
        </>
      )}
    </fieldset>
  )
}

function Preview({ heading, url, description, placeholder }) {
  return (
    <figure className="studio-preview">
      <figcaption>{heading}</figcaption>
      <div>{url ? <img src={url} alt={description} /> : <p><Images size={24} aria-hidden="true" />{placeholder}</p>}</div>
    </figure>
  )
}

function Validation({ details }) {
  return (
    <details className="studio-panel studio-validation">
      <summary>Technical validation</summary>
      <dl>
        <div><dt>Output</dt><dd>{details.width} × {details.height} · {details.aspectRatio} · {details.format.toUpperCase()}</dd></div>
        <div><dt>File size</dt><dd>{details.bytes.toLocaleString('en')} bytes</dd></div>
        <div><dt>Preset</dt><dd>{details.preset}</dd></div>
        <div><dt>Source image</dt><dd>{details.sourceWidth} × {details.sourceHeight}{details.sourceFormat && ` · ${details.sourceFormat}`}</dd></div>
        <div><dt>Canvas</dt><dd>{details.opaque ? 'Opaque' : 'Transparent'} · {details.clipped ? 'Clipped' : 'No clipping'}</dd></div>
        <div><dt>Source preparation</dt><dd>{details.method === 'existing-alpha' ? 'Existing transparency preserved' : 'Background segmented'}</dd></div>
        <div><dt>Preprocessing</dt><dd>{(details.preprocessingMs / 1000).toFixed(2)} s</dd></div>
        <div><dt>Composition</dt><dd>{(details.compositionMs / 1000).toFixed(2)} s</dd></div>
        {['source', 'cutout', 'candidate'].map(key => <div key={key}><dt>{key} SHA-256</dt><dd><code>{details[`${key}Sha256`]}</code></dd></div>)}
      </dl>
    </details>
  )
}

function ReferenceConfirmation({ file, perfume, onCancel, onConfirm }) {
  const dialog = useRef(null)
  const [approved, setApproved] = useState(false)
  const [permitted, setPermitted] = useState(false)

  useEffect(() => {
    const modal = dialog.current
    modal.showModal()
    return () => modal.close()
  }, [])

  return (
    <dialog ref={dialog} className="studio-confirmation" aria-labelledby="studio-confirmation-title"
      onCancel={event => { event.preventDefault(); onCancel() }}>
      <form onSubmit={event => {
        event.preventDefault()
        if (approved && permitted) onConfirm(file)
      }}>
        <h3 id="studio-confirmation-title">Confirm image use</h3>
        <p className="studio-file-name">{file.name} · {perfume.name}</p>
        <label className="studio-check"><input type="checkbox" checked={approved} onChange={event => setApproved(event.target.checked)} /> The owner approved this source for this perfume.</label>
        <label className="studio-check"><input type="checkbox" checked={permitted} onChange={event => setPermitted(event.target.checked)} /> We have permission to use and adapt this image.</label>
        <div className="actions studio-dialog-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button className="primary" disabled={!approved || !permitted}>Confirm</button>
        </div>
      </form>
    </dialog>
  )
}

export default function ImageStudio({ onPublished }) {
  const [selected, setSelected] = useState(null)
  const [source, setSource] = useState(null)
  const [pendingFile, setPendingFile] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [publication, setPublication] = useState(null)
  const [job, setJob] = useState(null)
  const [result, setResult] = useState(null)
  const [chooseError, setChooseError] = useState('')
  const [error, setError] = useState('')
  const fileInput = useRef(null)
  const [readError, setReadError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const sourceUrl = usePreview(source, true)
  const candidateUrl = usePreview(result?.candidate)
  const jobId = job?.id
  const busy = submitting || publication?.status === 'publishing' || Boolean(jobId && !terminal.includes(job.status))

  const canPublish = import.meta.env.VITE_ERP_IMAGE_PUBLICATION_ENABLED === 'true'
    && job?.publicationEnabled && job.status === 'completed' && Boolean(result)

  useEffect(() => {
    if (!jobId) return
    const controller = new AbortController()
    const path = `${base}/jobs/${jobId}`
    let timer
    async function read() {
      try {
        const next = await erpApi.request(path, { signal: controller.signal })
        if (controller.signal.aborted) return
        setJob(next)
        if (next.status === 'completed') {
          const [candidate, details] = await Promise.all([
            erpApi.request(`${path}/preview`, { signal: controller.signal, responseType: 'webp' }),
            erpApi.request(`${path}/validation`, { signal: controller.signal }),
          ])
          if (!controller.signal.aborted) setResult({ candidate, details })
        } else if (next.status !== 'failed') {
          timer = window.setTimeout(read, 800)
        }
      } catch (failure) {
        if (!controller.signal.aborted) setReadError(failure.message)
      }
    }
    void read()
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [jobId, attempt])

  function resetResult() {
    setJob(null)
    setResult(null)
    setPublication(null)
    setError('')
    setReadError('')
  }

  function chooseSource(event) {
    const file = event.target.files[0]
    event.target.value = ''
    if (!file || !selected || busy) return
    if (file.size < 1 || file.size > 20 * 1024 * 1024) {
      setChooseError('Choose a nonempty PNG, JPEG or WebP file of 20 MiB or less.')
      return
    }
    setChooseError('')
    setPendingFile(file)
  }

  async function submit(file) {
    if (busy || !selected || !file) return
    setPendingFile(null)
    setSource(file)
    setChooseError('')
    resetResult()
    setSubmitting(true)
    try {
      setJob(await erpApi.request(`${base}/perfumes/${selected.id}/jobs`, {
        method: 'POST', image: file, sourceApproved: true, sourceUsagePermitted: true, timeoutMs: 45000,
      }))
    } catch (failure) {
      setError(failure.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function publish() {
    if (!canPublish || busy || publication?.status === 'published') return
    if (!window.confirm(`Approve this candidate as the published primary image for ${selected.name}?`)) return
    setPublication({ status: 'publishing' })
    try {
      await erpApi.request(`${base}/jobs/${jobId}/publish`, {
        method: 'POST', candidateApproved: true, timeoutMs: 65000,
      })
      setPublication({ status: 'published' })
      onPublished()
    } catch (failure) {
      setPublication({ status: 'failed', message: failure.message })
    }
  }

  return (
    <section className="image-studio" aria-labelledby="studio-title">
      <header><h2 id="studio-title">Image Studio</h2><p>Compose a private candidate from an approved local reference.</p></header>
      <div className="studio-workspace">
        <div className="studio-controls">
          <PerfumePicker disabled={busy} selected={selected} onSelect={perfume => {
            if (selected?.id === perfume.id) return
            resetResult()
            setChooseError('')
            setSource(null)
            setSelected(perfume)
          }} />
          <input ref={fileInput} type="file" hidden onChange={chooseSource} />
          <button className="primary studio-choose" type="button" disabled={busy || !selected}
            onClick={() => fileInput.current.click()}>
            <ImagePlus size={18} aria-hidden="true" /> Choose Image
          </button>
          {chooseError && <p role="alert">{chooseError}</p>}
          {pendingFile && <ReferenceConfirmation file={pendingFile} perfume={selected}
            onCancel={() => setPendingFile(null)} onConfirm={submit} />}
        </div>
        <div className="studio-results">
          {job && <p role="status" className="studio-status">{labels[job.status]}</p>}
          {submitting && <p role="status" className="studio-status">Submitting reference…</p>}
          {(error || job?.error) && <div className="actions">
            <p role="alert">{error || job.error.message}</p>
            <button type="button" disabled={busy} onClick={() => submit(source)}>Retry composition</button>
          </div>}
          {readError && <div className="actions"><p role="alert">{readError}</p>
            <button onClick={() => { setReadError(''); setAttempt(value => value + 1) }}>Retry status</button>
            <button onClick={resetResult}>Reset local view</button>
          </div>}
          <div className="studio-comparison">
            <Preview heading="Source reference" url={sourceUrl} description="Uploaded reference" placeholder="Choose an image to preview it." />
            <Preview heading="Master candidate" url={candidateUrl} description="Private master candidate" placeholder="The validated candidate will appear here." />
          </div>
          {result && <Validation details={result.details} />}
          {publication?.status === 'published' && <p role="status" className="studio-status">Master image published.</p>}
          {publication?.status === 'failed' && <p role="alert">{publication.message}</p>}
          <button type="button" className="primary" disabled={!canPublish || busy || publication?.status === 'published'} onClick={publish}>
            {publication?.status === 'publishing' ? 'Publishing…' : publication?.status === 'failed' ? 'Retry publication' : 'Approve & Publish'}
          </button>
        </div>
      </div>
    </section>
  )
}
