import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  AUDIT_CHECKS, AUDIT_DUTY, AUDIT_INTRO, CORE_DUTIES, COORDINATOR_INSTRUCTION, DUTY_STATIC, EXPLAINER_PROTOCOL,
  SCOPE_LINE, SEAT_DISPATCH_LINE, SKILL_POINTER, composeCoordinatorInstruction,
} from '../../src/inject/instruction.js'
import { SEAT_EN_NAMES, SEAT_INSTANCE_NAMES } from '../../src/settings/constants.js'
import { SKILL_NAME, loadSkill, registerSkill } from '../../src/skill/register.js'

const skill = loadSkill()
const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
const constantsSrc = readFileSync(new URL('../../src/settings/constants.js', import.meta.url), 'utf8')
const clientSrc = readFileSync(new URL('../../lib/client.js', import.meta.url), 'utf8')

test('插件自带技能文件可解析，包含三席开箱即用派发模板与 task_id / lead 寻址', () => {
  assert.equal(skill.name, SKILL_NAME)
  assert.equal(skill.name, 'team-mode-collaboration')
  assert.ok(skill.description.length > 0)
  assert.ok(skill.content.includes('### 1. 派发 Mentor'))
  assert.ok(skill.content.includes('### 2. 派发 Atlas'))
  assert.ok(skill.content.includes('### 3. 派发 Argus'))
  // P1-2: Atlas 模板必须含 task_id 与任务板认领完结
  assert.ok(skill.content.includes('task_id = <task-n>'), 'Atlas 派发模板必须包含 task_id')
  // P0-A: Argus 模板必须指明宿主根通信名 lead，严禁向 "leader" 发消息
  assert.ok(skill.content.includes('严禁向不存在的 "leader" 发消息'), 'Argus 模板必须禁止向 "leader" 寻址')
  assert.ok(skill.content.includes('通信名 lead'), 'Argus 模板必须指明宿主根通信名 lead')
})

test('核心原则与一次性注入逐字一致（漂移守卫）', () => {
  for (const duty of CORE_DUTIES) {
    assert.ok(COORDINATOR_INSTRUCTION.includes(duty), '注入缺核心原则：' + duty.slice(0, 16))
    assert.ok(skill.content.includes(duty), 'SKILL 缺核心原则：' + duty.slice(0, 16))
  }
  assert.ok(COORDINATOR_INSTRUCTION.includes(SCOPE_LINE))
  assert.ok(skill.content.includes(SCOPE_LINE))
  assert.ok(COORDINATOR_INSTRUCTION.includes(SKILL_POINTER))
  assert.ok(COORDINATOR_INSTRUCTION.includes(EXPLAINER_PROTOCOL))
  assert.ok(skill.content.includes(EXPLAINER_PROTOCOL))
})

test('通用审计检查三项在注入与 Skill 中逐字一致，且不含 DSH 特定硬编码', () => {
  assert.equal(AUDIT_CHECKS.length, 3)
  assert.ok(COORDINATOR_INSTRUCTION.includes(AUDIT_INTRO.both))
  for (const check of AUDIT_CHECKS) {
    assert.ok(COORDINATOR_INSTRUCTION.includes(check), '注入缺审计检查项：' + check.slice(0, 12))
    assert.ok(skill.content.includes(check), 'SKILL 缺审计检查项：' + check.slice(0, 12))
  }
  for (const forbidden of ['app.asar', 'dsh.client.external', 'platform-singleton']) {
    assert.equal(COORDINATOR_INSTRUCTION.includes(forbidden), false, '注入不应硬编码特定项目术语：' + forbidden)
    assert.equal(skill.content.includes(forbidden), false, 'SKILL 不应硬编码特定项目术语：' + forbidden)
  }
})

