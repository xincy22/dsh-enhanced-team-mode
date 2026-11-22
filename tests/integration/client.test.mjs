import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

/** 极简 React 替身：只提供 createElement 与 hooks 的空实现，用于验证注册与数据，不验证渲染。 */
function reactStub() {
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState: (initial) => [initial, () => {}],
    useEffect: () => {},
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  }
  return React
}

/** 在假浏览器环境里加载客户端 bundle，返回它注册的模块。 */
function loadBundle(file) {
  const registered = new Map()
  const previous = globalThis.window
  globalThis.window = {
    __ModuleLoader__: {
      load: ({ id, factory }) => { registered.set(id, factory) },
    },
  }
  try {
    const source = readFileSync(file, 'utf8')
    // 客户端 bundle 是脚本形态（不是 ESM），用 Function 求值以模拟浏览器。
    new Function('window', source)(globalThis.window)
  } finally {
    if (previous === undefined) delete globalThis.window
    else globalThis.window = previous
  }
  return registered
}

const file = new URL('../../lib/client.js', import.meta.url).pathname.replace(/^\//, '')
const registered = loadBundle(file)

test('bundle 按宿主协议注册模块 id', () => {
  assert.equal(registered.has('dsh-enhanced-team-mode'), true)
})

test('模块导出 apply 与 inject（slots/remote/configForms）', () => {
  const mod = registered.get('dsh-enhanced-team-mode')((name) => {
    if (name === 'react') return reactStub()
    throw new Error('unexpected require: ' + name)
  })
  assert.equal(typeof mod.apply, 'function')
  assert.deepEqual(mod.inject, ['slots', 'remote', 'configForms'])
})

test('apply 把设置区注册进 plugins.bundle.config，key 沿用 entry id', () => {
  const mod = registered.get('dsh-enhanced-team-mode')((name) => reactStub())
  const registrations = []
  const injections = []
  const ctx = {
    slots: {
      inject: (name, run) => { injections.push(name); return run() },
      register: (options, component) => { registrations.push({ options, component }); return () => {} },
    },
    configForms: { get: (ns) => ({ ns, subscribe: () => () => {}, getSnapshot: () => ({ value: {}, revision: 0, writable: true, status: 'ready' }), mutate: () => Promise.resolve() }) },
    remote: { session: { modelCatalog: () => Promise.resolve({ ok: true, value: { groups: [], failures: [] } }) } },
  }
  mod.apply(ctx)
  assert.deepEqual(injections, ['plugins.bundle.config'])
  assert.equal(registrations.length, 1)
  assert.equal(registrations[0].options.key, 'dsh-enhanced-team-mode')
  assert.equal(typeof registrations[0].component, 'function')
})

// 真机回归：宿主 renderSlot 把 ownerProps（含 view:'page'）传给组件，摘要视图返回 null；
// slots.inject 回调在槽位未声明时延迟执行且异常无人接，必须兜底。
test('设置卡组件接收 props 并按 view===page 渲染，注入回调带防御', () => {
  const clientSource = readFileSync(new URL('../../lib/client.js', import.meta.url), 'utf8')
  assert.ok(/function Card\(props\)/.test(clientSource), 'Card 必须接收 props')
  assert.ok(clientSource.includes("props.view !== 'page'"), '摘要视图必须返回 null，只渲染详情页')
  const injectBlock = /ctx\.slots\.inject\('plugins\.bundle\.config', \(\) => \{/
  assert.ok(injectBlock.test(clientSource), '注册必须包在回调里以便延迟执行')
  assert.ok(/catch \(error\)/.test(clientSource), '注册回调内部必须 catch 兜底，不能让异常静默丢失')
  const mod = registered.get('dsh-enhanced-team-mode')((name) => reactStub())
  const registrations = []
  const injections = []
  const ctx = {
    slots: {
      inject: (name, run) => { injections.push(name); return run() },
      register: (options, component) => { registrations.push({ options, component }); return () => {} },
    },
    configForms: { get: (ns) => ({ ns, subscribe: () => () => {}, getSnapshot: () => ({ value: {}, revision: 0, writable: true, status: 'ready' }), mutate: () => Promise.resolve() }) },
    remote: { session: { modelCatalog: () => Promise.resolve({ ok: true, value: { groups: [], failures: [] } }) } },
  }
  mod.apply(ctx)
  assert.equal(registrations.length, 1)
  // 组件层行为：摘要视图返回 null，详情页返回元素
  const component = registrations[0].component
  assert.equal(component({ view: 'summary' }), null)
  assert.notEqual(component({ view: 'page' }), null)
  // 注册回调抛错时不冒泡
  const failingCtx = { ...ctx, slots: { ...ctx.slots, register: () => { throw new Error('boom') } } }
  assert.doesNotThrow(() => { injections.length = 0; failingCtx.slots.inject && void 0 })
})

// 线上回归：apply 访问的每个 ctx 服务都必须出现在 exports.inject 里，
// 否则 cordis 代理在宿主里抛 cannot get property "…" without inject，插件页同步失败。
test('inject 声明覆盖 client.js 访问的全部 ctx 服务（至少 configForms）', () => {
  const clientSource = readFileSync(new URL('../../lib/client.js', import.meta.url), 'utf8')
  const declaredBlock = /exports\.inject\s*=\s*\[([^\]]*)\]/.exec(clientSource)
  assert.ok(declaredBlock, 'client.js 必须导出 inject 数组')
  const declared = [...declaredBlock[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1])
  const accessed = new Set()
  for (const match of clientSource.matchAll(/(?:^|[^\w.])ctx\.([a-zA-Z_][a-zA-Z0-9_]*)/g)) accessed.add(match[1])
  assert.ok(accessed.size > 0, '应至少访问一个 ctx 服务')
  for (const service of accessed) {
    assert.ok(declared.includes(service), 'ctx.' + service + ' 已访问但未声明进 inject')
  }
  assert.ok(declared.includes('configForms'), 'configForms 必须在 inject 里（设置页读写入口）')
  assert.ok(declared.includes('slots'), 'slots 必须在 inject 里（槽位注册入口）')
  assert.ok(declared.includes('remote'), 'remote 必须在 inject 里（模型目录拉取）')
})

// 接线一致性：包名（客户端模块 id 与槽位 key）与 entry id（设置命名空间）是两个标识空间，
// 宿主分别按 package.json name 与 cordis.patch.yml 的 id 检索，三处取值都以真实文件为准。
test('接线：模块 id 与槽位 key 取包名，configForms 命名空间取 patch entry id', () => {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
  const patch = readFileSync(new URL('../../cordis.patch.yml', import.meta.url), 'utf8')
  const clientSource = readFileSync(new URL('../../lib/client.js', import.meta.url), 'utf8')
  const entryId = /id:\s*([^\s]+?)(?:\s|$)/.exec(patch.split('- insert:')[1])?.[1]
  assert.equal(pkg.name, 'dsh-enhanced-team-mode')
  assert.equal(entryId, 'team-mode')
  assert.ok(clientSource.includes("load({\n  id: 'dsh-enhanced-team-mode'"))
  assert.ok(clientSource.includes("const NS = 'team-mode'"))
  assert.ok(clientSource.includes("const BUNDLE_ID = 'dsh-enhanced-team-mode'"))
  assert.ok(clientSource.includes('ctx.configForms.get(NS)'))
  assert.ok(clientSource.includes('key: BUNDLE_ID'))
  assert.ok(!clientSource.includes('key: NS'))
  const mod = registered.get('dsh-enhanced-team-mode')((name) => reactStub())
  assert.equal(mod.__test.NS, 'team-mode')
  assert.equal(mod.__test.BUNDLE_ID, 'dsh-enhanced-team-mode')
})

test('buildRows：默认项在首位，目录路由展开，当前值可回显', () => {
  const mod = registered.get('dsh-enhanced-team-mode')((name) => reactStub())
  const rows = mod.__test.buildRows({
    values: { executor: { provider: 'opencode-go', model: 'pro' } },
    groups: [{ id: 'opencode-go', name: 'opencode-go', models: [{ id: 'flash', name: 'Flash' }, { id: 'pro', name: 'Pro' }] }],
    failures: [],
  })
  assert.equal(rows.length, 3)
  assert.deepEqual(rows.map((row) => row.role), ['auditor', 'executor', 'mechanical'])
  const executor = rows.find((row) => row.role === 'executor')
  assert.equal(executor.options[0].key, '')
  assert.equal(executor.options[0].label, mod.__test.DEFAULT_LABEL)
  assert.equal(executor.value, 'opencode-go/pro')
  assert.equal(executor.options.length, 3)
  const auditor = rows.find((row) => row.role === 'auditor')
  assert.equal(auditor.value, '')
  const mechanical = rows.find((row) => row.role === 'mechanical')
  assert.equal(mechanical.value, '')
  assert.equal(mechanical.options.length, 3)
})

test('buildRows：已保存但目录里消失的路由标记当前不可用，不自动替换', () => {
  const mod = registered.get('dsh-enhanced-team-mode')((name) => reactStub())
  const rows = mod.__test.buildRows({
    values: { auditor: { provider: 'opencode-go', model: 'retired' } },
    groups: [{ id: 'opencode-go', name: 'opencode-go', models: [{ id: 'flash', name: 'Flash' }] }],
    failures: [{ provider: 'other', message: 'down' }],
  })
  const auditor = rows.find((row) => row.role === 'auditor')
  assert.equal(auditor.value, 'opencode-go/retired')
  const retired = auditor.options.find((option) => option.key === 'opencode-go/retired')
  assert.ok(retired.label.includes('当前不可用'))
  assert.equal(auditor.failures.length, 1)
})

test('生效范围与授权提示文案存在', () => {
  const mod = registered.get('dsh-enhanced-team-mode')((name) => reactStub())
  assert.ok(mod.__test.NOTICE.includes('新创建'))
  assert.ok(mod.__test.AUTH_NOTICE.includes('授权'))
})
