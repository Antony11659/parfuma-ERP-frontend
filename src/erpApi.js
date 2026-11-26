export class ErpApiError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

function parseBackendOrigin(value, allowLocalHttp) {
  try {
    const url = new URL(value)
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') return null
    if (url.protocol === 'https:' || (allowLocalHttp && local && url.protocol === 'http:')) return url.origin
  } catch {
    return null
  }
  return null
}

export function createErpApi({ baseUrl, getSession, allowLocalHttp = false, fetcher = fetch }) {
  const origin = parseBackendOrigin(baseUrl, allowLocalHttp)

  async function request(path, { method = 'GET', body, image, sourceApproved, sourceUsagePermitted, candidateApproved, responseType = 'json', signal, timeoutMs = 12000 } = {}) {
    if (!origin) throw new ErpApiError('configuration', 'The ERP backend URL is missing or invalid.')
    const url = new URL(path, origin)
    if (url.origin !== origin || !url.pathname.startsWith('/erp/')) {
      throw new ErpApiError('configuration', 'Invalid ERP endpoint.')
    }

    let session
    try {
      const result = await getSession()
      if (!result.error) session = result.data?.session
    } catch {
      throw new ErpApiError('session', 'Could not read your session. Sign out and sign in again.')
    }

    if (!session?.access_token) {
      throw new ErpApiError('session', 'Your session is unavailable. Sign out and sign in again.')
    }

    let response
    try {
      const deadline = AbortSignal.timeout(timeoutMs)
      response = await fetcher(url, {
        method,
        body: image ?? (body === undefined ? undefined : JSON.stringify(body)),
        signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
        headers: {
          Accept: responseType === 'webp' ? 'image/webp' : 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          ...(candidateApproved === true ? { 'X-Candidate-Approved': 'true' } : {}),
          ...(image ? {
            'Content-Type': 'application/octet-stream',
            ...(sourceApproved === true ? { 'X-Source-Approved': 'true' } : {}),
            ...(sourceUsagePermitted === true ? { 'X-Source-Usage-Permitted': 'true' } : {}),
          } : body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
      })
    } catch {
      throw new ErpApiError('network', 'Could not reach the ERP backend. Try again.')
    }

    if (response.status === 401) {
      throw new ErpApiError('session', 'Your session could not be verified. Sign out and sign in again.')
    }
    if (response.status === 403) throw new ErpApiError('forbidden', 'ERP staff access is required.')
    if (response.status === 404) throw new ErpApiError('notFound', 'The requested record was not found.')
    if (!response.ok && url.pathname.startsWith('/erp/image-studio/')) {
      const payload = await response.clone().json().catch(() => null)
      if (typeof payload?.code === 'string' && payload.code.startsWith('ERP_STUDIO_') && typeof payload.message === 'string') {
        throw new ErpApiError(payload.code, payload.message)
      }
    }
    if (response.status === 400 || response.status === 409) {
      const payload = await response.json().catch(() => null)
      switch (payload?.code) {
        case 'ERP_CATALOG_DUPLICATE':
          throw new ErpApiError('duplicate', 'This name already exists in the selected catalog scope.')
        case 'ERP_CATALOG_DEPENDENCY':
          throw new ErpApiError('dependency', 'Existing orders or marketplace mappings prevent this identity change. Other fields can still be edited.')
        case 'ERP_INVALID_VOLUMES':
          throw new ErpApiError('validation', 'Select distinct volumes from the registered list.')
        case 'ERP_INVALID_VARIANT_VOLUME':
          throw new ErpApiError('validation', 'Select a registered volume.')
        case 'ERP_VARIANT_DUPLICATE':
          throw new ErpApiError('duplicate', 'This volume is already registered for this perfume.')
        case 'ERP_SKU_DUPLICATE':
          throw new ErpApiError('duplicate', 'This SKU is already registered. Existing mappings have been preserved.')
        case 'ERP_SKU_STALE':
          throw new ErpApiError('conflict', 'The mapping changed or was busy. Close this dialog, refresh the page, and try again.')
        case 'ERP_SKU_DEPENDENCY':
          throw new ErpApiError('dependency', 'Existing fulfillment or historical use prevents this change.')
        case 'ERP_SKU_FULFILLMENT':
          throw new ErpApiError('dependency', 'This Raspiv volume already has an eligible mapping.')
        case 'ERP_SKU_INVALID_VARIANT':
          throw new ErpApiError('validation', 'Select a registered perfume and volume.')
        case 'ERP_SYNC_REQUIRED':
          throw new ErpApiError('conflict', 'Complete a shop synchronization first.')
        case 'ERP_PERFUME_DELETE_BLOCKED': {
          const error = new ErpApiError('dependency', 'New or existing dependencies prevent deletion.')
          const dependencies = payload.dependencies
          const fields = ['variants', 'skuMappings', 'websiteOrderItems', 'images', 'unverifiedForeignKeys']
          if (dependencies?.canDelete === false && fields.every(field =>
            Number.isSafeInteger(dependencies[field]) && dependencies[field] >= 0,
          )) {
            error.dependencies = { ...Object.fromEntries(fields.map(field => [field, dependencies[field]])), canDelete: false }
          }
          throw error
        }
        case 'ERP_PERFUME_ARCHIVE_BUSY':
          throw new ErpApiError('conflict', 'Another catalog change is in progress. Try saving the archive status again.')
        case 'ERP_PERFUME_DELETE_BUSY':
          throw new ErpApiError('conflict', 'The perfume was busy. Check dependencies again.')
        case 'ERP_VARIANT_DEPENDENCY': {
          const sources = [
            payload.dependencies?.websiteOrders === true && 'historical website orders',
            payload.dependencies?.marketplaceMappings === true && 'marketplace SKU mappings',
          ].filter(Boolean)
          throw new ErpApiError('dependency', sources.length
            ? `This variant is used by ${sources.join(' and ')} and cannot be changed or deleted.`
            : 'Related records prevent changing or deleting this variant. Refresh before trying again.')
        }
        default:
          if (response.status === 409) throw new ErpApiError('conflict', 'The record could not be saved. Try again.')
          throw new ErpApiError('validation', 'Check the required fields and try again.')
      }
    }
    if (!response.ok) throw new ErpApiError('unavailable', 'The ERP backend could not verify access. Try again.')

    try {
      if (responseType === 'webp') {
        if (response.headers.get('Content-Type') !== 'image/webp') throw new Error('Invalid preview type')
        return await response.blob()
      }
      return await response.json()
    } catch {
      throw new ErpApiError('response', 'The ERP backend returned an unexpected response.')
    }
  }

  return { request }
}
