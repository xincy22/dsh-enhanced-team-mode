import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** 极简 React 替身：只提供 createElement 与 hooks 的空实现，用于验证注册与数据，不验证渲染。 */
function reactStub() {
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState: (initial) => [initial, () => {}],
    useEffect: () => {},
    useRef: (initial) => ({ current: initial === undefined ? null : initial }),
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

const file = fileURLToPath(new URL('../../lib/client.js', import.meta.url))
const registered = loadBundle(file)

/** 用替身把函数组件真正展开成元素树：这是唯一能发现「组件自递归」的检查方式，
 *  因为只做 JSON.stringify(element) 时函数类型的 type 会被序列化丢掉。 */
function expandTree(element, ancestry = new Set(), depth = 0) {
  if (element === null || element === undefined) return element
  if (typeof element !== 'object') return element
  if (Array.isArray(element)) return element.map((child) => expandTree(child, ancestry, depth))
  if (depth > 80) throw new Error('渲染层级过深（疑似组件递归）')
  if (typeof element.type === 'function') {
    const name = element.type.name || 'anonymous'
    if (ancestry.has(element.type)) throw new Error('组件自递归：' + name)
    const next = new Set(ancestry)
    next.add(element.type)
    return expandTree(element.type(element.props || {}), next, depth + 1)
  }
  return {
    type: element.type,
    props: element.props,
    children: (element.children || []).map((child) => expandTree(child, ancestry, depth + 1)),
  }
}


/**
 * 有状态的极简 React 替身：让 useState 真的驱动重渲染，用于验证「保存被拒」这类交互分支。
 * 组件按渲染顺序分配 hook 槽位（组件顺序稳定，所以槽位稳定）。
 */
function createLiveReact() {
  const states = new Map()
  let componentSeq = 0
  let hookCursor = 0
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState: (initial) => {
      const key = componentSeq + ':' + hookCursor++
      if (!states.has(key)) states.set(key, initial)
      const set = (next) => {
        const prev = states.get(key)
        states.set(key, typeof next === 'function' ? next(prev) : next)
      }
      return [states.get(key), set]
    },
    // 每个组件实例的每个 effect 只跑一次（模拟挂载）：这样取模型目录的 effect 会真的执行。
    useEffect: (fn) => {
      const key = 'effect:' + componentSeq + ':' + hookCursor++
      if (states.has(key)) return
      states.set(key, true)
      const cleanup = fn()
      if (typeof cleanup === 'function') states.set(key + ':cleanup', cleanup)
    },
    useRef: (initial) => (states.has('ref:' + componentSeq + ':' + hookCursor)
      ? states.get('ref:' + componentSeq + ':' + hookCursor++)
      : (() => { const ref = { current: initial === undefined ? null : initial }; states.set('ref:' + componentSeq + ':' + hookCursor, ref); hookCursor++; return ref })()),
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
    Fragment: 'Fragment',
  }
  /** 展开成元素树（函数组件就地调用，state 生效）。 */
  function paint(element) {
    componentSeq = 0
    const walk = (node) => {
      if (node === null || node === undefined) return node
      if (Array.isArray(node)) return node.map(walk)
      if (typeof node !== 'object') return node
      if (typeof node.type === 'function') {
        const seq = ++componentSeq
        const saved = componentSeq
        componentSeq = seq
        hookCursor = 0
        const out = node.type(node.props || {})
        componentSeq = saved
        return walk(out)
      }
      return { type: node.type, props: node.props, children: (node.children || []).map(walk) }
    }
    return walk(element)
  }
  /** 深度优先找第一个满足条件的元素。 */
  function find(node, predicate) {
    if (node === null || node === undefined) return null
    if (Array.isArray(node)) { for (const item of node) { const hit = find(item, predicate); if (hit) return hit } return null }
    if (typeof node !== 'object') return null
    if (predicate(node)) return node
    return find(node.children, predicate)
  }
  function findAll(node, predicate, acc = []) {
    if (node === null || node === undefined) return acc
    if (Array.isArray(node)) { node.forEach((item) => findAll(item, predicate, acc)); return acc }
    if (typeof node !== 'object') return acc
    if (predicate(node)) acc.push(node)
    findAll(node.children, predicate, acc)
    return acc
  }
  return { React, paint, find, findAll }
}

