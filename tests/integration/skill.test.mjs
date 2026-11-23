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

test('没有 skills 服务时注册直接抛错，由入口兜住', () => {
  assert.throws(() => registerSkill({}), /Cannot read properties|undefined/)
})

test('清单声明客户端半与包内技能，便于打包', () => {
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.equal(pkg.exports['./client'], './lib/client.js')
  assert.ok(pkg.files.includes('skills'))
  assert.ok(pkg.files.includes('lib/client.js'))
})
