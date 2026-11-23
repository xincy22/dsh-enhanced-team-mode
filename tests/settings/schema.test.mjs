import test from 'node:test'
import assert from 'node:assert/strict'
import { createSettingsSchema, normalizeSettings, emptySettings } from '../../src/settings/schema.js'
import { SettingsError } from '../../src/settings/errors.js'

/** 极简 schemastery 替身：只记录结构与 volatile 调用，不实现校验语义。 */
const volatileCalls = []
const leaf = { default: () => leaf, volatile: () => { volatileCalls.push(1); return leaf } }
const z = {
  string: () => leaf,
  object: (shape) => ({ shape }),
}

test('schema 暴露三个角色、每个角色三个叶子字段（含 reasoningEffort）', () => {
  const schema = createSettingsSchema(z)
  assert.deepEqual(Object.keys(schema.shape), ['auditor', 'executor', 'mechanical'])
  for (const role of ['auditor', 'executor', 'mechanical']) {
    assert.deepEqual(Object.keys(schema.shape[role].shape), ['provider', 'model', 'reasoningEffort'])
  }
})

// 真机回归：宿主只把带 volatile 标记的字段放进可写设置文档；缺标记时该 entry 不会出现在
// settings/describe 的命名空间里，configForms.get(entryId) 拿到空壳、mutate 必被拒（实测返回 false）。
test('九个叶子字段全部声明 volatile，宿主才会提供可写设置命名空间', () => {
  volatileCalls.length = 0
  createSettingsSchema(z)
  assert.equal(volatileCalls.length, 9, '三个角色 × 三个字段都要 volatile')
})

test('空配置归一为三角色都跟随默认', () => {
  assert.deepEqual(normalizeSettings(undefined), emptySettings())
  assert.deepEqual(normalizeSettings({}), emptySettings())
  const both = normalizeSettings({ executor: {}, auditor: {}, mechanical: {} })
  assert.equal(both.auditor.mode, 'default')
  assert.equal(both.executor.mode, 'default')
  assert.equal(both.mechanical.mode, 'default')
})

test('完整路由归一为显式选择', () => {
  const out = normalizeSettings({ executor: { provider: 'opencode-go', model: 'deepseek-v4.1-flash' } })
  assert.deepEqual(out.executor, { mode: 'explicit', provider: 'opencode-go', model: 'deepseek-v4.1-flash', reasoningEffort: '' })
  assert.equal(out.auditor.mode, 'default')
})

test('只给 provider 报不完整，而不是猜一个模型', () => {
  assert.throws(() => normalizeSettings({ executor: { provider: 'p', model: '' } }), /SETTINGS_INCOMPLETE_ROUTE/)
  assert.throws(() => normalizeSettings({ executor: { provider: 'p', model: '' } }), (error) => {
    assert.ok(error instanceof SettingsError)
    assert.equal(error.code, 'SETTINGS_INCOMPLETE_ROUTE')
    return true
  })
})

test('仅 model 且形如别名的输入被当作别名候选，交由解析阶段校验', () => {
  const out = normalizeSettings({ auditor: { provider: '', model: 'deepseek-v4.1-flash' } })
  assert.deepEqual(out.auditor, { mode: 'alias', alias: 'deepseek-v4.1-flash', reasoningEffort: '' })
})

test('三个角色互不影响', () => {
  const out = normalizeSettings({
    executor: { provider: 'p1', model: 'm1' },
    auditor: { provider: 'p2', model: 'm2' },
    mechanical: { provider: 'p3', model: 'm3' },
  })
  assert.deepEqual(out.executor, { mode: 'explicit', provider: 'p1', model: 'm1', reasoningEffort: '' })
  assert.deepEqual(out.auditor, { mode: 'explicit', provider: 'p2', model: 'm2', reasoningEffort: '' })
  assert.deepEqual(out.mechanical, { mode: 'explicit', provider: 'p3', model: 'm3', reasoningEffort: '' })
})

test('旧配置缺 mechanical 字段时按 default 兼容，不要求迁移', () => {
  const out = normalizeSettings({
    executor: { provider: 'p1', model: 'm1' },
    auditor: { provider: '', model: 'alias-a' },
  })
  assert.deepEqual(out.executor, { mode: 'explicit', provider: 'p1', model: 'm1', reasoningEffort: '' })
  assert.deepEqual(out.auditor, { mode: 'alias', alias: 'alias-a', reasoningEffort: '' })
  assert.deepEqual(out.mechanical, { mode: 'default' })
})

// 新增：推理等级是模型级可选属性，零迁移（旧配置缺该字段）且可透传。
test('推理等级：旧配置缺字段归一为空串，显式档位原样透传', () => {
  const legacy = normalizeSettings({ executor: { provider: 'p', model: 'm' } })
  assert.equal(legacy.executor.reasoningEffort, '')
  const withEffort = normalizeSettings({ executor: { provider: 'p', model: 'm', reasoningEffort: ' high ' } })
  assert.deepEqual(withEffort.executor, { mode: 'explicit', provider: 'p', model: 'm', reasoningEffort: 'high' })
  // 没有路由时推理等级没有意义：随 default 一并忽略。
  const orphan = normalizeSettings({ auditor: { provider: '', model: '', reasoningEffort: 'high' } })
  assert.deepEqual(orphan.auditor, { mode: 'default' })
  // 类型不对仍然报错，不静默吞掉。
  assert.throws(() => normalizeSettings({ auditor: { provider: 'p', model: 'm', reasoningEffort: 1 } }), /SETTINGS_INVALID_ROLE/)
})

test('非法输入形状被拒绝', () => {
  assert.throws(() => normalizeSettings({ executor: 'nope' }), /SETTINGS_INVALID_ROLE/)
  assert.throws(() => normalizeSettings({ executor: { provider: 1, model: 'm' } }), /SETTINGS_INVALID_ROLE/)
})
