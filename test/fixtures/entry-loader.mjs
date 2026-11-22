// Node module customize hook，仅用于入口接线测试：
//  - 宿主 dsh-llm/dsh-tools 用最小替身（真实宿主包无法从插件目录的 bare import 解析）；
//  - schemastery 指到本机已安装 profile 里的真实 @deepseek-ai/schemastery@3.19.0；
//  - index.js 本身是磁盘上的真实入口文件。
import { pathToFileURL } from 'node:url'

const fixture = pathToFileURL(new URL('./host-modules.mjs', import.meta.url).pathname.replace(/^\//, '')).href
const realSchemastery = 'file:///C:/Users/xincy/.dsh/profiles/desktop/node_modules/@deepseek-ai/schemastery/lib/index.mjs'
const map = new Map([
  ['@deepseek-ai/dsh-llm', fixture],
  ['@deepseek-ai/dsh-tools', fixture],
  ['@deepseek-ai/schemastery', realSchemastery],
])

export async function resolve(specifier, context, nextResolve) {
  if (map.has(specifier)) return { url: map.get(specifier), shortCircuit: true }
  return nextResolve(specifier, context)
}