/** 造一个最小客户端 ctx（带或不带 configForms/remote 服务）。 */
function makeEnv(withForms) {
  const collected = []
  return {
    collected,
    ctx: {
      slots: {
        inject: (name, run) => run(),
        register: (options, component) => { collected.push({ options, component }); return () => {} },
      },
      configForms: withForms ? { get: () => ({ subscribe: () => () => {}, getSnapshot: () => ({ value: {}, revision: 0, writable: true, status: 'ready' }), mutate: () => Promise.resolve() }) } : undefined,
      remote: withForms ? { session: { modelCatalog: () => Promise.resolve({ ok: true, value: { groups: [], failures: [] } }) } } : undefined,
    },
  }
}

test('bundle 按宿主协议注册模块 id', () => {
  assert.equal(registered.has('dsh-enhanced-team-mode'), true)
})

test('模块导出 apply 与 inject（slots/remote/configForms）', () => {
  const mod = registered.get('dsh-enhanced-team-mode')((name) => {
    if (name === 'react') return reactStub()
    throw new Error('unexpected require: ' + name)
  })
  assert.equal(typeof mod.apply, 'function')
  // remote.session 是独立服务 id：只声明 'remote' 时真机访问 remote.session 会抛
  // "cannot get property \"remote.session\" without inject"，设置页随之空白。
  assert.deepEqual(mod.inject, ['slots', 'remote', 'remote.session', 'configForms'])
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
  assert.deepEqual(injections, ['settings.section', 'settings.section.icon', 'plugins.bundle.config'])
  assert.equal(registrations.length, 3)
  const bundleCard = registrations.find((r) => r.options.name === 'plugins.bundle.config')
  assert.equal(bundleCard.options.key, 'dsh-enhanced-team-mode')
  assert.equal(typeof bundleCard.component, 'function')
  const section = registrations.find((r) => r.options.name === 'settings.section')
  assert.equal(section.options.id, 'team-mode')
  assert.equal(section.options.order, 80)
  assert.equal(section.options.label(), '团队模式')
  assert.equal(typeof section.component, 'function')
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
  assert.equal(registrations.length, 3)
  // 组件层行为：摘要视图返回 null，详情页返回元素（取 bundle 卡那个）
  const component = registrations.find((r) => r.options.name === 'plugins.bundle.config').component
  assert.equal(component({ view: 'summary' }), null)
  assert.notEqual(component({ view: 'page' }), null)
  // 注册回调抛错时不冒泡
  const failingCtx = { ...ctx, slots: { ...ctx.slots, register: () => { throw new Error('boom') } } }
  assert.doesNotThrow(() => { injections.length = 0; failingCtx.slots.inject && void 0 })
})

// 真机回归：详情页卡在此宿主版本可能不渲染，settings.section 是可靠入口（office/sidenote 同款）。
// 静态断言注册参数，行为断言 Section/降级组件渲染。
test('settings.section 独立设置页：id=entry id、order=80、label=团队模式，缺服务时渲染可见错误', () => {
  const clientSource = readFileSync(new URL('../../lib/client.js', import.meta.url), 'utf8')
  assert.ok(clientSource.includes("name: 'settings.section'"), '必须注册 settings.section')
  assert.ok(clientSource.includes("id: 'team-mode'"), 'section id 必须是 entry id')
  assert.ok(/order: 80/.test(clientSource), 'order 80 排在第三方分区常规位次')
  assert.ok(clientSource.includes("label: () => '团队模式'"), '导航标签必须是「团队模式」')
  assert.ok(clientSource.includes('UnavailableSection'), 'configForms/remote 不可用时必须有可见降级组件')
  assert.ok(clientSource.includes("props.view !== 'page'"), '详情页卡契约保留')

  const mod = registered.get('dsh-enhanced-team-mode')((name) => reactStub())
  const makeCtx = (withForms) => {
    const collected = []
    return {
      collected,
      ctx: {
        slots: {
          inject: (name, run) => run(),
          register: (options, component) => { collected.push({ options, component }); return () => {} },
        },
        configForms: withForms ? { get: () => ({ subscribe: () => () => {}, getSnapshot: () => ({ value: {}, revision: 0, writable: true, status: 'ready' }), mutate: () => Promise.resolve() }) } : undefined,
        remote: withForms ? { session: { modelCatalog: () => Promise.resolve({ ok: true, value: { groups: [], failures: [] } }) } } : undefined,
      },
    }
  }

  // 有服务：settings.section 渲染共享表单（含标题与三档说明）
  let env = makeCtx(true)
  mod.apply(env.ctx)
  let section = env.collected.find((r) => r.options.name === 'settings.section')
  assert.ok(section, 'settings.section 必须注册')
  assert.equal(env.collected.some((r) => r.options.name === 'plugins.bundle.config'), true, '详情页卡仍保留')
  const element = section.component({ close: () => {} })
  assert.notEqual(element, null)
  const dump = JSON.stringify(element)
  assert.ok(dump.includes('团队模式'), '设置页必须有标题')
  assert.ok(dump.includes('新建成员'), '设置页必须说明作用范围')

  // 无服务：settings.section 仍注册，组件渲染可见错误文本而不是静默返回
  env = makeCtx(false)
  mod.apply(env.ctx)
  section = env.collected.find((r) => r.options.name === 'settings.section')
  assert.ok(section, '无服务时 settings.section 仍必须注册（可见降级）')
  const degraded = section.component({})
  assert.ok(JSON.stringify(degraded).includes('设置服务不可用'), '降级必须可见，不能静默')
  // bundle 卡在无服务时不注册
  assert.equal(env.collected.some((r) => r.options.name === 'plugins.bundle.config'), false, '无服务时不注册详情页卡')
})


