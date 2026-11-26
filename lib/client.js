/**
 * lib/client.js — 浏览器半：设置页与插件详情页的「团队模式」配置界面。
 *
 * 形态与已装插件一致：window.__ModuleLoader__.load({ id, factory })，由宿主客户端
 * 模块系统按 package.json 的 dsh.client 声明加载；exports.apply 接收客户端 ctx。
 *
 * 槽位：
 *  - settings.section / settings.section.icon：设置页独立分区与导航图标。
 *  - plugins.bundle.config：插件详情页配置区（按包名 key）。
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
      { role: 'auditor', title: '审计模型', badge: 'Argus · 1 名', hint: '节点巡检与交付终审', tone: 'auditor' },
      { role: 'executor', title: '能力型执行模型', badge: 'Atlas · atlas-1~atlas-3', hint: '局部勘察、实现、调试与测试', tone: 'executor' },
      { role: 'mechanical', title: '侦察与讲解模型', badge: 'Mentor · 1 名', hint: '全局地图、假设证伪与机制讲解', tone: 'mechanical' },
    ]
    // 两个审计开关：任一开启即有 1 名审计席，都关则 0 名（团队上限 4）。
    const AUDIT_SECTION_LABEL = '审计能力'
    const MODELS_SECTION_LABEL = '成员模型'
    const AUDIT_MODES = [
      { key: 'background', label: '节点持续巡检', hint: '在方案拆定与阶段节点巡检设计偏差与遗漏边界；只读不改文件。' },
      { key: 'finalReview', label: '交付终审', hint: '交付物须经审计席判定通过后方可完成。' },
    ]
    const AUDIT_STATUS = {
      both: '审计席 1 名 · 上限 5 名',
      background: '仅节点巡检 · 上限 5 名',
      finalReview: '仅交付终审 · 上限 5 名',
      none: '不设审计席 · 上限 4 名',
    }
    const AUDITOR_DISABLED_HINT = '未启用审计席，当前不生效（已保存配置保留）'
    const DEFAULT_LABEL = '跟随 DSH 默认'
    // 推理等级（宿主 ModelSelection.reasoningEffort）。只有模型声明了 reasoning.efforts 才出现。
    const REASONING_LABEL = '推理等级'
    const REASONING_DEFAULT_LABEL = '跟随模型默认'
    // 顶部仅保留一条必要范围说明。
    const SELECT_HINT = '仅作用于本插件新建成员，未指定时继承 DSH 默认模型。'
    // 第二行选择器的标签与无档位说明（宿主把这一层叫 reasoning effort，界面上叫思考强度）。
    const EFFORT_LABEL = '思考强度'
    const NO_EFFORT_VALUE = '未声明'
    const NO_EFFORT_HINT = '该模型未声明 reasoning.efforts，不可选。'
    const SEARCH_PLACEHOLDER = '搜索模型'
    const MODEL_SECTION_LABEL = '模型'
    // 底部仅保留权限边界说明。
    const NOTICE = '仅影响本插件新创建的成员'
    const AUTH_NOTICE = '未授权路由不予派发'
    const SAVE_REJECTED = '保存未被宿主接受：这个设置命名空间当前不可写。常见原因是插件 Config 的字段没有声明 volatile，'
      + '或配置来源是只读的组合层。'
    const UNAVAILABLE = '宿主的 settings/describe 里没有 team-mode 命名空间，本页无法读写配置。'
      + '这通常意味着插件 Config 的字段缺少 volatile 标记（宿主只把 volatile 字段放进可写的设置文档）。'

    const CSS = [
      '[data-dsh-tm]{color:var(--dsw-alias-label-primary,#1f2329);font-size:13px;line-height:20px;display:flex;flex-direction:column;min-width:0}',
      '[data-dsh-tm] *{box-sizing:border-box}',
      // 顶部标题区：与宿主设置页字体层级对齐
      '[data-dsh-tm] .tm-header{margin:0 0 18px}',
      '[data-dsh-tm] .tm-title{margin:0 0 4px;font-size:18px;font-weight:600;line-height:26px;color:var(--dsw-alias-label-primary,#1f2329)}',
      '[data-dsh-tm] .tm-subtitle{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#5c6370)}',
      // 分组块与分组头
      '[data-dsh-tm] .tm-section{margin:0 0 20px}',
      '[data-dsh-tm] .tm-section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 10px;flex-wrap:wrap}',
      '[data-dsh-tm] .tm-section-title{font-size:13px;font-weight:600;line-height:20px;color:var(--dsw-alias-label-primary,#1f2329)}',
      '[data-dsh-tm] .tm-section-meta{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#8a919e)}',
      '[data-dsh-tm] .tm-pill{display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;font-size:11px;line-height:16px;font-weight:500;color:var(--dsw-alias-label-secondary,#5c6370);background:var(--dsw-alias-bg-layer-3,rgba(0,0,0,.05))}',
      '[data-dsh-tm] .tm-pill.is-muted{color:var(--dsw-alias-label-tertiary,#8a919e)}',
      // 审计开关卡片：分组圆角卡片 + 0.5px 细分隔线 + 宿主同款胶囊 Switch
      '[data-dsh-tm] .tm-card{border:0.5px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-alias-bg-layer-1,#fff);overflow:hidden}',
      '[data-dsh-tm] .tm-toggle-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 14px}',
      '[data-dsh-tm] .tm-toggle-row+.tm-toggle-row{border-top:0.5px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12))}',
      '[data-dsh-tm] .tm-toggle-copy{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}',
      '[data-dsh-tm] .tm-toggle-label{font-size:13px;font-weight:500;line-height:20px;color:var(--dsw-alias-label-primary,#1f2329)}',
      '[data-dsh-tm] .tm-toggle-hint{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#8a919e)}',
      '[data-dsh-tm] .tm-switch-btn{position:relative;flex:none;width:40px;height:22px;padding:2px;border:0.5px solid var(--dsw-alias-border-l3,rgba(0,0,0,.16));border-radius:999px;background:var(--dsw-alias-bg-layer-3,rgba(0,0,0,.08));cursor:pointer;transition:background .15s ease,border-color .15s ease}',
      '[data-dsh-tm] .tm-switch-btn::after{content:"";display:block;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:var(--dsw-elevation-panel,0 1px 3px rgba(0,0,0,.22));transition:transform .15s ease}',
      '[data-dsh-tm] .tm-switch-btn[aria-checked="true"]{background:var(--dsw-alias-button-info-fill,var(--dsw-alias-brand-primary,#397ee8));border-color:transparent}',
      '[data-dsh-tm] .tm-switch-btn[aria-checked="true"]::after{transform:translateX(18px)}',
      '[data-dsh-tm] .tm-switch-btn:disabled{cursor:not-allowed;opacity:.5}',
      '[data-dsh-tm] .tm-switch-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4f7cff);outline-offset:2px}',
      // 成员模型卡片列表：每席位一张卡片，模型与思考强度左右并排
      '[data-dsh-tm] .tm-role-list{display:flex;flex-direction:column;gap:10px}',
      '[data-dsh-tm] .tm-role-card{border:0.5px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-alias-bg-layer-1,#fff);padding:12px 14px;transition:opacity .15s ease}',
      '[data-dsh-tm] .tm-role-card.is-disabled{opacity:.62;background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.02))}',
      '[data-dsh-tm] .tm-role-head{display:flex;align-items:flex-start;gap:10px;margin:0 0 10px}',
      '[data-dsh-tm] .tm-role-tile{flex:none;width:30px;height:30px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;margin-top:1px}',
      '[data-dsh-tm] .tm-role-tile.is-auditor{color:var(--dsw-alias-state-warn-primary,#c26d2f);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#c26d2f) 11%,transparent)}',
      '[data-dsh-tm] .tm-role-tile.is-executor{color:var(--dsw-alias-brand-primary,#4f7cff);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4f7cff) 11%,transparent)}',
      '[data-dsh-tm] .tm-role-tile.is-mechanical{color:var(--dsw-alias-state-success-primary,#2f9e6e);background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#2f9e6e) 11%,transparent)}',
      '[data-dsh-tm] .tm-role-copy{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}',
      '[data-dsh-tm] .tm-role-title-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '[data-dsh-tm] .tm-role-title{font-size:13px;font-weight:600;line-height:20px;color:var(--dsw-alias-label-primary,#1f2329)}',
      '[data-dsh-tm] .tm-role-badge{display:inline-flex;align-items:center;padding:1px 7px;border-radius:999px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary,#5c6370);background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.04))}',
      '[data-dsh-tm] .tm-hint{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#8a919e);margin:0}',
      '[data-dsh-tm] .tm-role-fields{display:grid;grid-template-columns:minmax(0,1fr) 186px;gap:8px}',
      '@media (max-width:560px){[data-dsh-tm] .tm-role-fields{grid-template-columns:minmax(0,1fr)}}',
      // 搜索输入框与选择行（行高 34px、次要色标签、主色值、右侧箭头）
      '[data-dsh-tm] .tm-search{width:100%;height:30px;padding:0 10px;border:0.5px solid var(--dsw-alias-border-l3,rgba(0,0,0,.16));border-radius:7px;background:var(--dsw-alias-bg-layer-1,#fff);color:inherit;font:inherit;font-size:12px}',
      '[data-dsh-tm] .tm-search:focus-visible{outline:none;border-color:var(--dsw-alias-brand-primary,#4f7cff)}',
      '[data-dsh-tm] .tm-field{display:flex;align-items:center;gap:8px;width:100%;height:34px;padding:0 10px;border:0.5px solid var(--dsw-alias-border-l3,rgba(0,0,0,.16));border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.02));color:inherit;font:inherit;text-align:left;cursor:pointer;margin:0;transition:border-color .12s ease,background-color .12s ease,box-shadow .12s ease}',
      '[data-dsh-tm] .tm-field:hover:not(:disabled){border-color:var(--dsw-alias-border-l4,rgba(0,0,0,.26));background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.04))}',
      '[data-dsh-tm] .tm-field:focus-visible{outline:none;border-color:var(--dsw-alias-brand-primary,#4f7cff);box-shadow:0 0 0 2px var(--dsw-alias-brand-soft,rgba(79,124,255,.18))}',
      '[data-dsh-tm] .tm-field:disabled,[data-dsh-tm] .tm-field.is-disabled{cursor:not-allowed;opacity:.55}',
      '[data-dsh-tm] .tm-field-label{flex:0 0 auto;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#5c6370)}',
      '[data-dsh-tm] .tm-field-value{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary,#1f2329)}',
      '[data-dsh-tm] .tm-field-value.is-empty{color:var(--dsw-alias-label-tertiary,#8a919e)}',
      // 弹出层沿用宿主菜单视觉：圆角、阴影、选中打勾
      '[data-dsh-tm] .tm-menu{z-index:1100;min-width:260px;padding:6px;border:0.5px solid var(--dsw-alias-border-l2,rgba(0,0,0,.14));border-radius:var(--dsw-radius-lg,10px);background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:var(--dsw-elevation-panel,0 8px 24px rgba(0,0,0,.12));overflow:auto;display:flex;flex-direction:column;gap:2px}',
      '[data-dsh-tm] .tm-menu-search{padding:2px 2px 6px}',
      '[data-dsh-tm] .tm-menu-list{display:flex;flex-direction:column;gap:2px}',
      '[data-dsh-tm] .tm-menu-empty{margin:0;padding:8px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#8a919e);text-align:center}',
      '[data-dsh-tm] .tm-item{display:flex;align-items:center;gap:8px;width:100%;padding:7px 8px;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-primary,#1f2329);font:inherit;text-align:left;cursor:pointer}',
      '[data-dsh-tm] .tm-item.is-active{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}',
      '[data-dsh-tm] .tm-item[aria-selected="true"]{color:var(--dsw-alias-brand-text,var(--dsw-alias-brand-primary,#4f7cff));font-weight:500}',
      '[data-dsh-tm] .tm-item-check{flex:0 0 14px;font-size:12px;line-height:18px;text-align:center}',
      '[data-dsh-tm] .tm-item-text{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '[data-dsh-tm] .tm-caret{flex:0 0 auto;font-size:14px;line-height:1;color:var(--dsw-alias-label-caption,var(--dsw-alias-label-tertiary,#8a919e));transition:transform .15s ease}',
      '[data-dsh-tm] .tm-caret.is-icon{display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-caption,var(--dsw-alias-label-tertiary,#8a919e));transition:transform .15s ease}',
      '[data-dsh-tm] .tm-field[aria-expanded="true"] .tm-caret{transform:rotate(180deg)}',
      // 提示与底部操作栏（对齐宿主 SettingsForm）
      '[data-dsh-tm] .tm-notice{margin:0 0 12px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#8a919e)}',
      '[data-dsh-tm] .tm-notice.is-error{color:var(--dsw-alias-state-error-primary,#e5484d)}',
      '[data-dsh-tm] .tm-footer{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-top:14px;margin-top:4px;border-top:0.5px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));flex-wrap:wrap}',
      '[data-dsh-tm] .tm-footer-meta{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1 1 240px}',
      '[data-dsh-tm] .tm-footer-note{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#8a919e)}',
      '[data-dsh-tm] .tm-status{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-state-success-primary,#2f9e6e)}',
      '[data-dsh-tm] .tm-status.is-error{color:var(--dsw-alias-state-error-primary,#e5484d)}',
      '[data-dsh-tm] .tm-actions{display:flex;align-items:center;gap:8px;flex:none}',
      '[data-dsh-tm] .tm-btn{height:32px;padding:0 14px;border:0.5px solid var(--dsw-alias-border-l3,rgba(0,0,0,.16));border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#1f2329);font:inherit;font-size:13px;font-weight:500;cursor:pointer;transition:background-color .12s ease,border-color .12s ease,opacity .12s ease}',
      '[data-dsh-tm] .tm-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.04))}',
      '[data-dsh-tm] .tm-btn:disabled{cursor:not-allowed;opacity:.45}',
      '[data-dsh-tm] .tm-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4f7cff);outline-offset:2px}',
      '[data-dsh-tm] .tm-btn.is-primary{border-color:transparent;background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary,#4f7cff));color:var(--dsw-alias-label-on-color,#fff)}',
      '[data-dsh-tm] .tm-btn.is-primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover,var(--dsw-alias-brand-primary,#3d69eb))}',
    ].join('')

    /** 角色卡片图标（纯内联 SVG，不依赖外部图标包）。 */
    function roleIcon(role) {
      if (role === 'auditor') {
        return h('svg', { viewBox: '0 0 20 20', width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
          h('path', { d: 'M10 2.8 16 5.2v4.6c0 3.7-2.5 6.4-6 7.4-3.5-1-6-3.7-6-7.4V5.2L10 2.8Z' }),
          h('path', { d: 'm7.6 10.1 1.7 1.7 3.3-3.4' }),
        )
      }
      if (role === 'executor') {
        return h('svg', { viewBox: '0 0 20 20', width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
          h('path', { d: 'M11.2 2.6 5.2 11h4.6l-1 6.4 6-8.4h-4.6l1-6.4Z' }),
        )
      }
      return h('svg', { viewBox: '0 0 20 20', width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
        h('path', { d: 'M4 4.5h4.5A2.5 2.5 0 0 1 11 7v9.5a2 2 0 0 0-2-2H4V4.5Z' }),
        h('path', { d: 'M16 4.5h-4.5A2.5 2.5 0 0 0 9 7v9.5a2 2 0 0 1 2-2H16V4.5Z' }),
      )
    }

    /** 左侧设置导航图标（settings.section.icon 槽位）。 */
    function NavIcon(props) {
      const size = (props && props.size) || 16
      return h('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
        h('circle', { cx: 12, cy: 7, r: 3 }),
        h('path', { d: 'M6.5 20v-1.2a4.5 4.5 0 0 1 4.5-4.5h2a4.5 4.5 0 0 1 4.5 4.5V20' }),
        h('circle', { cx: 5, cy: 9.5, r: 2.2 }),
        h('path', { d: 'M2 19.5v-.8a3.2 3.2 0 0 1 2.4-3.1' }),
        h('circle', { cx: 19, cy: 9.5, r: 2.2 }),
        h('path', { d: 'M22 19.5v-.8a3.2 3.2 0 0 0-2.4-3.1' }),
      )
    }

    /**
     * 宿主图标：@deepseek-ai/dsh-client-ui-primitives 是基线模块，浏览器半可直接 require。
     * 取不到就退回字符箭头（有意的降级，见 README 限制项），不让渲染失败。
     */
    let chevronIcon
    let chevronTried = false
    function chevronDownIcon() {
      if (chevronTried) return chevronIcon
      chevronTried = true
      try {
        const primitives = require('@deepseek-ai/dsh-client-ui-primitives')
        chevronIcon = primitives.IconChevronDownOutlineRegular || primitives.IconChevronDownOutline14 || null
      } catch (error) {
        chevronIcon = null
      }
      return chevronIcon
    }

    /** 一条路由的稳定键。 */
    function routeKey(route) {
      return route && route.provider && route.model ? route.provider + '/' + route.model : ''
    }

    /**
     * 把设置快照与适配器目录拍平成三行候选。
     * @param {object} input - { values, groups, failures }
     * @returns {Array<object>} 三行。
     */
    function buildRows(input) {
      const values = (input && input.values) || {}
      const groups = (input && input.groups) || []
      const failures = (input && input.failures) || []
      const audit = buildAuditMode({ values })
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
        const auditorOff = entry.role === 'auditor' && audit.mode === 'none'
        return {
          role: entry.role,
          title: entry.title,
          badge: entry.badge,
          tone: entry.tone,
          hint: auditorOff ? AUDITOR_DISABLED_HINT : entry.hint,
          disabled: auditorOff,
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
     * 两个审计开关的当前值与组合状态行。
     * @param {object} input - { values }
     * @returns {object} 开关数据。
     */
    function buildAuditMode(input) {
      const values = (input && input.values) || {}
      const stored = values.auditMode || {}
      const background = stored.background !== false
      const finalReview = stored.finalReview !== false
      const mode = background && finalReview
        ? 'both'
        : background
          ? 'background'
          : finalReview
            ? 'finalReview'
            : 'none'
      return { background, finalReview, mode, status: AUDIT_STATUS[mode], modes: AUDIT_MODES }
    }

    /**
     * 一行的推理等级候选项：首项为空键（跟随模型默认），其余来自该模型的 reasoning.efforts。
     * 模型没有档位时返回空数组，调用方据此禁用思考强度选择器。
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
      buildAuditMode,
      reasoningOptions,
      AUDIT_SECTION_LABEL,
      AUDIT_MODES,
      AUDIT_STATUS,
      AUDITOR_DISABLED_HINT,
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
          h('div', { className: 'tm-header' },
            h('h3', { className: 'tm-title' }, '团队模式'),
          ),
          h('p', { className: 'tm-notice' },
            '设置服务不可用（缺少 configForms 或 slots），团队模式的模型配置无法在此页读写。'),
          h('p', { className: 'tm-notice is-error' },
            '请确认 DSH 版本支持插件设置表单（configForms 服务），或到「插件 → dsh-enhanced-team-mode」详情页查看。'),
        )
      }

      /** 设置页整页形态：标题 + 简述 + 共享表单。 */
      function Section() {
        return h('div', { 'data-dsh-tm': '' },
          h('style', null, CSS),
          h('div', { className: 'tm-header' },
            h('h3', { className: 'tm-title' }, '团队模式'),
            h('p', { className: 'tm-subtitle' }, SELECT_HINT),
          ),
          h(ModelRoutesForm),
        )
      }

      /**
       * 单值选择控件：每个维度独立按钮 + 弹出层（模型带搜索框，思考强度不搜索）。
       */
      function SeatField(props) {
        const React3 = require('react')
        const [open, setOpen] = React3.useState(false)
        const [query, setQuery] = React3.useState('')
        const [active, setActive] = React3.useState(0)
        const [rect, setRect] = React3.useState(null)
        const [portalTarget, setPortalTarget] = React3.useState(null)
        const triggerRef = React3.useRef(null)
        const searchRef = React3.useRef(null)

        const kind = props.kind === 'effort' ? 'effort' : 'model'
        const options = props.options || []
        const disabled = props.disabled === true || options.length === 0
        const lowered = query.trim().toLowerCase()
        const visible = lowered.length === 0
          ? options
          : options.filter((option) => option.label.toLowerCase().includes(lowered))
        const menuId = props.id + '-menu'
        const itemId = (index) => menuId + '-item-' + index
        const current = options.find((option) => option.key === props.value)
        const title = current ? current.label : (props.emptyLabel || '')
        const itemAttr = kind === 'model' ? 'data-model-key' : 'data-effort-key'

        function focusTrigger() {
          if (typeof document === 'undefined') return
          const node = triggerRef.current
          if (node && typeof node.focus === 'function') node.focus()
        }

        function openPanel() {
          if (disabled) return
          const node = triggerRef.current
          if (node && typeof node.getBoundingClientRect === 'function') {
            const box = node.getBoundingClientRect()
            const viewportHeight = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : 800
            const viewportWidth = (typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth : 1200
            const spaceBelow = viewportHeight - box.bottom - 8
            const spaceAbove = box.top - 8
            const placeAbove = spaceBelow < 220 && spaceAbove > spaceBelow
            const maxHeight = Math.max(180, Math.min(420, placeAbove ? spaceAbove : spaceBelow))
            const minWidth = Math.max(kind === 'model' ? 280 : 186, box.width)
            const left = Math.max(8, Math.min(box.left, viewportWidth - minWidth - 8))
            setRect({
              left,
              width: minWidth,
              top: box.bottom + 6,
              bottom: viewportHeight - box.top + 6,
              placeAbove,
              maxHeight,
            })
          } else {
            setRect(null)
          }
          if (node && typeof node.closest === 'function') {
            setPortalTarget(node.closest('[role="dialog"], dialog') || (typeof document !== 'undefined' ? document.body : null))
          }
          setQuery('')
          setActive(Math.max(0, options.findIndex((option) => option.key === props.value)))
          setOpen(true)
        }

        function closePanel() {
          setOpen(false)
          focusTrigger()
        }

        function choose(option) {
          if (!option) { closePanel(); return }
          props.onChoose(option.key)
          closePanel()
        }

        React3.useEffect(() => {
          if (!open) return undefined
          const onDocDown = (event) => {
            const target = event.target
            if (typeof Element !== 'undefined' && target instanceof Element
              && typeof target.closest === 'function' && target.closest('[data-dsh-tm-select]') !== null) return
            setOpen(false)
          }
          // 只有「选择行之外的滚动」才算页面位移；行内/面板内的滚动不能关面板。
          const onScroll = (event) => {
            const target = event && event.target
            if (typeof Element !== 'undefined' && target instanceof Element
              && typeof target.closest === 'function' && target.closest('[data-dsh-tm-select]') !== null) return
            setOpen(false)
          }
          if (typeof document !== 'undefined') {
            document.addEventListener('mousedown', onDocDown, true)
            document.addEventListener('scroll', onScroll, true)
          }
          const search = searchRef.current
          if (search && typeof search.focus === 'function') search.focus()
          if (typeof document !== 'undefined') {
            const menu = document.getElementById(menuId)
            if (menu && typeof menu.querySelectorAll === 'function') {
              const selected = menu.querySelector('[role="menuitem"][aria-selected="true"]')
              if (selected && typeof selected.scrollIntoView === 'function') {
                selected.scrollIntoView({ block: 'nearest' })
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

        /** 键盘：↑↓ 移动、Enter 选中、Esc 只关本层、Tab 关闭。 */
        function onKeyDown(event) {
          if (disabled) return
          if (event.key === 'Escape') {
            if (open) {
              // 只收起本层：不 stopPropagation 会冒泡到设置对话框，把整个设置页一起关掉。
              event.preventDefault()
              if (typeof event.stopPropagation === 'function') event.stopPropagation()
              closePanel()
            }
            return
          }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            if (typeof event.stopPropagation === 'function') event.stopPropagation()
            if (!open) { openPanel(); return }
            if (visible.length === 0) return
            const delta = event.key === 'ArrowDown' ? 1 : -1
            setActive((prev) => (prev + delta + visible.length) % visible.length)
            return
          }
          if (event.key === 'Enter') {
            event.preventDefault()
            if (!open) { openPanel(); return }
            choose(visible[active])
            return
          }
          if (event.key === 'Tab' && open) setOpen(false)
        }

        const trigger = h('button', {
          id: props.id,
          ref: triggerRef,
          type: 'button',
          className: 'tm-field' + (disabled ? ' is-disabled' : ''),
          disabled,
          'data-dsh-tm-select': '',
          'data-kind': kind,
          'aria-haspopup': 'menu',
          'aria-expanded': open ? 'true' : 'false',
          'aria-controls': open ? menuId : undefined,
          'aria-disabled': disabled ? 'true' : undefined,
          title: disabled && props.disabledHint ? props.disabledHint : title,
          onClick: () => { if (open) closePanel(); else openPanel() },
          onKeyDown,
        },
          h('span', { className: 'tm-field-label' }, props.label),
          h('span', { className: 'tm-field-value' + (current ? '' : ' is-empty') }, title),
          (() => {
            const Chevron = chevronDownIcon()
            return h('span', { className: 'tm-caret' + (Chevron ? ' is-icon' : ''), 'aria-hidden': 'true' },
              Chevron ? h(Chevron, { size: 14 }) : '▾')
          })(),
        )

        const menu = !open ? null : h('div', {
          id: menuId,
          className: 'tm-menu',
          'data-dsh-tm-select': '',
          role: 'menu',
          'aria-label': props.label,
          style: rect === null
            ? { position: 'relative', marginTop: '6px' }
            : rect.placeAbove === true
              ? {
                  position: 'fixed',
                  left: rect.left + 'px',
                  bottom: rect.bottom + 'px',
                  minWidth: rect.width + 'px',
                  maxHeight: rect.maxHeight + 'px',
                }
              : {
                  position: 'fixed',
                  left: rect.left + 'px',
                  top: rect.top + 'px',
                  minWidth: rect.width + 'px',
                  maxHeight: rect.maxHeight + 'px',
                },
        },
          kind === 'model'
            ? h('div', { className: 'tm-menu-search' },
                h('input', {
                  ref: searchRef,
                  type: 'search',
                  className: 'tm-search',
                  value: query,
                  placeholder: SEARCH_PLACEHOLDER,
                  'aria-label': SEARCH_PLACEHOLDER,
                  role: 'combobox',
                  'aria-expanded': 'true',
                  'aria-controls': menuId,
                  'aria-autocomplete': 'list',
                  'aria-activedescendant': visible.length > 0 ? itemId(active) : undefined,
                  onChange: (event) => { setQuery(event.target.value); setActive(0) },
                  onKeyDown,
                }),
              )
            : null,
          h('div', { className: 'tm-menu-list' },
            visible.length === 0
              ? h('p', { className: 'tm-menu-empty' }, '没有匹配的选项')
              : visible.map((option, index) => h('button', {
                  key: (kind === 'model' ? 'model:' : 'effort:') + (option.key || 'default'),
                  id: itemId(index),
                  type: 'button',
                  role: 'menuitem',
                  className: 'tm-item' + (index === active ? ' is-active' : ''),
                  tabIndex: -1,
                  'aria-selected': option.key === props.value ? 'true' : 'false',
                  [itemAttr]: option.key,
                  onMouseEnter: () => setActive(index),
                  onClick: () => choose(option),
                },
                  h('span', { className: 'tm-item-check', 'aria-hidden': 'true' }, option.key === props.value ? '✓' : ''),
                  h('span', { className: 'tm-item-text' }, option.label),
                )),
          ),
        )

        let rendered = menu
        const target = portalTarget || (typeof document !== 'undefined' ? document.body : null)
        if (menu !== null && target) {
          try {
            const reactDom = require('react-dom')
            if (reactDom && typeof reactDom.createPortal === 'function') {
              rendered = reactDom.createPortal(h('div', { 'data-dsh-tm': '' }, menu), target)
            }
          } catch (error) {
            rendered = menu
          }
        }
        return h('span', { 'data-dsh-tm-select': '' }, trigger, rendered)
      }

      /**
       * 表单主体：审计能力开关卡 + 三席位模型卡片 + 底部操作栏。
       * 说明：选择器与开关自绘（不依赖 platform-singleton 里的 Menu 组件），样式全部走宿主 --dsw-alias-* token。
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
        const audit = buildAuditMode({ values })
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

        function toggleAudit(key) {
          const next = Object.assign({}, values)
          next.auditMode = {
            background: audit.background,
            finalReview: audit.finalReview,
            [key]: !audit[key],
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
          // settings/rejected 拒绝（真机实测），必须拆成 [role, 'provider']、[role, 'model'] 与 [role, 'reasoningEffort']。
          const ops = []
          for (const entry of ROLES) {
            const route = values[entry.role] || {}
            ops.push({ op: 'set', path: [entry.role, 'provider'], value: route.provider || '' })
            ops.push({ op: 'set', path: [entry.role, 'model'], value: route.model || '' })
            ops.push({ op: 'set', path: [entry.role, 'reasoningEffort'], value: route.reasoningEffort || '' })
          }
          ops.push({ op: 'set', path: ['auditMode', 'background'], value: audit.background })
          ops.push({ op: 'set', path: ['auditMode', 'finalReview'], value: audit.finalReview })
          // 宿主 ConfigForm.mutate 的契约是「失败返回 false，不抛错」：只看 resolve 会把拒绝当成功。
          Promise.resolve(scope.mutate(ops, snapshot.revision))
            .then((accepted) => {
              if (accepted === false) {
                setError(SAVE_REJECTED)
                return
              }
              setDraft(null)
              setMessage('已保存，对后续新建成员生效。')
            })
            .catch((failure) => { setError((failure && failure.message) || '保存失败') })
            .then(() => { setBusy(false) })
        }

        const unavailable = snapshot.status === 'unavailable'

        return h('div', { 'data-dsh-tm-form': '' },
          unavailable ? h('p', { className: 'tm-notice is-error' }, UNAVAILABLE) : null,
          // 分组 1：审计能力
          h('section', { className: 'tm-section', key: 'audit-mode' },
            h('div', { className: 'tm-section-head' },
              h('span', { className: 'tm-section-title' }, AUDIT_SECTION_LABEL),
              h('span', { className: 'tm-pill' + (audit.mode === 'none' ? ' is-muted' : '') }, audit.status),
            ),
            h('div', { className: 'tm-card' },
              audit.modes.map((entry) => h('div', { className: 'tm-toggle-row', key: entry.key },
                h('div', { className: 'tm-toggle-copy' },
                  h('span', { className: 'tm-toggle-label' }, entry.label),
                  h('span', { className: 'tm-toggle-hint' }, entry.hint),
                ),
                h('button', {
                  type: 'button',
                  role: 'switch',
                  'aria-checked': audit[entry.key] ? 'true' : 'false',
                  'aria-label': entry.label,
                  'data-audit-key': entry.key,
                  className: 'tm-switch-btn',
                  disabled: busy || !snapshot.writable,
                  onClick: () => toggleAudit(entry.key),
                }),
              )),
            ),
          ),
          // 分组 2：成员模型路由
          h('section', { className: 'tm-section', key: 'member-models' },
            h('div', { className: 'tm-section-head' },
              h('span', { className: 'tm-section-title' }, MODELS_SECTION_LABEL),
            ),
            h('div', { className: 'tm-role-list' },
              rows.map((row) => {
                const effortOptions = reasoningOptions(row)
                const rowDisabled = busy || !snapshot.writable || row.disabled === true
                return h('div', { className: 'tm-role-card' + (row.disabled ? ' is-disabled' : ''), key: row.role },
                  h('div', { className: 'tm-role-head' },
                    h('span', { className: 'tm-role-tile is-' + row.tone, 'aria-hidden': 'true' }, roleIcon(row.role)),
                    h('div', { className: 'tm-role-copy' },
                      h('div', { className: 'tm-role-title-row' },
                        h('span', { className: 'tm-role-title' }, row.title),
                        h('span', { className: 'tm-role-badge' }, row.badge),
                      ),
                      h('p', { className: 'tm-hint' }, row.hint),
                    ),
                  ),
                  h('div', { className: 'tm-role-fields' },
                    h(SeatField, {
                      id: 'tm-' + row.role + '-model',
                      kind: 'model',
                      label: MODEL_SECTION_LABEL,
                      value: row.value,
                      options: row.options,
                      emptyLabel: DEFAULT_LABEL,
                      disabled: rowDisabled,
                      onChoose: (key) => choose(row.role, key),
                    }),
                    h(SeatField, {
                      id: 'tm-' + row.role + '-effort',
                      kind: 'effort',
                      label: EFFORT_LABEL,
                      value: row.reasoningEffort,
                      options: effortOptions,
                      emptyLabel: effortOptions.length === 0 ? NO_EFFORT_VALUE : '',
                      disabled: rowDisabled || effortOptions.length === 0,
                      disabledHint: NO_EFFORT_HINT,
                      onChoose: (effort) => chooseEffort(row.role, effort),
                    }),
                  ),
                )
              }),
            ),
          ),
          catalog.state === 'error'
            ? h('p', { className: 'tm-notice is-error' }, '模型目录加载失败：只能保留当前选择，无法改选新路由。')
            : null,
          // 底部操作栏
          h('div', { className: 'tm-footer' },
            h('div', { className: 'tm-footer-meta' },
              h('p', { className: 'tm-footer-note' }, AUTH_NOTICE),
              (error || message)
                ? h('p', { className: 'tm-status' + (error === '' ? '' : ' is-error'), role: 'status' }, error || message)
                : h('p', { className: 'tm-status', role: 'status', style: { display: 'none' } }, ''),
            ),
            h('div', { className: 'tm-actions' },
              h('button', { type: 'button', className: 'tm-btn', disabled: busy || !dirty, onClick: () => { setDraft(null); setMessage(''); setError('') } }, '放弃'),
              h('button', { type: 'button', className: 'tm-btn is-primary', disabled: busy || !dirty || unavailable, onClick: save },
                busy ? '保存中…' : '保存'),
            ),
          ),
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

      // 左侧导航自定义图标，替换默认齿轮图标。
      ctx.slots.inject('settings.section.icon', () => {
        try {
          return ctx.slots.register({
            name: 'settings.section.icon',
            id: 'team-mode',
          }, NavIcon)
        } catch (error) {
          console.warn('settings.section.icon 槽位注册失败：', error)
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
