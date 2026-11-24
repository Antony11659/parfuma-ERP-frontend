import { useEffect, useState, useSyncExternalStore } from 'react'
import { Box, ChevronDown, ClipboardList, FlaskConical, Images, LayoutDashboard, Settings, ShoppingBag, Wallet } from 'lucide-react'
import { Catalog, PerfumeDetails, perfumeTabs } from './PerfumeCatalog'
import MarketplaceMatching from './MarketplaceMatching'

const pilot = { perfumes: 375, registered: 5 }
const remaining = pilot.perfumes - pilot.registered
const coverage = pilot.registered / pilot.perfumes * 100
const businessMetrics = ['Total revenue', 'Net profit', "Today's orders", 'Orders to process']

const navigation = [
  { label: 'Dashboard', href: '#overview', Icon: LayoutDashboard },
  {
    label: 'Perfumes',
    href: '#perfumes',
    Icon: FlaskConical,
    children: [
      { label: 'All perfumes', href: '#perfumes', Icon: FlaskConical },
      { label: 'Image library', href: '#image-library', Icon: Images },
    ],
  },
  {
    label: 'Marketplaces', href: '#marketplaces', Icon: ShoppingBag,
    children: [
      { label: 'Overview', href: '#marketplaces', Icon: LayoutDashboard },
      { label: 'SKU matching', href: '#marketplaces/matching', Icon: ClipboardList },
      { label: 'Product coverage', href: '#marketplaces/coverage', Icon: Box },
      { label: 'Product creation', href: '#marketplaces/creation', Icon: ShoppingBag },
    ],
  },
  { label: 'Inventory', href: '#inventory', Icon: Box },
  { label: 'Orders', href: '#orders', Icon: ClipboardList },
  { label: 'Accounting', href: '#accounting', Icon: Wallet },
  { label: 'Settings', href: '#settings', Icon: Settings },
]

const pages = navigation.flatMap(item => item.children ?? [item])

function subscribeToHash(listener) {
  window.addEventListener('hashchange', listener)
  return () => window.removeEventListener('hashchange', listener)
}

function getHash() {
  return window.location.hash
}

function NavigationLink({ item: { label, href, Icon }, current = false, onClick }) {
  return (
    <a className="nav-link" href={href} aria-current={current ? 'page' : undefined} onClick={onClick}>
      <Icon size={19} strokeWidth={1.75} aria-hidden="true" />
      {label}
    </a>
  )
}

function NavigationGroup({ item, activeHref }) {
  const childIsActive = item.children.some(child => child.href === activeHref)
  const [expanded, setExpanded] = useState(childIsActive)
  const submenu = `${item.href.slice(1)}-submenu`

  useEffect(() => {
    if (childIsActive) setExpanded(true)
  }, [activeHref, childIsActive])

  return (
    <div className={item.href === '#marketplaces' ? 'nav-group marketplace-nav-group' : 'nav-group'}>
      <div className="nav-group-header">
        <NavigationLink item={item} onClick={() => setExpanded(true)} />
        <button
          type="button"
          className="nav-toggle"
          aria-label={`Toggle ${item.label} submenu`}
          aria-expanded={expanded}
          aria-controls={submenu}
          onClick={() => setExpanded(open => !open)}
        >
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      </div>
      <ul className="nav-submenu" id={submenu} hidden={!expanded}>
        {item.children.map(child => (
          <li key={child.href}>
            <NavigationLink item={child} current={activeHref === child.href} />
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function Dashboard({ brand, email, action, error, preview }) {
  const hash = useSyncExternalStore(subscribeToHash, getHash)
  const [path, query = ''] = hash.split('?')
  const detail = /^#perfumes\/([1-9][0-9]{0,18})(?:\/([a-z]+))?(\/edit)?$/.exec(path)
  const detailsTab = detail && (detail[2] || 'general')
  const isCatalog = path === '#perfumes' || (detail && Object.hasOwn(perfumeTabs, detailsTab))
  const isMatching = path === '#marketplaces/matching'
  const isMarketplace = path === '#marketplaces' || isMatching
  const active = pages.find(item => item.href === (isCatalog ? '#perfumes' : path)) ?? pages[0]

  return (
    <div className="workspace">
      <aside className="sidebar">
        {brand}
        <nav aria-label="Workspace">
          {navigation.map(item => item.children ? (
            <NavigationGroup key={item.href} item={item} activeHref={active.href} />
          ) : (
            <NavigationLink key={item.href} item={item} current={active.href === item.href} />
          ))}
        </nav>
      </aside>
      <div className="content">
        <header className="topbar">
          <span>{preview ? 'Local preview' : 'Staff workspace'}</span>
          <div className="actions">{email && <span className="account">{email}</span>}{action}</div>
        </header>
        {active.href === '#overview' ? <main id="overview" className="overview">
          {error && <p role="alert">{error}</p>}
          <header className="overview-title">
            <h1>Business overview</h1>
          </header>
          <dl className="metrics business-metrics">
            {businessMetrics.map(label => (
              <div key={label}><dt>{label}</dt><dd>Not connected yet</dd></div>
            ))}
          </dl>
        </main> : active.href === '#image-library' ? (
          <main className="overview">
            {error && <p role="alert">{error}</p>}
            <header className="overview-title">
              <h1>Image library</h1>
              <p>Live statistics, filtering, image processing, and uploading are planned for Stage 3.</p>
            </header>
            <section aria-labelledby="snapshot-title">
              <h2 id="snapshot-title" className="section-label">Initial snapshot</h2>
              <dl className="metrics">
                <div><dt>Total perfumes</dt><dd>{pilot.perfumes}</dd></div>
                <div><dt>Registered master images</dt><dd>{pilot.registered}</dd></div>
                <div><dt>Missing master images</dt><dd>{remaining}</dd></div>
              </dl>
              <div className="coverage">
                <div className="coverage-heading">
                  <div>
                    <h3 id="coverage-title">Master image completion</h3>
                    <p>{pilot.registered} of {pilot.perfumes} perfumes have a registered master image.</p>
                  </div>
                  <strong>{coverage.toFixed(2)}%</strong>
                </div>
                <progress aria-labelledby="coverage-title" value={pilot.registered} max={pilot.perfumes} />
              </div>
            </section>
          </main>
        ) : isMarketplace && !preview ? (
          <main className="overview">
            {error && <p role="alert">{error}</p>}
            <MarketplaceMatching matching={isMatching} shopId={new URLSearchParams(query).get('shop')} />
          </main>
        ) : isCatalog && !preview ? (
          <main className="overview">
            {error && <p role="alert">{error}</p>}
            {detail
              ? <PerfumeDetails key={detail[1]} id={detail[1]} tab={detailsTab} edit={detailsTab === 'general' && Boolean(detail[3])} listQuery={query} />
              : <Catalog query={query} />}
          </main>
        ) : (
          <main className="overview">
            {error && <p role="alert">{error}</p>}
            <h1>{active.label}</h1>
            <p>{isCatalog || isMarketplace ? 'Sign in as staff to view live data.' : 'This module is planned.'}</p>
          </main>
        )}
      </div>
    </div>
  )
}