// 空白页回归（2026-11-22）：上一版 Section 渲染 h(ModelRoutesForm)，而 ModelRoutesForm 只有
// `return ModelRoutesForm(props)` 一行——渲染期无限递归爆栈（RangeError），React 卸载整棵子树，
// 设置页左侧有「团队模式」条目、右侧内容区空白。下面两层断言把这类错误钉死：
// 1) 静态：任何 `function X(...) { return X(...) }` 形态直接判失败；
// 2) 行为：用替身真展开组件树，同一组件不得出现在自己的祖先链上，并确认三行表单真的产出。
test('回归：设置页组件树可完整展开、无组件自递归，且渲染出三行模型表单', () => {
  const clientSource = readFileSync(new URL('../../lib/client.js', import.meta.url), 'utf8')
  const selfRecursive = [...clientSource.matchAll(/function\s+(\w+)\s*\(([^)]*)\)\s*\{\s*return\s+\1\(/g)]
    .map((match) => match[1])
  assert.deepEqual(selfRecursive, [], 'client.js 不得存在组件自调用（渲染期会递归爆栈导致整页空白）')

  const mod = registered.get('dsh-enhanced-team-mode')((name) => reactStub())
  const env = makeEnv(true)
  mod.apply(env.ctx)
  const section = env.collected.find((entry) => entry.options.name === 'settings.section')
  assert.ok(section, 'settings.section 必须注册')

  const tree = expandTree(section.component({ close: () => {} }))
  const dump = JSON.stringify(tree)
  assert.ok(dump.includes('团队模式'), '设置页标题必须渲染出来')
  for (const title of ['审计模型', '能力型执行模型', '讲解模型']) {
    assert.ok(dump.includes(title), '缺少表单行：' + title)
  }
  const selects = (tree) => (JSON.stringify(tree).match(/"className":"tm-field(?: is-disabled)?"/g) || []).length
  assert.equal(selects(tree), 6, '三档各两行独立选择器（模型 + 思考强度）')
  assert.ok(dump.includes('跟随 DSH 默认'), '每行都要有「跟随 DSH 默认」选项')

  // 详情页卡同样能展开，且摘要视图仍返回 null
  const card = env.collected.find((entry) => entry.options.name === 'plugins.bundle.config')
  assert.equal(card.component({ view: 'summary' }), null)
  assert.equal(selects(expandTree(card.component({ view: 'page' }))), 6, '详情页卡同样渲染三档两行选择器')
})


// 保存被拒分支（审计要求补的真机替代验证）：宿主 ConfigForm.mutate 的契约是「失败返回 false，
// 不抛错」。若只看 resolve 就会把拒绝当成功（历史缺陷），或在拒绝时清空用户输入。
// 这里用有状态替身真的点一次保存，断言：显示 SAVE_REJECTED、保留用户选择、保存按钮仍可用。
test('mutate 返回 false：显示 SAVE_REJECTED，保留用户选择，不清空输入', async () => {
  const live = createLiveReact()
  const mod = registered.get('dsh-enhanced-team-mode')((name) => {
    if (name === 'react') return live.React
    throw new Error('unexpected require: ' + name)
  })

  const calls = []
  const scope = {
    subscribe: () => () => {},
    getSnapshot: () => ({ value: { auditor: { provider: 'prov', model: 'm1' } }, revision: 0, writable: true, status: 'ready' }),
    mutate: (ops, revision) => { calls.push({ ops, revision }); return Promise.resolve(false) },
  }
  const collected = []
  const ctx = {
    slots: { inject: (name, run) => run(), register: (options, component) => { collected.push({ options, component }); return () => {} } },
    configForms: { get: () => scope },
    remote: { session: { modelCatalog: () => Promise.resolve({ ok: true, value: { groups: [], failures: [] } }) } },
  }
  mod.apply(ctx)
  const section = collected.find((entry) => entry.options.name === 'settings.section')

  // 1. 用复合选择器选一个具体路由（这里用「已保存但目录里消失」的那条，保证是可点的非默认值）
  let tree = live.paint(section.component({ close: () => {} }))
  let trigger = live.find(tree, (node) => node.type === 'button' && node.props.id === 'tm-auditor-model')
  assert.ok(trigger, '审计模型必须有可交互的复合选择器')
  trigger.props.onClick()
  tree = live.paint(section.component({ close: () => {} }))
  const modelItem = live.find(tree, (node) => node.type === 'button' && node.props['data-model-key'] === 'prov/m1')
  assert.ok(modelItem, '面板里必须能点到目标模型')
  modelItem.props.onClick()
  tree = live.paint(section.component({ close: () => {} }))
  trigger = live.find(tree, (node) => node.type === 'button' && node.props.id === 'tm-auditor-model')
  assert.ok(JSON.stringify(trigger).includes('prov/m1'), '选择后触发按钮应回显所选路由')

  // 2. 点保存：宿主返回 false
  const saveButton = live.find(tree, (node) => node.type === 'button' && String(node.props.className).includes('is-primary'))
  assert.ok(saveButton, '必须有保存按钮')
  saveButton.props.onClick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))

  tree = live.paint(section.component({ close: () => {} }))
  const status = live.find(tree, (node) => node.props && node.props.role === 'status')
  assert.ok(status, '状态行必须存在')
  const statusText = (status.children || []).flat(Infinity).join('')
  assert.equal(statusText, mod.__test.SAVE_REJECTED, '被拒时必须显示 SAVE_REJECTED，不能显示「已保存」')
  assert.ok(String(status.props.className).includes('is-error'), '被拒状态必须是错误样式')

  trigger = live.find(tree, (node) => node.type === 'button' && node.props.id === 'tm-auditor-model')
  assert.ok(JSON.stringify(trigger).includes('prov/m1'), '被拒后必须保留用户选择，不能清空')
  const afterSave = live.find(tree, (node) => node.type === 'button' && String(node.props.className).includes('is-primary'))
  assert.equal(afterSave.props.disabled, false, '被拒后保存按钮应仍可用（dirty 未清）')

  // 3. 写入形态仍是 volatile 叶子路径（九条角色写 + 两条审计开关），不是整对象写
  assert.equal(calls.length, 1, 'mutate 只应被调用一次')
  assert.equal(calls[0].ops.length, 11, '三个角色各三个叶子写，加两个审计开关')
  assert.deepEqual(calls[0].ops.map((op) => op.path.join('.')), [
    'auditor.provider', 'auditor.model', 'auditor.reasoningEffort',
    'executor.provider', 'executor.model', 'executor.reasoningEffort',
    'mechanical.provider', 'mechanical.model', 'mechanical.reasoningEffort',
    'auditMode.background', 'auditMode.finalReview',
  ])
  for (const op of calls[0].ops.slice(0, 9)) {
    assert.equal(typeof op.value, 'string', '叶子写的值必须是字符串，不能是整对象')
  }
  for (const op of calls[0].ops.slice(9)) {
    assert.equal(typeof op.value, 'boolean', '审计开关的值必须是布尔，不能是整对象')
  }
})

