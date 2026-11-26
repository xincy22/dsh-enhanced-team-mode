/**
 * constants.js — 角色、标签与生效范围声明的唯一副本。
 *
 * 文案集中在这里，设置页与派发侧共用，避免两处说法不一致。
 */

/** 三个角色，顺序即设置页顺序：审计、能力型执行、侦察与讲解（键 mechanical 保留以零迁移兼容旧配置）。 */
export const ROLES = ['auditor', 'executor', 'mechanical']

/** 角色中文名。 */
export const ROLE_LABELS = {
  auditor: '审计模型',
  executor: '能力型执行模型',
  mechanical: '侦察与讲解模型',
}

/**
 * 角色用途说明，供设置页的每档副标题使用。
 */
export const ROLE_HINTS = {
  auditor: '审计席（1 名）：节点巡检与交付终审',
  executor: '执行席（≤3 名）：局部勘察、实现、调试与测试',
  mechanical: '侦察讲解席（1 名）：全局地图、假设证伪与机制讲解',
}

/**
 * 席位英文名的单一来源。键与 ROLES 一致（零迁移），中文类别名保留。
 * 名字只体现气质，不固定分工；子成员 name 不得用 leader 或 lead。
 */
export const SEAT_EN_NAMES = {
  leader: 'leader',
  auditor: 'Argus',
  executor: 'Atlas',
  mechanical: 'Mentor',
}

/** 席位实例名。执行席按序号区分，侦察讲解席与审计席各一名、不带序号。 */
export const SEAT_INSTANCE_NAMES = {
  executor: ['atlas-1', 'atlas-2', 'atlas-3'],
  mechanical: ['mentor'],
  auditor: ['argus'],
}

/** 顶部唯一一句说明。 */
export const SELECT_HINT = '仅作用于本插件新建成员，未指定时继承 DSH 默认模型。'

/** 两个审计能力开关的键，顺序即设置页顺序。 */
export const AUDIT_MODES = ['background', 'finalReview']

/** 开关标签。 */
export const AUDIT_MODE_LABELS = {
  background: '节点持续巡检',
  finalReview: '交付终审',
}

/** 开关说明。 */
export const AUDIT_MODE_HINTS = {
  background: '在方案拆定与阶段节点巡检设计偏差与遗漏边界；只读不改文件。',
  finalReview: '交付物须经审计席判定通过后方可完成。',
}

/** 组合状态行：两个开关决定审计席是否存在与承担什么。 */
export const AUDIT_STATUS = {
  both: '审计席 1 名 · 上限 5 名',
  background: '仅节点巡检 · 上限 5 名',
  finalReview: '仅交付终审 · 上限 5 名',
  none: '不设审计席 · 上限 4 名',
}

/** 两个开关都关时，审计模型行的说明。 */
export const AUDITOR_DISABLED_HINT = '未启用审计席，当前不生效（已保存配置保留）'

/** 由两个布尔取组合键。 */
export function auditModeKey(mode) {
  const background = mode?.background !== false
  const finalReview = mode?.finalReview !== false
  if (background && finalReview) return 'both'
  if (background) return 'background'
  if (finalReview) return 'finalReview'
  return 'none'
}

/** 跟随默认这一选项的标签。 */
export const DEFAULT_LABEL = '跟随 DSH 默认'

/** 推理等级选择器的标签。宿主只在模型声明 reasoning.efforts 时才显示该行。 */
export const REASONING_LABEL = '推理等级'

/** 未指定推理等级时的标签：跟随模型默认。 */
export const REASONING_DEFAULT_LABEL = '跟随模型默认'

/** 推理等级的简短说明（只在数据层描述里使用，界面不再逐档重复这句）。 */
export const REASONING_HINT = '空值表示跟随该模型的默认档位。'

/** 生效范围声明。 */
export const EFFECT_SCOPE_NOTICE = '仅影响本插件新创建的成员，不改主对话与全局默认；未授权路由不予派发。'
