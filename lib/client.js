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

    // 宿主共享组件：@deepseek-ai/dsh-client-ui-primitives 是 platform-singleton（module-table 基线）
    // 模块（dsh-web-frontend/dist/assets/index-*.js 里的模块表），客户端插件可直接
    // require，无需 package.json 的 dsh.client.external；宿主自己的文档缩放菜单就用它。
    // 拿不到时降级为原生 select，功能不丢。
    let HostMenu = null
    try {
      const hostPrimitives = require('@deepseek-ai/dsh-client-ui-primitives')
      HostMenu = hostPrimitives && typeof hostPrimitives.Menu === 'function' ? hostPrimitives.Menu : null
    } catch (error) {
      HostMenu = null
    }

    // 设置命名空间取 cordis.patch.yml 的 entry id（宿主 ConfigForms.get(entryId) → namespace: entryId）。
    const NS = 'team-mode'
    // 插件详情页按包名检索 plugins.bundle.config 槽位（renderSlot(..., {entryKey: pkg.name})），
    // 槽位 key 必须是 package.json 的 name，与设置命名空间（entry id）是两个标识空间。
    const BUNDLE_ID = 'dsh-enhanced-team-mode'
    const ROLES = [
      { role: 'auditor', title: '审计模型', hint: '独立审计成员（最多 1 名）使用此默认模型，同一成员承担开工研判与交付终审，可与任一执行模型相同。' },
      { role: 'executor', title: '能力型执行模型', hint: '调研、设计、实现等需要较强能力的执行成员（最多 3 名）共用此默认模型。' },
      { role: 'mechanical', title: '机械执行模型', hint: '只需按指令无脑执行的成员（最多 1 名）使用此默认模型。' },
    ]
    const DEFAULT_LABEL = '跟随 DSH 默认（新成员继承父路由）'
    const NOTICE = '只影响本插件在团队模式下新创建的成员；在跑与空闲的已有成员保留当前模型。'
      + '不改变主对话模型、普通子代理或 DSH 的全局默认模型。'
    const AUTH_NOTICE = '保存后仍按当前会话的模型授权校验；未授权的路由不会被用于派发，需要时请到「模型」设置补授权。'
    const SAVE_REJECTED = '保存未被宿主接受：这个设置命名空间当前不可写。常见原因是插件 Config 的字段没有声明 volatile，'
      + '或配置来源是只读的组合层。'
    const UNAVAILABLE = '宿主的 settings/describe 里没有 team-mode 命名空间，本页无法读写配置。'
      + '这通常意味着插件 Config 的字段缺少 volatile 标记（宿主只把 volatile 字段放进可写的设置文档）。'

    const CSS = [
      '[data-dsh-tm]{color:var(--dsw-alias-label-primary,#1f2329);font-size:13px;line-height:20px}',
      '[data-dsh-tm] *{box-sizing:border-box}',
      '[data-dsh-tm] .tm-row{margin:0 0 14px}',
      '[data-dsh-tm] .tm-label{display:block;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#5c6370);margin-bottom:6px}',
      '[data-dsh-tm] .tm-hint{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#8a919e);margin:4px 0 0}',
      // 下拉框触发按钮。弹出层交给宿主 Menu 组件，这里只保留字段外观。
      '[data-dsh-tm] .tm-select{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;height:34px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.14));border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);color:inherit;font:inherit;text-align:left;cursor:pointer;transition:border-color .15s ease,box-shadow .15s ease}',
      '[data-dsh-tm] .tm-select:hover:not(:disabled){border-color:var(--dsw-alias-border-l3,rgba(0,0,0,.26))}',
      '[data-dsh-tm] .tm-select:focus-visible{outline:none;border-color:var(--dsw-alias-brand-primary,#4f7cff);box-shadow:0 0 0 3px rgba(79,124,255,.18)}',
      '[data-dsh-tm] .tm-select:disabled{cursor:not-allowed;opacity:.55}',
      '[data-dsh-tm] .tm-select-text{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '[data-dsh-tm] .tm-caret{flex:0 0 auto;width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid var(--dsw-alias-label-tertiary,#8a919e);transition:transform .15s ease}',
      '[data-dsh-tm] .tm-select[aria-expanded="true"] .tm-caret{transform:rotate(180deg)}',
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

    exports.__test = { buildRows, DEFAULT_LABEL, NOTICE, AUTH_NOTICE, SAVE_REJECTED, UNAVAILABLE, NS, BUNDLE_ID }

    /** 注册设置区：设置页独立分区（settings.section）与插件详情页卡（plugins.bundle.config）两条入口互不依赖。 */
    function apply(ctx) {
      const hasForms = !!(ctx && ctx.configForms && ctx.slots)
      const scope = hasForms ? ctx.configForms.get(NS) : null
      const remote = hasForms ? ctx.remote : null

      // ConfigForm 的方法内部读 this.store（宿主实现里是类方法），把方法本身当回调传出去会丢 this，
      // 报 "Cannot read properties of undefined (reading 'store')" 并让整个 section 崩溃（右侧空白）。
      // 这里包成固定引用的闭包，既保留 this，也满足 useSyncExternalStore 对引用稳定的要求。
      const readScope = scope ? () => scope.getSnapshot() : null
      const subscribeScope = scope ? (onChange) => scope.subscribe(onChange) : null

      /** configForms/remote 不可用时的可见降级：不静默，给出明确错误文本。 */
      function UnavailableSection() {
        return h('div', { 'data-dsh-tm': '' },
          h('style', null, CSS),
          h('h3', { style: { margin: '0 0 8px', fontSize: '16px', fontWeight: 600 } }, '团队模式'),
          h('p', { className: 'tm-notice' },
            '设置服务不可用（缺少 configForms 或 slots），团队模式的模型配置无法在此页读写。'),
          h('p', { className: 'tm-notice is-error' },
            '请确认 DSH 版本支持插件设置表单（configForms 服务），或到「插件 → dsh-enhanced-team-mode」详情页查看。'),
        )
      }

      /** 设置页整页形态：标题 + 三档作用说明 + 共享表单。组件收 { close }（SettingsSectionOwnerProps），本表单不需要它。 */
      function Section() {
        return h('div', { 'data-dsh-tm': '' },
          h('style', null, CSS),
          h('h3', { style: { margin: '0 0 8px', fontSize: '16px', fontWeight: 600 } }, '团队模式'),
          h('p', { className: 'tm-notice' }, '为团队模式下本插件派发的新成员配置默认模型：审计、能力型执行、机械执行三档，各自独立，空值表示跟随 DSH 默认。'),
          h(ModelRoutesForm),
        )
      }

      /**
       * 下拉框：弹出层用宿主组件 @deepseek-ai/dsh-client-ui-primitives 的 Menu。
       *
       * 该模块是 platform-singleton（module-table 基线）的共享模块（见 app.asar 内
       * dsh-web-frontend/dist/assets/index-*.js 的模块表），客户端插件可直接 require，
       * 与宿主「文档缩放」等处用的是同一套菜单：自带样式、portal 定位、键盘导航
       * （↑↓/Home/End/Enter/Esc）、role=menu/menuitem 与焦点归还。
       * 触发按钮沿用本插件的字段外观（.tm-select），只把弹出层交给宿主。
       */
      function TmSelect(props) {
        const React3 = require('react')
        const [open, setOpen] = React3.useState(false)
        const options = props.options || []
        const current = options.find((option) => option.key === props.value) || options[0]

        // 宿主菜单不可用：退回原生 select（外观朴素，但不丢功能）。
        if (HostMenu === null) {
          return h('select', {
            id: props.id,
            className: 'tm-select',
            value: props.value,
            disabled: props.disabled,
            onChange: (event) => props.onChoose(event.target.value),
          }, options.map((option) => h('option', { key: option.key || 'default', value: option.key }, option.label)))
        }

        // 空键（跟随默认）用一个占位 id 传给 Menu，避免 Menu 把 '' 当作未选中。
        const DEFAULT_ID = '__dsh_tm_default__'
        const toId = (key) => (key === '' ? DEFAULT_ID : key)
        const fromId = (id) => (id === DEFAULT_ID ? '' : id)
        const items = options.map((option) => ({ id: toId(option.key), label: option.label }))

        const trigger = h('button', {
          id: props.id,
          type: 'button',
          className: 'tm-select',
          disabled: props.disabled,
          'aria-haspopup': 'menu',
          'aria-expanded': open ? 'true' : 'false',
          onMouseDown: (event) => { event.preventDefault() },
          onClick: () => { if (!props.disabled) setOpen((prev) => !prev) },
        },
          h('span', { className: 'tm-select-text' }, current ? current.label : ''),
          h('span', { className: 'tm-caret', 'aria-hidden': 'true' }),
        )

        // Menu 自带 anchor（触发元素由它渲染）、portal 定位、键盘导航与样式。
        return h(HostMenu, {
          open,
          anchor: trigger,
          items,
          selectedId: toId(props.value),
          portal: true,
          // 不锁到触发按钮宽度：选项里带 provider/model 全名，让菜单按内容自适应，避免截断。
          minWidthFromAnchor: false,
          align: 'start',
          onSelect: (id) => { setOpen(false); props.onChoose(fromId(id)) },
          onClose: () => setOpen(false),
        })
      }

      /**
       * 表单主体：hooks 全部在这里，Card 与 Section 只做外层包装。
       * 这里绝不可写成 ModelRoutesForm 自调用——渲染期会无限递归爆栈（RangeError），
       * React 随即卸载整棵子树，设置页右侧内容区表现为空白。
       */
      function ModelRoutesForm() {
        const React2 = require('react')
        const snapshot = React2.useSyncExternalStore(subscribeScope, readScope, readScope)
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
          // 宿主设置服务只接受「终止在 volatile 叶子」的路径写入：整对象写 path:[role] 会被
          // settings/rejected 拒绝（真机实测），必须拆成 [role, 'provider'] 与 [role, 'model']。
          const ops = []
          for (const entry of ROLES) {
            const route = values[entry.role] || {}
            ops.push({ op: 'set', path: [entry.role, 'provider'], value: route.provider || '' })
            ops.push({ op: 'set', path: [entry.role, 'model'], value: route.model || '' })
          }
          // 宿主 ConfigForm.mutate 的契约是「失败返回 false，不抛错」：只看 resolve 会把拒绝当成功。
          Promise.resolve(scope.mutate(ops, snapshot.revision))
            .then((accepted) => {
              if (accepted === false) {
                setError(SAVE_REJECTED)
                return
              }
              setDraft(null)
              setMessage('已保存。新创建的成员使用新配置；已有成员保留当前模型。')
            })
            .catch((failure) => { setError((failure && failure.message) || '保存失败') })
            .then(() => { setBusy(false) })
        }

        const unavailable = snapshot.status === 'unavailable'

        return h('div', { 'data-dsh-tm-form': '' },
          unavailable ? h('p', { className: 'tm-notice is-error' }, UNAVAILABLE) : null,
          rows.map((row) => h('div', { className: 'tm-row', key: row.role },
            h('label', { className: 'tm-label', htmlFor: 'tm-' + row.role }, row.title),
            h(TmSelect, {
              id: 'tm-' + row.role,
              value: row.value,
              options: row.options,
              disabled: busy || !snapshot.writable,
              onChoose: (key) => choose(row.role, key),
            }),
            h('p', { className: 'tm-hint' }, row.hint),
          )),
          h('p', { className: 'tm-notice' }, NOTICE),
          h('p', { className: 'tm-notice' }, AUTH_NOTICE),
          catalog.state === 'error'
            ? h('p', { className: 'tm-notice' }, '模型目录加载失败：只能保留当前选择，无法改选新路由。')
            : null,
          h('div', { className: 'tm-actions' },
            h('button', { type: 'button', className: 'tm-btn is-primary', disabled: busy || !dirty || unavailable, onClick: save },
              busy ? '保存中…' : '保存'),
            h('button', { type: 'button', className: 'tm-btn', disabled: busy || !dirty, onClick: () => { setDraft(null); setMessage('') } }, '放弃'),
          ),
          h('p', { className: 'tm-status' + (error === '' ? '' : ' is-error'), role: 'status' }, error || message),
        )
      }

      /** 插件详情页卡：宿主按 renderSlot('plugins.bundle.config', {view: 'page'}, ...) 调用，摘要等其它视图返回 null。 */
      function Card(props) {
        if (!props || props.view !== 'page') return null
        return h('div', { 'data-dsh-tm': '' },
          h('style', null, CSS),
          h(ModelRoutesForm),
        )
      }

      // 设置页独立分区：list 槽，注册即出现在「设置」导航（office/sidenote 同款入口）。
      // id 用 entry id 'team-mode'，与 configForms 命名空间同源。
      ctx.slots.inject('settings.section', () => {
        try {
          return ctx.slots.register({
            name: 'settings.section',
            id: 'team-mode',
            order: 80,
            label: () => '团队模式',
          }, hasForms ? Section : UnavailableSection)
        } catch (error) {
          console.warn('settings.section 槽位注册失败：', error)
          return undefined
        }
      })

      // 插件详情页卡（保留；若此宿主版本对该入口有限制，设置页入口不受影响）。
      if (hasForms) {
        ctx.slots.inject('plugins.bundle.config', () => {
          // 槽位未声明时该回调延迟执行，内部抛错无人接（页面静默）。此处兜底记录。
          try {
            return ctx.slots.register({
              name: 'plugins.bundle.config',
              key: BUNDLE_ID,
            }, Card)
          } catch (error) {
            console.warn('plugins.bundle.config 槽位注册失败：', error)
            return undefined
          }
        })
      }
    }

    exports.apply = apply
    // inject 决定客户端 ctx 上能访问哪些服务（cordis 代理对未声明服务抛 "cannot get property … without inject"）。
    // 注意 remote.session 是独立服务 id，只声明 'remote' 访问 remote.session 同样会抛错（真机实测）。
    // apply 里访问了 slots、configForms、remote、remote.session 四个 id，声明缺一即崩。
    exports.inject = ['slots', 'remote', 'remote.session', 'configForms']
    return module.exports
  },
})
