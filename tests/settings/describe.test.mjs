import test from 'node:test'
import assert from 'node:assert/strict'
import { describeRoles } from '../../src/settings/describe.js'
import { EFFECT_SCOPE_NOTICE } from '../../src/settings/constants.js'

const catalog = {
  providers: [{ id: 'opencode-go', name: 'opencode-go' }],
  models: {
    'opencode-go': [
      { id: 'flash', name: 'DeepSeek V4.1 Flash' },
      { id: 'pro', name: 'DeepSeek V4.1 Pro' },
    ],
  },
  authorized: [{ provider: 'opencode-go', model: 'flash' }, { provider: 'opencode-go', model: 'pro' }],
  failures: [],
}
const parentRoute = { provider: 'opencode-go', model: 'flash' }
const store = {
  auditor: { mode: 'default' },
  executor: { mode: 'explicit', provider: 'opencode-go', model: 'pro' },
  mechanical: { mode: 'default' },
}

test('每个角色给出一行：当前值、候选、是否可用', () => {
  const rows = describeRoles({ store, catalog, parentRoute })
  assert.equal(rows.length, 3)
  assert.deepEqual(rows.map((row) => row.role), ['auditor', 'executor', 'mechanical'])
  const executor = rows.find((row) => row.role === 'executor')
  assert.equal(executor.mode, 'explicit')
  assert.match(executor.currentLabel, /DeepSeek V4.1 Pro/)
  assert.equal(executor.options.length, 3)
  assert.equal(executor.options.every((option) => option.available), true)
  const auditor = rows.find((row) => row.role === 'auditor')
  assert.equal(auditor.mode, 'default')
  assert.match(auditor.currentLabel, /默认/)
  const mechanical = rows.find((row) => row.role === 'mechanical')
  assert.equal(mechanical.mode, 'default')
  assert.equal(mechanical.title, '机械执行模型')
})

test('默认行携带默认标签与继承说明', () => {
  const rows = describeRoles({ store, catalog, parentRoute })
  const auditor = rows.find((row) => row.role === 'auditor')
  assert.equal(auditor.options[0].kind, 'default')
  assert.match(auditor.defaultLabel, /默认/)
})

test('已保存但目录里消失的路由标记为不可用，仍保留可移除', () => {
  const gone = {
    ...store,
    executor: { mode: 'explicit', provider: 'opencode-go', model: 'retired' },
  }
  const rows = describeRoles({ store: gone, catalog, parentRoute })
  const executor = rows.find((row) => row.role === 'executor')
  const retired = executor.options.find((option) => option.model === 'retired')
  assert.ok(retired, '消失的已存路由必须仍出现在候选里')
  assert.equal(retired.available, false)
  assert.match(executor.currentLabel, /不可用/)
})

test('生效范围声明是常量且被行数据引用', () => {
  const rows = describeRoles({ store, catalog, parentRoute })
  for (const row of rows) assert.equal(row.notice, EFFECT_SCOPE_NOTICE)
  assert.match(EFFECT_SCOPE_NOTICE, /新创建/)
})
