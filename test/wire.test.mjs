import test from 'node:test'
import assert from 'node:assert/strict'
import { wire } from '../src/inject/wire.js'
import { KIND } from '../src/inject/policy.js'
import { createProjectionDefinition } from '../src/inject/projection.js'

/** 极简 zod 替身：只实现投影用到的 object / number / string 及 nullable 链。 */
const scalar = () => ({ nullable: () => scalar() })
const z = {
  object: (shape) => ({ shape, parse: (value) => value }),
  number: scalar,
  string: scalar,
  const: (value) => ({ value }),
  union: (list) => ({ list }),
}

/** 假 createUserMessage：补齐 id 与 role，保留调用方给的 source。 */
function fakeCreateUserMessage({ content, source }) {
  return { id: 'inj-' + (++counter), role: 'user', content, source }
}
let counter = 0

/** 一台假 harness：投影状态、事件回放、pre-step 监听器。 */
function makeHarness(options = {}) {
  counter = 0
  const sessions = new Map()
  const definition = createProjectionDefinition(z)
  const stateOf = (session) => {
    if (!sessions.has(session.id)) sessions.set(session.id, definition.init())
    return sessions.get(session.id)
  }
  const listeners = []
  const ctx = {
    sessionProjections: {
      register: async (registered) => {
        assert.equal(registered.key, definition.key)
        return { stateOf: (session) => structuredClone(stateOf(session)) }
      },
    },
    on: (name, listener) => { listeners.push({ name, listener }) },
    subagents: { rootOf: (agent) => (options.root === false ? { id: 'other-root' } : agent) },
    agentTeams: { isEnabled: () => options.enabled !== false },
    logger: { debug: () => {} },
    fiber: { assertActive: () => {} },
  }
  wire(ctx, { createUserMessage: fakeCreateUserMessage, z })
  assert.equal(listeners.length, 1)
  assert.equal(listeners[0].name, 'agent/pre-step')

  /** 事件回放：驱动投影状态。 */
  const replay = (session, event) => {
    sessions.set(session.id, definition.apply(stateOf(session), event))
  }
  /** 一轮开始。 */
  const startTurn = (session, turn) => replay(session, { type: 'turn/start', data: { turn } })
  /** 把注入消息写回日志，模拟宿主 append。 */
  const commit = (session, message) => replay(session, { type: 'user/message', data: message })

  /** 一次 pre-step：返回最终进入本步的消息列表。 */
  const preStep = async (session, { turn, step, messages }) => {
    const agent = { id: session.id, session }
    const payload = { agent, turn, step, messages, signal: { aborted: false } }
    const decision = await listeners[0].listener(payload, async () => ({ kind: 'enter', messages }))
    if (decision.kind === 'enter') for (const m of decision.messages) if (m.source?.kind === KIND) commit(session, m)
    return decision.messages
  }

  const session = (id, origin = 'root') => ({ id, header: { origin }, surface: { nodes: [] } })

  return { session, startTurn, preStep, stateOf, replay }
}

const human = (id, text) => ({ id, role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } })
const nonHuman = (id, kind, text) => ({ id, role: 'user', content: [{ type: 'text', text }], source: { kind } })

test('首次触发：根会话第一轮注入一条协作指令', async () => {
  const h = makeHarness()
  const s = h.session('s1')
  h.startTurn(s, 1)
  const messages = await h.preStep(s, { turn: 1, step: 1, messages: [human('m1', '把插件骨架搭起来')] })
  assert.equal(messages.length, 2)
  const injected = messages[1]
  assert.equal(injected.role, 'user')
  assert.equal(injected.source.kind, KIND)
  assert.equal(injected.source.form, 'instructions')
  assert.match(injected.content[0].text, /架构协调者/)
  assert.equal(h.stateOf(s).taskEpoch, 1)
  assert.equal(h.stateOf(s).lastInjectedTurn, 1)
})

test('重复事件：同一轮再次进入第一步不重复注入', async () => {
  const h = makeHarness()
  const s = h.session('s1')
  h.startTurn(s, 1)
  await h.preStep(s, { turn: 1, step: 1, messages: [human('m1', '任务')] })
  const again = await h.preStep(s, { turn: 1, step: 1, messages: [human('m1', '任务')] })
  assert.equal(again.length, 1)
  assert.equal(h.stateOf(s).taskEpoch, 1)
})

test('意见调整与追问：第二轮不注入', async () => {
  const h = makeHarness()
  const s = h.session('s1')
  h.startTurn(s, 1)
  await h.preStep(s, { turn: 1, step: 1, messages: [human('m1', '任务')] })
  for (const [i, text] of ['继续补测试', '改一下命名', '顺便看日志'].entries()) {
    const turn = i + 2
    h.startTurn(s, turn)
    const out = await h.preStep(s, { turn, step: 1, messages: [human('m' + (i + 2), text)] })
    assert.equal(out.length, 1, text)
  }
  assert.equal(h.stateOf(s).taskEpoch, 1)
})

