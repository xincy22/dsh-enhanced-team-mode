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

test('schema 暴露三个角色、每个角色两个叶子字段', () => {
  const schema = createSettingsSchema(z)
  assert.deepEqual(Object.keys(schema.shape), ['auditor', 'executor', 'mechanical'])
  assert.deepEqual(Object.keys(schema.shape.auditor.shape), ['provider', 'model'])
  assert.deepEqual(Object.keys(schema.shape.executor.shape), ['provider', 'model'])
  assert.deepEqual(Object.keys(schema.shape.mechanical.shape), ['provider', 'model'])
})

// 真机回归：宿主只把带 volatile 标记的字段放进可写设置文档；缺标记时该 entry 不会出现在
// settings/describe 的命名空间里，configForms.get(entryId) 拿到空壳、mutate 必被拒（实测返回 false）。
test('六个叶子字段全部声明 volatile，宿主才会提供可写设置命名空间', () => {
  volatileCalls.length = 0
  createSettingsSchema(z)
  assert.equal(volatileCalls.length, 6, '三个角色 × 两个字段都要 volatile')
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
  assert.deepEqual(out.executor, { mode: 'explicit', provider: 'opencode-go', model: 'deepseek-v4.1-flash' })
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
  assert.deepEqual(out.auditor, { mode: 'alias', alias: 'deepseek-v4.1-flash' })
})

test('三个角色互不影响', () => {
  const out = normalizeSettings({
    executor: { provider: 'p1', model: 'm1' },
    auditor: { provider: 'p2', model: 'm2' },
    mechanical: { provider: 'p3', model: 'm3' },
  })
  assert.deepEqual(out.executor, { mode: 'explicit', provider: 'p1', model: 'm1' })
  assert.deepEqual(out.auditor, { mode: 'explicit', provider: 'p2', model: 'm2' })
  assert.deepEqual(out.mechanical, { mode: 'explicit', provider: 'p3', model: 'm3' })
})

test('旧配置缺 mechanical 字段时按 default 兼容，不要求迁移', () => {
  const out = normalizeSettings({
    executor: { provider: 'p1', model: 'm1' },
    auditor: { provider: '', model: 'alias-a' },
  })
  assert.deepEqual(out.executor, { mode: 'explicit', provider: 'p1', model: 'm1' })
  assert.deepEqual(out.auditor, { mode: 'alias', alias: 'alias-a' })
  assert.deepEqual(out.mechanical, { mode: 'default' })
})

test('非法输入形状被拒绝', () => {
  assert.throws(() => normalizeSettings({ executor: 'nope' }), /SETTINGS_INVALID_ROLE/)
  assert.throws(() => normalizeSettings({ executor: { provider: 1, model: 'm' } }), /SETTINGS_INVALID_ROLE/)
})
