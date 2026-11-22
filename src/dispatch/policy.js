/**
 * policy.js — 读取本会话的子代理模型授权列表。
 *
 * 宿主里这份授权的权威来源是会话日志里的 subagent/model-selection-policy 事件
 * （由 dsh-tool-subagent 在会话第一条模型请求前写入）。该插件没有导出它的投影定义，
 * 所以本插件用不同的投影 key 折叠同一个事件类型：只读，不写入，不与宿主的 key 冲突。
 */

/** 本插件自己的投影 key，与宿主的 subagentModelSelectionPolicy 并存。 */
export const POLICY_KEY = 'teamModeModelPolicy'

/** 状态版本。 */
export const POLICY_VERSION = 1

/**
 * 构造授权投影定义。
 * @param {{ object: Function, array: Function, string: Function }} z - zod 兼容实现。
 * @returns {object} 可交给 ctx.sessionProjections.register 的定义。
 */
export function createPolicyProjection(z) {
  return {
    key: POLICY_KEY,
    stateVersion: POLICY_VERSION,
    // schemastery 3.19.0 没有 .nullable()。字段默认可选，显式 null 用 union([T, const(null)]) 表达；
    // 这样真实 z 下投影定义可构造，且 null（无授权列表）能原样通过校验。
    stateSchema: z.union([z.array(z.object({ provider: z.string(), model: z.string() })), z.const(null)]),
    init: () => null,
    apply(state, event) {
      if (state !== null) return state
      if (event.type !== 'subagent/model-selection-policy') return state
      const allowed = event.data?.allowedModels
      if (!Array.isArray(allowed) || allowed.length === 0) return state
      return allowed.map((route) => ({ provider: route.provider, model: route.model }))
    },
  }
}

/**
 * 读本会话的授权路由。
 * @param {{stateOf: (session: object) => unknown}} handle - 投影句柄。
 * @param {object} session - 会话。
 * @returns {Array<{provider: string, model: string}>|null} 授权列表；null 表示没有授权列表。
 */
export function readAuthorized(handle, session) {
  const value = handle.stateOf(session)
  if (!Array.isArray(value)) return null
  return value.map((route) => ({ provider: route.provider, model: route.model }))
}
