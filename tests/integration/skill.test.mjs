import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { loadSkill, parseSkillFile, registerSkill, SKILL_NAME } from '../../src/skill/register.js'
import { AUDIT_CHECKS, AUDIT_CHECKS_INTRO, CORE_DUTIES, COORDINATOR_INSTRUCTION, SCOPE_LINE, SKILL_POINTER } from '../../src/inject/instruction.js'


const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
const readmeSrc = readFileSync(new URL('../../README.md', import.meta.url), 'utf8')
const planSrc = readFileSync(new URL('../../PLAN.md', import.meta.url), 'utf8')
const clientSrc = readFileSync(new URL('../../lib/client.js', import.meta.url), 'utf8')
const instructionSrc = readFileSync(new URL('../../src/inject/instruction.js', import.meta.url), 'utf8')
const skill = loadSkill()

test('前置区解析：必填字段与引号去除', () => {
  const parsed = parseSkillFile('---\nname: demo\ndescription: "适用：演示"\n---\n\n正文')
  assert.equal(parsed.name, 'demo')
  assert.equal(parsed.description, '适用：演示')
  assert.equal(parsed.content.trim(), '正文')
})

test('前置区缺失时直接报错', () => {
  assert.throws(() => parseSkillFile('没有前置区'), /缺少前置区/)
  assert.throws(() => parseSkillFile('---\ndescription: x\n---\n正文'), /缺少 name/)
  assert.throws(() => parseSkillFile('---\nname: x\n---\n正文'), /缺少 description/)
})

test('插件自带技能文件可解析，名字与常量一致', () => {
  assert.equal(skill.name, SKILL_NAME)
  assert.ok(skill.description.startsWith('适用于'))
  assert.ok(skill.content.includes('## 审计常驻循环'))
})

test('漂移守卫：六条核心职责在技能里逐字一致', () => {
  for (const duty of CORE_DUTIES) {
    assert.ok(skill.content.includes(duty), '技能缺少与注入一致的职责：' + duty.slice(0, 12))
  }
  for (const duty of CORE_DUTIES) {
    assert.ok(COORDINATOR_INSTRUCTION.includes(duty))
  }
  assert.ok(skill.content.includes(SCOPE_LINE))
  assert.ok(COORDINATOR_INSTRUCTION.includes(SCOPE_LINE))
})

test('注入里有一句按需加载的技能指针', () => {
  assert.ok(COORDINATOR_INSTRUCTION.includes(SKILL_POINTER))
  assert.ok(SKILL_POINTER.includes(SKILL_NAME))
  assert.ok(SKILL_POINTER.includes('不要逐轮重复加载'))
})

test('手册写明按需使用、模式关闭时的限制，不承诺自动失效', () => {
  assert.ok(skill.content.includes('不要重复加载'))
  assert.ok(skill.content.includes('模式关闭时不要按本手册行事'))
  assert.ok(skill.content.includes('不保证历史里的旧指令自动失效'))
})

test('手册写明开工研判契约、落盘路径与两阶段', () => {
  for (const field of ['问题陈述', '范围与非目标', '验收标准', '风险', '未知项', '证据位置']) {
    assert.ok(skill.content.includes(field), '契约缺字段：' + field)
  }
  assert.ok(skill.content.includes('## 开工研判（阶段 0）'))
  assert.ok(skill.content.includes('.reports/recon/'))
  assert.ok(skill.content.includes('变更记录'))
  assert.ok(skill.content.includes('阶段 N'))
  assert.ok(skill.content.includes('任务 id 与 revision'))
})

