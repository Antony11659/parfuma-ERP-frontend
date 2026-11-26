import { lazy, Suspense, useEffect, useState } from 'react'
import { Image, ImageOff, Search } from 'lucide-react'
import { erpApi } from './auth'
import './imageLibrary.css'
const ImageStudio = import.meta.env.DEV && import.meta.env.VITE_ERP_IMAGE_STUDIO_ENABLED === 'true'
  ? lazy(() => import('./ImageStudio'))
  : null

const metrics = [
  ['totalPerfumes', 'Total perfumes'],
  ['activePerfumes', 'Active perfumes'],
  ['archivedPerfumes', 'Archived perfumes'],
  ['masterImageRecords', 'Registered master records'],
  ['activeWithPrimaryMaster', 'Active with a primary master'],
  ['activeWithoutPrimaryMaster', 'Active without a primary master'],
]
const views = [
  ['active', 'All Active'],
  ['missing', 'Missing Images'],
  ['registered', 'Registered Images'],
  ['archived', 'Archived'],
]
const formatCount = new Intl.NumberFormat('en')
const formatPercent = new Intl.NumberFormat('en', { maximumFractionDigits: 2, style: 'percent' })
const pageSize = 12

function useLibraryRead(path, refresh = 0) {
  const [result, setResult] = useState(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    erpApi.request(path, { signal: controller.signal }).then(
      data => {
        if (!controller.signal.aborted) setResult({ path, attempt, refresh, data })
      },
      error => {
        if (!controller.signal.aborted) setResult({ path, attempt, refresh, error })
      },
    )
    return () => controller.abort()
  }, [path, attempt, refresh])

  return {
    current: result?.path === path && result.attempt === attempt && result.refresh === refresh ? result : null,
    retry: () => setAttempt(value => value + 1),
  }
}

function ReadError({ children, retry }) {
  return <div className="library-message"><p role="alert">{children}</p><button onClick={retry}>Try again</button></div>
}

function LibraryStats({ refresh }) {
  const { current, retry } = useLibraryRead('/erp/image-library/stats', refresh)
  if (!current) return <p className="library-message" role="status">Loading image library statistics…</p>
  if (current.error) return <ReadError retry={retry}>Could not load image library statistics.</ReadError>

  const stats = current.data
  return (
    <section aria-label="Image library statistics">
      <dl className="metrics library-metrics">
        {metrics.map(([key, label]) => (
          <div key={key}><dt>{label}</dt><dd>{formatCount.format(stats[key])}</dd></div>
        ))}
      </dl>
      <div className="coverage">
        <div className="coverage-heading">
          <div>
            <h2 id="library-coverage-title">Active image coverage</h2>
            <p>{formatCount.format(stats.activeWithPrimaryMaster)} of {formatCount.format(stats.activePerfumes)} active perfumes have a registered primary master.</p>
          </div>
          <strong>{formatPercent.format(stats.activeCoveragePercent / 100)}</strong>
        </div>
        <progress aria-labelledby="library-coverage-title" value={stats.activeCoveragePercent} max={100} />
      </div>
    </section>
  )
}

function Thumbnail({ image, name }) {
  const [failedUrl, setFailedUrl] = useState(null)
  const url = image?.image_url
  return (
    <div className="library-thumbnail">
      {url && /^https:\/\//i.test(url) && failedUrl !== url ? (
        <img src={url} alt={`Primary master for ${name}`} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedUrl(url)} />
      ) : (
        <span>
          <ImageOff size={26} aria-hidden="true" />
          {image ? 'Preview unavailable' : 'No primary master'}
        </span>
      )}
    </div>
  )
}

