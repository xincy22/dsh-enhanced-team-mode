/**
 * tool.js — 只读的"当前成员模型"查询工具描述。
 *
 * 建工具不拦截任何现有工具：它只是给协调者一个受支持的入口，在新建成员前读当前配置。
 * 授权仍走宿主规则（同一份会话授权列表）；显式路由不可用时返回问题说明，不返回替代路由。
 */

import { renderQueryAnswer } from './query.js'

/** 工具名。 */
export const ROUTE_TOOL_NAME = 'team_model_routes'

/** 面向模型的说明：说明何时该调用，不承诺它能强制任何事。 */
export const ROUTE_TOOL_DESCRIPTION = 'Read the current auditor, executor and mechanical model routes from this plugin settings page, checked against this session authorization. '
  + 'Call it before creating new teammates when the settings may have changed since this task started. '
  + 'Omission of provider/model on a subagent call inherits the parent route, so a missed call does not fail; it silently uses the parent model. '
  + 'Reusing an existing teammate needs no route.'

/**
 * 构造工具描述。
 * @param {object} deps - 依赖。
 * @param {(agent: object, signal?: AbortSignal) => Promise<object>} deps.query - 解析当前路由。
 * @returns {{name: string, description: string, parameters: object, output: object, execute: Function, isConcurrencySafe: Function}} 工具描述。
 */
export function createRouteTool({ query }) {
  return {
    name: ROUTE_TOOL_NAME,
    description: ROUTE_TOOL_DESCRIPTION,
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args, result) => [{ type: 'text', text: result }],
    },
    isConcurrencySafe: () => true,
    async execute(_args, exec) {
      if (exec.agent === undefined) throw new Error(ROUTE_TOOL_NAME + ' requires a calling agent')
      const resolved = await query(exec.agent, exec.signal)
      return renderQueryAnswer(resolved)
    },
  }
}
