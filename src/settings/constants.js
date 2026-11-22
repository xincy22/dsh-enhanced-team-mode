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
  mechanical: '机械执行模型',
}

/** 角色用途说明，供设置页副标题使用。 */
export const ROLE_HINTS = {
  auditor: '独立审计成员使用此默认模型，可与任一执行模型相同。',
  executor: '调研、设计、实现等需要较强能力的执行成员（最多 3 名）共用此默认模型。',
  mechanical: '只需按指令无脑执行的成员（最多 1 名）使用此默认模型，可与能力型执行模型相同。',
}

/** 跟随默认这一选项的标签。 */
export const DEFAULT_LABEL = '跟随 DSH 默认（新成员继承父路由）'

/** 生效范围声明：PLAN 要求页面明确告知，且不得暗示影响主对话或全局默认。 */
export const EFFECT_SCOPE_NOTICE = '只影响本插件在团队模式下新创建的成员；在跑与空闲的已有成员保留当前模型。'
  + '不改变主对话模型、普通子代理或 DSH 的全局默认模型。'
