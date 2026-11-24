// P0/P1 回归：导入真实 index.js，使用真实 schemastery，
// 验证 apply() 的入口接线（工具、Skill）与设置命名空间。
// 运行方式：node --test 会经 test/fixtures/entry-loader.mjs 注入宿主替身；问题背景见 .reports/audit/t4-audit.md。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as entry from '../../index.js'
import { ROUTE_TOOL_NAME } from '../../src/dispatch/tool.js'
import { SKILL_NAME } from '../../src/skill/register.js'
import { ROLES } from '../../src/settings/constants.js'

const patch = readFileSync(new URL('../../cordis.patch.yml', import.meta.url), 'utf8')
const clientSource = readFileSync(new URL('../../lib/client.js', import.meta.url), 'utf8')
const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8')

test('入口常量与 patch 的 entry id 一致，并成为客户端设置命名空间', () => {
  const id = /id:\s*([^\s]+)/.exec(patch)?.[1]
  assert.equal(id, entry.ENTRY_ID)
  assert.equal(entry.ENTRY_ID, 'team-mode')
  assert.ok(clientSource.includes("const NS = 'team-mode'"))
  assert.ok(!clientSource.includes("const NS = 'dsh-enhanced-team-mode'"))
  assert.ok(readme.includes('team-mode'))
})

test('真实 index.js 的 Config 在真实 schemastery 下可构造', () => {
  assert.equal(typeof entry.Config, 'function')
  const config = entry.Config({})
  // 角色集合以 src/settings/constants.js 的 ROLES 为准，不硬编码角色数量。
  assert.deepEqual(Object.keys(config).sort(), [...ROLES, 'auditMode'].sort())
})

test('apply() 接线：注册投影、pre-step、工具与 Skill；工具受团队开关门控', async () => {
  const definitions = new Map()
  const listeners = []
  const tools = []
  const skills = []
  let enabled = true
  const ctx = {
    sessionProjections: {
      register: async (definition) => {
        definitions.set(definition.key, definition)
        return { stateOf: () => definition.init() }
      },
    },
    on: (name, listener) => listeners.push({ name, listener }),
    subagents: { rootOf: (agent) => agent },
    agentTeams: { isEnabled: () => enabled },
    llm: { listProviders: () => [], listModels: async () => [] },
    logger: { warn: () => {} },
    fiber: { assertActive: () => {} },
    inject: (names, run) => {
      if (names.includes('tools')) run({ tools: { register: (tool, options) => tools.push({ tool, options }) } })
      if (names.includes('skills')) run({ skills: { register: (skill) => { skills.push(skill); return () => {} } } })
    },
  }

  const activation = entry.apply(ctx, {})
  assert.equal(typeof activation.query, 'function')
  assert.ok(definitions.has('teamModeInjection'))
  assert.ok(definitions.has('teamModeModelPolicy'))
  assert.deepEqual(listeners.map((l) => l.name), ['agent/pre-step'])
  assert.equal(tools.length, 1)
  assert.equal(tools[0].tool.name, ROUTE_TOOL_NAME)
  assert.equal(tools[0].options.when({}), true)
  enabled = false
  assert.equal(tools[0].options.when({}), false)
  assert.equal(skills.length, 1)
  assert.equal(skills[0].name, SKILL_NAME)
  assert.equal(skills[0].provider, 'dsh-enhanced-team-mode')
})

// 防止测试误用替身：真实入口必须已经从磁盘加载了真实 schemastery。
test('入口使用真实 schemastery（无 .nullable()）而非替身', async () => {
  const schema = entry.Config
  assert.equal(typeof schema, 'function')
  assert.equal(typeof schema().nullable, 'undefined')
  const config = schema({ executor: { provider: 'p', model: 'm' } })
  // volatile 字段解析后是响应式 foam，取值要用 .get()（normalizeSettings 内部已统一解包）。
  const provider = typeof config.executor.provider?.get === 'function' ? config.executor.provider.get() : config.executor.provider
  assert.equal(provider, 'p')
})
