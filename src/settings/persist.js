/**
 * persist.js — 配置读取与设置写入的路径编辑。
 *
 * 写入走 ctx.settings.mutate 的路径操作，因此不需要把整段设置重述一遍，
 * 也不会误删同一命名空间里其他字段。
 */

import { SettingsError } from './errors.js'
import { ROLES } from './constants.js'
import { normalizeSettings } from './schema.js'

/**
 * 读取插件配置里的三个角色选择（审计 / 能力型执行 / 机械执行）。
 * @param {unknown} config - 插件 Config 对象。
 * @returns {{auditor: object, executor: object, mechanical: object}} 归一化后的选择。
 */
export function readSettings(config) {
  return normalizeSettings(config)
}

/**
 * 把一个角色选择转换成设置写入操作。
 * @param {'auditor'|'executor'|'mechanical'} role - 角色。
 * @param {{kind: 'default'}|{kind: 'route', provider: string, model: string}|{kind: 'alias', alias: string}} selection - 选择。
 * @returns {Array<{op: 'set', path: string[], value: string}>} 供 ctx.settings.mutate 使用的操作。
 * @throws {SettingsError} 未知角色或未知选择。
 */
export function mutateOps(role, selection) {
  if (!ROLES.includes(role)) throw new SettingsError('SETTINGS_UNKNOWN_ROLE', '未知角色 ' + String(role))
  const kind = selection?.kind
  // 推理等级是模型级可选字段：路由为 default 时一并清空，避免留下对不上路由的残留值。
  if (kind === 'default') {
    return [set(role, 'provider', ''), set(role, 'model', ''), set(role, 'reasoningEffort', '')]
  }
  const effort = typeof selection.reasoningEffort === 'string' ? selection.reasoningEffort.trim() : ''
  if (kind === 'route') {
    if (typeof selection.provider !== 'string' || typeof selection.model !== 'string'
      || selection.provider.length === 0 || selection.model.length === 0) {
      throw new SettingsError('SETTINGS_INVALID_SELECTION', '显式路由必须同时给出 provider 与 model')
    }
    return [
      set(role, 'provider', selection.provider),
      set(role, 'model', selection.model),
      set(role, 'reasoningEffort', effort),
    ]
  }
  if (kind === 'alias') {
    if (typeof selection.alias !== 'string' || selection.alias.length === 0) {
      throw new SettingsError('SETTINGS_INVALID_SELECTION', '别名不能为空')
    }
    return [set(role, 'provider', ''), set(role, 'model', selection.alias), set(role, 'reasoningEffort', effort)]
  }
  throw new SettingsError('SETTINGS_INVALID_SELECTION', '未知的选择类型 ' + String(kind))
}

/**
 * @param {string} role - 角色。
 * @param {string} field - provider、model 或 reasoningEffort。
 * @param {string} value - 写入值。
 * @returns {{op: 'set', path: string[], value: string}} 路径操作。
 */
function set(role, field, value) {
  return { op: 'set', path: [role, field], value }
}