test('职责写明接单确认与阻塞预算，禁令限于实施', () => {
  const duty5 = CORE_DUTIES[4]
  assert.ok(duty5.includes('阶段 0'))
  assert.ok(duty5.includes('阶段 N'))
  assert.ok(duty5.includes('不得成为实施者'))
  assert.ok(duty5.includes('不代修'))
  assert.ok(duty5.includes('「接受」或「质疑」'))
  assert.equal(duty5.includes('开工即与执行成员并行启动'), false)
  const duty3 = CORE_DUTIES[2]
  assert.ok(duty3.includes('.reports/recon/'))
  assert.ok(duty3.includes('机械任务'))
  assert.ok(duty3.includes('一个回合'))
})

test('手册不引入定时器或轮询机制', () => {
  assert.equal(skill.content.includes('setInterval'), false)
  assert.equal(skill.content.includes('setTimeout'), false)
  assert.ok(skill.content.includes('没有工具层硬拦截'))
})

test('三项审计固定检查：注入与 Skill 逐字一致，顺序不变', () => {
  assert.equal(AUDIT_CHECKS.length, 3)
  assert.ok(COORDINATOR_INSTRUCTION.includes(AUDIT_CHECKS_INTRO))
  assert.ok(skill.content.includes(AUDIT_CHECKS_INTRO))
  for (const check of AUDIT_CHECKS) {
    assert.ok(COORDINATOR_INSTRUCTION.includes(check), '注入缺检查项：' + check.slice(0, 12))
    assert.ok(skill.content.includes(check), 'Skill 缺检查项：' + check.slice(0, 12))
  }
  const order = AUDIT_CHECKS.map((check) => skill.content.indexOf(check))
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'Skill 里的三项检查顺序与注入不一致')
})

test('阶段 0 与阶段 N 的清单都列出三项检查', () => {
  const phase0 = '固定检查（阶段 0）：A 宿主能力对照、B 重复实现、C 导入边界'
  const phaseN = '固定检查（阶段 N）：A 宿主能力对照、B 重复实现、C 导入边界'
  assert.ok(skill.content.includes(phase0), '缺少阶段 0 清单')
  assert.ok(skill.content.includes(phaseN), '缺少阶段 N 清单')
  assert.ok(skill.content.includes('缺证据的判定无效'))
})

test('宿主能力对照要求 asar 证据，三个分支缺证据或缺理由都无效', () => {
  const hostFirst = AUDIT_CHECKS[0]
  assert.ok(hostFirst.includes('宿主能力对照'))
  assert.ok(hostFirst.includes('app.asar'))
  assert.ok(hostFirst.includes('文件:行号'))
  assert.ok(hostFirst.includes('判定理由'))
  for (const branch of ['可直接复用', '无法复用', '复刻，原因']) {
    assert.ok(hostFirst.includes(branch), '缺少分支：' + branch)
  }
  assert.ok(hostFirst.includes('三个分支缺证据或缺理由即判定无效'))
  assert.ok(hostFirst.includes('不默认成立'))
  for (const element of ['接入方式四要素', '宿主能力名称', '引用入口', '包名', 'id/client', 'dsh.client.external', 'platform-singleton', 'module-table', '版本或来源约束']) {
    assert.ok(hostFirst.includes(element), '可直接复用缺接入要素：' + element)
  }
  assert.ok(hostFirst.includes('可直接复用缺任一要素同样无效'))
  assert.equal(hostFirst.includes('缺证据的「无法复用」判定无效'), false, '旧措辞只覆盖一个分支，不应保留')
  assert.ok(skill.content.includes('三个分支都要有宿主证据与判定理由'))
  assert.ok(skill.content.includes('不允许用一句「宿主没有」了事'))
  assert.ok(AUDIT_CHECKS[1].includes('重复实现检查'))
  assert.ok(AUDIT_CHECKS[2].includes('导入边界检查'))
  assert.ok(AUDIT_CHECKS[2].includes('inject'))
})

