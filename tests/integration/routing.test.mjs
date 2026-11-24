import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveRoutes, renderRoutingBlock, composeInstruction } from '../../src/dispatch/routing.js'
import { createCatalog } from '../../src/settings/catalog.js'
import { DEFAULT_LABEL } from '../../src/settings/constants.js'
import { emptySettings } from '../../src/settings/schema.js'

const catalog = createCatalog({
  providers: [{ id: 'opencode-go', name: 'opencode-go' }, { id: 'other', name: 'Other' }],
  models: {
    'opencode-go': [{ id: 'flash', name: 'Flash' }, { id: 'pro', name: 'Pro' }],
    other: [{ id: 'x1', name: 'X One' }],
  },
  authorized: [{ provider: 'opencode-go', model: 'flash' }, { provider: 'opencode-go', model: 'pro' }],
})
const parentRoute = { provider: 'opencode-go', model: 'flash' }

const store = (executor, auditor, mechanical) => ({
  auditor: auditor ?? { mode: 'default' },
  executor: executor ?? { mode: 'default' },
  mechanical: mechanical ?? { mode: 'default' },
})

test('三角色都跟随默认且无问题时不出路由块', () => {
  const resolved = resolveRoutes({ store: emptySettings(), catalog, parentRoute })
  assert.deepEqual(resolved.problems, [])
  assert.equal(renderRoutingBlock(resolved), '')
  assert.equal(composeInstruction('正文', resolved), '正文')
})

test('显式路由被写进指令，默认角色标注省略参数', () => {
  const resolved = resolveRoutes({
    store: store({ mode: 'explicit', provider: 'opencode-go', model: 'pro' }, null, { mode: 'explicit', provider: 'opencode-go', model: 'flash' }),
    catalog,
    parentRoute,
  })
  const block = renderRoutingBlock(resolved)
  assert.ok(block.includes('能力型执行模型：opencode-go/pro'))
  assert.ok(block.includes('审计模型：' + DEFAULT_LABEL))
  assert.ok(block.includes('讲解模型：opencode-go/flash'))
  assert.ok(block.includes('复用已有成员时不要传 provider 与 model'))
})

test('mechanical 解析失败同样进问题条目', () => {
  const resolved = resolveRoutes({
    store: store(null, null, { mode: 'explicit', provider: 'ghost', model: 'm' }),
    catalog,
    parentRoute,
  })
  assert.equal(resolved.routes.mechanical, undefined)
  const block = renderRoutingBlock(resolved)
  assert.ok(block.includes('SETTINGS_UNKNOWN_PROVIDER'))
  assert.equal(block.includes('讲解模型：ghost/m'), false)
})

test('未授权路由变成问题条目，且指令里不出现该路由', () => {
  const resolved = resolveRoutes({
    store: store(null, { mode: 'explicit', provider: 'other', model: 'x1' }),
    catalog,
    parentRoute,
  })
  const block = renderRoutingBlock(resolved)
  assert.ok(block.includes('SETTINGS_UNAUTHORIZED_ROUTE'))
  assert.ok(block.includes('不要改用其他模型'))
  // 错误说明里会点名这条路由，但它不能被写成一个可用的选择
  assert.equal(block.includes('审计模型：other/x1'), false)
})

test('显式不可用不回退：目录里没有的模型只报错，不给替代路由', () => {
  const resolved = resolveRoutes({
    store: store({ mode: 'explicit', provider: 'opencode-go', model: 'retired' }),
    catalog,
    parentRoute,
  })
  assert.equal(resolved.routes.executor, undefined)
  const block = renderRoutingBlock(resolved)
  assert.ok(block.includes('SETTINGS_UNKNOWN_MODEL'))
  assert.equal(block.includes('opencode-go/flash'), false)
  assert.equal(block.includes('opencode-go/pro'), false)
})

test('无 allowlist 时只有父路由可用', () => {
  const noAllowlist = createCatalog({
    providers: [{ id: 'opencode-go', name: 'opencode-go' }, { id: 'other', name: 'Other' }],
    models: { 'opencode-go': [{ id: 'flash', name: 'Flash' }, { id: 'pro', name: 'Pro' }], other: [{ id: 'x1', name: 'X One' }] },
    authorized: null,
  })
  const ok = resolveRoutes({ store: store({ mode: 'explicit', ...parentRoute }), catalog: noAllowlist, parentRoute })
  assert.deepEqual(ok.routes.executor, { kind: 'route', provider: 'opencode-go', model: 'flash' })
  const bad = resolveRoutes({
    store: store({ mode: 'explicit', provider: 'opencode-go', model: 'pro' }),
    catalog: noAllowlist,
    parentRoute,
  })
  assert.equal(bad.routes.executor, undefined)
  assert.equal(bad.problems[0].code, 'SETTINGS_UNAUTHORIZED_ROUTE')
  assert.ok(renderRoutingBlock(bad).includes('没有授权列表'))
})

test('composeInstruction 追加在正文之后', () => {
  const resolved = resolveRoutes({ store: store({ mode: 'explicit', ...parentRoute }), catalog, parentRoute })
  const text = composeInstruction('（正文）', resolved)
  assert.ok(text.startsWith('（正文）'))
  assert.ok(text.includes('## 成员模型'))
})