test('四组合矩阵：审计开关组合输出正确的职责变体与检查项，none 模式彻底裁剪 argus', () => {
  const cases = [
    { key: 'both', mode: { background: true, finalReview: true }, hasChecks: true, maxSeats: '上限 5 名' },
    { key: 'background', mode: { background: true, finalReview: false }, hasChecks: true, maxSeats: '上限 5 名' },
    { key: 'finalReview', mode: { background: false, finalReview: true }, hasChecks: true, maxSeats: '上限 5 名' },
    { key: 'none', mode: { background: false, finalReview: false }, hasChecks: false, maxSeats: '上限 4 名' },
  ]
  for (const item of cases) {
    const text = composeCoordinatorInstruction(item.mode)
    assert.ok(text.includes(AUDIT_DUTY[item.key]), '组合 ' + item.key + ' 缺职责变体')
    assert.ok(text.includes(item.maxSeats), '组合 ' + item.key + ' 席位上限不对')
    assert.ok(text.includes(EXPLAINER_PROTOCOL), '组合 ' + item.key + ' 缺侦察讲解协议')
    assert.ok(skill.content.includes(AUDIT_DUTY[item.key]), 'SKILL 缺职责变体：' + item.key)
    if (item.hasChecks) {
      assert.ok(text.includes(AUDIT_INTRO[item.key]), '组合 ' + item.key + ' 缺审计抬头')
      for (const check of AUDIT_CHECKS) assert.ok(text.includes(check), '组合 ' + item.key + ' 缺检查项')
    } else {
      assert.equal(text.includes(AUDIT_CHECKS[0]), false, '都关时不应注入审计检查项')
      assert.equal(text.includes('argus'), false, '都关时不应残留 argus 席位说明')
    }
  }
  assert.equal(COORDINATOR_INSTRUCTION, composeCoordinatorInstruction({ background: true, finalReview: true }))
})

test('P0/P1 审计守卫：硬定量防火墙、子成员投喂义务、双模证伪与反顺从逃生门', () => {
  assert.ok(DUTY_STATIC[0].includes('≤3 次') && DUTY_STATIC[0].includes('≤120 行'), '防火墙必须有硬定量预算')
  assert.ok(DUTY_STATIC[1].includes('单模块深水区'), '必须区分单模块深水区两步走')
  assert.ok(DUTY_STATIC[2].includes('子成员看不到本指令'), '必须明确子成员看不到根指令、须显式投喂 prompt')
  assert.ok(DUTY_STATIC[2].includes('新建默认用 subagent'), '必须明确默认使用 subagent 而非 subagent_fork')
  for (const token of ['项目地图', '假设证伪', '直接推翻重立', '隐性约束', '关键契约', '待拍板取舍']) {
    assert.ok(EXPLAINER_PROTOCOL.includes(token), 'EXPLAINER_PROTOCOL 缺要素：' + token)
  }
})

test('席位命名与 constants.js 一致，且禁止 leader/lead 作子成员 name', () => {
  assert.ok(SEAT_DISPATCH_LINE.includes(SEAT_EN_NAMES.executor))
  assert.ok(SEAT_DISPATCH_LINE.includes(SEAT_EN_NAMES.mechanical))
  assert.ok(SEAT_DISPATCH_LINE.includes(SEAT_EN_NAMES.auditor))
  for (const name of [...SEAT_INSTANCE_NAMES.executor, ...SEAT_INSTANCE_NAMES.mechanical, ...SEAT_INSTANCE_NAMES.auditor]) {
    assert.ok(COORDINATOR_INSTRUCTION.includes(name), '注入缺实例名：' + name)
  }
  assert.ok(COORDINATOR_INSTRUCTION.includes('子成员 name 禁为 leader/lead'))
  const hintBlock = clientSrc.slice(clientSrc.indexOf('const ROLES = ['), clientSrc.indexOf('// 两个审计开关'))
  assert.ok(hintBlock.includes(SEAT_EN_NAMES.executor))
  assert.ok(hintBlock.includes(SEAT_EN_NAMES.mechanical))
  assert.ok(hintBlock.includes(SEAT_EN_NAMES.auditor))
  assert.ok(constantsSrc.includes('侦察与讲解模型'))
})

