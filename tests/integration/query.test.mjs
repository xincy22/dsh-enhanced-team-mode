import test from 'node:test'
import assert from 'node:assert/strict'
import { attach } from '../../src/dispatch/attach.js'
import { createRouteTool, ROUTE_TOOL_NAME, ROUTE_TOOL_DESCRIPTION } from '../../src/dispatch/tool.js'
import { renderQueryAnswer } from '../../src/dispatch/query.js'
import { fakeCreateUserMessage as createUserMessage, makeHarness, human, z } from './harness.mjs'

const PRO = { provider: 'opencode-go', model: 'pro' }
const FLASH = { provider: 'opencode-go', model: 'flash' }

function mount(h, config) {
  return attach(h.ctx, { config, createUserMessage, z })
}

async function firstTask(h, session) {
  h.startTurn(session, 1)
  const { decision } = await h.preStep(session, { turn: 1, step: 1, messages: [human('m1', '把骨架搭起来')] })
  return h.textOf(decision.messages)
}

test('同一任务内设置 A→B：新建成员前查询得到 B，已注入的指令仍是 A', async () => {
  const h = makeHarness({ authorized: [FLASH, PRO] })
  const session = h.session('s1')

  const first = mount(h, { auditor: { provider: PRO.provider, model: PRO.model } })
  h.authorizedEvent(session)
  const injected = await firstTask(h, session)
  assert.ok(injected.includes('审计模型：opencode-go/pro'), injected)

  // 任务进行中保存了新设置：插件重新加载，注入不变，查询入口读到新值。
  h.listeners.length = 0
  const second = mount(h, { auditor: { provider: FLASH.provider, model: FLASH.model } })
  const agent = h.makeAgent(session)
  const resolved = await second.query(agent)
  assert.deepEqual(resolved.routes.auditor, { kind: 'route', provider: 'opencode-go', model: 'flash' })
  assert.ok(resolved.text.includes('审计模型：opencode-go/flash'), resolved.text)
  // 一次性注入是快照，不会因为设置变更而改写
  assert.ok(injected.includes('审计模型：opencode-go/pro'))
})

test('同一任务内两角色都改：查询同时给出两个角色的新值', async () => {
  const h = makeHarness({ authorized: [FLASH, PRO] })
  const session = h.session('s1')
  mount(h, {})
  h.authorizedEvent(session)
  await firstTask(h, session)

  h.listeners.length = 0
  const second = mount(h, {
    executor: { provider: 'opencode-go', model: PRO.model },
    auditor: { provider: 'opencode-go', model: FLASH.model },
  })
  const resolved = await second.query(h.makeAgent(session))
  assert.deepEqual(resolved.routes.executor, { kind: 'route', provider: 'opencode-go', model: 'pro' })
  assert.deepEqual(resolved.routes.auditor, { kind: 'route', provider: 'opencode-go', model: 'flash' })
})

test('复用旧成员不变：查询文本与工具说明都写明复用不需要路由', async () => {
  const h = makeHarness({ authorized: [FLASH, PRO] })
  const session = h.session('s1')
  const mounted = mount(h, { auditor: { provider: PRO.provider, model: PRO.model } })
  h.authorizedEvent(session)
  const resolved = await mounted.query(h.makeAgent(session))
  assert.ok(resolved.text.includes('复用已有成员时不要传 provider 与 model'), resolved.text)
  assert.ok(ROUTE_TOOL_DESCRIPTION.includes('Reusing an existing teammate needs no route'))
})

test('显式路由不可用：拒绝并说明，不回退到父路由或其他模型', async () => {
  const h = makeHarness({ authorized: [FLASH, PRO] })
  const session = h.session('s1')
  const mounted = mount(h, { auditor: { provider: 'opencode-go', model: 'retired' } })
  h.authorizedEvent(session)
  const resolved = await mounted.query(h.makeAgent(session))
  assert.equal(resolved.routes.auditor, undefined)
  assert.equal(resolved.problems[0].code, 'SETTINGS_UNKNOWN_MODEL')
  assert.equal(resolved.text.includes('审计模型：opencode-go/flash'), false)
  assert.equal(resolved.text.includes('审计模型：opencode-go/pro'), false)
})

test('无 allowlist：父路由可用，其他路由在查询入口同样被拒', async () => {
  const h = makeHarness({ authorized: null })
  const session = h.session('s1')
  const mounted = mount(h, { auditor: { provider: PRO.provider, model: PRO.model } })
  const resolved = await mounted.query(h.makeAgent(session))
  assert.equal(resolved.routes.auditor, undefined)
  assert.equal(resolved.problems[0].code, 'SETTINGS_UNAUTHORIZED_ROUTE')
  assert.ok(resolved.text.includes('没有授权列表'))
})

test('目录读取失败：查询返回问题，不给路由', async () => {
  const h = makeHarness({ authorized: [FLASH, PRO] })
  h.ctx.llm.listProviders = () => { throw new Error('llm 不可用') }
  const session = h.session('s1')
  const mounted = mount(h, { auditor: { provider: PRO.provider, model: PRO.model } })
  h.authorizedEvent(session)
  const resolved = await mounted.query(h.makeAgent(session))
  assert.equal(resolved.routes.auditor, undefined)
  assert.equal(resolved.problems[0].code, 'SETTINGS_CATALOG_UNAVAILABLE')
})

test('查询工具：执行时把当前路由渲染成文本', async () => {
  const calls = []
  const tool = createRouteTool({
    query: async (agent, signal) => {
      calls.push({ agent: agent.id, signal })
      return { routes: {}, problems: [], text: '审计模型：opencode-go/pro' }
    },
  })
  assert.equal(tool.name, ROUTE_TOOL_NAME)
  assert.deepEqual(tool.parameters, {})
  assert.equal(tool.isConcurrencySafe(), true)
  const text = await tool.execute({}, { agent: { id: 'a1' }, signal: undefined })
  assert.equal(text, '审计模型：opencode-go/pro')
  assert.equal(calls.length, 1)
})

test('查询工具：没有调用方时报错，不编造路由', async () => {
  const tool = createRouteTool({ query: async () => ({ routes: {}, problems: [], text: '' }) })
  await assert.rejects(() => tool.execute({}, {}), new RegExp(ROUTE_TOOL_NAME))
})

test('都跟随默认时给出一句明确回答，而不是空串', () => {
  const answer = renderQueryAnswer({ routes: {}, problems: [], text: '' })
  assert.ok(answer.includes('跟随 DSH 默认'))
  assert.ok(answer.includes('继承父路由'))
})

test('注入里带按需查询入口的指针', async () => {
  const { COORDINATOR_INSTRUCTION, ROUTE_QUERY_POINTER } = await import('../../src/inject/instruction.js')
  assert.ok(COORDINATOR_INSTRUCTION.includes(ROUTE_QUERY_POINTER))
  assert.ok(ROUTE_QUERY_POINTER.includes(ROUTE_TOOL_NAME))
  assert.ok(ROUTE_QUERY_POINTER.includes('新建成员之前'))
})

test('文档口径守卫：漏传参数是继承父路由，不是派发失败', async () => {
  const { readFileSync } = await import('node:fs')
  const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8')
  assert.ok(readme.includes('继承父路由'))
  assert.ok(readme.includes('不会失败'))
  assert.ok(readme.includes('team_model_routes'))
  assert.equal(readme.includes('漏传会派发失败'), false)
})
