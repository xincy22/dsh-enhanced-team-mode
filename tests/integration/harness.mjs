/** 测试替身：一台只实现本插件用到的宿主切面的假 harness。 */

export const scalar = () => ({ nullable: () => scalar() })

export const z = {
  object: (shape) => ({ shape, parse: (value) => value }),
  array: (inner) => ({ inner, nullable: () => ({ inner, nullable: () => null }), parse: (value) => value }),
  number: scalar,
  string: scalar,
  const: (value) => ({ value }),
  union: (list) => ({ list }),
  any: () => ({}),
}

export function fakeCreateUserMessage({ content, source }) {
  return { id: 'inj-' + (++counter), role: 'user', content, source }
}
let counter = 0

/**
 * @param {object} options - harness 选项。
 * @param {boolean} [options.enabled] - 团队开关。
 * @param {boolean} [options.root] - 是否根会话。
 * @param {Array|null} [options.authorized] - 会话授权列表；null 表示没有。
 * @param {Array} [options.providers] - 已注册 provider。
 * @param {object} [options.models] - 各 provider 公布的模型。
 * @param {{provider: string, model: string}|null} [options.parentRoute] - 父路由。
 */
export function makeHarness(options = {}) {
  counter = 0
  const registrations = new Map()
  const listeners = []
  const calls = { select: [], resolveCallConfig: [], listModels: [], startActivation: [] }
  const providerList = options.providers ?? [{ id: 'opencode-go', name: 'opencode-go' }]
  const models = options.models ?? { 'opencode-go': [{ id: 'flash', name: 'DeepSeek V4.1 Flash' }, { id: 'pro', name: 'DeepSeek V4.1 Pro' }] }
  const parentRoute = options.parentRoute ?? { provider: 'opencode-go', model: 'flash' }

  const ctx = {
    sessionProjections: {
      register: async (definition) => {
        // 同 key 重复注册复用同一份状态，模拟宿主的引用计数。
        const entry = registrations.get(definition.key) ?? { definition, bySession: new Map() }
        registrations.set(definition.key, entry)
        return {
          stateOf: (session) => {
            if (!entry.bySession.has(session.id)) entry.bySession.set(session.id, definition.init())
            return structuredClone(entry.bySession.get(session.id))
          },
        }
      },
    },
    on: (name, listener) => { listeners.push({ name, listener }) },
    subagents: { rootOf: (agent) => (options.root === false ? { id: 'other-root' } : agent) },
    agentTeams: { isEnabled: () => options.enabled !== false },
    llm: {
      listProviders: () => providerList,
      listModels: async (provider) => { calls.listModels.push(provider); return models[provider] ?? [] },
      resolveCallConfig: async (input) => { calls.resolveCallConfig.push(input); return input },
    },
    logger: { debug: () => {}, warn: () => {} },
    fiber: { assertActive: () => {} },
  }

  /** 事件回放，驱动所有已注册投影。 */
  const replay = (session, event) => {
    for (const entry of registrations.values()) {
      if (!entry.bySession.has(session.id)) entry.bySession.set(session.id, entry.definition.init())
      entry.bySession.set(session.id, entry.definition.apply(structuredClone(entry.bySession.get(session.id)), event))
    }
  }

  const session = (id, origin = 'root') => ({ id, header: { origin }, requestHeader: () => undefined, surface: { nodes: [] } })

  const makeAgent = (s) => ({
    id: s.id,
    session: s,
    options: {},
    model: {
      current: () => (parentRoute === null ? undefined : { ...parentRoute }),
      select: (selection) => { calls.select.push(selection) },
    },
  })

  const startTurn = (s, turn) => replay(s, { type: 'turn/start', data: { turn } })

  const preStep = async (s, { turn, step, messages }) => {
    const agent = makeAgent(s)
    const payload = { agent, turn, step, messages, signal: { aborted: false, throwIfAborted: () => {} } }
    const decision = await listeners[0].listener(payload, async () => ({ kind: 'enter', messages }))
    if (decision.kind === 'enter') {
      for (const message of decision.messages) {
        if (message.source?.kind === 'team-mode') replay(s, { type: 'user/message', data: message })
      }
    }
    return { decision, agent }
  }

  const authorizedEvent = (target) => {
    if (options.authorized === null) return
    replay(target, { type: 'subagent/model-selection-policy', data: { allowedModels: options.authorized } })
  }

  const textOf = (messages) => messages.filter((m) => m.source?.kind === 'team-mode').map((m) => m.content[0].text).join('\n\n')

  const stateOf = (s) => {
    const entry = registrations.get('teamModeInjection')
    if (entry === undefined) return undefined
    if (!entry.bySession.has(s.id)) entry.bySession.set(s.id, entry.definition.init())
    return structuredClone(entry.bySession.get(s.id))
  }

  return { ctx, listeners, calls, session, startTurn, preStep, replay, authorizedEvent, textOf, stateOf, makeAgent, parentRoute, zmock: z }
}

export const human = (id, text) => ({ id, role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } })
