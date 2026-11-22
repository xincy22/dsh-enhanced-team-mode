import test from 'node:test'
import assert from 'node:assert/strict'
import { attach } from '../../src/dispatch/attach.js'
import { fakeCreateUserMessage as createUserMessage, makeHarness, human, z } from './harness.mjs'

/** 挂载一个实例（模拟插件加载）。 */
function mount(h, config) {
  return attach(h.ctx, { config, createUserMessage, z })
}

/** 第一轮：根会话首个独立任务。 */
async function firstTask(h, session, text = '把插件骨架搭起来') {
  h.startTurn(session, 1)
  const { decision } = await h.preStep(session, { turn: 1, step: 1, messages: [human('m1', text)] })
  return h.textOf(decision.messages)
}

const PRO = { provider: 'opencode-go', model: 'pro' }
const FLASH = { provider: 'opencode-go', model: 'flash' }

test('无 allowlist：父路由可用，非父路由报未授权且不作为选择出现', async () => {
  const ok = makeHarness({ authorized: null })
  mount(ok, { auditor: { provider: PRO.provider, model: PRO.model } })
  const session = ok.session('s1')
  const text = await firstTask(ok, session)
  assert.ok(text.includes('SETTINGS_UNAUTHORIZED_ROUTE'), text)
  assert.equal(text.includes('审计模型：opencode-go/pro'), false)

  const parent = makeHarness({ authorized: null })
  mount(parent, { auditor: { provider: FLASH.provider, model: FLASH.model } })
  const s2 = parent.session('s2')
  const t2 = await firstTask(parent, s2)
  assert.ok(t2.includes('审计模型：opencode-go/flash'), t2)
})

test('有 allowlist：列表外的路由被拒，列表内可用', async () => {
  const h = makeHarness({ authorized: [FLASH] })
  mount(h, { auditor: { provider: PRO.provider, model: PRO.model } })
  const session = h.session('s1')
  h.authorizedEvent(session)
  const text = await firstTask(h, session)
  assert.ok(text.includes('SETTINGS_UNAUTHORIZED_ROUTE'), text)
  assert.equal(text.includes('审计模型：opencode-go/pro'), false)
})

test('显式不可用不回退：只剩问题说明，没有替代路由', async () => {
  const h = makeHarness({ authorized: [FLASH, PRO] })
  mount(h, { executor: { provider: 'opencode-go', model: 'retired' } })
  const session = h.session('s1')
  h.authorizedEvent(session)
  const text = await firstTask(h, session)
  assert.ok(text.includes('SETTINGS_UNKNOWN_MODEL'), text)
  assert.equal(text.includes('执行模型：opencode-go/flash'), false)
  assert.equal(text.includes('执行模型：opencode-go/pro'), false)
})

test('复用已有成员保留原模型写进指令', async () => {
  const h = makeHarness({ authorized: [FLASH, PRO] })
  mount(h, { executor: { provider: 'opencode-go', model: PRO.model } })
  const session = h.session('s1')
  h.authorizedEvent(session)
  const text = await firstTask(h, session)
  assert.ok(text.includes('复用已有成员时不要传 provider 与 model'), text)
})

test('主对话模型不变：不选模型、不改请求配置', async () => {
  const h = makeHarness({ authorized: [FLASH, PRO] })
  mount(h, { executor: { provider: 'opencode-go', model: PRO.model } })
  const session = h.session('s1')
  h.authorizedEvent(session)
  await firstTask(h, session)
  assert.deepEqual(h.calls.select, [])
  assert.deepEqual(h.calls.resolveCallConfig, [])
})

test('设置变更后，后续独立任务使用新路由，已注入的历史不变', async () => {
  const h = makeHarness({ authorized: [FLASH, PRO] })
  const session = h.session('s1')

  mount(h, { auditor: { provider: PRO.provider, model: PRO.model } })
  h.authorizedEvent(session)
  const first = await firstTask(h, session)
  assert.ok(first.includes('审计模型：opencode-go/pro'), first)

  // 模拟设置保存后插件重新加载：旧实例的监听器被替换，会话状态由投影重放保留。
  h.listeners.length = 0
  mount(h, { auditor: { provider: FLASH.provider, model: FLASH.model } })
  h.startTurn(session, 2)
  const { decision } = await h.preStep(session, { turn: 2, step: 1, messages: [human('m2', '新任务：写安装文档')] })
  const second = h.textOf(decision.messages)
  assert.ok(second.includes('审计模型：opencode-go/flash'), second)

  // 第二次注入是新的独立消息；两次注入都被日志记录（投影计数为 2），旧文本没有被改写
  const all = decision.messages
  assert.equal(all.length, 2)
  assert.equal(all[0].source.kind, 'user')
  assert.equal(all[1].source.kind, 'team-mode')
  assert.ok(all[1].content[0].text.includes('审计模型：opencode-go/flash'))
  const injectionState = h.stateOf(session)
  assert.equal(injectionState.taskEpoch, 2, '两次独立任务各注入一次')
})

test('两角色都跟随默认时不出现模型路由块', async () => {
  const h = makeHarness({ authorized: [FLASH, PRO] })
  mount(h, {})
  const session = h.session('s1')
  h.authorizedEvent(session)
  const text = await firstTask(h, session)
  assert.equal(text.includes('## 成员模型'), false)
  assert.ok(text.includes('项目协调者'))
})

test('坏配置只报问题，不静默改用默认路由', async () => {
  const h = makeHarness({ authorized: [FLASH, PRO] })
  mount(h, { executor: { provider: 'opencode-go', model: '' } })
  const session = h.session('s1')
  h.authorizedEvent(session)
  const text = await firstTask(h, session)
  assert.ok(text.includes('SETTINGS_INCOMPLETE_ROUTE'), text)
  assert.ok(text.includes('插件设置'))
  assert.equal(text.includes('执行模型：opencode-go/'), false)
})

test('团队关闭时不注入（集成层仍生效）', async () => {
  const h = makeHarness({ enabled: false })
  mount(h, {})
  const session = h.session('s1')
  h.startTurn(session, 1)
  const { decision } = await h.preStep(session, { turn: 1, step: 1, messages: [human('m1', '任务')] })
  assert.equal(decision.messages.length, 1)
})

test('注入消息形态仍是 user + team-mode + instructions', async () => {
  const h = makeHarness({ authorized: [FLASH] })
  mount(h, {})
  const session = h.session('s1')
  h.authorizedEvent(session)
  h.startTurn(session, 1)
  const { decision } = await h.preStep(session, { turn: 1, step: 1, messages: [human('m1', '任务')] })
  const injected = decision.messages[1]
  assert.equal(injected.role, 'user')
  assert.equal(injected.source.kind, 'team-mode')
  assert.equal(injected.source.form, 'instructions')
})

test('目录读取失败时只报问题，不给出路由', async () => {
  const h = makeHarness({ authorized: [FLASH, PRO] })
  h.ctx.llm.listProviders = () => { throw new Error('llm 不可用') }
  mount(h, { executor: { provider: 'opencode-go', model: PRO.model } })
  const session = h.session('s1')
  h.authorizedEvent(session)
  const text = await firstTask(h, session)
  assert.ok(text.includes('SETTINGS_CATALOG_UNAVAILABLE'), text)
  assert.equal(text.includes('执行模型：opencode-go/pro'), false)
})
