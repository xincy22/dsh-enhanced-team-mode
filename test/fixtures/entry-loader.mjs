// Node module customize hook，仅用于入口接线测试：
//  - 宿主 dsh-llm/dsh-tools 用最小替身（真实宿主包无法从插件目录的 bare import 解析）；
//  - schemastery 按本机已安装 DSH profile / 应用目录解析真实 @deepseek-ai/schemastery；
//  - index.js 本身是磁盘上的真实入口文件。
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const fixture = pathToFileURL(fileURLToPath(new URL('./host-modules.mjs', import.meta.url))).href

function findSchemasteryEntry() {
  const candidates = [
    join(homedir(), '.dsh', 'profiles', 'desktop', 'node_modules', '@deepseek-ai', 'schemastery', 'lib', 'index.mjs'),
    '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/schemastery/lib/index.mjs',
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return pathToFileURL(candidate).href
  }
  return null
}

const realSchemastery = findSchemasteryEntry()
const map = new Map([
  ['@deepseek-ai/dsh-llm', fixture],
  ['@deepseek-ai/dsh-tools', fixture],
  ...(realSchemastery ? [['@deepseek-ai/schemastery', realSchemastery]] : []),
])

export async function resolve(specifier, context, nextResolve) {
  if (map.has(specifier)) return { url: map.get(specifier), shortCircuit: true }
  return nextResolve(specifier, context)
}