test('产品文案不再出现旧术语 PLATFORM_MODULES', () => {
  const legacy = 'PLATFORM_MODULES'
  const product = { 'README.md': readmeSrc, 'PLAN.md': planSrc, 'lib/client.js': clientSrc, 'instruction.js': instructionSrc, 'SKILL.md': skill.content }
  for (const [name, text] of Object.entries(product)) {
    assert.equal(text.includes(legacy), false, name + ' 仍含旧术语 ' + legacy)
  }
  // 反向断言不能空跑：新术语必须在文案里真实存在
  assert.ok(instructionSrc.includes('platform-singleton'))
  assert.ok(instructionSrc.includes('module-table'))
  assert.ok(skill.content.includes('platform-singleton'))
  assert.ok(clientSrc.includes('platform-singleton'))
})

test('阶段 0 与阶段 N 对可直接复用同严格度', () => {
  const phase0 = '固定检查（阶段 0）：A 宿主能力对照、B 重复实现、C 导入边界，逐项给出结论与证据，判定标准与阶段 N 相同'
  const phaseN = '固定检查（阶段 N）：A 宿主能力对照、B 重复实现、C 导入边界。三个分支都要有宿主证据与判定理由'
  assert.ok(skill.content.includes(phase0), '阶段 0 清单未对齐判定标准')
  assert.ok(skill.content.includes(phaseN), '阶段 N 清单未写明三个分支的证据与理由要求')
  assert.ok(skill.content.includes('可直接复用另须给出接入方式四要素（能力名称、引用入口、额外声明、版本或来源约束）'))
  assert.ok(skill.content.includes('可直接复用另核接入方式四要素（能力名称、引用入口、额外声明、版本或来源约束）'))
  assert.ok(skill.content.includes('可直接复用缺接入方式四要素同样无效'))
})

test('证据行号优先引宿主源码，构建产物仅作退路', () => {
  const hostFirst = AUDIT_CHECKS[0]
  assert.ok(hostFirst.includes('src/*.ts(x)'), '缺少源码行号优先级')
  assert.ok(hostFirst.includes('优先引宿主 app.asar 内 src/*.ts(x) 源码'))
  assert.ok(hostFirst.includes('只有该项目无源码可引时才引构建产物'))
  assert.ok(hostFirst.includes('压缩'))
  assert.ok(hostFirst.includes('定位意义'))
  assert.ok(skill.content.includes('行号来源'))
  assert.ok(skill.content.includes('优先引 app.asar 内 src/*.ts(x) 源码'))
})

test('注册调用把技能交给宿主的 skills 服务', () => {
  const captured = []
  const ctx = { skills: { register: (skill) => { captured.push(skill); return () => {} } } }
  const dispose = registerSkill(ctx)
  assert.equal(captured.length, 1)
  assert.equal(captured[0].name, SKILL_NAME)
  assert.equal(captured[0].provider, 'dsh-enhanced-team-mode')
  assert.ok(captured[0].content.includes('## 团队结构'))
  assert.equal(typeof dispose, 'function')
})

// —— 技能注册 source 回归（三层）————————————————————————————————————
// 背景：宿主 register() 只补 invocation 与 provider 的默认值，不补 source；
// 而 skills.get() 会走 validateDefinition，对 source 做 typeof === 'string' 校验。
// 插件漏传 source 时，技能目录照常显示（list 路径不校验），一加载就报
// 'loaded skill "team-mode-collaboration" source must be a string'。
// 三层分别守：字段存在且类型正确、取值在宿主 SkillSource 字面量集合内、真能过宿主校验。

// 宿主加载校验的逐字摘录，来源：app.asar 内
// dsh/node_modules/@deepseek-ai/dsh-skill/lib/index.js
//   SKILL_NAME 行 17 附近 / validateDefinition 行 471 附近 / validateInvocation 行 504 附近
// 只摘这三个符号：它们不依赖宿主服务（只用正则、typeof 与 TypeError），
// 这样第三层测的是宿主真校验，而不是凭记忆复刻。宿主升级改了校验，重新摘录即可。
const HOST_SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function hostValidateInvocation(invocation, subject) {
  if (invocation === undefined) return
  if (typeof invocation !== 'object' || invocation === null || Array.isArray(invocation)) throw new TypeError(subject + ' with a non-object invocation policy')
  const policy = invocation
  if (typeof policy.modelInvocable !== 'boolean') throw new TypeError(subject + ' with a non-boolean invocation.modelInvocable')
  if (typeof policy.userInvocable !== 'boolean') throw new TypeError(subject + ' with a non-boolean invocation.userInvocable')
}