function PerfumeCard({ perfume }) {
  const image = perfume.primary_master_image
  return (
    <li className="library-card">
      <Thumbnail image={image} name={perfume.name} />
      <div className="library-card-details">
        <div>
          <p>{perfume.brand.name}</p>
          <h3>{perfume.name}</h3>
        </div>
        {image && <p className="library-image-meta"><Image size={15} aria-hidden="true" />{image.width_px} × {image.height_px} · {image.mime_type.replace(/^image\//, '').toUpperCase()}</p>}
      </div>
    </li>
  )
}

function LibraryCatalog() {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState({ q: '', view: 'active', page: 1 })
  const params = new URLSearchParams({ view: query.view, page: query.page, pageSize })
  if (query.q) params.set('q', query.q)
  const { current, retry } = useLibraryRead(`/erp/image-library/perfumes?${params}`)
  const data = current?.data
  const lastPage = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  const setPage = page => setQuery(previous => ({ ...previous, page }))

  function submit(event) {
    event.preventDefault()
    setQuery(previous => ({ ...previous, q: search.trim(), page: 1 }))
  }

  return (
    <section className="library-catalog" aria-labelledby="library-catalog-title">
      <h2 id="library-catalog-title">Perfumes</h2>
      <form className="library-search" onSubmit={submit} role="search" aria-label="Image library perfumes">
        <label>
          <span>Search by perfume or brand</span>
          <input type="search" value={search} maxLength={100} onChange={event => {
            const value = event.target.value
            setSearch(value)
            if (!value.trim()) setQuery(previous => ({ ...previous, q: '', page: 1 }))
          }} />
        </label>
        <button type="submit"><Search size={17} aria-hidden="true" /> Search</button>
      </form>
      <div role="group" aria-label="Filter perfumes" className="library-filters">
        {views.map(([view, label]) => (
          <button key={view} type="button" aria-pressed={query.view === view}
            onClick={() => setQuery(previous => ({ ...previous, view, page: 1 }))}>{label}</button>
        ))}
      </div>
      {!current && <p className="library-message" role="status">Loading perfumes…</p>}
      {current?.error && <ReadError retry={retry}>Could not load perfumes.</ReadError>}
      {data && (
        <>
          <p className="library-result-count" role="status">{formatCount.format(data.total)} {data.total === 1 ? 'perfume' : 'perfumes'}</p>
          {data.items.length ? (
            <ul className="library-grid">{data.items.map(perfume => <PerfumeCard key={perfume.id} perfume={perfume} />)}</ul>
          ) : <p className="library-message">{query.page > lastPage ? 'This page is no longer available.' : 'No perfumes match this view.'}</p>}
          {(lastPage > 1 || query.page > 1) && (
            <nav className="library-pagination" aria-label="Image library pages">
              <button disabled={query.page === 1} onClick={() => setPage(Math.min(query.page - 1, lastPage))}>Previous</button>
              <span>Page {query.page} of {lastPage}</span>
              <button disabled={query.page >= lastPage} onClick={() => setPage(query.page + 1)}>Next</button>
            </nav>
          )}
        </>
      )}
    </section>
  )
}

export default function ImageLibrary({ preview, studio }) {
  const studioEnabled = !preview && ImageStudio !== null
  const showStudio = studioEnabled && studio
  const [refresh, setRefresh] = useState(0)
  return (
    <div className="image-library">
      <header className="overview-title"><h1>Image library</h1></header>
      {studioEnabled && (
        <nav className="studio-navigation" aria-label="Image library views">
          <a className="nav-link" href="#image-library" aria-current={!showStudio ? 'page' : undefined}>Library</a>
          <a className="nav-link" href="#image-library?view=studio" aria-current={showStudio ? 'page' : undefined}>Image Studio</a>
        </nav>
      )}
      {preview ? <p>Sign in as staff to view live data.</p> : (
        <>
          <div hidden={showStudio}><LibraryStats refresh={refresh} />{!showStudio && <LibraryCatalog />}</div>
          {showStudio && <Suspense fallback={<p role="status">Loading Image Studio…</p>}>
            <ImageStudio onPublished={() => setRefresh(value => value + 1)} />
          </Suspense>}
        </>
      )}
    </div>
  )
}
