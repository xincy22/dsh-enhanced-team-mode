/**
 * routing.js — 把设置里的三个角色解析成"可写进指令的路由"，并渲染成指令块。
 *
 * 本插件不自己创建成员：成员由主对话经原生 subagent / subagent_fork 工具创建，
 * 授权校验也在工具层完成。这里只做两件事——沿用同一份会话授权把用户配置解析成
 * 精确路由，并把结果（含 reasoning_effort）写进注入的指令，让主对话在派发时传对参数。
 *
 * 两个审计开关都关（auditOff）时，auditor 配置仅保留不生效：跳过解析、不报错、不渲染。
 */

import { DEFAULT_LABEL, ROLES, ROLE_LABELS } from '../settings/constants.js'
import { SettingsError } from '../settings/errors.js'
import { resolveRole } from '../settings/resolve.js'

/** 每个角色在指令里的固定顺序：与设置页一致（审计、能力型执行、侦察与讲解）。 */
const ROLE_ORDER = ROLES

/**
 * 解析三个角色的派发路由。
 * @param {object} input - 输入。
 * @param {object} input.store - readSettings 的结果。
 * @param {object} input.catalog - createCatalog 的结果。
 * @param {{provider: string, model: string}} input.parentRoute - 父路由。
 * @returns {{routes: Record<string, object|undefined>, problems: Array<{role: string, code: string, message: string}>, auditOff: boolean}} 解析结果。
 */
export function resolveRoutes({ store, catalog, parentRoute }) {
  const auditOff = store?.auditMode?.background === false && store?.auditMode?.finalReview === false
  const routes = {}
  const problems = []
  for (const role of ROLE_ORDER) {
    if (role === 'auditor' && auditOff) {
      routes[role] = undefined
      continue
    }
    try {
      const decision = resolveRole({ role, store, catalog, parentRoute })
      routes[role] = decision.kind === 'default' ? undefined : decision
    } catch (error) {
      routes[role] = undefined
      problems.push({
        role,
        code: error instanceof SettingsError ? error.code : 'SETTINGS_RESOLVE_FAILED',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return { routes, problems, auditOff }
}

/**
 * 渲染追加在协作指令后面的模型路由块。
 * @param {object} input - 渲染输入。
 * @param {Record<string, {provider: string, model: string, reasoningEffort?: string}|undefined>} input.routes - 三角色路由；undefined 表示跟随默认。
 * @param {Array<{role: string, code: string, message: string}>} input.problems - 解析失败项。
 * @param {boolean} [input.auditOff=false] - 两个审计开关都关时为 true，不渲染审计模型行。
 * @returns {string} 指令块；所有启用角色都跟随默认且无问题时返回空串。
 */
export function renderRoutingBlock({ routes, problems, auditOff = false }) {
  const activeRoles = auditOff ? ROLE_ORDER.filter((role) => role !== 'auditor') : ROLE_ORDER
  const hasRoute = activeRoles.some((role) => routes[role] !== undefined)
  if (!hasRoute && problems.length === 0) return ''
  const lines = []
  lines.push('## 成员模型（来自本插件设置页）')
  for (const role of activeRoles) {
    const route = routes[role]
    const label = ROLE_LABELS[role] ?? role
    if (route === undefined) {
      lines.push('- ' + label + '：' + DEFAULT_LABEL + '，派发时省略 provider、model 与 reasoning_effort')
    } else if (typeof route.reasoningEffort === 'string' && route.reasoningEffort.length > 0) {
      lines.push('- ' + label + '：' + route.provider + '/' + route.model + '（reasoning_effort: ' + route.reasoningEffort + '）')
    } else {
      lines.push('- ' + label + '：' + route.provider + '/' + route.model + '（省略 reasoning_effort，跟随模型默认）')
    }
  }
  if (problems.length > 0) {
    lines.push('')
    lines.push('以下配置当前不可用，派发前必须按实际原因报告，不要改用其他模型：')
    for (const problem of problems) {
      lines.push('- ' + problemLabel(problem.role) + '：' + problem.code + '（' + problem.message + '）')
    }
  }
  lines.push('')
  lines.push('派发规则：')
  lines.push('- 只有新建成员时才按上面的路由传 provider、model（及指明的 reasoning_effort）；未指明或标记为跟随默认的字段一律省略。')
  lines.push('- 复用已有成员时不要传 provider、model、reasoning_effort，保留该成员当前模型。')
  lines.push('- 工具层仍会按当前会话授权校验。若工具报路由不可用，据实报告并请用户到设置页改选或补授权，不要自行换用其他模型。')
  return lines.join('\n')
}

/**
 * 由路由结果拼出最终指令文本。
 * @param {string} base - 协作指令正文。
 * @param {{routes: object, problems: Array<object>, auditOff?: boolean}} resolved - resolveRoutes 的结果。
 * @returns {string} 完整指令文本。
 */
export function composeInstruction(base, resolved) {
  const block = renderRoutingBlock(resolved)
  return block.length === 0 ? base : base + '\n\n' + block
}

/** 问题条目的角色标签，非角色来源给固定中文名。 */
function problemLabel(role) {
  if (ROLE_LABELS[role] !== undefined) return ROLE_LABELS[role]
  if (role === 'settings') return '插件设置'
  if (role === 'catalog') return '授权目录'
  return String(role)
}

export { ROLES }
