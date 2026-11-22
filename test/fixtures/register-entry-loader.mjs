// 为 node --test 注册模块钩子：真实 index.js 用真实 schemastery，
// 仅 dsh-llm / dsh-tools 两个宿主包用最小替身。
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

const here = new URL('./', import.meta.url)
register(new URL('./entry-loader.mjs', here).href, here)