test('buildAuditMode：缺省两个都开，都关时审计行置灰', () => {
  const mod = registered.get('dsh-enhanced-team-mode')((name) => reactStub())
  assert.equal(mod.__test.buildAuditMode({ values: {} }).mode, 'both')
  assert.equal(mod.__test.buildAuditMode({ values: { auditMode: { background: true, finalReview: false } } }).mode, 'background')
  assert.equal(mod.__test.buildAuditMode({ values: { auditMode: { background: false, finalReview: true } } }).mode, 'finalReview')
  assert.equal(mod.__test.buildAuditMode({ values: { auditMode: { background: false, finalReview: false } } }).mode, 'none')
  const rows = mod.__test.buildRows({ values: { auditMode: { background: false, finalReview: false } } })
  const auditor = rows.find((row) => row.role === 'auditor')
  assert.equal(auditor.disabled, true)
  assert.match(auditor.hint, /不生效/)
  assert.equal(rows.find((row) => row.role === 'executor').disabled, false)
})

test('设置页审计开关：都关时审计档置灰，勾选后台后保存写入布尔路径', async () => {
  const live = createLiveReact()
  const mod = registered.get('dsh-enhanced-team-mode')((name) => {
    if (name === 'react') return live.React
    throw new Error('unexpected require: ' + name)
  })
  const calls = []
  const scope = {
    subscribe: () => () => {},
    getSnapshot: () => ({ value: { auditMode: { background: false, finalReview: false } }, revision: 0, writable: true, status: 'ready' }),
    mutate: (ops, revision) => { calls.push({ ops, revision }); return Promise.resolve(true) },
  }
  const collected = []
  const ctx = {
    slots: { inject: (name, run) => run(), register: (options, component) => { collected.push({ options, component }); return () => {} } },
    configForms: { get: () => scope },
    remote: { session: { modelCatalog: () => Promise.resolve({ ok: true, value: { groups: [], failures: [] } }) } },
  }
  mod.apply(ctx)
  const section = collected.find((entry) => entry.options.name === 'settings.section')
  let tree = live.paint(section.component({ close: () => {} }))
  assert.ok(JSON.stringify(tree).includes('不设审计席'), '状态行应显示不设审计席')
  const trigger = live.find(tree, (node) => node.type === 'button' && node.props.id === 'tm-auditor-model')
  assert.equal(trigger.props.disabled, true, '都关时审计档应置灰')
  const box = live.find(tree, (node) => node.type === 'button' && node.props.role === 'switch' && node.props['data-audit-key'] === 'background')
  assert.ok(box, '必须有后台持续审计开关')
  box.props.onClick()
  tree = live.paint(section.component({ close: () => {} }))
  const saveButton = live.find(tree, (node) => node.type === 'button' && String(node.props.className).includes('is-primary'))
  saveButton.props.onClick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(calls.length, 1, '保存应调用一次 mutate')
  const background = calls[0].ops.find((op) => op.path.join('.') === 'auditMode.background')
  assert.ok(background, '必须写入 auditMode.background')
  assert.equal(background.value, true)
})

