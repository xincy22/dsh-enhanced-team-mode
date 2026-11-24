/**
 * schema.js — 插件设置的表单 schema、归一化与空值语义。
 *
 * 存储形态是每个角色三个字符串（provider、model、reasoningEffort），空串表示该角色跟随默认或跟随模型默认：
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
  /**
   * 一个字符串叶子字段。
   *
   * `.volatile()` 是宿主 settings 文档的写入标记：只有带该标记的字段才会让这个 entry
   * 获得 settings 命名空间（`configForms.get(entryId)` 才有内容）。缺了它，宿主
   * `settings/describe` 不会列出该命名空间，客户端拿到的表单是空壳，
   * `mutate` 一定被拒（真机实测：返回 false，不写盘）。
   * 替身 z 可能没有该链式方法，因此按存在性调用。
   */
  const field = () => {
    const leaf = z.string().default('')
    return typeof leaf.volatile === 'function' ? leaf.volatile() : leaf
  }
  /** 布尔叶子：两个审计开关，默认都开。与字符串叶子同样按存在性声明 volatile。 */
  const flag = () => {
    const leaf = z.boolean().default(true)
    return typeof leaf.volatile === 'function' ? leaf.volatile() : leaf
  }
  const role = () => z.object({ provider: field(), model: field(), reasoningEffort: field() })
  return z.object({
    auditor: role(),
    executor: role(),
    mechanical: role(),
    auditMode: z.object({ background: flag(), finalReview: flag() }),
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
    auditMode: { background: true, finalReview: true },
  }
}

/**
 * 读取一个可能被 volatile 包装的标量。
 *
 * schemastery 的 volatile 字段在解析后会被包成响应式 foam（带 get/set），
 * 不是普通字符串。归一化时必须先取值，否则会把 foam 当成非法类型。
 * @param {unknown} value - 原始字段值。
 * @returns {unknown} 解包后的值。
 */
export function readScalar(value) {
  if (value !== null && typeof value === 'object' && typeof value.get === 'function') {
    try {
      return value.get()
    } catch {
      return value
    }
  }
  return value
}

/**
 * 把插件配置归一化成解析阶段使用的形态。
 * @param {unknown} raw - 插件 Config 对象（可为空）。
 * @returns {{auditor: object, executor: object, mechanical: object}} 归一化结果。
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
    const provider = readScalar(value.provider) ?? ''
    const model = readScalar(value.model) ?? ''
    const effortRaw = readScalar(value.reasoningEffort) ?? ''
    if (typeof provider !== 'string' || typeof model !== 'string' || typeof effortRaw !== 'string') {
      throw new SettingsError('SETTINGS_INVALID_ROLE', '设置项 ' + role + ' 的 provider、model 与 reasoningEffort 必须是字符串')
    }
    const p = provider.trim()
    const m = model.trim()
    // 推理等级是模型级可选属性：没有路由时它没有意义，忽略。
    const effort = effortRaw.trim()
    if (p.length === 0 && m.length === 0) continue
    if (p.length === 0) {
      out[role] = { mode: 'alias', alias: m, reasoningEffort: effort }
      continue
    }
    if (m.length === 0) {
      throw new SettingsError('SETTINGS_INCOMPLETE_ROUTE', '设置项 ' + role + ' 只给了 provider，缺少 model')
    }
    out[role] = { mode: 'explicit', provider: p, model: m, reasoningEffort: effort }
  }
  const mode = raw.auditMode
  if (mode !== undefined && mode !== null) {
    if (typeof mode !== 'object' || Array.isArray(mode)) {
      throw new SettingsError('SETTINGS_INVALID_AUDIT_MODE', '设置项 auditMode 必须是对象')
    }
    for (const key of ['background', 'finalReview']) {
      const value = readScalar(mode[key])
      if (value === undefined || value === null) continue
      if (typeof value !== 'boolean') {
        throw new SettingsError('SETTINGS_INVALID_AUDIT_MODE', '设置项 auditMode.' + key + ' 必须是布尔值')
      }
      out.auditMode[key] = value
    }
  }
  return out
}
