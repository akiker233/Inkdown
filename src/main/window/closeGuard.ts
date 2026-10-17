/**
 * 未保存状态由渲染进程上报，主进程在窗口关闭时据此拦截。
 * 之所以不在主进程跟踪文档内容，是因为编辑器内容只在渲染进程里是权威的。
 */
let documentDirty = false

export function setDocumentDirty(dirty: boolean): void {
  documentDirty = dirty
}

export function isDocumentDirty(): boolean {
  return documentDirty
}
