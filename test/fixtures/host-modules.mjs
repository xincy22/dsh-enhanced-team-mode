// 仅用于入口接线测试：提供 index.js 依赖的宿主包最小替身。
export function createUserMessage({ content, source }) {
  return { id: 'inj-' + (++counter), role: 'user', content, source }
}
let counter = 0

export function defineTool(descriptor) {
  return descriptor
}
