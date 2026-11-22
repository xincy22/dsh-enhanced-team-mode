import test from 'node:test'
import assert from 'node:assert/strict'
import { decide, KIND, MESSAGE_FORM, emptyState } from '../src/inject/policy.js'

const human = (id, text) => ({ id, text })
const base = (over = {}) => ({
  isRoot: true,
  origin: 'root',
  teamEnabled: true,
  step: 1,
  turn: 1,
  humanMessages: [human('m1', '把插件骨架搭起来')],
  state: emptyState(),
  ...over,
})

test('首次独立任务自动注入一次', () => {
  const out = decide(base())
  assert.equal(out.inject, true)
  assert.equal(out.reason, 'first-independent-task')
})

test('第二轮的追问与调整不注入', () => {
  const state = { ...emptyState(), taskEpoch: 1, lastInjectedTurn: 1 }
  for (const text of ['继续补测试', '顺便把日志统一', '改一下命名', '补充边界用例']) {
    const out = decide(base({ turn: 2, humanMessages: [human('m2', text)], state }))
    assert.equal(out.inject, false, text)
    assert.equal(out.reason, 'not-an-explicit-new-task')
  }
})

test('第二轮明确另起任务时注入一次', () => {
  const state = { ...emptyState(), taskEpoch: 1, lastInjectedTurn: 1 }
  const out = decide(base({ turn: 2, humanMessages: [human('m2', '新任务：写安装文档')], state }))
  assert.equal(out.inject, true)
  assert.equal(out.reason, 'explicit-new-task')
})

test('同一轮内重复事件不重复注入', () => {
  const state = { ...emptyState(), taskEpoch: 1, lastInjectedTurn: 4 }
  const out = decide(base({ turn: 4, state }))
  assert.equal(out.inject, false)
  assert.equal(out.reason, 'already-injected-this-turn')
})

test('非第一步不注入', () => {
  const out = decide(base({ step: 2 }))
  assert.equal(out.inject, false)
  assert.equal(out.reason, 'not-first-step')
})

test('非真人来源不注入（自动续跑、定时、队友、工具结果）', () => {
  const out = decide(base({ humanMessages: [] }))
  assert.equal(out.inject, false)
  assert.equal(out.reason, 'no-human-input')
})

test('成员会话不注入', () => {
  assert.equal(decide(base({ origin: 'subagent' })).reason, 'not-root-session')
  assert.equal(decide(base({ isRoot: false })).reason, 'not-root-session')
})

test('模式关闭时不注入，首次任务也不注入', () => {
  const out = decide(base({ teamEnabled: false }))
  assert.equal(out.inject, false)
  assert.equal(out.reason, 'team-disabled')
})

test('模式关闭后已有注入不再新增', () => {
  const state = { ...emptyState(), taskEpoch: 1, lastInjectedTurn: 1 }
  const out = decide(base({ turn: 2, teamEnabled: false, humanMessages: [human('m2', '新任务：另做一件')], state }))
  assert.equal(out.inject, false)
  assert.equal(out.reason, 'team-disabled')
})

test('重入：状态持久化后追问不因内存丢失而重复注入', () => {
  const state = { ...emptyState(), taskEpoch: 1, lastInjectedTurn: 1, lastInjectedMessageId: 'x1' }
  const out = decide(base({ turn: 3, humanMessages: [human('m3', '继续')], state }))
  assert.equal(out.inject, false)
})

test('压缩恢复：没有新的真人消息就不注入', () => {
  const state = { ...emptyState(), taskEpoch: 1, lastInjectedTurn: 2 }
  const out = decide(base({ turn: 3, humanMessages: [], state }))
  assert.equal(out.inject, false)
  assert.equal(out.reason, 'no-human-input')
})

test('注入目标是最新一条真人消息', () => {
  const out = decide(base({ humanMessages: [human('m1', '旧'), human('m2', '新任务：另起一件')] }))
  assert.equal(out.inject, true)
  assert.equal(out.target.id, 'm2')
})

test('来源标识固定', () => {
  assert.equal(KIND, 'team-mode')
  assert.equal(MESSAGE_FORM, 'instructions')
})
