/**
 * lib/client.js — 浏览器半：插件页里的「团队模式」设置区。
 *
 * 形态与已装插件一致：window.__ModuleLoader__.load({ id, factory })，由宿主客户端
 * 模块系统按 package.json 的 dsh.client 声明加载；exports.apply 接收客户端 ctx。
 *
 * 槽位用 plugins.bundle.config（bundle 自己的配置区，按包名 key），不是 plugins.item：
 * 后者被官方设置页占用，槽目录明确要求 bundle 配置走这里。
 */

window.__ModuleLoader__.load({
  id: 'dsh-enhanced-team-mode',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    const React = require('react')
    const h = React.createElement

    // 设置命名空间取 cordis.patch.yml 的 entry id（宿主 ConfigForms.get(entryId) → namespace: entryId）。
    const NS = 'team-mode'
    // 插件详情页按包名检索 plugins.bundle.config 槽位（renderSlot(..., {entryKey: pkg.name})），
    // 槽位 key 必须是 package.json 的 name，与设置命名空间（entry id）是两个标识空间。
    const BUNDLE_ID = 'dsh-enhanced-team-mode'
    const ROLES = [
      { role: 'auditor', title: '审计模型', hint: '独立审计成员（最多 1 名）使用此默认模型，可与任一执行模型相同。' },
      { role: 'executor', title: '能力型执行模型', hint: '调研、设计、实现等需要较强能力的执行成员（最多 3 名）共用此默认模型。' },
      { role: 'mechanical', title: '机械执行模型', hint: '只需按指令无脑执行的成员（最多 1 名）使用此默认模型。' },
    ]
    const DEFAULT_LABEL = '跟随 DSH 默认（新成员继承父路由）'
    const NOTICE = '只影响本插件在团队模式下新创建的成员；在跑与空闲的已有成员保留当前模型。'
      + '不改变主对话模型、普通子代理或 DSH 的全局默认模型。'
    const AUTH_NOTICE = '保存后仍按当前会话的模型授权校验；未授权的路由不会被用于派发，需要时请到「模型」设置补授权。'

    const CSS = [
      '[data-dsh-tm]{color:var(--dsw-alias-label-primary,#1f2329);font-size:13px;line-height:20px}',
      '[data-dsh-tm] *{box-sizing:border-box}',
      '[data-dsh-tm] .tm-row{margin:0 0 14px}',
      '[data-dsh-tm] .tm-label{display:block;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#5c6370);margin-bottom:6px}',
      '[data-dsh-tm] .tm-hint{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#8a919e);margin:4px 0 0}',
      '[data-dsh-tm] .tm-select{width:100%;height:34px;padding:0 8px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.14));border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);color:inherit;font:inherit}',
      '[data-dsh-tm] .tm-notice{margin:12px 0 0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#8a919e)}',
      '[data-dsh-tm] .tm-status{margin:10px 0 0;font-size:12px;line-height:18px;min-height:18px}',
      '[data-dsh-tm] .tm-status.is-error{color:var(--dsw-alias-state-error-primary,#e5484d)}',
      '[data-dsh-tm] .tm-actions{display:flex;gap:8px;margin-top:12px}',
      '[data-dsh-tm] .tm-btn{height:30px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.14));border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);color:inherit;font:inherit;cursor:pointer}',
      '[data-dsh-tm] .tm-btn.is-primary{border-color:transparent;background:var(--dsw-alias-brand-primary,#4f7cff);color:#fff}',
    ].join('')

    /** 一条路由的稳定键。 */
    function routeKey(route) {
      return route && route.provider && route.model ? route.provider + '/' + route.model : ''
    }

    /**
     * 把设置快照与适配器目录拍平成两行候选。
     * @param {object} input - { values, groups, failures }
     * @returns {Array<object>} 两行。
     */
    function buildRows(input) {
      const values = (input && input.values) || {}
      const groups = (input && input.groups) || []
      const failures = (input && input.failures) || []
      return ROLES.map((entry) => {
        const stored = values[entry.role] || {}
        const current = routeKey(stored)
        const options = [{ key: '', label: DEFAULT_LABEL, provider: '', model: '' }]
        for (const group of groups) {
          for (const model of (group && group.models) || []) {
            const route = { provider: group.id, model: model.id }
            options.push({
              key: routeKey(route),
              label: (model.name || model.id) + '（' + routeKey(route) + '）',
              provider: route.provider,
              model: route.model,
            })
          }
        }
        if (current.length > 0 && !options.some((option) => option.key === current)) {
          // 已保存但目录里消失：保留成可改掉的选项，标记不可用，不自动替换。
          options.push({ key: current, label: current + '（当前不可用）', provider: stored.provider, model: stored.model })
        }
        return {
          role: entry.role,
          title: entry.title,
          hint: entry.hint,
          value: current,
          options,
          notice: NOTICE,
          authNotice: AUTH_NOTICE,
          failures,
        }
      })
    }

    exports.__test = { buildRows, DEFAULT_LABEL, NOTICE, AUTH_NOTICE, NS, BUNDLE_ID }

    /** 注册设置区。宿主没有设置表单服务时静默跳过，不影响插件其它功能。 */
    function apply(ctx) {
      if (!ctx || !ctx.configForms || !ctx.slots) return
      const scope = ctx.configForms.get(NS)
      const remote = ctx.remote

      function Card() {
        const React2 = require('react')
        const snapshot = React2.useSyncExternalStore(scope.subscribe, scope.getSnapshot, scope.getSnapshot)
        const [draft, setDraft] = React2.useState(null)
        const [busy, setBusy] = React2.useState(false)
        const [message, setMessage] = React2.useState('')
        const [error, setError] = React2.useState('')
        const [catalog, setCatalog] = React2.useState({ groups: [], failures: [], state: 'idle' })

        React2.useEffect(() => {
          let live = true
          setCatalog((prev) => (prev.state === 'loading' ? prev : { ...prev, state: 'loading' }))
          Promise.resolve(remote && remote.session ? remote.session.modelCatalog() : Promise.resolve({ ok: false }))
            .then((response) => {
              if (!live) return
              if (response && response.ok) {
                setCatalog({ groups: response.value.groups || [], failures: response.value.failures || [], state: 'ready' })
              } else {
                setCatalog({ groups: [], failures: [], state: 'error' })
              }
            })
            .catch(() => { if (live) setCatalog({ groups: [], failures: [], state: 'error' }) })
          return () => { live = false }
        }, [])

        const values = draft || (snapshot.value || {})
        const rows = buildRows({ values, groups: catalog.groups, failures: catalog.failures })
        const dirty = draft !== null

        function choose(role, key) {
          const next = Object.assign({}, values)
          if (key === '') next[role] = { provider: '', model: '' }
          else {
            const option = rows.find((row) => row.role === role).options.find((entry) => entry.key === key)
            next[role] = { provider: option.provider, model: option.model }
          }
          setDraft(next)
          setMessage('')
          setError('')
        }

        function save() {
          if (busy || !dirty) return
          setBusy(true)
          setError('')
          const ops = []
          for (const entry of ROLES) {
            const route = values[entry.role] || {}
            ops.push({ op: 'set', path: [entry.role], value: { provider: route.provider || '', model: route.model || '' } })
          }
          Promise.resolve(scope.mutate(ops, snapshot.revision))
            .then(() => { setDraft(null); setMessage('已保存。新创建的成员使用新配置；已有成员保留当前模型。') })
            .catch((failure) => { setError((failure && failure.message) || '保存失败') })
            .then(() => { setBusy(false) })
        }

        return h('div', { 'data-dsh-tm': '' },
          h('style', null, CSS),
          rows.map((row) => h('div', { className: 'tm-row', key: row.role },
            h('label', { className: 'tm-label', htmlFor: 'tm-' + row.role }, row.title),
            h('select', {
              id: 'tm-' + row.role,
              className: 'tm-select',
              value: row.value,
              disabled: busy || !snapshot.writable,
              onChange: (event) => choose(row.role, event.target.value),
            }, row.options.map((option) => h('option', { value: option.key, key: option.key || 'default' }, option.label))),
            h('p', { className: 'tm-hint' }, row.hint),
          )),
          h('p', { className: 'tm-notice' }, NOTICE),
          h('p', { className: 'tm-notice' }, AUTH_NOTICE),
          catalog.state === 'error'
            ? h('p', { className: 'tm-notice' }, '模型目录加载失败：只能保留当前选择，无法改选新路由。')
            : null,
          h('div', { className: 'tm-actions' },
            h('button', { type: 'button', className: 'tm-btn is-primary', disabled: busy || !dirty, onClick: save },
              busy ? '保存中…' : '保存'),
            h('button', { type: 'button', className: 'tm-btn', disabled: busy || !dirty, onClick: () => { setDraft(null); setMessage('') } }, '放弃'),
          ),
          h('p', { className: 'tm-status' + (error === '' ? '' : ' is-error'), role: 'status' }, error || message),
        )
      }

      ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
        name: 'plugins.bundle.config',
        key: BUNDLE_ID,
      }, Card))
    }

    exports.apply = apply
    // inject 决定客户端 ctx 上能访问哪些服务（cordis 代理对未声明服务抛 "cannot get property … without inject"）。
    // apply 里访问了 slots、remote、configForms 三个服务，声明缺一即崩。
    exports.inject = ['slots', 'remote', 'configForms']
    return module.exports
  },
})
