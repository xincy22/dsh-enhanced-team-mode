/**
 * detect.js — 判断一条真人消息是否「明确另起独立任务」。
 *
 * 只会返回 true 的场合：句首附近出现明确的另起任务说法（新任务：、另起一个任务、
 * 换一个任务、开始新的任务、独立的另一件事之外的英文等价说法），且没有被否定词
 * 或引号包住。含糊、追问、意见调整、返工一律 false —— 宁可漏判，不可误判：
 * 误判会让主对话在同一任务里重复收到协作指令。
 *
 * 纯函数，无宿主依赖，便于单测。
 */

/** 引号内的内容视为引用而非指令。 */
const QUOTED = /“[^”]*”|「[^」]*」|『[^』]*』|"[^"]*"|'[^']*'/g

/** 只看句首一段，避免长文档中段偶然出现关键词。 */
const SCAN_CHARS = 80

/** 否定或撤回语境。 */
const NEGATION = /(不要|别|不用|无需|不必|先不|暂不|别急着|取消|撤销|不想|don't|do not|no need to)\s*$/

/** 高置信度的「另起任务」说法。 */
const STRONG = [
  /^\s*新任务\s*[:：]/,
  /(?:^|[\s，。；;：:、])新任务\s*[:：]/,
  /另起(?:一)?(?:个|项)?(?:独立的)?任务/,
  /另开(?:一)?(?:个|项)?(?:独立的)?任务/,
  /另外(?:再)?起(?:一)?(?:个|项)?任务/,
  /换(?:一)?(?:个|项)任务/,
  /开始(?:一)?(?:个|项)?(?:新的|另一项|另一个|全新的)?任务/,
  /这(?:是|算)(?:一个|一项)?(?:全新的|新的|新|独立的)(?:任务|工作)/,
  /^\s*new\s+task\b/i,
  /\bstart\s+(?:a|an)\s+(?:new|another|separate)\s+task\b/i,
  /\bswitch(?:ing)?\s+to\s+(?:a|an)?\s*(?:new|another|different)\s+task\b/i,
  /\b(?:completely|entirely)\s+(?:new|different)\s+task\b/i,
]

/**
 * 是否为明确的另起任务指令。
 * @param {unknown} text - 真人消息的文本。
 * @returns {boolean} 高置信度为 true；其余一律 false。
 */
export function isExplicitNewTask(text) {
  if (typeof text !== 'string') return false
  const trimmed = text.trim()
  if (trimmed.length === 0) return false
  const sample = trimmed.replace(QUOTED, ' ').slice(0, SCAN_CHARS)
  for (const pattern of STRONG) {
    const match = pattern.exec(sample)
    if (match === null) continue
    const before = sample.slice(Math.max(0, match.index - 12), match.index)
    if (NEGATION.test(before)) continue
    return true
  }
  return false
}
