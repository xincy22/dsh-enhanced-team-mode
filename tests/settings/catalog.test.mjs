import test from 'node:test'
import assert from 'node:assert/strict'
import { createCatalog, createHostCatalog } from '../../src/settings/catalog.js'

const providers = [{ id: 'opencode-go', name: 'opencode-go' }, { id: 'other', name: 'Other' }]
const modelsByProvider = {
  'opencode-go': [{ id: 'flash', name: 'Flash' }, { id: 'pro', name: 'Pro' }],
  other: [{ id: 'x1', name: 'X One' }],
}

test('快照装配：只保留有授权路由的 provider', () => {
  const catalog = createCatalog({
    providers,
    models: modelsByProvider,
    authorized: [{ provider: 'opencode-go', model: 'pro' }],
  })
  assert.deepEqual(catalog.providers.map((p) => p.id), ['opencode-go'])
  assert.deepEqual(catalog.models['opencode-go'].map((m) => m.id), ['flash', 'pro'])
  assert.deepEqual(catalog.authorized, [{ provider: 'opencode-go', model: 'pro' }])
})

test('快照装配：无 allowlist 时保留全部已注册 provider，authorized 为 null', () => {
  const catalog = createCatalog({ providers, models: modelsByProvider, authorized: null })
  assert.deepEqual(catalog.providers.map((p) => p.id), ['opencode-go', 'other'])
  assert.equal(catalog.authorized, null)
})

test('宿主适配器：按授权逐个拉取模型清单', async () => {
  const calls = []
  const catalog = await createHostCatalog({
    listProviders: () => providers,
    listModels: async (id) => { calls.push(id); return modelsByProvider[id] ?? [] },
    authorized: [{ provider: 'opencode-go', model: 'pro' }],
  })
  assert.deepEqual(calls, ['opencode-go'])
  assert.deepEqual(catalog.models['opencode-go'].map((m) => m.id), ['flash', 'pro'])
  assert.deepEqual(catalog.failures, [])
})

test('宿主适配器：某 provider 拉取失败记入 failures，且不编造模型', async () => {
  const catalog = await createHostCatalog({
    listProviders: () => providers,
    listModels: async (id) => {
      if (id === 'other') throw new Error('adapter down')
      return modelsByProvider[id] ?? []
    },
    authorized: [{ provider: 'other', model: 'x1' }],
  })
  assert.deepEqual(catalog.providers.map((p) => p.id), ['other'])
  assert.deepEqual(catalog.models.other, [])
  assert.equal(catalog.failures.length, 1)
  assert.equal(catalog.failures[0].provider, 'other')
})

test('宿主适配器：未知 provider 的授权路由被丢弃并记为失败', async () => {
  const catalog = await createHostCatalog({
    listProviders: () => providers,
    listModels: async (id) => modelsByProvider[id] ?? [],
    authorized: [{ provider: 'ghost', model: 'm' }],
  })
  assert.deepEqual(catalog.providers, [])
  assert.equal(catalog.failures.length, 1)
  assert.equal(catalog.failures[0].provider, 'ghost')
})
