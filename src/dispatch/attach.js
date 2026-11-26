/**
 * attach.js — 把设置解析接到注入路径上（集成层，不直接 import 宿主包）。
 *
 * 每次真正要注入时，按"当前会话授权 → 授权目录 → 三角色解析"的顺序算出模型路由，
 * 拼进协作指令。任何一步失败都变成指令里的问题条目，不吞掉、不换模型。
 */

import { composeCoordinatorInstruction } from '../inject/instruction.js'
import { emptySettings } from '../settings/schema.js'
import { readSettings } from '../settings/persist.js'
import { createHostCatalog } from '../settings/catalog.js'
import { SettingsError } from '../settings/errors.js'
import { wire } from '../inject/wire.js'
import { createPolicyProjection, readAuthorized } from './policy.js'
import { composeInstruction, resolveRoutes } from './routing.js'
import { queryRoutes } from './query.js'

/**
 * 注册授权投影并接线注入。
 * @param {object} ctx - Cordis 上下文。
 * @param {object} deps - 注入依赖。
 * @param {unknown} deps.config - 插件配置（设置页写入的值）。
 * @param {(spec: object) => object} deps.createUserMessage - 宿主消息构造器。
 * @param {object} deps.z - zod 兼容实现。
 * @param {string} [deps.instructionBase] - 协作指令正文，默认取唯一副本。
 * @param {(outcome: object) => void} [deps.onDecision] - 判定回调，供测试与审计记录证据。
 * @returns {Promise<object>} 注入接线返回的投影句柄。
 */
export function attach(ctx, deps) {
  const { config, createUserMessage, z, instructionBase, onDecision } = deps
  // 审计开关在插件加载时读取一次；按组合拼出注入文本（讲解协议恒在）。
  const auditMode = readStore(config).store.auditMode
  const composedBase = typeof instructionBase === 'string' ? instructionBase : composeCoordinatorInstruction(auditMode)
  const policyReady = ctx.sessionProjections.register(createPolicyProjection(z))

  /** 派发前按需读取当前配置的入口：同一个配置对象、同一份会话授权。 */
  const query = async (agent, signal) => {
    const handle = await policyReady
    return queryRoutes({ ctx, config, agent, policyHandle: handle, parentRoute: parentRouteOf(agent), signal })
  }

  const injection = wire(ctx, {
    createUserMessage,
    z,
    onDecision,
    instructionFor: async (agent, signal) => {
      const resolved = await resolveForAgent({ ctx, config, agent, signal, policyReady })
      return composeInstruction(composedBase, resolved)
    },
  })

  return { injection, policyReady, query }
}

/**
 * 为一个会话解析三角色路由。
 * @param {object} input - 输入。
 * @param {object} input.ctx - 上下文（需要 llm）。
 * @param {unknown} input.config - 插件配置。
 * @param {object} input.agent - 根会话 Agent。
 * @param {AbortSignal} [input.signal] - 本轮取消信号。
 * @param {Promise<object>} input.policyReady - 授权投影句柄。
 * @returns {Promise<{routes: object, problems: Array<object>}>} 解析结果。
 */
export async function resolveForAgent({ ctx, config, agent, signal, policyReady }) {
  const handle = await policyReady
  const authorized = readAuthorized(handle, agent.session)
  const parentRoute = parentRouteOf(agent)
  const read = readStore(config)
  const problems = read.problem === null ? [] : [read.problem]
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
    const auditOff = read.store.auditMode?.background === false && read.store.auditMode?.finalReview === false
    return { routes: { auditor: undefined, executor: undefined, mechanical: undefined }, problems, auditOff }
  }
  const resolved = resolveRoutes({ store: read.store, catalog, parentRoute })
  return { routes: resolved.routes, problems: [...problems, ...resolved.problems], auditOff: resolved.auditOff }
}

/**
 * 读设置；坏配置变成一条问题，而不是让插件加载失败或静默改用默认。
 * @param {unknown} config - 插件配置。
 * @returns {{store: object, problem: object|null}} 读取结果。
 */
export function readStore(config) {
  try {
    return { store: readSettings(config), problem: null }
  } catch (error) {
    return {
      store: emptySettings(),
      problem: {
        role: 'settings',
        code: error instanceof SettingsError ? error.code : 'SETTINGS_INVALID_CONFIG',
        message: error instanceof Error ? error.message : String(error),
      },
    }
  }
}

/**
 * 父 Agent 当前路由，作为"跟随默认"的继承目标与无授权列表时唯一允许的显式路由。
 * @param {object} agent - Agent。
 * @returns {{provider: string, model: string}|null} 路由；无从得知时返回 null。
 */
export function parentRouteOf(agent) {
  const selected = agent?.model?.current?.()
  if (selected !== undefined && selected !== null
    && typeof selected.provider === 'string' && typeof selected.model === 'string') {
    return { provider: selected.provider, model: selected.model }
  }
  const options = agent?.options
  if (options && typeof options.provider === 'string' && typeof options.model === 'string') {
    return { provider: options.provider, model: options.model }
  }
  const header = agent?.session?.requestHeader?.()
  const config = header?.config
  if (config && typeof config.provider === 'string' && typeof config.model === 'string') {
    return { provider: config.provider, model: config.model }
  }
  return null
}
