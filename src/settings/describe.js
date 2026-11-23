/**
 * describe.js — 设置页需要的行数据（纯数据，不含任何 UI 框架）。
 *
 * 每个角色一行：当前选择、候选列表、以及固定不变的生效范围声明。
 * 已保存但目录里已消失的路由仍出现在候选里并标记不可用，用户可以改掉它，
 * 模块不会为了"看起来正常"而静默换成别的路由。
 */

import { DEFAULT_LABEL, EFFECT_SCOPE_NOTICE, REASONING_HINT, REASONING_LABEL, ROLES, ROLE_HINTS, ROLE_LABELS } from './constants.js'
import { SettingsError } from './errors.js'
import { resolveRole } from './resolve.js'

/**
 * 生成三个角色的行数据（审计、能力型执行、机械执行）。
 * @param {object} input - 输入。
 * @param {object} input.store - normalizeSettings 的结果。
 * @param {object} input.catalog - createCatalog 的结果。
 * @param {{provider: string, model: string}} input.parentRoute - 父路由。
 * @returns {Array<object>} 两行数据。
 */
export function describeRoles({ store, catalog, parentRoute }) {
  return ROLES.map((role) => describeRole({ role, store, catalog, parentRoute }))
}

/**
 * 生成一个角色的行数据。
 * @param {object} input - 输入。
 * @returns {object} 行数据。
 */
export function describeRole({ role, store, catalog, parentRoute }) {
  const selection = store?.[role] ?? { mode: 'default' }
  const options = [{
    kind: 'default',
    key: 'default',
    label: DEFAULT_LABEL,
    provider: '',
    model: '',
    available: true,
  }]
  for (const option of catalogRoutes(catalog)) {
    options.push({
      kind: 'route',
      key: option.provider + '/' + option.model,
      label: option.name + '（' + option.provider + '/' + option.model + '）',
      provider: option.provider,
      model: option.model,
      available: true,
    })
  }
  for (const stored of storedRoute(selection)) {
    if (options.some((option) => option.kind === 'route' && option.provider === stored.provider && option.model === stored.model)) continue
    options.push({
      kind: 'route',
      key: stored.provider + '/' + stored.model,
      label: stored.provider + '/' + stored.model,
      provider: stored.provider,
      model: stored.model,
      available: false,
    })
  }
  let currentLabel = DEFAULT_LABEL
  let error = null
  if (selection.mode !== 'default') {
    try {
      const decision = resolveRole({ role, store, catalog, parentRoute })
      currentLabel = labelOf(decision, catalog)
    } catch (failure) {
      error = failure instanceof SettingsError
        ? { code: failure.code, message: failure.message }
        : { code: 'SETTINGS_RESOLVE_FAILED', message: String(failure) }
      currentLabel = '不可用（' + error.code + '）'
    }
  }
  return {
    role,
    title: ROLE_LABELS[role],
    hint: ROLE_HINTS[role],
    mode: selection.mode,
    selection,
    reasoningEffort: typeof selection.reasoningEffort === 'string' ? selection.reasoningEffort : '',
    currentLabel,
    defaultLabel: DEFAULT_LABEL,
    reasoningLabel: REASONING_LABEL,
    reasoningHint: REASONING_HINT,
    options,
    notice: EFFECT_SCOPE_NOTICE,
    error,
  }
}

/** 目录里可选项的来源：有授权列表时按其顺序，没有时按 provider 公布的模型。 */
function catalogRoutes(catalog) {
  const routes = []
  if (Array.isArray(catalog.authorized)) {
    for (const route of catalog.authorized) {
      const models = catalog.models[route.provider] ?? []
      const model = models.find((entry) => entry.id === route.model)
      if (model === undefined) continue
      routes.push({ provider: route.provider, model: route.model, name: model.name })
    }
    return routes
  }
  for (const provider of catalog.providers) {
    for (const model of catalog.models[provider.id] ?? []) {
      routes.push({ provider: provider.id, model: model.id, name: model.name })
    }
  }
  return routes
}

/** 已保存的精确路由；别名为空或解析不出的情况不在这里伪造候选。 */
function storedRoute(selection) {
  if (selection.mode !== 'explicit') return []
  return [{ provider: selection.provider, model: selection.model }]
}

/** 决定的可读标签。 */
function labelOf(decision, catalog) {
  if (decision.kind === 'default') return DEFAULT_LABEL
  const models = catalog.models[decision.provider] ?? []
  const model = models.find((entry) => entry.id === decision.model)
  return (model === undefined ? decision.model : model.name) + '（' + decision.provider + '/' + decision.model + '）'
}