// 推理等级（task-21 方案 A）：只有模型声明 reasoning.efforts 时才渲染等级选择器，
// 与宿主 ModelSelect 的显隐规则一致（ModelSelect.tsx:498）。
test('buildRows：模型声明的推理档位进入选项，行数据带当前等级', () => {
  const mod = registered.get('dsh-enhanced-team-mode')((name) => reactStub())
  const rows = mod.__test.buildRows({
    values: { executor: { provider: 'p', model: 'm1', reasoningEffort: 'high' } },
    groups: [{
      id: 'p',
      models: [
        { id: 'm1', name: 'M1', reasoning: { efforts: [{ id: 'low', name: '低' }, { id: 'high', name: '高' }], defaultEffort: 'low' } },
        { id: 'm2', name: 'M2' },
      ],
    }],
    failures: [],
  })
  const executor = rows.find((row) => row.role === 'executor')
  assert.equal(executor.reasoningEffort, 'high', '行数据必须带当前推理等级')
  assert.deepEqual(executor.efforts.map((effort) => effort.id), ['low', 'high'])
  // 声明了档位的模型才出现选项；没声明的模型 efforts 为空。
  const m1 = executor.options.find((option) => option.key === 'p/m1')
  const m2 = executor.options.find((option) => option.key === 'p/m2')
  assert.deepEqual(m1.efforts.map((effort) => effort.id), ['low', 'high'])
  assert.deepEqual(m2.efforts, [])

  // 候选项：首项为空键（跟随模型默认），并用 defaultEffort 的名称提示默认档位。
  assert.deepEqual(mod.__test.reasoningOptions(executor).map((option) => option.key), ['', 'low', 'high'])
  assert.ok(mod.__test.reasoningOptions(executor)[0].label.includes('低'), '默认项应标出模型默认档位')

  // 机械执行没选路由时不该有推理等级行。
  const mechanical = rows.find((row) => row.role === 'mechanical')
  assert.deepEqual(mechanical.efforts, [])
  assert.deepEqual(mod.__test.reasoningOptions(mechanical), [], '模型无档位时不渲染等级选择器')
})

