import test from 'node:test'
import assert from 'node:assert/strict'
import { mutateOps, readSettings } from '../../src/settings/persist.js'
import { normalizeSettings } from '../../src/settings/schema.js'

/** 把 mutateOps 的 set 操作套用到普通对象上，模拟设置写入后的形状。 */
function applyOps(target, ops) {
  const out = structuredClone(target)
  for (const op of ops) {
    assert.equal(op.op, 'set')
    op.path.reduce((node, key, index) => {
      if (index === op.path.length - 1) node[key] = op.value
      else node[key] ??= {}
      return node[key]
    }, out)
  }
  return out
}

test('跟随默认：三个字段写成空字符串（含推理等级）', () => {
  assert.deepEqual(mutateOps('executor', { kind: 'default' }), [
    { op: 'set', path: ['executor', 'provider'], value: '' },
    { op: 'set', path: ['executor', 'model'], value: '' },
    { op: 'set', path: ['executor', 'reasoningEffort'], value: '' },
  ])
})

test('显式路由：分别写入 provider、model 与 reasoningEffort', () => {
  assert.deepEqual(mutateOps('auditor', { kind: 'route', provider: 'p', model: 'm' }), [
    { op: 'set', path: ['auditor', 'provider'], value: 'p' },
    { op: 'set', path: ['auditor', 'model'], value: 'm' },
    { op: 'set', path: ['auditor', 'reasoningEffort'], value: '' },
  ])
  assert.deepEqual(mutateOps('auditor', { kind: 'route', provider: 'p', model: 'm', reasoningEffort: 'high' }), [
    { op: 'set', path: ['auditor', 'provider'], value: 'p' },
    { op: 'set', path: ['auditor', 'model'], value: 'm' },
    { op: 'set', path: ['auditor', 'reasoningEffort'], value: 'high' },
  ])
})

test('写入后再读回得到同一选择', () => {
  const ops = mutateOps('executor', { kind: 'route', provider: 'opencode-go', model: 'pro' })
  const stored = applyOps({}, ops)
  assert.deepEqual(normalizeSettings(stored).executor, {
    mode: 'explicit', provider: 'opencode-go', model: 'pro', reasoningEffort: '',
  })
})

test('默认写入后读回仍是 default', () => {
  const stored = applyOps({ auditor: { provider: 'x', model: 'y' } }, mutateOps('auditor', { kind: 'default' }))
  assert.equal(normalizeSettings(stored).auditor.mode, 'default')
})

test('readSettings 直接读插件配置对象', () => {
  const store = readSettings({ executor: { provider: 'p', model: 'm' } })
  assert.deepEqual(store.executor, { mode: 'explicit', provider: 'p', model: 'm', reasoningEffort: '' })
  assert.equal(store.auditor.mode, 'default')
  assert.equal(store.mechanical.mode, 'default')
})

test('mechanical 角色与其他角色同样读写', () => {
  const ops = mutateOps('mechanical', { kind: 'route', provider: 'p', model: 'm' })
  assert.deepEqual(ops, [
    { op: 'set', path: ['mechanical', 'provider'], value: 'p' },
    { op: 'set', path: ['mechanical', 'model'], value: 'm' },
    { op: 'set', path: ['mechanical', 'reasoningEffort'], value: '' },
  ])
  const stored = applyOps({}, ops)
  assert.deepEqual(normalizeSettings(stored).mechanical, { mode: 'explicit', provider: 'p', model: 'm', reasoningEffort: '' })
})

test('未知角色被拒绝', () => {
  assert.throws(() => mutateOps('reviewer', { kind: 'default' }), /SETTINGS_UNKNOWN_ROLE/)
})
