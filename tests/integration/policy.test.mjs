import test from 'node:test'
import assert from 'node:assert/strict'
import { createPolicyProjection, readAuthorized, POLICY_KEY } from '../../src/dispatch/policy.js'
import { z } from './harness.mjs'

test('折叠第一条授权事件，之后忽略', () => {
  const definition = createPolicyProjection(z)
  assert.equal(definition.key, POLICY_KEY)
  let state = definition.init()
  assert.equal(state, null)
  state = definition.apply(state, {
    type: 'subagent/model-selection-policy',
    data: { allowedModels: [{ provider: 'p', model: 'm' }] },
  })
  assert.deepEqual(state, [{ provider: 'p', model: 'm' }])
  state = definition.apply(state, {
    type: 'subagent/model-selection-policy',
    data: { allowedModels: [{ provider: 'q', model: 'n' }] },
  })
  assert.deepEqual(state, [{ provider: 'p', model: 'm' }], '后到的授权事件不改写已折叠的状态')
})

test('没有授权事件时读出 null', () => {
  const definition = createPolicyProjection(z)
  const handle = { stateOf: () => definition.init() }
  assert.equal(readAuthorized(handle, {}), null)
})

test('空授权列表视为没有授权，不作为空数组传播', () => {
  const definition = createPolicyProjection(z)
  const state = definition.apply(null, { type: 'subagent/model-selection-policy', data: { allowedModels: [] } })
  assert.equal(state, null)
})

test('无关事件不改状态', () => {
  const definition = createPolicyProjection(z)
  assert.equal(definition.apply(null, { type: 'turn/start', data: { turn: 1 } }), null)
})