// —— 技能注册 source 回归（三层）+ 打包清单守卫（P1-1 恢复）————————
const HOST_SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function hostValidateInvocation(invocation, subject) {
  if (invocation === undefined) return
  if (typeof invocation !== 'object' || invocation === null || Array.isArray(invocation)) {
    throw new TypeError(subject + ' with a non-object invocation policy')
  }
  if (typeof invocation.modelInvocable !== 'boolean') {
    throw new TypeError(subject + ' with a non-boolean invocation.modelInvocable')
  }
  if (typeof invocation.userInvocable !== 'boolean') {
    throw new TypeError(subject + ' with a non-boolean invocation.userInvocable')
  }
}

function validateDefinition(def) {
  const { name, description, whenToUse, invocation, source, provider, content, path: skillPath } = def
  if (typeof name !== 'string') throw new TypeError('loaded skill name must be a string')
  if (!HOST_SKILL_NAME.test(name)) throw new Error('loaded skill has invalid name "' + name + '"')
  if (typeof description !== 'string') throw new TypeError('loaded skill "' + name + '" description must be a string')
  if (description.length === 0) throw new Error('loaded skill "' + name + '" requires a description')
  hostValidateInvocation(invocation, 'loaded skill "' + name + '"')
  if (whenToUse !== undefined && typeof whenToUse !== 'string') throw new TypeError('loaded skill "' + name + '" whenToUse must be a string')
  if (typeof source !== 'string') throw new TypeError('loaded skill "' + name + '" source must be a string')
  if (typeof provider !== 'string') throw new TypeError('loaded skill "' + name + '" provider must be a string')
  if (typeof content !== 'string') throw new TypeError('loaded skill "' + name + '" content must be a string')
  if (skillPath !== undefined && typeof skillPath !== 'string') throw new TypeError('loaded skill "' + name + '" path must be a string')
}

const LEGAL_SOURCES = ['project-dsh', 'project-agents', 'runtime', 'user-dsh', 'user-agents', 'custom', 'bundled']

function captureRegistration() {
  const captured = []
  const dispose = registerSkill({ skills: { register: (def) => { captured.push(def); return () => {} } } })
  return { registration: captured[0], dispose }
}

test('① 注册对象带 source 字符串且语义为 runtime', () => {
  const { registration, dispose } = captureRegistration()
  assert.equal(typeof dispose, 'function')
  assert.equal(registration.name, SKILL_NAME)
  assert.equal(registration.provider, 'dsh-enhanced-team-mode')
  assert.equal(typeof registration.source, 'string')
  assert.equal(registration.source, 'runtime')
})

test('② source 取值在宿主 SkillSource 合法集合内', () => {
  const { registration } = captureRegistration()
  assert.ok(LEGAL_SOURCES.includes(registration.source), 'source 不在宿主合法取值内：' + String(registration.source))
})

test('③ 注册对象通过宿主 validateDefinition 真校验（含缺 source 反向守卫）', () => {
  const { registration } = captureRegistration()
  const definition = { invocation: { modelInvocable: true, userInvocable: false }, ...registration }
  assert.doesNotThrow(() => validateDefinition(definition), '注册对象过不了宿主加载校验')
  const { source, ...withoutSource } = definition
  assert.throws(() => validateDefinition(withoutSource), /source must be a string/)
})

test('没有 skills 服务时注册直接抛错，由入口兜住', () => {
  assert.throws(() => registerSkill({}), /Cannot read properties|undefined/)
})

test('package.json 清单声明客户端半、包内技能、图标与本地化', () => {
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.equal(pkg.exports['./client'], './lib/client.js')
  assert.equal(pkg.exports['./icon'], './icon.svg')
  assert.ok(pkg.files.includes('skills'))
  assert.ok(pkg.files.includes('lib/client.js'))
  assert.ok(pkg.files.includes('icon.svg'))
  assert.ok(pkg.files.includes('locale'))
})
