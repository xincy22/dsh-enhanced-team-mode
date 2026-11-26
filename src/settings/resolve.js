/**
 * resolve.js — 把设置里的角色选择解析成派发可用的决定。
 *
 * 三种结果：
 *  - { kind: 'default' }：跟随 DSH 默认，派发侧不要传 provider/model（继承父路由）。
 *  - { kind: 'route', provider, model }：显式且已授权的精确路由。
 *  - 抛 SettingsError：任何不确定、未注册、未公布、未授权、别名歧义，都不返回替代路由。
 */

import { SettingsError } from './errors.js'
import { ROLES } from './constants.js'

/**
 * 把会话投影的授权返回值归一成目录接受的形态。
 *
 * dsh-tool-subagent 的投影在"没有策略"时返回 undefined，在有策略时返回路由数组，
 * 两种都合法；null 与 undefined 同义，表示没有授权列表（显式选择只允许父路由）。
 * @param {unknown} value - 投影返回值。
 * @returns {Array<{provider: string, model: string}>|null} 归一后的授权列表。
 * @throws {SettingsError} 形状非法（SETTINGS_INVALID_AUTHORIZATION）。
 */
export function normalizeAuthorized(value) {
  if (value === undefined || value === null) return null
  if (!Array.isArray(value)) {
    throw new SettingsError('SETTINGS_INVALID_AUTHORIZATION', '授权列表必须是数组或空值')
  }
  return value.map((route) => {
    if (!route || typeof route.provider !== 'string' || typeof route.model !== 'string'
      || route.provider.length === 0 || route.model.length === 0) {
      throw new SettingsError('SETTINGS_INVALID_AUTHORIZATION', '授权列表含非法路由')
    }
    return { provider: route.provider, model: route.model }
  })
}

/**
 * 把派发决定翻成子代理的 agentOptions。
 *
 * kind 为 default 时返回 undefined：调用方不要传 provider/model，让成员继承父路由。
 * 本函数不做任何路由替换，因此不存在"静默换用其他模型"的路径。
 * @param {{kind: 'default'}|{kind: 'route', provider: string, model: string}} decision - resolveRole 的返回值。
 * @returns {{provider: string, model: string}|undefined} 供 startActivation 的 agentOptions 使用。
 */
export function toAgentOptions(decision) {
  if (decision?.kind === 'default') return undefined
  if (decision?.kind !== 'route') {
    throw new SettingsError('SETTINGS_INVALID_SELECTION', '未知的派发决定 ' + String(decision?.kind))
  }
  const options = { provider: decision.provider, model: decision.model }
  // dsh-tool-subagent 的 agentOptions 对 reasoningEffort 用 z.string().min(1)，
  // 空串会校验失败，因此只在有值时带上。
  if (typeof decision.reasoningEffort === 'string' && decision.reasoningEffort.length > 0) {
    options.reasoningEffort = decision.reasoningEffort
  }
  return options
}

/**
 * 解析一个角色。
 * @param {object} input - 解析输入。
 * @param {'auditor'|'executor'|'mechanical'} input.role - 角色。
 * @param {object} input.store - normalizeSettings 的结果。
 * @param {object} input.catalog - createCatalog 的结果。
 * @param {{provider: string, model: string}} input.parentRoute - 父 Agent 当前路由，无授权列表时唯一允许的显式路由。
 * @returns {{kind: 'default'}|{kind: 'route', provider: string, model: string}} 派发决定。
 * @throws {SettingsError} 未注册 provider、未公布模型、未授权路由、别名未知或歧义。
 */
export function resolveRole({ role, store, catalog, parentRoute }) {
  if (!ROLES.includes(role)) throw new SettingsError('SETTINGS_UNKNOWN_ROLE', '未知角色 ' + String(role))
  const selection = store?.[role] ?? { mode: 'default' }
  if (selection.mode === 'default') return { kind: 'default' }
  const route = selection.mode === 'alias'
    ? resolveAlias(selection.alias, catalog)
    : { provider: selection.provider, model: selection.model }
  assertRouteUsable(route, catalog, parentRoute)
  const decision = { kind: 'route', provider: route.provider, model: route.model }
  // 推理等级：空串表示跟随模型默认；当目录明确声明了模型的 efforts 列表时，提前校验合法性。
  const effort = typeof selection.reasoningEffort === 'string' ? selection.reasoningEffort.trim() : ''
  if (effort.length > 0) {
    const modelEntry = (catalog.models[route.provider] ?? []).find((entry) => entry.id === route.model)
    if (Array.isArray(modelEntry?.efforts) && !modelEntry.efforts.includes(effort)) {
      throw new SettingsError(
        'SETTINGS_INVALID_REASONING_EFFORT',
        '路由 "' + route.provider + '/' + route.model + '" 不支持思考强度 "' + effort + '"（可选：'
          + (modelEntry.efforts.length > 0 ? modelEntry.efforts.join(', ') : '无') + '）',
      )
    }
    decision.reasoningEffort = effort
  }
  return decision
}

