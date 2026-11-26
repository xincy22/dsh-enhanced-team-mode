/**
 * query.js — 派发前按需读取"当前"成员模型设置的入口。
 *
 * 一次性注入的指令是任务开始时的快照；用户在任务进行中改了设置，指令不会跟着变。
 * 新建成员之前调用这里，按当前配置与当前会话授权重新解析，因此新成员用新值，
 * 已有成员不受影响（复用成员本来就不传 provider/model/reasoning_effort）。
 */

import { composeInstruction, renderRoutingBlock, resolveRoutes } from './routing.js'
import { createHostCatalog } from '../settings/catalog.js'
import { SettingsError } from '../settings/errors.js'
import { emptySettings } from '../settings/schema.js'
import { readSettings } from '../settings/persist.js'
import { readAuthorized } from './policy.js'

/**
 * 解析一次当前路由。
 * @param {object} input - 输入。
 * @returns {Promise<{routes: object, problems: Array<object>, auditOff: boolean, text: string}>} 当前解析结果与可读文本。
 */
export async function queryRoutes({ ctx, config, agent, policyHandle, parentRoute, signal }) {
  const authorized = readAuthorized(policyHandle, agent.session)
  const problems = []
  let store
  try {
    store = readSettings(config)
  } catch (error) {
    store = emptySettings()
    problems.push({
      role: 'settings',
      code: error instanceof SettingsError ? error.code : 'SETTINGS_INVALID_CONFIG',
      message: error instanceof Error ? error.message : String(error),
    })
  }
  const auditOff = store.auditMode?.background === false && store.auditMode?.finalReview === false
  let catalog
  try {
    catalog = await createHostCatalog({
      listProviders: () => ctx.llm.listProviders(),
      listModels: (provider, callSignal) => ctx.llm.listModels(provider, callSignal),
      authorized,
      signal,
    })
  } catch (error) {
    problems.push({
      role: 'catalog',
      code: error instanceof SettingsError ? error.code : 'SETTINGS_CATALOG_UNAVAILABLE',
      message: '无法读取授权模型目录：' + (error instanceof Error ? error.message : String(error)),
    })
    const empty = { auditor: undefined, executor: undefined, mechanical: undefined }
    return { routes: empty, problems, auditOff, text: renderRoutingBlock({ routes: empty, problems, auditOff }) }
  }
  const resolved = resolveRoutes({ store, catalog, parentRoute })
  const allProblems = [...problems, ...resolved.problems]
  const routing = renderRoutingBlock({ routes: resolved.routes, problems: allProblems, auditOff: resolved.auditOff })
  const defaultNoAudit = '当前能力型执行与侦察讲解模型都跟随 DSH 默认：新建成员时省略 provider、model 与 reasoning_effort，继承父路由。'
  const auditNote = '审计席未启用（两个审计开关都关）：auditor 路由不会被派发。'
  const text = resolved.auditOff
    ? (routing.length > 0 ? routing + '\n\n' + auditNote : defaultNoAudit + '\n\n' + auditNote)
    : routing
  return {
    routes: resolved.routes,
    problems: allProblems,
    auditOff: resolved.auditOff,
    text,
  }
}

/**
 * 渲染面向模型的回答：没有路由块时给出明确的一句，避免模型把空串当成"没设置"而自行猜路由。
 * @param {{routes: object, problems: Array<object>, auditOff?: boolean, text: string}} resolved - 解析结果。
 * @returns {string} 模型可读文本。
 */
export function renderQueryAnswer(resolved) {
  if (resolved.text.length > 0) return resolved.text
  if (resolved.auditOff) {
    return '当前能力型执行与侦察讲解模型都跟随 DSH 默认（审计席未启用，auditor 路由不会被派发）：新建成员时省略 provider、model 与 reasoning_effort，继承父路由。'
  }
  return '当前审计、能力型执行与侦察讲解模型都跟随 DSH 默认：新建成员时省略 provider、model 与 reasoning_effort，继承父路由。'
}

export { composeInstruction }
