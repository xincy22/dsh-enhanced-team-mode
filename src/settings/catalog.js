/**
 * catalog.js — 授权目录的装配。
 *
 * 目录只回答"有哪些 provider / 每个 provider 公布哪些模型 / 本会话授权了哪些精确路由"。
 * 授权判断本身在 resolve.js：目录负责如实反映，解析负责拒绝。
 *
 * 两个入口：
 *  - createCatalog：从快照装配，纯函数。
 *  - createHostCatalog：从宿主能力（listProviders / listModels / 会话授权）异步装配，
 *    某个 provider 拉取失败时记入 failures 并把它的模型列表留空，绝不编造。
 */

/**
 * 从快照装配目录。
 * @param {object} input - 目录快照。
 * @param {Array<{id: string, name?: string}>} [input.providers] - 已注册 provider。
 * @param {Record<string, Array<{id: string, name?: string, aliases?: string[]}>>} [input.models] - 各 provider 公布的模型。
 * @param {Array<{provider: string, model: string}>|null} [input.authorized] - 本会话授权路由；null 表示没有授权列表。
 * @param {Array<{provider: string, message: string}>} [input.failures] - 装配期的失败记录。
 * @returns {object} 目录。
 */
export function createCatalog({ providers = [], models = {}, authorized = null, failures = [] } = {}) {
  const providerList = (Array.isArray(providers) ? providers : [])
    .filter((entry) => entry && typeof entry.id === 'string' && entry.id.length > 0)
    .map((entry) => ({ id: entry.id, name: typeof entry.name === 'string' && entry.name.length > 0 ? entry.name : entry.id }))
  const modelsByProvider = {}
  for (const [provider, list] of Object.entries(models ?? {})) {
    modelsByProvider[provider] = (Array.isArray(list) ? list : [])
      .filter((model) => model && typeof model.id === 'string' && model.id.length > 0)
      .map((model) => {
        const rawEfforts = model.reasoning && Array.isArray(model.reasoning.efforts)
          ? model.reasoning.efforts
          : (Array.isArray(model.efforts) ? model.efforts : null)
        const efforts = rawEfforts
          ? rawEfforts.map((e) => (typeof e === 'string' ? e : e?.id)).filter((id) => typeof id === 'string' && id.length > 0)
          : undefined
        return {
          id: model.id,
          name: typeof model.name === 'string' && model.name.length > 0 ? model.name : model.id,
          ...(Array.isArray(model.aliases) ? { aliases: model.aliases.filter((alias) => typeof alias === 'string') } : {}),
          ...(efforts !== undefined ? { efforts } : {}),
        }
      })
  }
  const allowlist = Array.isArray(authorized)
    ? authorized
      .filter((route) => route && typeof route.provider === 'string' && typeof route.model === 'string')
      .map((route) => ({ provider: route.provider, model: route.model }))
    : null
  const visible = allowlist === null
    ? providerList
    : providerList.filter((provider) => allowlist.some((route) => route.provider === provider.id))
  return {
    providers: visible,
    registered: providerList.map((provider) => provider.id),
    models: modelsByProvider,
    authorized: allowlist,
    failures: (Array.isArray(failures) ? failures : []).map((failure) => ({ ...failure })),
  }
}

/**
 * 从宿主能力装配目录。
 * @param {object} input - 宿主能力。
 * @param {() => Array<{id: string, name?: string}>} input.listProviders - 返回已注册 provider。
 * @param {(provider: string, signal?: AbortSignal) => Promise<Array<object>>} input.listModels - 返回该 provider 公布的模型。
 * @param {Array<{provider: string, model: string}>|null} input.authorized - 本会话授权路由；null 表示没有授权列表。
 * @param {AbortSignal} [input.signal] - 取消信号。
 * @returns {Promise<object>} 目录。
 */
export async function createHostCatalog({ listProviders, listModels, authorized, signal }) {
  const registered = (typeof listProviders === 'function' ? listProviders() : []) ?? []
  const providers = Array.isArray(registered) ? registered : []
  const known = new Set(providers.map((provider) => provider?.id).filter((id) => typeof id === 'string'))
  const allowlist = Array.isArray(authorized) ? authorized : null
  const targets = allowlist === null
    ? providers.map((provider) => provider.id)
    : [...new Set(allowlist.map((route) => route.provider))]
  const failures = []
  const models = {}
  for (const provider of targets) {
    if (!known.has(provider)) {
      failures.push({ provider, message: 'provider 未注册' })
      continue
    }
    signal?.throwIfAborted?.()
    try {
      const list = await listModels(provider, signal)
      models[provider] = Array.isArray(list) ? list : []
    } catch (error) {
      models[provider] = []
      failures.push({ provider, message: error instanceof Error ? error.message : String(error) })
    }
  }
  const kept = allowlist === null
    ? providers
    : providers.filter((provider) => models[provider.id] !== undefined)
  return createCatalog({ providers: kept, models, authorized: allowlist, failures })
}