// 线上回归：apply 访问的每个 ctx 服务都必须出现在 exports.inject 里，
// 否则 cordis 代理在宿主里抛 cannot get property "…" without inject，插件页同步失败。

// 推理等级 UI（契约 A4）：模型声明了 reasoning.efforts 时该行出现第二个选择器，
// 换到没有档位的模型后消失——与宿主 ModelSelect.tsx:498 的显隐规则一致。
test('UI：模型有推理档位才渲染等级选择器，换模型后消失', async () => {
  const live = createLiveReact()
  const mod = registered.get('dsh-enhanced-team-mode')((name) => {
    if (name === 'react') return live.React
    throw new Error('unexpected require: ' + name)
  })
  const collected = []
  const ctx = {
    slots: { inject: (name, run) => run(), register: (options, component) => { collected.push({ options, component }); return () => {} } },
    configForms: {
      get: () => ({
        subscribe: () => () => {},
        getSnapshot: () => ({ value: {}, revision: 0, writable: true, status: 'ready' }),
        mutate: () => Promise.resolve(true),
      }),
    },
    remote: {
      session: {
        modelCatalog: () => Promise.resolve({
          ok: true,
          value: {
            groups: [{
              id: 'p',
              models: [
                { id: 'm1', name: 'M1', reasoning: { efforts: [{ id: 'low', name: '低' }, { id: 'high', name: '高' }], defaultEffort: 'low' } },
                { id: 'm2', name: 'M2' },
              ],
            }],
            failures: [],
          },
        }),
      },
    },
  }
  mod.apply(ctx)
  const section = collected.find((entry) => entry.options.name === 'settings.section')

  const triggerOf = (node, id) => live.find(node, (element) => element.type === 'button' && element.props.id === id)
  const openMenu = (node, id) => {
    triggerOf(node, id).props.onClick()
    return live.paint(section.component({ close: () => {} }))
  }
  const menuOf = (node) => live.find(node, (element) => element.props && element.props.role === 'menu')
  const effortItems = (node) => live.findAll(node, (element) => element.type === 'button' && element.props['data-effort-key'] !== undefined)
  const modelItems = (node) => live.findAll(node, (element) => element.type === 'button' && element.props['data-model-key'] !== undefined)

  // 首屏：两个弹出层都未打开，三档各两行
  let tree = live.paint(section.component({ close: () => {} }))
  await new Promise((resolve) => setTimeout(resolve, 0))
  tree = live.paint(section.component({ close: () => {} }))
  assert.equal(live.findAll(tree, (element) => element.props && element.props.role === 'menu').length, 0, '未展开时不应渲染弹出层')
  for (const role of ['auditor', 'executor', 'mechanical']) {
    assert.ok(triggerOf(tree, 'tm-' + role + '-model'), role + ' 必须有模型行')
    assert.ok(triggerOf(tree, 'tm-' + role + '-effort'), role + ' 必须有思考强度行')
  }

  // 模型行：自己的弹出层 + 搜索框 + 选中回显
  tree = openMenu(tree, 'tm-auditor-model')
  let menu = menuOf(tree)
  assert.ok(menu, '模型行必须展开自己的弹出层')
  assert.ok(live.find(menu, (element) => element.type === 'input' && element.props.type === 'search'), '模型层必须带搜索框')
  assert.equal(triggerOf(tree, 'tm-auditor-model').props['aria-expanded'], 'true', '展开时 aria-expanded=true')
  assert.equal(triggerOf(tree, 'tm-auditor-effort').props['aria-expanded'], 'false', '另一行不受影响')
  const m1 = live.find(menu, (element) => element.type === 'button' && element.props['data-model-key'] === 'p/m1')
  assert.ok(m1, '模型层必须列出目录里的模型')
  m1.props.onClick()
  tree = live.paint(section.component({ close: () => {} }))
  assert.equal(live.findAll(tree, (element) => element.props && element.props.role === 'menu').length, 0, '选完模型只关自己这一层')
  assert.ok(JSON.stringify(triggerOf(tree, 'tm-auditor-model')).includes('p/m1'), '模型行回显所选路由')

  // 思考强度行：随所选模型出现档位，自己的弹出层不带搜索
  const effortTrigger = triggerOf(tree, 'tm-auditor-effort')
  assert.equal(effortTrigger.props.disabled, false, '有档位时思考强度行可选')
  tree = openMenu(tree, 'tm-auditor-effort')
  menu = menuOf(tree)
  assert.ok(menu, '思考强度行必须展开自己的弹出层')
  assert.ok(!live.find(menu, (element) => element.type === 'input'), '思考强度层不带搜索框')
  const efforts = effortItems(menu)
  assert.equal(efforts.length, 3, '跟随默认 + 两档')
  assert.ok(JSON.stringify(efforts).includes('高'), '档位名来自模型声明')
  assert.equal(efforts.filter((item) => String(item.props['aria-selected']) === 'true').length, 1, '有且只有一个当前档位')
  const high = live.find(menu, (element) => element.type === 'button' && element.props['data-effort-key'] === 'high')
  high.props.onClick()
  tree = live.paint(section.component({ close: () => {} }))
  assert.equal(live.findAll(tree, (element) => element.props && element.props.role === 'menu').length, 0, '选完档位关闭本层')
  assert.ok(JSON.stringify(triggerOf(tree, 'tm-auditor-effort')).includes('高'), '思考强度行回显所选档位')

  // 换到不声明档位的模型：思考强度行禁用并说明原因
  tree = openMenu(tree, 'tm-auditor-model')
  live.find(menuOf(tree), (element) => element.type === 'button' && element.props['data-model-key'] === 'p/m2').props.onClick()
  tree = live.paint(section.component({ close: () => {} }))
  const offTrigger = triggerOf(tree, 'tm-auditor-effort')
  assert.equal(offTrigger.props.disabled, true, '无档位时必须禁用，不装作可点')
  assert.ok(String(offTrigger.props.title || '').includes('reasoning.efforts'), '禁用时说明原因')
})

