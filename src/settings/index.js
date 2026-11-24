/**
 * index.js — 设置模块对外的唯一入口。
 *
 * T5 接入时只从这里导入，模块内部文件可以重组而不影响入口。
 * 本文件不引用任何宿主包，因此可以在没有 Cordis 的情况下被测试直接导入。
 */

export { SettingsError } from './errors.js'
export {
  AUDITOR_DISABLED_HINT, AUDIT_MODES, AUDIT_MODE_HINTS, AUDIT_MODE_LABELS, AUDIT_STATUS,
  DEFAULT_LABEL, EFFECT_SCOPE_NOTICE, REASONING_DEFAULT_LABEL, REASONING_HINT, REASONING_LABEL,
  ROLES, ROLE_HINTS, ROLE_LABELS, SEAT_EN_NAMES, SEAT_INSTANCE_NAMES, SELECT_HINT, auditModeKey,
} from './constants.js'
export { createSettingsSchema, emptySettings, normalizeSettings } from './schema.js'
export { createCatalog, createHostCatalog } from './catalog.js'
export { normalizeAuthorized, resolveAlias, resolveRole, toAgentOptions } from './resolve.js'
export { mutateAuditMode, mutateOps, readSettings } from './persist.js'
export { describeAuditMode, describeRole, describeRoles } from './describe.js'
