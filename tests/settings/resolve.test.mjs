import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveRole, toAgentOptions } from '../../src/settings/resolve.js'
import { SettingsError } from '../../src/settings/errors.js'

const catalog = (over = {}) => ({
  providers: [{ id: 'opencode-go', name: 'opencode-go' }, { id: 'other', name: 'Other' }],
  models: {
    'opencode-go': [
      { id: 'deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash' },
      { id: 'deepseek-v4.1-pro', name: 'DeepSeek V4.1 Pro' },
    ],
    other: [{ id: 'x1', name: 'X One' }],
  },
  authorized: [
    { provider: 'opencode-go', model: 'deepseek-v4.1-flash' },
    { provider: 'opencode-go', model: 'deepseek-v4.1-pro' },
  ],
  failures: [],
  ...over,
})

const parentRoute = { provider: 'opencode-go', model: 'deepseek-v4.1-flash' }
const store = (over = {}) => ({ auditor: { mode: 'default' }, executor: { mode: 'default' }, mechanical: { mode: 'default' }, ...over })

test('跟随默认：直接返回 default，不解析成具体路由', () => {
  const out = resolveRole({ role: 'executor', store: store(), catalog: catalog(), parentRoute })
  assert.deepEqual(out, { kind: 'default' })
})

test('显式合法路由：原样返回该路由', () => {
  const out = resolveRole({
    role: 'executor',
    store: store({ executor: { mode: 'explicit', provider: 'opencode-go', model: 'deepseek-v4.1-pro' } }),
    catalog: catalog(),
    parentRoute,
  })
  assert.deepEqual(out, { kind: 'route', provider: 'opencode-go', model: 'deepseek-v4.1-pro' })
})

test('未注册的 provider 报错，不回退父路由', () => {
  assert.throws(() => resolveRole({
    role: 'executor',
    store: store({ executor: { mode: 'explicit', provider: 'ghost', model: 'm' } }),
    catalog: catalog(),
    parentRoute,
  }), (error) => {
    assert.equal(error.code, 'SETTINGS_UNKNOWN_PROVIDER')
    return true
  })
})

test('provider 存在但模型未公布，报非法模型', () => {
  assert.throws(() => resolveRole({
    role: 'auditor',
    store: store({ auditor: { mode: 'explicit', provider: 'opencode-go', model: 'nope' } }),
    catalog: catalog(),
    parentRoute,
  }), (error) => {
    assert.equal(error.code, 'SETTINGS_UNKNOWN_MODEL')
    return true
  })
})

test('模型存在但未在会话授权列表里，报未授权', () => {
  assert.throws(() => resolveRole({
    role: 'executor',
    store: store({ executor: { mode: 'explicit', provider: 'other', model: 'x1' } }),
    catalog: catalog(),
    parentRoute,
  }), (error) => {
    assert.equal(error.code, 'SETTINGS_UNAUTHORIZED_ROUTE')
    return true
  })
})

test('无 allowlist 时只允许父路由；其他路由一律未授权', () => {
  const noAllowlist = catalog({ authorized: null })
  assert.deepEqual(
    resolveRole({ role: 'executor', store: store({ executor: { mode: 'explicit', ...parentRoute } }), catalog: noAllowlist, parentRoute }),
    { kind: 'route', provider: parentRoute.provider, model: parentRoute.model },
  )
  assert.throws(() => resolveRole({
    role: 'executor',
    store: store({ executor: { mode: 'explicit', provider: 'opencode-go', model: 'deepseek-v4.1-pro' } }),
    catalog: noAllowlist,
    parentRoute,
  }), (error) => {
    assert.equal(error.code, 'SETTINGS_UNAUTHORIZED_ROUTE')
    assert.match(error.message, /没有授权列表|not authorized/)
    return true
  })
})


// 推理等级（task-21 方案 A）：模型级可选属性，解析时原样透传，派发时映射进 agentOptions。
test('推理等级：显式路由透传到决定对象与 agentOptions', () => {
  const decision = resolveRole({
    role: 'executor',
    store: store({ executor: { mode: 'explicit', provider: 'opencode-go', model: 'deepseek-v4.1-pro', reasoningEffort: 'high' } }),
    catalog: catalog(),
    parentRoute,
  })
  assert.deepEqual(decision, { kind: 'route', provider: 'opencode-go', model: 'deepseek-v4.1-pro', reasoningEffort: 'high' })
  assert.deepEqual(toAgentOptions(decision), { provider: 'opencode-go', model: 'deepseek-v4.1-pro', reasoningEffort: 'high' })
})