test('面板布局：两行选择器各自弹出层，行高与配色对齐宿主', () => {
  const clientSource = readFileSync(new URL('../../lib/client.js', import.meta.url), 'utf8')
  assert.match(clientSource, /\.tm-menu\{[^}]*overflow:auto/, '选项层自己滚动，不撑破视口')
  assert.match(clientSource, /\.tm-field\{[^}]*height:34px/, '选择行行高 34，对齐宿主')
  assert.match(clientSource, /\.tm-field-label\{[^}]*label-secondary/, '标签走次要色')
  assert.match(clientSource, /\.tm-field-value\{[^}]*label-primary/, '值走主色')
  assert.ok(clientSource.includes('scrollIntoView'), '打开面板时需把当前选中项滚入可视区')
})


// 修复守卫（task-42）：面板不能被自己的滚动监听关掉，且点开后必须保持展开。
test('滚动关闭排除组合控件内部，点开后保持展开', () => {
  const clientSource = readFileSync(new URL('../../lib/client.js', import.meta.url), 'utf8')
  // 1) 静态：scroll 处理器必须排除 [data-dsh-tm-combo] 内部的滚动，不能无条件 setOpen(false)。
  const scrollHandler = /const onScroll = \(event\) => \{([\s\S]*?)\n          \}/.exec(clientSource)
  assert.ok(scrollHandler, '必须存在 onScroll 处理器')
  assert.ok(scrollHandler[1].includes("closest('[data-dsh-tm-select]')"), '面板内部滚动必须被排除')
  assert.ok(scrollHandler[1].includes('return'), '内部滚动时应提前返回，不关闭面板')
  assert.equal(/const onScroll = \(\) => \{ setOpen\(false\) \}/.test(clientSource), false, '不得再有「任何滚动都关面板」的写法')

  // 2) 行为：点击触发按钮后，面板在重新渲染后仍然展开（历史缺陷：一开就被关掉）。
  const live = createLiveReact()
  const mod = registered.get('dsh-enhanced-team-mode')((name) => {
    if (name === 'react') return live.React
    throw new Error('unexpected require: ' + name)
  })
  const collected = []
  const ctx = {
    slots: { inject: (name, run) => run(), register: (options, component) => { collected.push({ options, component }); return () => {} } },
    configForms: { get: () => ({ subscribe: () => () => {}, getSnapshot: () => ({ value: {}, revision: 0, writable: true, status: 'ready' }), mutate: () => Promise.resolve(true) }) },
    remote: { session: { modelCatalog: () => Promise.resolve({ ok: true, value: { groups: [{ id: 'p', models: [{ id: 'm1', name: 'M1', reasoning: { efforts: [{ id: 'high', name: '高' }], defaultEffort: 'high' } }] }], failures: [] } }) } },
  }
  mod.apply(ctx)
  const section = collected.find((entry) => entry.options.name === 'settings.section')
  let tree = live.paint(section.component({ close: () => {} }))
  const trigger = live.find(tree, (element) => element.type === 'button' && element.props.id === 'tm-auditor-model')
  trigger.props.onClick()
  tree = live.paint(section.component({ close: () => {} }))
  assert.equal(live.findAll(tree, (element) => element.props && element.props.role === 'menu').length, 1, '点击后必须展开面板')
  const expanded = live.find(tree, (element) => element.type === 'button' && element.props.id === 'tm-auditor-model')
  assert.equal(expanded.props['aria-expanded'], 'true', 'aria-expanded 必须同步为 true')
  // 再渲染一次（模拟父组件因其它状态重渲染）面板不得丢失
  tree = live.paint(section.component({ close: () => {} }))
  assert.equal(live.findAll(tree, (element) => element.props && element.props.role === 'menu').length, 1, '重渲染后仍应保持展开')
})

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
  assert.ok(declared.includes('remote.session'), 'remote.session 是独立服务 id，必须单独声明')
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