/**
 * 用显式别名在授权目录里唯一命中一条路由。
 * @param {string} alias - 模型 id、显示名或目录声明的别名。
 * @param {object} catalog - 目录。
 * @returns {{provider: string, model: string}} 命中的精确路由。
 * @throws {SettingsError} 未命中（SETTINGS_UNKNOWN_ALIAS）或多处命中（SETTINGS_AMBIGUOUS_ALIAS）。
 */
export function resolveAlias(alias, catalog) {
  const token = typeof alias === 'string' ? alias.trim() : ''
  if (token.length === 0) throw new SettingsError('SETTINGS_UNKNOWN_ALIAS', '别名为空')
  const hits = []
  for (const provider of catalog.providers) {
    const models = catalog.models[provider.id] ?? []
    for (const model of models) {
      const names = [model.id, model.name, ...(model.aliases ?? [])]
      if (names.includes(token)) hits.push({ provider: provider.id, model: model.id })
    }
  }
  if (hits.length === 0) {
    throw new SettingsError('SETTINGS_UNKNOWN_ALIAS', '别名 "' + token + '" 在授权目录里没有唯一对应项')
  }
  if (hits.length > 1) {
    throw new SettingsError(
      'SETTINGS_AMBIGUOUS_ALIAS',
      '别名 "' + token + '" 命中 ' + hits.length + ' 条路由（' + hits.map((hit) => hit.provider + '/' + hit.model).join(', ') + '），请改用 provider 加 model 的精确写法',
    )
  }
  return hits[0]
}

/**
 * 校验一条路由可用：provider 已注册、模型已公布、本会话已授权。
 * @param {{provider: string, model: string}} route - 待校验路由。
 * @param {object} catalog - 目录。
 * @param {{provider: string, model: string}} parentRoute - 父路由。
 * @throws {SettingsError} SETTINGS_UNKNOWN_PROVIDER / SETTINGS_UNKNOWN_MODEL / SETTINGS_UNAUTHORIZED_ROUTE。
 */
export function assertRouteUsable(route, catalog, parentRoute) {
  const known = Array.isArray(catalog.registered)
    ? catalog.registered
    : catalog.providers.map((entry) => entry.id)
  if (!known.includes(route.provider)) {
    throw new SettingsError('SETTINGS_UNKNOWN_PROVIDER', 'provider "' + route.provider + '" 未注册')
  }
  const provider = catalog.providers.find((entry) => entry.id === route.provider)
  if (provider === undefined) {
    throw new SettingsError(
      'SETTINGS_UNAUTHORIZED_ROUTE',
      '路由 "' + route.provider + '/' + route.model + '" 未授权：provider "' + route.provider + '" 不在本会话的授权列表里',
    )
  }
  const models = catalog.models[route.provider] ?? []
  if (!models.some((model) => model.id === route.model)) {
    throw new SettingsError('SETTINGS_UNKNOWN_MODEL', 'provider "' + route.provider + '" 未公布模型 "' + route.model + '"')
  }
  if (catalog.authorized === null) {
    if (parentRoute && parentRoute.provider === route.provider && parentRoute.model === route.model) return
    throw new SettingsError(
      'SETTINGS_UNAUTHORIZED_ROUTE',
      '路由 "' + route.provider + '/' + route.model + '" 未授权：本会话没有授权列表（not authorized），显式选择只允许父路由 '
        + (parentRoute ? parentRoute.provider + '/' + parentRoute.model : '(未知)'),
    )
  }
  if (!catalog.authorized.some((entry) => entry.provider === route.provider && entry.model === route.model)) {
    throw new SettingsError(
      'SETTINGS_UNAUTHORIZED_ROUTE',
      '路由 "' + route.provider + '/' + route.model + '" 不在本会话的授权列表里',
    )
  }
}
