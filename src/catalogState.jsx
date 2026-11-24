import { useEffect, useState } from 'react'
import { erpApi } from './auth'

export function useCatalogRead(path, keepPrevious = false) {
  const [result, setResult] = useState(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!path) return
    const controller = new AbortController()
    erpApi.request(path, { signal: controller.signal }).then(
      data => { if (!controller.signal.aborted) setResult({ path, attempt, data }) },
      error => { if (!controller.signal.aborted) setResult({ path, attempt, error }) },
    )
    return () => controller.abort()
  }, [path, attempt])

  return {
    ...(result?.path === path && result.attempt === attempt ? result : {
      loading: true,
      data: keepPrevious && result?.path === path ? result.data : undefined,
    }),
    retry: () => setAttempt(value => value + 1),
  }
}

export function ReadState({ read, loading }) {
  if (read.loading) return <p role="status">{loading}</p>
  if (!read.error) return null
  return (
    <div className="catalog-error">
      <p role="alert">{read.error.message}</p>
      <button onClick={read.retry}>Try again</button>
    </div>
  )
}

export function Table({ label, headings, className = '', children }) {
  return (
    <div className={`catalog-table-wrap ${className}`} role="region" aria-label={label} tabIndex={0}>
      <table className="catalog-table" role="table" aria-label={label}>
        <thead role="rowgroup"><tr role="row">{headings.map(heading => <th key={heading} role="columnheader" scope="col">{heading}</th>)}</tr></thead>
        <tbody role="rowgroup">{children}</tbody>
      </table>
    </div>
  )
}
