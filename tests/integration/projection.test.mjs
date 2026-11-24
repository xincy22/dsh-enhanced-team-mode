// 压缩后重新注入（task-38）：投影在 compaction/end 成功时把注入状态归零。
// 依据：宿主的压缩产物用 surfaceOp=replace 折掉一段 surface，被折掉的 team-mode 指令不再可见；
// 投影从日志重放，状态仍记得「已注入」，所以必须由压缩事件本身把状态归零。
import test from 'node:test'
import assert from 'node:assert/strict'
import { createProjectionDefinition, PROJECTION_KEY, STATE_VERSION } from '../../src/inject/projection.js'
import { decide, emptyState, KIND } from '../../src/inject/policy.js'

/** 极简 schemastery 替身：apply 不依赖 schema 语义，只要构造得过。 */
const leaf = { default: () => leaf }
const z = {
  number: () => leaf,
  string: () => leaf,
  const: () => leaf,
  union: () => leaf,
  object: (shape) => ({ shape }),
}

const definition = createProjectionDefinition(z)

/** 已注入过一次的状态（turn=1 注入）。 */
function injected() {
  let state = definition.init()
  state = definition.apply(state, { type: 'turn/start', data: { turn: 1 } })
  state = definition.apply(state, { type: 'user/message', data: { id: 'inj-1', source: { kind: KIND } } })
  return state
}

test('压缩成功：compaction/end 把注入状态归零，turn 保留', () => {
  const before = injected()
  assert.equal(before.taskEpoch, 1)
  const after = definition.apply(before, {
    type: 'compaction/end',
    data: { compactionId: 'c1', turn: 1 },
  })
  assert.equal(after.taskEpoch, 0, '压缩后必须重新允许首次注入')
  assert.equal(after.lastInjectedTurn, null)
  assert.equal(after.lastInjectedMessageId, null)
  assert.equal(after.turn, 1, 'turn 不因压缩而回退')
})

test('压缩失败（带 error）：不重置', () => {
  const before = injected()
  const after = definition.apply(before, {
    type: 'compaction/end',
    data: { compactionId: 'c1', turn: 1, error: { code: 'summary', message: 'boom' } },
  })
  assert.deepEqual(after, before, '失败压缩不得让插件误判为「需要重新注入」')
})

test('其它压缩事件不重置：start / summary / prune', () => {
  const before = injected()
  for (const type of ['compaction/start', 'compaction/summary', 'compaction/prune']) {
    const after = definition.apply(before, { type, data: { compactionId: 'c1', turn: 1, shadowedSeqs: [1, 2] } })
    assert.deepEqual(after, before, type + ' 不应改变注入状态')
  }
})

test('无关事件与自家消息：状态转移保持原样', () => {
  const empty = definition.init()
  const otherUser = definition.apply(empty, { type: 'user/message', data: { id: 'u1', source: { kind: 'user' } } })
  assert.deepEqual(otherUser, empty, '非自家 user/message 不改状态')
  const turn = definition.apply(empty, { type: 'turn/start', data: { turn: 3 } })
  assert.equal(turn.turn, 3)
  assert.equal(definition.apply(turn, { type: 'tool/result', data: {} }), turn, '未知事件原样返回')
})

test('重置后能真正重新注入：decide 走 first-independent-task', () => {
  let state = injected()
  // 压缩前：同一轮非「明确另起任务」的普通消息不会再次注入（现有去重语义）。
  const human = [{ id: 'u2', text: '继续这个任务，把剩下的做完' }]
  const beforeCompaction = decide({
    isRoot: true, teamEnabled: true, step: 1, turn: 2, humanMessages: human, state,
  })
  assert.equal(beforeCompaction.inject, false)
  assert.equal(beforeCompaction.reason, 'not-an-explicit-new-task')

  // 压缩成功后同一句话就应当重新注入。
  state = definition.apply(state, { type: 'compaction/end', data: { compactionId: 'c2', turn: 2 } })
  const afterCompaction = decide({
    isRoot: true, teamEnabled: true, step: 1, turn: 2, humanMessages: human, state,
  })
  assert.equal(afterCompaction.inject, true)
  assert.equal(afterCompaction.reason, 'first-independent-task')
})

test('投影契约未被改动：key / 版本 / 空状态保持稳定', () => {
  assert.equal(PROJECTION_KEY, 'teamModeInjection')
  assert.equal(STATE_VERSION, 1, '字段形状没变，不升版本')
  assert.deepEqual(definition.init(), emptyState())
})
