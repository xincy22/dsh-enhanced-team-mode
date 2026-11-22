/**
 * index.js — dsh-enhanced-team-mode 插件入口。
 *
 * 四件事：
 *  1. 根会话收到用户发起的独立任务时，注入一次协作指令（T2）。
 *  2. 指令里携带设置页配置的成员模型路由，由主对话经原生 subagent 工具派发（T5）。
 *  3. 注册只读的 team_model_routes 工具：任务内改过设置时，新建成员前读当前值（T6）。
 *  4. 注册插件自带的协作手册 Skill，供按需加载（T5）。
 *
 * 插件自己不创建成员、不拦截工具、不新增开关；授权校验仍在宿主的工具层。
 */

import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'
import { attach } from './src/dispatch/attach.js'
import { createRouteTool } from './src/dispatch/tool.js'
import { createSettingsSchema } from './src/settings/schema.js'
import { registerSkill } from './src/skill/register.js'

/** 插件名与客户端模块 id。设置命名空间另见 ENTRY_ID（宿主按 entry id 提供 configForms）。 */
export const name = 'dsh-enhanced-team-mode'

/** cordis.patch.yml 的 entry id，即宿主的插件设置命名空间。 */
export const ENTRY_ID = 'team-mode'

/** 需要的宿主服务。skills 与 tools 缺失时跳过对应注册，注入仍然工作。 */
export const inject = ['sessionProjections', 'subagents', 'agentTeams', 'llm']

/** 设置页表单：执行模型与审计模型各一组 provider/model，空串表示跟随默认。 */
export const Config = createSettingsSchema(z)

/**
 * 插件入口。
 * @param {object} ctx - Cordis 上下文。
 * @param {unknown} config - 设置页保存的配置。
 * @returns {object} 注入接线结果：injection 句柄、policyReady、query。
 */
export function apply(ctx, config) {
  const activation = attach(ctx, { config, createUserMessage, z })

  // 只读查询工具：与团队开关同生灭，避免普通会话多出一个无用工具。
  ctx.inject(['tools'], (toolCtx) => {
    const descriptor = createRouteTool({ query: (agent, signal) => activation.query(agent, signal) })
    toolCtx.tools.register(defineTool(descriptor), {
      when: ({ agent }) => {
        try {
          return ctx.agentTeams.isEnabled(agent) === true
        } catch {
          return false
        }
      },
    })
  })

  // 协作手册 Skill：宿主没有技能注册表时跳过，注入不受影响。
  ctx.inject(['skills'], (scoped) => {
    try {
      registerSkill(scoped)
    } catch (error) {
      ctx.logger?.warn?.('dsh-enhanced-team-mode: 协作手册 Skill 注册失败：' + (error instanceof Error ? error.message : String(error)))
    }
  })

  return activation
}
