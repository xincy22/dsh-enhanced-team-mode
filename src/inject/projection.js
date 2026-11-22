/**
 * projection.js — 「本会话是否已注入过协作指令」的持久状态。
 *
 * 状态全部从日志重放得到，因此插件重启、会话恢复、进程重入都不会重复注入。
 * 只认自家 source.kind，其他来源的 user 消息不改状态。
 */

import { emptyState, KIND } from './policy.js'

/** 投影键。同 key 与 stateVersion 的重复注册由注册表按引用计数合并。 */
export const PROJECTION_KEY = 'teamModeInjection'

/** 状态版本。字段形状变化时递增。 */
export const STATE_VERSION = 1

/**
 * 构造投影定义。
 * @param {{ object: (shape: object) => unknown }} z - zod 兼容实现；由入口注入，便于单测。
 * @returns {object} 可交给 ctx.sessionProjections.register 的定义。
 */
export function createProjectionDefinition(z) {
  return {
    key: PROJECTION_KEY,
    stateVersion: STATE_VERSION,
    stateSchema: z.object({
      turn: z.number(),
      taskEpoch: z.number(),
      // 真实 schemastery 3.19.0 无 .nullable()：字段默认可选，null 用 union([T, const(null)]) 表示。
      lastInjectedTurn: z.union([z.number(), z.const(null)]),
      lastInjectedMessageId: z.union([z.string(), z.const(null)]),
    }),
    init: emptyState,
    apply(state, event) {
      if (event.type === 'turn/start') return { ...state, turn: event.data.turn }
      if (event.type === 'user/message' && event.data?.source?.kind === KIND) {
        return {
          ...state,
          taskEpoch: state.taskEpoch + 1,
          lastInjectedTurn: state.turn,
          lastInjectedMessageId: event.data.id ?? null,
        }
      }
      return state
    },
  }
}
