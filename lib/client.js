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
    // 每档只写「名额 + 职责」这一行，不再三档重复同一套句式。
    const ROLES = [
      { role: 'auditor', title: '审计模型', hint: '审计席（1 名）：开工研判 + 交付终审' },
      { role: 'executor', title: '能力型执行模型', hint: '执行席（≤3 名）：调研、设计、实现' },
      { role: 'mechanical', title: '机械执行模型', hint: '机械席（1 名）：按指令执行' },
    ]
    const DEFAULT_LABEL = '跟随 DSH 默认（新成员继承父路由）'
    // 推理等级（宿主 ModelSelection.reasoningEffort）。只有模型声明了 reasoning.efforts 才出现。
    const REASONING_LABEL = '推理等级'
    const REASONING_DEFAULT_LABEL = '跟随模型默认'
    // 推理等级的说明只出现在顶部那一句里，界面不再逐档重复。
    const SELECT_HINT = '每档为新建成员选「模型 + 推理等级」；空值跟随 DSH 默认，推理等级仅在模型声明档位时可选。'
    const SEARCH_PLACEHOLDER = '搜索模型'
    const MODEL_SECTION_LABEL = '模型'
    // 底部只留一句：两个要点（只影响新建成员 / 未授权不派发）合起来说。
    const NOTICE = '只影响本插件新创建的成员，不改主对话与全局默认'
    const AUTH_NOTICE = '未授权路由不会被派发。'
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
      // 复合选择器：触发按钮 + 浮层面板。颜色全部取 --dsw-alias-* 主题变量，回退值只在该变量缺失时生效。
      '[data-dsh-tm] .tm-select{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;height:34px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.14));border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);color:inherit;font:inherit;text-align:left;cursor:pointer;transition:border-color .15s ease,box-shadow .15s ease}',
      '[data-dsh-tm] .tm-select:hover:not(:disabled){border-color:var(--dsw-alias-border-l3,rgba(0,0,0,.26))}',
      '[data-dsh-tm] .tm-select:focus-visible{outline:none;border-color:var(--dsw-alias-brand-primary,#4f7cff);box-shadow:0 0 0 3px var(--dsw-alias-border-l2,rgba(0,0,0,.14))}',
      '[data-dsh-tm] .tm-select:disabled{cursor:not-allowed;opacity:.55}',
      '[data-dsh-tm] .tm-select-text{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '[data-dsh-tm] .tm-combo-text{flex:1 1 auto;display:flex;align-items:baseline;gap:2px;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}',
      '[data-dsh-tm] .tm-combo-model{overflow:hidden;text-overflow:ellipsis}',
      '[data-dsh-tm] .tm-combo-effort{flex:0 0 auto;color:var(--dsw-alias-label-tertiary,#8a919e)}',
      '[data-dsh-tm] .tm-panel{z-index:60;max-height:min(560px,80vh);display:flex;flex-direction:column;gap:2px;padding:6px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.14));border-radius:10px;background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 10px 28px var(--dsw-alias-border-l2,rgba(0,0,0,.14))}',
      // 模型区吃掉剩余高度并自己滚动；等级区固定保底高度、独立滚动，
      // 保证「当前推理等级」不会像 420px 时代那样被裁到面板外。
      '[data-dsh-tm] .tm-panel-models{flex:1 1 auto;min-height:0;overflow:auto}',
      '[data-dsh-tm] .tm-panel-efforts{flex:0 0 auto;max-height:45%;overflow:auto}',
      '[data-dsh-tm] .tm-panel-search{flex:0 0 auto;padding:2px 2px 6px}',
      '[data-dsh-tm] .tm-search{width:100%;height:30px;padding:0 8px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.14));border-radius:7px;background:var(--dsw-alias-bg-layer-1,#fff);color:inherit;font:inherit}',
      '[data-dsh-tm] .tm-search:focus-visible{outline:none;border-color:var(--dsw-alias-brand-primary,#4f7cff)}',
      '[data-dsh-tm] .tm-panel-section{flex:1 1 auto;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:2px;padding:2px}',
      '[data-dsh-tm] .tm-panel-section + .tm-panel-section{border-top:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.14));padding-top:6px;margin-top:2px}',
      '[data-dsh-tm] .tm-panel-heading{margin:0;padding:2px 8px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#8a919e)}',
      '[data-dsh-tm] .tm-panel-empty{margin:0;padding:4px 8px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#8a919e)}',
      '[data-dsh-tm] .tm-item{display:flex;align-items:center;gap:8px;width:100%;padding:7px 8px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary,#1f2329);font:inherit;text-align:left;cursor:pointer}',
      '[data-dsh-tm] .tm-item.is-active{background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.06))}',
      '[data-dsh-tm] .tm-item[aria-selected="true"]{color:var(--dsw-alias-brand-primary,#4f7cff);font-weight:500}',
      '[data-dsh-tm] .tm-item-check{flex:0 0 12px;font-size:12px;line-height:18px}',
      '[data-dsh-tm] .tm-item-text{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
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
        const options = [{ key: '', label: DEFAULT_LABEL, provider: '', model: '', efforts: [], defaultEffort: '' }]
        for (const group of groups) {
          for (const model of (group && group.models) || []) {
            const route = { provider: group.id, model: model.id }
            const reasoning = model.reasoning || null
            options.push({
              key: routeKey(route),
              label: (model.name || model.id) + '（' + routeKey(route) + '）',
              provider: route.provider,
              model: route.model,
              // 只有声明了 reasoning.efforts 的模型才有推理档位（与宿主 ModelSelect 同规则）。
              efforts: (reasoning && Array.isArray(reasoning.efforts)) ? reasoning.efforts : [],
              defaultEffort: (reasoning && typeof reasoning.defaultEffort === 'string') ? reasoning.defaultEffort : '',
            })
          }
        }
        if (current.length > 0 && !options.some((option) => option.key === current)) {
          // 已保存但目录里消失：保留成可改掉的选项，标记不可用，不自动替换。
          options.push({
            key: current,
            label: current + '（当前不可用）',
            provider: stored.provider,
            model: stored.model,
            efforts: [],
            defaultEffort: '',
          })
        }
        const selectedOption = options.find((option) => option.key === current) || options[0]
        return {
          role: entry.role,
          title: entry.title,
          hint: entry.hint,
          value: current,
          options,
          // 当前模型声明的推理档位：空数组表示该模型没有推理等级这一层。
          efforts: (selectedOption && selectedOption.efforts) || [],
          defaultEffort: (selectedOption && selectedOption.defaultEffort) || '',
          reasoningEffort: typeof stored.reasoningEffort === 'string' ? stored.reasoningEffort.trim() : '',
          notice: NOTICE,
          authNotice: AUTH_NOTICE,
          failures,
        }
      })
    }

    /**
     * 一行的推理等级候选项：首项为空键（跟随模型默认），其余来自该模型的 reasoning.efforts。
     * 模型没有档位时返回空数组，调用方据此隐藏整行。
     * @param {object} row - buildRows 的一行。
     * @returns {Array<{key: string, label: string}>} 候选项。
     */
    function reasoningOptions(row) {
      const efforts = (row && row.efforts) || []
      if (efforts.length === 0) return []
      const fallback = (row && row.defaultEffort) || ''
      const fallbackName = fallback.length > 0
        ? (efforts.find((effort) => effort.id === fallback) || {}).name || fallback
        : ''
      const label = fallbackName.length > 0
        ? REASONING_DEFAULT_LABEL + '（' + fallbackName + '）'
        : REASONING_DEFAULT_LABEL
      return [{ key: '', label }].concat(efforts.map((effort) => ({ key: effort.id, label: effort.name || effort.id })))
    }

    exports.__test = {
      buildRows,
      reasoningOptions,
      DEFAULT_LABEL,
      REASONING_LABEL,
      REASONING_DEFAULT_LABEL,
      SELECT_HINT,
      NOTICE,
      AUTH_NOTICE,
      SAVE_REJECTED,
      UNAVAILABLE,
      NS,
      BUNDLE_ID,
    }

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
          h('p', { className: 'tm-notice' }, SELECT_HINT),
          h(ModelRoutesForm),
        )
      }

      /**
       * 复合选择器：一个触发按钮 + 一块浮层面板（参照宿主对话里的 ModelSelect 设计）。
       *
       * - 触发按钮显示「模型名 · 推理等级」，空值时回落为「跟随 DSH 默认」。
       * - 面板分两区：上半是带搜索框的模型列表，下半是该模型的推理等级列表。
       * - 等级区只在当前模型声明了 reasoning.efforts 时出现（同宿主 ModelSelect.tsx:498）。
       * - 交互复刻宿主：点击外部 / Esc 关闭、↑↓ 移动、Enter 选中、关闭后焦点归还触发按钮，
       *   面板与条目使用 role=menu / menuitem，当前值带对勾（aria-selected）。
       * - 样式全部走 --dsw-alias-* 主题变量，不写死颜色。
       * - 有 document.body 时用 createPortal 挂到 body 上，避免被设置页的滚动容器裁切。
       */
      function ModelReasoningSelect(props) {
        const React3 = require('react')
        const [open, setOpen] = React3.useState(false)
        const [query, setQuery] = React3.useState('')
        const [active, setActive] = React3.useState(0)
        const [rect, setRect] = React3.useState(null)
        const [portalTarget, setPortalTarget] = React3.useState(null)
        const triggerRef = React3.useRef(null)
        const searchRef = React3.useRef(null)

        const options = props.options || []
        const current = options.find((option) => option.key === props.value) || options[0]
        const efforts = props.efforts || []
        const currentEffort = props.reasoningEffort || ''
        const effortLabelOf = (id) => {
          const hit = efforts.find((effort) => effort.id === id)
          return hit ? (hit.name || hit.id) : ''
        }

        const lowered = query.trim().toLowerCase()
        const visibleModels = lowered.length === 0
          ? options
          : options.filter((option) => option.label.toLowerCase().includes(lowered))
        const visibleEfforts = efforts.length > 0
          ? [{ key: '', label: effortFallbackLabel(efforts, props.defaultEffort) }]
            .concat(efforts.map((effort) => ({ key: effort.id, label: effort.name || effort.id })))
          : []

        /** 面板里的全部可选项，顺序即键盘上下键的顺序：先模型、后推理等级。 */
        const entries = visibleModels
          .map((option) => ({ kind: 'model', key: option.key, label: option.label }))
          .concat(visibleEfforts.map((effort) => ({ kind: 'effort', key: effort.key, label: effort.label })))

        const panelId = props.id + '-panel'
        const entryId = (index) => panelId + '-item-' + index

        const modelTitle = current ? current.label : DEFAULT_LABEL
        const effortTitle = efforts.length > 0
          ? (currentEffort === '' ? effortFallbackLabel(efforts, props.defaultEffort) : (effortLabelOf(currentEffort) || currentEffort))
          : ''

        function focusTrigger() {
          if (typeof document === 'undefined') return
          const node = triggerRef.current
          if (node && typeof node.focus === 'function') node.focus()
        }

        function openPanel() {
          if (props.disabled) return
          const node = triggerRef.current
          if (node && typeof node.getBoundingClientRect === 'function') {
            const box = node.getBoundingClientRect()
            setRect({ left: box.left, top: box.bottom + 4, width: box.width })
          } else {
            setRect(null)
          }
          // 优先 portal 进当前对话框：宿主设置页是模态层（top layer），挂到 body 会被它盖住。
          if (node && typeof node.closest === 'function') {
            setPortalTarget(node.closest('[role="dialog"], dialog') || (typeof document !== 'undefined' ? document.body : null))
          }
          setQuery('')
          setActive(0)
          setOpen(true)
        }

        function closePanel() {
          setOpen(false)
          focusTrigger()
        }

        function chooseEntry(entry) {
          if (!entry) { closePanel(); return }
          if (entry.kind === 'model') props.onChoose(entry.key)
          else props.onChooseEffort(entry.key)
          closePanel()
        }

        React3.useEffect(() => {
          if (!open) return undefined
          const onDocDown = (event) => {
            const target = event.target
            if (typeof Element !== 'undefined' && target instanceof Element) {
              if (target.closest('[data-dsh-tm-combo]') !== null) return
            }
            setOpen(false)
          }
          const onScroll = () => { setOpen(false) }
          if (typeof document !== 'undefined') {
            document.addEventListener('mousedown', onDocDown, true)
            document.addEventListener('scroll', onScroll, true)
          }
          // 打开后把焦点交给搜索框，键盘用户可以直接开始输入。
          const search = searchRef.current
          if (search && typeof search.focus === 'function') search.focus()
          // 把当前选中的模型与推理等级滚进可视区：用户打开面板就是为了确认「我现在是哪一档」。
          if (typeof document !== 'undefined') {
            const panel = document.getElementById(panelId)
            if (panel && typeof panel.querySelectorAll === 'function') {
              const selected = panel.querySelectorAll('[role="menuitem"][aria-selected="true"]')
              for (let index = 0; index < selected.length; index += 1) {
                const node = selected[index]
                if (node && typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'nearest' })
              }
            }
          }
          return () => {
            if (typeof document !== 'undefined') {
              document.removeEventListener('mousedown', onDocDown, true)
              document.removeEventListener('scroll', onScroll, true)
            }
          }
        }, [open])

        /** 键盘导航：在「模型 + 等级」的合并列表上移动 active，Enter 选中，Esc 关闭。 */
        function onKeyDown(event) {
          if (props.disabled) return
          if (event.key === 'Escape') {
            if (open) { event.preventDefault(); closePanel() }
            return
          }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            if (!open) { openPanel(); return }
            if (entries.length === 0) return
            const delta = event.key === 'ArrowDown' ? 1 : -1
            setActive((prev) => (prev + delta + entries.length) % entries.length)
            return
          }
          if (event.key === 'Enter') {
            event.preventDefault()
            if (!open) { openPanel(); return }
            chooseEntry(entries[active])
            return
          }
          if (event.key === 'Tab' && open) setOpen(false)
        }

        const trigger = h('button', {
          id: props.id,
          ref: triggerRef,
          type: 'button',
          className: 'tm-select tm-combo',
          disabled: props.disabled,
          'data-dsh-tm-combo': '',
          'aria-haspopup': 'menu',
          'aria-expanded': open ? 'true' : 'false',
          'aria-controls': open ? panelId : undefined,
          onClick: () => { if (open) closePanel(); else openPanel() },
          onKeyDown,
        },
          h('span', { className: 'tm-combo-text' },
            h('span', { className: 'tm-combo-model' }, modelTitle),
            effortTitle.length > 0
              ? h('span', { className: 'tm-combo-effort' }, ' · ' + effortTitle)
              : null,
          ),
          h('span', { className: 'tm-caret', 'aria-hidden': 'true' }),
        )

        // 注意：无论开关都返回同一个外层结构，避免展开/收起时重建触发按钮（那会让 ref 失效、焦点丢失）。
        const panel = !open ? null : h('div', {
          id: panelId,
          ref: null,
          className: 'tm-panel',
          'data-dsh-tm-combo': '',
          role: 'menu',
          'aria-label': props.ariaLabel || modelTitle,
          style: rect === null
            ? { position: 'relative', marginTop: '4px' }
            : { position: 'fixed', left: rect.left + 'px', top: rect.top + 'px', minWidth: Math.max(240, rect.width) + 'px' },
        },
          h('div', { className: 'tm-panel-search' },
            h('input', {
              ref: searchRef,
              type: 'search',
              className: 'tm-search',
              value: query,
              placeholder: SEARCH_PLACEHOLDER,
              'aria-label': SEARCH_PLACEHOLDER,
              // 搜索框是展开后真正持有焦点的元素，combobox 语义与 activedescendant 挂在这里才生效。
              role: 'combobox',
              'aria-expanded': 'true',
              'aria-controls': panelId,
              'aria-autocomplete': 'list',
              'aria-activedescendant': entries.length > 0 ? entryId(active) : undefined,
              onChange: (event) => { setQuery(event.target.value); setActive(0) },
              onKeyDown,
            }),
          ),
          h('div', { className: 'tm-panel-section tm-panel-models' },
            h('p', { className: 'tm-panel-heading' }, MODEL_SECTION_LABEL),
            visibleModels.length === 0
              ? h('p', { className: 'tm-panel-empty' }, '没有匹配的模型')
              : null,
            visibleModels.map((option) => {
              const index = entries.findIndex((entry) => entry.kind === 'model' && entry.key === option.key)
              return h('button', {
                key: 'model:' + (option.key || 'default'),
                id: entryId(index),
                type: 'button',
                role: 'menuitem',
                className: 'tm-item' + (index === active ? ' is-active' : ''),
                tabIndex: -1,
                'aria-selected': option.key === props.value ? 'true' : 'false',
                'data-model-key': option.key,
                onMouseEnter: () => setActive(index),
                onClick: () => chooseEntry({ kind: 'model', key: option.key }),
              },
                h('span', { className: 'tm-item-check', 'aria-hidden': 'true' }, option.key === props.value ? '✓' : ''),
                h('span', { className: 'tm-item-text' }, option.label),
              )
            }),
          ),
          visibleEfforts.length > 0
            ? h('div', { className: 'tm-panel-section tm-panel-efforts' },
                h('p', { className: 'tm-panel-heading' }, REASONING_LABEL),
                visibleEfforts.map((effort) => {
                  const index = entries.findIndex((entry) => entry.kind === 'effort' && entry.key === effort.key)
                  return h('button', {
                    key: 'effort:' + (effort.key || 'default'),
                    id: entryId(index),
                    type: 'button',
                    role: 'menuitem',
                    className: 'tm-item' + (index === active ? ' is-active' : ''),
                    tabIndex: -1,
                    'aria-selected': effort.key === currentEffort ? 'true' : 'false',
                    'data-effort-key': effort.key,
                    onMouseEnter: () => setActive(index),
                    onClick: () => chooseEntry({ kind: 'effort', key: effort.key }),
                  },
                    h('span', { className: 'tm-item-check', 'aria-hidden': 'true' }, effort.key === currentEffort ? '✓' : ''),
                    h('span', { className: 'tm-item-text' }, effort.label),
                  )
                }),
              )
            : null,
        )

        // 有 document.body 就 portal 到页面根，避免被滚动容器裁切；测试与无 DOM 环境内联渲染。
        let rendered = panel
        const target = portalTarget || (typeof document !== 'undefined' ? document.body : null)
        if (panel !== null && target) {
          try {
            const reactDom = require('react-dom')
            if (reactDom && typeof reactDom.createPortal === 'function') {
              rendered = reactDom.createPortal(h('div', { 'data-dsh-tm': '' }, panel), target)
            }
          } catch (error) {
            rendered = panel
          }
        }
        return h('span', { 'data-dsh-tm-combo': '' }, trigger, rendered)
      }

      /**
       * 跟随模型默认的档位标签：模型声明了 defaultEffort 时把它的名字带出来。
       * @param {Array<object>} efforts - 档位列表。
       * @param {string} defaultEffort - 默认档位 id。
       * @returns {string} 标签。
       */
      function effortFallbackLabel(efforts, defaultEffort) {
        const fallback = typeof defaultEffort === 'string' ? defaultEffort : ''
        const name = (efforts.find((effort) => effort.id === fallback) || {}).name || fallback
        return name.length > 0 ? REASONING_DEFAULT_LABEL + '（' + name + '）' : REASONING_DEFAULT_LABEL
      }

      /**
       * 表单主体：hooks 全部在这里，Card 与 Section 只做外层包装。
       * 说明：本控件按用户要求自绘（对照宿主 ModelSelect 的设计），不再依赖 platform-singleton
       * 里的 Menu 组件；平台基线（module-table）里那些共享模块仍然可用，只是这里用不到。
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
          if (key === '') {
            next[role] = { provider: '', model: '', reasoningEffort: '' }
          } else {
            const option = rows.find((row) => row.role === role).options.find((entry) => entry.key === key)
            // 换模型时清空推理等级：档位是模型级属性，旧档位对新模型多半不成立。
            const keepEffort = option.efforts.some((effort) => effort.id === ((values[role] || {}).reasoningEffort || ''))
            next[role] = {
              provider: option.provider,
              model: option.model,
              reasoningEffort: keepEffort ? ((values[role] || {}).reasoningEffort || '') : '',
            }
          }
          setDraft(next)
          setMessage('')
          setError('')
        }

        function chooseEffort(role, effort) {
          const next = Object.assign({}, values)
          const current = next[role] || { provider: '', model: '' }
          next[role] = { provider: current.provider, model: current.model, reasoningEffort: effort }
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
            // 推理等级同样是 volatile 叶子，必须单独一条路径写（整对象写会被 settings/rejected 拒绝）。
            ops.push({ op: 'set', path: [entry.role, 'reasoningEffort'], value: route.reasoningEffort || '' })
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
            // 一个复合选择器同时承载「模型 + 推理等级」，替代原先两个独立下拉。
            h(ModelReasoningSelect, {
              id: 'tm-' + row.role,
              value: row.value,
              options: row.options,
              efforts: row.efforts,
              defaultEffort: row.defaultEffort,
              reasoningEffort: row.reasoningEffort,
              disabled: busy || !snapshot.writable,
              ariaLabel: row.title,
              onChoose: (key) => choose(row.role, key),
              onChooseEffort: (effort) => chooseEffort(row.role, effort),
            }),
            h('p', { className: 'tm-hint' }, row.hint),
          )),
          h('p', { className: 'tm-notice' }, NOTICE + '；' + AUTH_NOTICE),
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