test('推理等级：空串表示跟随模型默认，不进 agentOptions', () => {
  const decision = resolveRole({
    role: 'executor',
    store: store({ executor: { mode: 'explicit', provider: 'opencode-go', model: 'deepseek-v4.1-pro', reasoningEffort: '' } }),
    catalog: catalog(),
    parentRoute,
  })
  assert.equal(decision.reasoningEffort, undefined, '空串不应出现在决定对象里')
  // 宿主 agentOptions 对 reasoningEffort 用 z.string().min(1)，空串会校验失败，必须省略该键。
  assert.deepEqual(toAgentOptions(decision), { provider: 'opencode-go', model: 'deepseek-v4.1-pro' })
})

test('推理等级：别名解析同样透传', () => {
  const decision = resolveRole({
    role: 'auditor',
    store: store({ auditor: { mode: 'alias', alias: 'DeepSeek V4.1 Pro', reasoningEffort: 'low' } }),
    catalog: catalog(),
    parentRoute,
  })
  assert.equal(decision.reasoningEffort, 'low')
})

test('跟随默认的派发不产生 agentOptions（推理等级一并省略）', () => {
  assert.equal(toAgentOptions({ kind: 'default' }), undefined)
})

test('别名唯一命中时解析成精确路由', () => {
  for (const alias of ['DeepSeek V4.1 Pro', 'deepseek-v4.1-pro']) {
    const out = resolveRole({
      role: 'auditor',
      store: store({ auditor: { mode: 'alias', alias } }),
      catalog: catalog(),
      parentRoute,
    })
    assert.deepEqual(out, { kind: 'route', provider: 'opencode-go', model: 'deepseek-v4.1-pro' })
  }
})

test('别名未命中时报未知别名，不做模糊匹配', () => {
  assert.throws(() => resolveRole({
    role: 'auditor',
    store: store({ auditor: { mode: 'alias', alias: 'deepseek' } }),
    catalog: catalog(),
    parentRoute,
  }), (error) => {
    assert.equal(error.code, 'SETTINGS_UNKNOWN_ALIAS')
    return true
  })
})

test('别名在多个 provider 上重名时报歧义，不静默取第一个', () => {
  const ambiguous = catalog({
    models: {
      'opencode-go': [{ id: 'a1', name: 'Shared' }],
      other: [{ id: 'b1', name: 'Shared' }],
    },
    authorized: [
      { provider: 'opencode-go', model: 'a1' },
      { provider: 'other', model: 'b1' },
    ],
  })
  assert.throws(() => resolveRole({
    role: 'auditor',
    store: store({ auditor: { mode: 'alias', alias: 'Shared' } }),
    catalog: ambiguous,
    parentRoute,
  }), (error) => {
    assert.equal(error.code, 'SETTINGS_AMBIGUOUS_ALIAS')
    return true
  })
})

test('别名命中但未授权时报未授权', () => {
  assert.throws(() => resolveRole({
    role: 'auditor',
    store: store({ auditor: { mode: 'alias', alias: 'X One' } }),
    catalog: catalog(),
    parentRoute,
  }), (error) => {
    assert.equal(error.code, 'SETTINGS_UNAUTHORIZED_ROUTE')
    return true
  })
})

test('mechanical 角色按同一套解析规则工作', () => {
  const out = resolveRole({
    role: 'mechanical',
    store: store({ mechanical: { mode: 'explicit', provider: 'opencode-go', model: 'deepseek-v4.1-pro' } }),
    catalog: catalog(),
    parentRoute,
  })
  assert.deepEqual(out, { kind: 'route', provider: 'opencode-go', model: 'deepseek-v4.1-pro' })
  assert.throws(() => resolveRole({
    role: 'mechanical',
    store: store({ mechanical: { mode: 'explicit', provider: 'ghost', model: 'm' } }),
    catalog: catalog(),
    parentRoute,
  }), (error) => {
    assert.equal(error.code, 'SETTINGS_UNKNOWN_PROVIDER')
    return true
  })
})

test('每次失败都抛错，绝不返回替代路由', () => {
  const cases = [
    { mode: 'explicit', provider: 'ghost', model: 'm' },
    { mode: 'explicit', provider: 'opencode-go', model: 'nope' },
    { mode: 'explicit', provider: 'other', model: 'x1' },
    { mode: 'alias', alias: 'nope' },
  ]
  for (const executor of cases) {
    assert.throws(() => resolveRole({ role: 'executor', store: store({ executor }), catalog: catalog(), parentRoute }))
  }
})