test('明确换任务：第二轮注入第二条', async () => {
  const h = makeHarness()
  const s = h.session('s1')
  h.startTurn(s, 1)
  await h.preStep(s, { turn: 1, step: 1, messages: [human('m1', '任务')] })
  h.startTurn(s, 2)
  const out = await h.preStep(s, { turn: 2, step: 1, messages: [human('m2', '新任务：写安装文档')] })
  assert.equal(out.length, 2)
  assert.equal(h.stateOf(s).taskEpoch, 2)
})

test('非真人消息：自动续跑、定时、队友消息都不注入', async () => {
  const h = makeHarness()
  const s = h.session('s1')
  for (const [i, kind] of ['goal', 'schedule', 'team-message', 'agent-message'].entries()) {
    h.startTurn(s, i + 1)
    const out = await h.preStep(s, { turn: i + 1, step: 1, messages: [nonHuman('n' + i, kind, '自动消息')] })
    assert.equal(out.length, 1, kind)
  }
  assert.equal(h.stateOf(s).taskEpoch, 0)
})

test('关闭：模式关闭时首次任务也不注入', async () => {
  const h = makeHarness({ enabled: false })
  const s = h.session('s1')
  h.startTurn(s, 1)
  const out = await h.preStep(s, { turn: 1, step: 1, messages: [human('m1', '任务')] })
  assert.equal(out.length, 1)
  assert.equal(h.stateOf(s).taskEpoch, 0)
})

test('关闭后不新增注入，也不改动历史消息与状态', async () => {
  const h = makeHarness({ enabled: false })
  const s = h.session('s1')
  h.startTurn(s, 1)
  await h.preStep(s, { turn: 1, step: 1, messages: [human('m1', '任务')] })
  const injectionOf = (state) => ({
    taskEpoch: state.taskEpoch,
    lastInjectedTurn: state.lastInjectedTurn,
    lastInjectedMessageId: state.lastInjectedMessageId,
  })
  const before = injectionOf(h.stateOf(s))
  h.startTurn(s, 2)
  const out = await h.preStep(s, { turn: 2, step: 1, messages: [human('m2', '新任务：另做一件')] })
  assert.equal(out.length, 1)
  assert.deepEqual(injectionOf(h.stateOf(s)), before)
  assert.deepEqual(s.surface.nodes, [])
})

test('复用与重入：新实例按日志重放状态后不重复注入', async () => {
  const first = makeHarness()
  const s = first.session('s1')
  first.startTurn(s, 1)
  await first.preStep(s, { turn: 1, step: 1, messages: [human('m1', '任务')] })
  const restored = structuredClone(first.stateOf(s))
  assert.equal(restored.taskEpoch, 1)

  // 第二个实例模拟插件重启：只有投影重放出来的状态，内存里没有别的标记。
  const h = makeHarness()
  const s2 = h.session('s1')
  h.replay(s2, { type: 'turn/start', data: { turn: 1 } })
  h.replay(s2, { type: 'user/message', data: { id: 'inj-1', role: 'user', content: [{ type: 'text', text: 'x' }], source: { kind: KIND, form: 'instructions' } } })
  h.startTurn(s2, 2)
  const out = await h.preStep(s2, { turn: 2, step: 1, messages: [human('m2', '继续')] })
  assert.equal(out.length, 1)
})

test('成员会话不注入', async () => {
  const h = makeHarness()
  const s = h.session('child', 'subagent')
  h.startTurn(s, 1)
  const out = await h.preStep(s, { turn: 1, step: 1, messages: [human('m1', '任务')] })
  assert.equal(out.length, 1)
})

test('非根会话（rootOf 不是自己）不注入', async () => {
  const h = makeHarness({ root: false })
  const s = h.session('s1')
  h.startTurn(s, 1)
  const out = await h.preStep(s, { turn: 1, step: 1, messages: [human('m1', '任务')] })
  assert.equal(out.length, 1)
})

test('非第一步不注入', async () => {
  const h = makeHarness()
  const s = h.session('s1')
  h.startTurn(s, 1)
  const out = await h.preStep(s, { turn: 1, step: 2, messages: [human('m1', '任务')] })
  assert.equal(out.length, 1)
})

test('投影只认自家 kind，别人的 user 消息不改状态', async () => {
  const h = makeHarness()
  const s = h.session('s1')
  h.startTurn(s, 3)
  h.replay(s, { type: 'user/message', data: human('m9', '真人') })
  assert.equal(h.stateOf(s).taskEpoch, 0)
  assert.equal(h.stateOf(s).lastInjectedTurn, null)
})
