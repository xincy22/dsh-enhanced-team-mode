import test from 'node:test'
import assert from 'node:assert/strict'
import { isExplicitNewTask } from '../src/inject/detect.js'

const EXPLICIT = [
  '新任务：整理依赖清单',
  '我们开始另一个任务，把导出脚本补齐',
  '另起一个任务：修一下打包配置',
  '换一个任务，先做安装文档',
  '这是一个新任务，请从零核对接口',
  'New task: write the migration notes',
  'Start a separate task on the release script',
]

const NOT_EXPLICIT = [
  '继续把刚才的测试补上',
  '顺便也看看日志格式',
  '另外把错误码统一一下',
  '改一下这个函数的命名',
  '修复刚才那个失败用例',
  '返工：上一版漏了边界条件',
  '还有，把 README 的示例更新一下',
  '补充一句：不要动公共接口',
  '接着做第二步',
  '这个任务还要加一个用例',
  'Continue with the tests we started',
  'Also update the changelog',
]

for (const text of EXPLICIT) {
  test('明确另起任务：' + text, () => {
    assert.equal(isExplicitNewTask(text), true)
  })
}

for (const text of NOT_EXPLICIT) {
  test('不算另起任务：' + text, () => {
    assert.equal(isExplicitNewTask(text), false)
  })
}

test('空文本与非字符串不触发', () => {
  assert.equal(isExplicitNewTask(''), false)
  assert.equal(isExplicitNewTask(undefined), false)
  assert.equal(isExplicitNewTask(null), false)
})

test('引号内的引用不触发', () => {
  assert.equal(isExplicitNewTask('你之前说的“新任务：整理依赖”是什么意思'), false)
})