function validateDefinition(skill) {
  const name = skill.name
  const description = skill.description
  const whenToUse = skill.whenToUse
  const invocation = skill.invocation
  const source = skill.source
  const provider = skill.provider
  const content = skill.content
  const path = skill.path
  if (typeof name !== 'string') throw new TypeError('loaded skill name must be a string')
  if (!HOST_SKILL_NAME.test(name)) throw new Error('loaded skill has invalid name "' + name + '"')
  if (typeof description !== 'string') throw new TypeError('loaded skill "' + name + '" description must be a string')
  if (description.length === 0) throw new Error('loaded skill "' + name + '" requires a description')
  hostValidateInvocation(invocation, 'loaded skill "' + name + '"')
  if (whenToUse !== undefined && typeof whenToUse !== 'string') throw new TypeError('loaded skill "' + name + '" whenToUse must be a string')
  if (typeof source !== 'string') throw new TypeError('loaded skill "' + name + '" source must be a string')
  if (typeof provider !== 'string') throw new TypeError('loaded skill "' + name + '" provider must be a string')
  if (typeof content !== 'string') throw new TypeError('loaded skill "' + name + '" content must be a string')
  if (path !== undefined && typeof path !== 'string') throw new TypeError('loaded skill "' + name + '" path must be a string')
}

/** 宿主 SkillSource 的合法字面量（@deepseek-ai/dsh-skill/src/index.ts:40）。 */
const LEGAL_SOURCES = ['project-dsh', 'project-agents', 'runtime', 'user-dsh', 'user-agents', 'custom', 'bundled']

/** 捕获一次 registerSkill 交给宿主的注册对象。 */
function captureRegistration() {
  const captured = []
  const ctx = { skills: { register: (skill) => { captured.push(skill); return () => {} } } }
  registerSkill(ctx)
  return captured[0]
}

test('① 注册对象带 source，且是字符串', () => {
  const registration = captureRegistration()
  assert.equal(typeof registration.source, 'string', '注册对象必须带 source 字符串')
  assert.equal(registration.source, 'runtime', '经由 ctx.skills.register 注册，语义上就是 runtime 来源')
})

test('② source 取值在宿主 SkillSource 字面量集合内', () => {
  const registration = captureRegistration()
  assert.ok(LEGAL_SOURCES.includes(registration.source), 'source 不在宿主合法取值内：' + String(registration.source))
})

test('③ 注册对象能过宿主 validateDefinition（加载路径真校验）', () => {
  const registration = captureRegistration()
  // 宿主 register() 会补 invocation 与 provider 的默认值，这里同源补齐后再校验。
  const definition = {
    invocation: { modelInvocable: true, userInvocable: false },
    ...registration,
  }
  assert.doesNotThrow(() => validateDefinition(definition), '注册对象过不了宿主加载校验')
  // 反向守卫：缺 source 时必须报错，证明这条测试真的在测该校验而不是空跑。
  const { source, ...withoutSource } = definition
  assert.throws(() => validateDefinition(withoutSource), /source must be a string/)
})

test('没有 skills 服务时注册直接抛错，由入口兜住', () => {
  assert.throws(() => registerSkill({}), /Cannot read properties|undefined/)
})

test('清单声明客户端半与包内技能，便于打包', () => {
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.equal(pkg.exports['./client'], './lib/client.js')
  assert.ok(pkg.files.includes('skills'))
  assert.ok(pkg.files.includes('lib/client.js'))
})