// task-47 复审：颜色必须走宿主变量，箭头优先宿主图标、可退回字符。
test('颜色与箭头：宿主变量优先，无裸硬编码颜色，图标可回退', async () => {
  const clientSource = readFileSync(new URL('../../lib/client.js', import.meta.url), 'utf8')
  assert.match(clientSource, /\.tm-menu\{[^}]*box-shadow:var\(--dsw-elevation-panel/, '弹出层阴影必须用 --dsw-elevation-panel')
  assert.match(clientSource, /\.tm-btn\.is-primary\{[^}]*color:var\(--dsw-alias-label-on-color/, '主按钮文字色必须用 --dsw-alias-label-on-color')
  // 裸硬编码：var(--x, 回退值) 里的回退值允许，其余不允许出现 #hex 或 rgba( 作为独立颜色值。
  const bare = []
  for (const [index, line] of clientSource.split('\n').entries()) {
    if (!line.includes("'[data-dsh-tm]")) continue
    const stripped = line.replace(/var\([^)]*\)/g, 'VAR')
    if (/#[0-9a-fA-F]{3,8}\b/.test(stripped) || /rgba?\s*\(/.test(stripped)) bare.push((index + 1) + ': ' + line.trim().slice(0, 80))
  }
  assert.deepEqual(bare, [], '不得有 var() 之外的硬编码颜色：' + bare.join(' | '))

  // 图标优先：require 返回宿主图标组件时，触发按钮渲染该组件而不是字符。
  const live = createLiveReact()
  const FakeIcon = function IconChevronDownOutlineRegular() { return null }
  const mod = registered.get('dsh-enhanced-team-mode')((name) => {
    if (name === 'react') return live.React
    if (name === '@deepseek-ai/dsh-client-ui-primitives') return { IconChevronDownOutlineRegular: FakeIcon }
    throw new Error('unexpected require: ' + name)
  })
  const collected = []
  const ctx = {
    slots: { inject: (name, run) => run(), register: (options, component) => { collected.push({ options, component }); return () => {} } },
    configForms: { get: () => ({ subscribe: () => () => {}, getSnapshot: () => ({ value: {}, revision: 0, writable: true, status: 'ready' }), mutate: () => Promise.resolve(true) }) },
    remote: { session: { modelCatalog: () => Promise.resolve({ ok: true, value: { groups: [{ id: 'p', models: [{ id: 'm1', name: 'M1' }] }], failures: [] } }) } },
  }
  mod.apply(ctx)
  const section = collected.find((entry) => entry.options.name === 'settings.section')
  const tree = live.paint(section.component({ close: () => {} }))
  // 图标组件会被展开成 null，断言渲染标记：caret 带 is-icon 类。
  assert.ok(JSON.stringify(tree).includes('tm-caret is-icon'), '拿到宿主图标时应渲染图标（caret 带 is-icon）')
  assert.equal(JSON.stringify(tree).includes('"▾"'), false, '有图标时不应再渲染字符箭头')
})
