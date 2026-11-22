/**
 * policy.js — 注入判定的纯函数与状态形状。无宿主依赖。
 *
 * 判定顺序即优先级：非根会话 → 模式关闭 → 非第一步 → 无真人输入 →
 * 本轮已注入 → 首次任务自动注入 → 仅明确另起任务时注入。
 */

import { isExplicitNewTask } from './detect.js'

/** 注入消息的来源标识；插件以自己的 kind 识别自家消息。 */
export const KIND = 'team-mode'

/** 语义形态取 instructions：这是一份模型被期望遵循的指令，不是可被后续快照取代的状态。 */
export const MESSAGE_FORM = 'instructions'

/**
 * 一根会话的注入状态。字段全部可从日志重放得到。
 * @returns {{turn: number, taskEpoch: number, lastInjectedTurn: number|null, lastInjectedMessageId: string|null}} 空状态。
 */
export function emptyState() {
  return { turn: 0, taskEpoch: 0, lastInjectedTurn: null, lastInjectedMessageId: null }
}

/**
 * 判定本次 pre-step 是否注入协作指令。
 * @param {object} input - 判定输入。
 * @param {boolean} input.isRoot - 调用方是否为子代理树的根会话。
 * @param {string|undefined} input.origin - 会话来源，subagent 表示成员会话。
 * @param {boolean} input.teamEnabled - 团队模式当前是否开启。
 * @param {number} input.step - 本步序号。
 * @param {number} input.turn - 本轮序号。
 * @param {Array<{id: string, text: string}>} input.humanMessages - 本轮领取的真人消息（按顺序）。
 * @param {object} input.state - 投影状态。
 * @returns {{inject: boolean, reason: string, target?: {id: string, text: string}}} 判定结果。
 */
export function decide(input) {
  const { isRoot, origin, teamEnabled, step, turn, humanMessages, state } = input
  if (origin === 'subagent' || !isRoot) return skip('not-root-session')
  if (!teamEnabled) return skip('team-disabled')
  if (step !== 1) return skip('not-first-step')
  if (!Array.isArray(humanMessages) || humanMessages.length === 0) return skip('no-human-input')
  if (state.lastInjectedTurn !== null && state.lastInjectedTurn === turn) return skip('already-injected-this-turn')
  const target = humanMessages[humanMessages.length - 1]
  if (state.taskEpoch === 0) return { inject: true, reason: 'first-independent-task', target }
  if (!isExplicitNewTask(target.text)) return skip('not-an-explicit-new-task')
  return { inject: true, reason: 'explicit-new-task', target }
}

/**
 * @param {string} reason - 不注入的原因。
 * @returns {{inject: false, reason: string}} 判定结果。
 */
function skip(reason) { return { inject: false, reason } }
