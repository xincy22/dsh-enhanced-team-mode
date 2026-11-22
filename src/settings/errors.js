/**
 * errors.js — 设置模块的类型化错误。
 *
 * 所有失败都抛错，调用方必须把码与说明报给用户；任何一处都不返回替代路由。
 */

/** 设置模块错误：稳定的 code 加人可读说明。 */
export class SettingsError extends Error {
  /**
   * @param {string} code - 稳定错误码，形如 SETTINGS_*。
   * @param {string} message - 说明。
   * @param {object} [details] - 诊断附加信息。
   */
  constructor(code, message, details = {}) {
    super(code + ': ' + message)
    this.name = 'SettingsError'
    this.code = code
    this.details = details
  }
}
