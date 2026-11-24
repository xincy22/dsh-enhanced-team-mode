import test from 'node:test'
import assert from 'node:assert/strict'
import * as settings from '../../src/settings/index.js'
import { normalizeAuthorized, toAgentOptions } from '../../src/settings/resolve.js'
import { SettingsError } from '../../src/settings/errors.js'

test('对外接口齐全，集成方只依赖这一个入口', () => {
  for (const name of [
    'SettingsError', 'ROLES', 'ROLE_LABELS', 'ROLE_HINTS', 'DEFAULT_LABEL', 'EFFECT_SCOPE_NOTICE',
    'createSettingsSchema', 'emptySettings', 'normalizeSettings',
    'createCatalog', 'createHostCatalog',
    'normalizeAuthorized', 'resolveAlias', 'resolveRole', 'toAgentOptions',
    'mutateOps', 'mutateAuditMode', 'readSettings', 'describeRole', 'describeRoles', 'describeAuditMode',
    'AUDIT_MODES', 'AUDIT_MODE_LABELS', 'AUDIT_MODE_HINTS', 'AUDIT_STATUS', 'AUDITOR_DISABLED_HINT', 'auditModeKey',
  ]) {
    assert.ok(name in settings, '缺少导出 ' + name)
  }
  assert.deepEqual([...settings.ROLES], ['auditor', 'executor', 'mechanical'])
})

test('授权归一：undefined 与 null 都表示没有授权列表', () => {
  assert.equal(normalizeAuthorized(undefined), null)
  assert.equal(normalizeAuthorized(null), null)
  assert.deepEqual(normalizeAuthorized([{ provider: 'p', model: 'm' }]), [{ provider: 'p', model: 'm' }])
})

test('授权归一：非法形状直接报错，不当成没有授权', () => {
  assert.throws(() => normalizeAuthorized('nope'), (error) => {
    assert.ok(error instanceof SettingsError)
    assert.equal(error.code, 'SETTINGS_INVALID_AUTHORIZATION')
    return true
  })
  assert.throws(() => normalizeAuthorized([{ provider: 'p' }]), /SETTINGS_INVALID_AUTHORIZATION/)
})

test('派发适配：default 不产生 agentOptions', () => {
  assert.equal(toAgentOptions({ kind: 'default' }), undefined)
})

test('派发适配：显式路由原样转成 agentOptions', () => {
  assert.deepEqual(toAgentOptions({ kind: 'route', provider: 'p', model: 'm' }), { provider: 'p', model: 'm' })
})

test('派发适配：未知决定报错，不回退默认', () => {
  assert.throws(() => toAgentOptions({ kind: 'alias' }), /SETTINGS_INVALID_SELECTION/)
  assert.throws(() => toAgentOptions(undefined), /SETTINGS_INVALID_SELECTION/)
})
