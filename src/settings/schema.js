/**
 * schema.js — 插件设置的表单 schema、归一化与空值语义。
 *
 * 存储形态是每个角色两个字符串（provider 与 model），空串表示该角色跟随默认：
 *  - 两个字段都空       → default
 *  - 只有 provider      → 不完整，直接报错，不猜模型
 *  - 只有 model         → 显式别名候选，交给解析阶段用授权目录唯一命中
 *
 * 三个角色：auditor（审计）、executor（能力型执行）、mechanical（机械执行）。
 * mechanical 是后加的：normalize 按 ROLES 驱动，旧配置缺该字段时自动归为 default，零迁移。
 */

import { SettingsError } from './errors.js'
import { ROLES } from './constants.js'

/**
 * 构造 schemastery 设置 schema。只用到 object 与 string，便于替身测试。
 * @param {{ object: Function, string: Function }} z - schemastery 兼容实现。
 * @returns {object} 可挂到插件 Config 的 schema。
 */
export function createSettingsSchema(z) {
  const role = () => z.object({ provider: z.string().default(''), model: z.string().default('') })
  return z.object({
    auditor: role(),
    executor: role(),
    mechanical: role(),
  })
}

/**
 * 空设置：三个角色都跟随默认。
 * @returns {object} 归一化后的设置。
 */
export function emptySettings() {
  return {
    auditor: { mode: 'default' },
    executor: { mode: 'default' },
    mechanical: { mode: 'default' },
  }
}

/**
 * 把插件配置归一化成解析阶段使用的形态。
 * @param {unknown} raw - 插件 Config 对象（可为空）。
 * @returns {{auditor: object, executor: object, mechanical: object}} 归一化结果。
 * @throws {SettingsError} 形状非法（SETTINGS_INVALID_ROLE）或只给了 provider（SETTINGS_INCOMPLETE_ROUTE）。
 */
export function normalizeSettings(raw) {
  const out = emptySettings()
  if (raw === undefined || raw === null) return out
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SettingsError('SETTINGS_INVALID_ROLE', '设置根必须是对象')
  }
  for (const role of ROLES) {
    const value = raw[role]
    if (value === undefined || value === null) continue
    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new SettingsError('SETTINGS_INVALID_ROLE', '设置项 ' + role + ' 必须是对象')
    }
    const provider = value.provider ?? ''
    const model = value.model ?? ''
    if (typeof provider !== 'string' || typeof model !== 'string') {
      throw new SettingsError('SETTINGS_INVALID_ROLE', '设置项 ' + role + ' 的 provider 与 model 必须是字符串')
    }
    const p = provider.trim()
    const m = model.trim()
    if (p.length === 0 && m.length === 0) continue
    if (p.length === 0) {
      out[role] = { mode: 'alias', alias: m }
      continue
    }
    if (m.length === 0) {
      throw new SettingsError('SETTINGS_INCOMPLETE_ROUTE', '设置项 ' + role + ' 只给了 provider，缺少 model')
    }
    out[role] = { mode: 'explicit', provider: p, model: m }
  }
  return out
}
