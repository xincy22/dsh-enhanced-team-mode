/**
 * register.js — 把插件自带的 Skill 注册进宿主的技能注册表。
 *
 * 注册方式：ctx.skills.register()（运行时技能贡献）。宿主不会自动扫描插件包里的
 * skills/ 目录——bundledSkillDir 是宿主侧的单根配置，改它属于全局设置，本插件不碰。
 *
 * 限制：注册发生在插件加载时，之后一直可见，不随「启用智能体团队协作」开关显隐。
 * 技能正文自己声明适用条件，指令里也写明按需加载；不对动态显隐做任何承诺。
 */

import { readFileSync } from 'node:fs'

/** 技能名（kebab-case，作为加载标识）。 */
export const SKILL_NAME = 'team-mode-collaboration'

/** 技能文件相对插件根的位置。 */
export const SKILL_PATH = 'skills/team-mode-collaboration/SKILL.md'

/**
 * 解析 SKILL.md：YAML 前置区只取 name / description / whenToUse，其余留在正文之外。
 * @param {string} text - 文件内容。
 * @returns {{name: string, description: string, whenToUse?: string, content: string}} 解析结果。
 * @throws {Error} 缺少前置区或必填字段。
 */
export function parseSkillFile(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text)
  if (match === null) throw new Error('SKILL.md 缺少前置区')
  const meta = {}
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(':')
    if (separator <= 0) continue
    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    meta[key] = value
  }
  if (typeof meta.name !== 'string' || meta.name.length === 0) throw new Error('SKILL.md 缺少 name')
  if (typeof meta.description !== 'string' || meta.description.length === 0) throw new Error('SKILL.md 缺少 description')
  const result = { name: meta.name, description: meta.description, content: match[2] }
  if (typeof meta.whenToUse === 'string' && meta.whenToUse.length > 0) result.whenToUse = meta.whenToUse
  return result
}

/**
 * 读取插件自带的技能文件。
 * @param {URL|string} [fileUrl] - 技能文件位置，默认取包内路径。
 * @param {(path: string|URL) => string} [readFile] - 读取实现，测试可注入。
 * @returns {{name: string, description: string, content: string, whenToUse?: string}} 解析结果。
 */
export function loadSkill(fileUrl, readFile = readFileSync) {
  const target = fileUrl ?? new URL('../../' + SKILL_PATH, import.meta.url)
  return parseSkillFile(readFile(target, 'utf8'))
}

/**
 * 注册技能。调用方需保证 ctx 上存在 skills 服务。
 * @param {object} ctx - 带 skills 服务的上下文。
 * @param {object} [options] - 选项。
 * @param {URL|string} [options.fileUrl] - 技能文件位置。
 * @param {(path: string|URL) => string} [options.readFile] - 读取实现。
 * @returns {() => void} 宿主给的注销函数。
 */
export function registerSkill(ctx, options = {}) {
  const skill = loadSkill(options.fileUrl, options.readFile)
  const registration = {
    name: skill.name,
    description: skill.description,
    content: skill.content,
    provider: 'dsh-enhanced-team-mode',
    // source 是宿主 SkillDefinition 的必填字段：register() 只为 invocation 与 provider 补默认值，
    // 不补 source；缺了它技能目录照常显示（list 不校验），但 get() 走 validateDefinition 时会报
    // 'loaded skill "…" source must be a string'。经 ctx.skills.register 注册即 runtime 来源，
    // 与宿主 RUNTIME_PROVIDER 常量同值（@deepseek-ai/dsh-skill/src/index.ts:24, :40）。
    source: 'runtime',
  }
  if (skill.whenToUse !== undefined) registration.whenToUse = skill.whenToUse
  return ctx.skills.register(registration)
}
