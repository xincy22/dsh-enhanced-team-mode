// P0 回归：用本机已安装的真实 @deepseek-ai/schemastery@3.19.0 构造投影，
// 不再让自带 nullable 的替身掩盖真实依赖缺失的方法。
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createProjectionDefinition } from '../../src/inject/projection.js'
import { emptyState } from '../../src/inject/policy.js'
import { createPolicyProjection } from '../../src/dispatch/policy.js'
import { createSettingsSchema, normalizeSettings } from '../../src/settings/schema.js'

function findSchemasteryDir() {
  const candidates = [
    join(homedir(), '.dsh', 'profiles', 'desktop', 'node_modules', '@deepseek-ai', 'schemastery'),
    '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/schemastery',
  ]
  return candidates.find((dir) => existsSync(join(dir, 'package.json'))) || null
}

const dir = findSchemasteryDir()
const pkg = dir ? JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) : null
const z = dir ? (await import(pathToFileURL(join(dir, 'lib', 'index.mjs')).href)).default : null

test('真实 schemastery 版本为 3.19.0，且没有 .nullable()', { skip: !dir }, () => {
  assert.equal(pkg.version, '3.19.0')
  assert.equal(typeof z.number().nullable, 'undefined')
  assert.equal(typeof z.union, 'function')
  assert.equal(typeof z.const, 'function')
})

test('真实 z 能构造注入投影，并校验 null 与数值两种 lastInjected 状态', { skip: !dir }, () => {
  const definition = createProjectionDefinition(z)
  const schema = definition.stateSchema
  const empty = emptyState()
  assert.deepEqual(schema(empty), empty)
  const injected = { turn: 2, taskEpoch: 1, lastInjectedTurn: 2, lastInjectedMessageId: 'inj-1' }
  assert.deepEqual(schema(injected), injected)
  // union 仍拒绝错误形状，说明它保留了校验语义而不是退化成 any。
  assert.throws(() => schema({ ...empty, lastInjectedTurn: 'oops' }), /expected/)
})

test('真实 z 能构造授权投影，并校验 null 与路由数组两种状态', { skip: !dir }, () => {
  const definition = createPolicyProjection(z)
  const schema = definition.stateSchema
  assert.equal(schema(null), null)
  const routes = [{ provider: 'opencode-go', model: 'flash' }]
  assert.deepEqual(schema(routes), routes)
  assert.throws(() => schema('not-an-array'), /expected/)
})

test('真实 z 的设置 Config 仍能校验空配置与显式路由', { skip: !dir }, () => {
  const Config = createSettingsSchema(z)
  assert.deepEqual(normalizeSettings(Config({})), normalizeSettings({}))
  const explicit = Config({ executor: { provider: 'opencode-go', model: 'flash' }, mechanical: { provider: 'opencode-go', model: 'flash' } })
  assert.equal(normalizeSettings(explicit).executor.mode, 'explicit')
  assert.equal(normalizeSettings(explicit).mechanical.mode, 'explicit')
  assert.throws(() => Config('x'), /expected object/)
})
