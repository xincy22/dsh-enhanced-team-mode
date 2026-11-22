/**
 * wire.js — 把判定接到 agent/pre-step 上。
 *
 * 依赖由入口注入（createUserMessage、zod），因此本文件不引用任何宿主包，
 * 可以在没有 Cordis 宿主的情况下用假 ctx 驱动测试。
 */

import { decide, KIND, MESSAGE_FORM } from './policy.js'
import { createProjectionDefinition } from './projection.js'
import { COORDINATOR_INSTRUCTION } from './instruction.js'

/**
 * 注册投影与 pre-step 监听器。
 * @param {object} ctx - Cordis 上下文（测试中为假实现）。
 * @param {object} deps - 宿主能力注入。
 * @param {(spec: object) => object} deps.createUserMessage - 构造 user 消息。
 * @param {{ object: (shape: object) => unknown }} deps.z - zod 兼容实现。
 * @param {string} [deps.instruction] - 覆盖指令文本，默认取唯一副本。
 * @param {(agent: object, signal: AbortSignal) => string|Promise<string>} [deps.instructionFor] - 按会话生成指令文本（用于携带模型路由）。给了它就忽略 instruction。
 * @param {(outcome: object) => void} [deps.onDecision] - 判定回调，供审计记录证据。
 * @returns {Promise<object>} 投影句柄。
 */
export function wire(ctx, deps) {
  const { createUserMessage, z, instruction = COORDINATOR_INSTRUCTION, instructionFor, onDecision } = deps
  const ready = ctx.sessionProjections.register(createProjectionDefinition(z))

  /** 团队模式当前是否开启。独立恢复的成员没有活动根节点时报错，按关闭处理。 */
  const teamEnabled = (agent) => {
    try {
      return ctx.agentTeams.isEnabled(agent) === true
    } catch {
      return false
    }
  }

  /** 是否为本子代理树的根会话。 */
  const isRoot = (agent) => {
    try {
      return ctx.subagents.rootOf(agent) === agent
    } catch {
      return false
    }
  }

  ctx.on('agent/pre-step', async (payload, next) => {
    const decision = await next()
    if (decision.kind !== 'enter') return decision
    const { agent, turn, step } = payload
    const handle = await ready
    ctx.fiber?.assertActive?.()
    const state = handle.stateOf(agent.session)
    const humanMessages = (payload.messages ?? [])
      .filter((message) => message?.source?.kind === 'user')
      .map((message) => ({ id: message.id, text: textOf(message) }))
    const outcome = decide({
      isRoot: isRoot(agent),
      origin: agent.session?.header?.origin,
      teamEnabled: teamEnabled(agent),
      step,
      turn,
      humanMessages,
      state,
    })
    onDecision?.({ ...outcome, turn, step, agent: agent.id })
    if (!outcome.inject) return decision
    const text = typeof instructionFor === 'function' ? await instructionFor(agent, payload.signal) : instruction
    return {
      ...decision,
      messages: [
        ...decision.messages,
        createUserMessage({
          content: [{ type: 'text', text }],
          source: { kind: KIND, form: MESSAGE_FORM },
        }),
      ],
    }
  }, { prepend: true })

  return ready
}

/**
 * 取消息里的纯文本。
 * @param {object} message - user 消息。
 * @returns {string} 文本块拼接结果。
 */
function textOf(message) {
  return (message.content ?? [])
    .filter((block) => block?.type === 'text')
    .map((block) => block.text)
    .join('\n')
}
