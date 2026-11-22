import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { loadSkill, parseSkillFile, registerSkill, SKILL_NAME } from '../../src/skill/register.js'
import { CORE_DUTIES, COORDINATOR_INSTRUCTION, SCOPE_LINE, SKILL_POINTER } from '../../src/inject/instruction.js'

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
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

test('手册不引入定时器或轮询机制', () => {
  assert.equal(skill.content.includes('setInterval'), false)
  assert.equal(skill.content.includes('setTimeout'), false)
  assert.ok(skill.content.includes('没有工具层硬拦截'))
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
