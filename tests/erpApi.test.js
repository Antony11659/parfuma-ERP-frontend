import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createErpApi } from '../src/erpApi.js'

const account = { id: 'fixture', email: 'staff@example.test', erpStaff: true }
const getSession = async () => ({ data: { session: { access_token: 'test-token' } } })
const api = (fetcher, overrides = {}) => createErpApi({
  baseUrl: 'http://127.0.0.1:3000',
  allowLocalHttp: true,
  getSession,
  fetcher,
  ...overrides,
})

test('attaches the current token to the configured ERP origin', async () => {
  const client = api(async (url, options) => {
    assert.equal(url.href, 'http://127.0.0.1:3000/erp/me')
    assert.equal(options.headers.Authorization, 'Bearer test-token')
    assert.equal(options.credentials, 'omit')
    assert.equal(options.redirect, 'error')
    assert.equal(options.cache, 'no-store')
    return Response.json(account)
  })
  assert.deepEqual(await client.request('/erp/me'), account)
})

test('avoids requests without a session or to invalid destinations', async (t) => {
  const fetcher = t.mock.fn()
  await assert.rejects(api(fetcher, { getSession: async () => ({ data: { session: null } }) }).request('/erp/me'), { code: 'session' })
  await assert.rejects(api(fetcher).request('https://other.example.test/erp/me'), { code: 'configuration' })
  await assert.rejects(api(fetcher).request('/health'), { code: 'configuration' })
  await assert.rejects(api(fetcher, { allowLocalHttp: false }).request('/erp/me'), { code: 'configuration' })
  assert.equal(fetcher.mock.callCount(), 0)
})

for (const [status, code] of [
  [400, 'validation'], [401, 'session'], [403, 'forbidden'], [404, 'notFound'], [503, 'unavailable'],
]) {
  test(`maps HTTP ${status} to a safe client error`, async () => {
    const client = api(async () => Response.json({ message: 'internal details' }, { status }))
    await assert.rejects(client.request('/erp/me'), error => code === error.code && !error.message.includes('internal details'))
  })
}

test('handles network failures and malformed API responses', async () => {
  const offline = api(async () => { throw Error('internal details') })
  await assert.rejects(offline.request('/erp/me'), { code: 'network' })
  const badResponse = api(async () => new Response('<html>'))
  await assert.rejects(badResponse.request('/erp/me'), { code: 'response' })
})

test('sends catalog patches as authenticated JSON and preserves bigint URL text', async () => {
  const client = api(async (url, options) => {
    assert.equal(url.pathname, '/erp/perfumes/9007199254740993')
    assert.equal(options.method, 'PATCH')
    assert.equal(options.headers.Authorization, 'Bearer test-token')
    assert.equal(options.headers['Content-Type'], 'application/json')
    assert.deepEqual(JSON.parse(options.body), { fragrance_family: null })
    return Response.json({ id: '9007199254740993' })
  })
  assert.deepEqual(await client.request('/erp/perfumes/9007199254740993', {
    method: 'PATCH', body: { fragrance_family: null },
  }), { id: '9007199254740993' })
})

test('deletes a variant without a JSON body and preserves its bigint URL', async () => {
  const path = '/erp/perfumes/9007199254740993/variants/9007199254740994'
  const client = api(async (url, options) => {
    assert.equal(url.pathname, path)
    assert.equal(options.method, 'DELETE')
    assert.equal(options.headers.Authorization, 'Bearer test-token')
    assert.equal(options.body, undefined)
    assert.equal(options.headers['Content-Type'], undefined)
    return Response.json({ id: '9007199254740994', volume_ml: 10 })
  })
  assert.equal((await client.request(path, { method: 'DELETE' })).id, '9007199254740994')
})

test('variant dependency errors identify both sources using only safe fields', async () => {
  const client = api(async () => Response.json({
    code: 'ERP_VARIANT_DEPENDENCY', message: 'private',
    dependencies: { websiteOrders: true, marketplaceMappings: true },
  }, { status: 409 }))
  await assert.rejects(client.request('/erp/perfumes/1/variants/2', { method: 'DELETE' }), {
    code: 'dependency',
    message: 'This variant is used by historical website orders and marketplace SKU mappings and cannot be changed or deleted.',
  })
})

test('perfume deletion returns fresh blocker counts without exposing raw database text', async () => {
  const path = '/erp/perfumes/9007199254740993'
  const dependencies = { variants: 2, images: 1, skuMappings: 0, websiteOrderItems: 0, unverifiedForeignKeys: 0, canDelete: false }
  const client = api(async (url, options) => {
    assert.equal(url.pathname, path)
    assert.equal(options.method, 'DELETE')
    assert.equal(options.body, undefined)
    return Response.json({
      code: 'ERP_PERFUME_DELETE_BLOCKED',
      message: 'private',
      dependencies: { ...dependencies, private: 'hidden' },
    }, { status: 409 })
  })
  await assert.rejects(client.request(path, { method: 'DELETE' }), error => {
    assert.deepEqual(error.dependencies, dependencies)
    return error.code === 'dependency' && !error.message.includes('private')
  })
})

for (const [backendCode, code] of [
  ['ERP_CATALOG_DUPLICATE', 'duplicate'],
  ['ERP_CATALOG_DEPENDENCY', 'dependency'],
  ['ERP_CATALOG_CONCURRENT_EDIT', 'conflict'],
  ['ERP_SKU_DUPLICATE', 'duplicate'],
  ['ERP_SKU_STALE', 'conflict'],
  ['ERP_SKU_DEPENDENCY', 'dependency'],
  ['ERP_SKU_FULFILLMENT', 'dependency'],
  ['ERP_SYNC_REQUIRED', 'conflict'],
  ['ERP_PERFUME_ARCHIVE_BUSY', 'conflict'],
]) {
  test(`handles ${backendCode} without exposing arbitrary backend text`, async () => {
    const client = api(async () => Response.json({ code: backendCode, message: 'private' }, { status: 409 }))
    await assert.rejects(client.request('/erp/perfumes'), error => error.code === code && !error.message.includes('private'))
  })
}

test('batch transport preserves SKU text and decimal-string perfume IDs', async () => {
  const records = [{ sku: '000123', perfume_id: '9007199254740993', volume_ml: 10 }]
  const client = api(async (url, options) => {
    assert.equal(url.pathname, '/erp/marketplaces/shops/fixture/mappings/batch')
    assert.deepEqual(JSON.parse(options.body), { records })
    return Response.json({ results: [{ sku: '000123', status: 'registered' }], comparisonRefreshed: true })
  })
  const result = await client.request('/erp/marketplaces/shops/fixture/mappings/batch', {
    method: 'POST', body: { records }, timeoutMs: 60000,
  })
  assert.equal(result.results[0].sku, '000123')
})

test('bulk archive sends only decimal-string perfume IDs in the authenticated request', async () => {
  const path = '/erp/perfumes/bulk-archive'
  const ids = ['9007199254740993', '9007199254740994']
  const client = api(async (url, options) => {
    assert.equal(url.pathname, path)
    assert.equal(options.method, 'POST')
    assert.deepEqual(JSON.parse(options.body), { ids })
    return Response.json({ changed: 2 })
  })
  assert.deepEqual(await client.request(path, { method: 'POST', body: { ids } }), { changed: 2 })
})
