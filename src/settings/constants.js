/**
 * constants.js — 角色、标签与生效范围声明的唯一副本。
 *
 * 文案集中在这里，设置页与派发侧共用，避免两处说法不一致。
 */

/** 三个角色，顺序即设置页顺序：审计、能力型执行、机械执行。 */
export const ROLES = ['auditor', 'executor', 'mechanical']

/** 角色中文名。 */
export const ROLE_LABELS = {
  auditor: '审计模型',
  executor: '能力型执行模型',
  mechanical: '讲解模型',
}

/**
 * 角色用途说明，供设置页的每档副标题使用。
 * 只写该档区别于其他档的信息（名额 + 职责），一行内说完，避免三档重复同一套句式。
 */
export const ROLE_HINTS = {
  auditor: '审计席（1 名）：开工研判 + 交付终审',
  executor: '执行席（≤3 名）：调研、设计、实现',
  mechanical: '讲解席（1 名）：讲清项目机制、接口与实现路径，建议与执行席同级',
}

/** 顶部唯一一句说明：模型与推理等级合在一个控件里，推理等级只在模型声明档位时可选。 */
export const SELECT_HINT = '每档为新建成员选「模型 + 推理等级」；空值跟随 DSH 默认，推理等级仅在模型声明档位时可选。'

/** 两个审计能力开关的键，顺序即设置页顺序。 */
export const AUDIT_MODES = ['background', 'finalReview']

/** 开关标签。 */
export const AUDIT_MODE_LABELS = {
  background: '后台持续审计',
  finalReview: '交付终审',
}

/** 开关说明。 */
export const AUDIT_MODE_HINTS = {
  background: '从需求提出起跟随所有活跃席位，按任务切换对象；只报问题，不产出交付物。',
  finalReview: '每个交付物由审计席判定通过、退回或阻塞；通过前不得报告完成。',
}

/** 组合状态行：两个开关决定审计席是否存在与承担什么。 */
export const AUDIT_STATUS = {
  both: '审计席 1 名：后台巡检与交付终审（团队上限 5 名）',
  background: '审计席 1 名：仅后台巡检，交付不设终审（团队上限 5 名）',
  finalReview: '审计席 1 名：仅交付终审（团队上限 5 名）',
  none: '不设审计席（团队上限 4 名）',
}

/** 两个开关都关时，审计模型行的说明。 */
export const AUDITOR_DISABLED_HINT = '未启用审计席，此档暂不生效；已保存的选择保留'

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
export const DEFAULT_LABEL = '跟随 DSH 默认（新成员继承父路由）'

/** 推理等级选择器的标签。宿主只在模型声明 reasoning.efforts 时才显示该行。 */
export const REASONING_LABEL = '推理等级'

/** 未指定推理等级时的标签：跟随模型默认。 */
export const REASONING_DEFAULT_LABEL = '跟随模型默认'

/** 推理等级的简短说明（只在数据层描述里使用，界面不再逐档重复这句）。 */
export const REASONING_HINT = '空值表示跟随该模型的默认档位。'

/** 生效范围声明：一句话覆盖「只影响新建成员」与「未授权路由不会被派发」两个要点。 */
export const EFFECT_SCOPE_NOTICE = '只影响本插件新创建的成员，不改主对话与全局默认；未授权路由不会被派发。'
