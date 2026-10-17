import { StateEffect, StateField } from '@codemirror/state'

/** 当前标签对应的磁盘路径；图片相对路径与拖拽本地化都依赖它 */
export const setDocPath = StateEffect.define<string>()

export const docPathField = StateField.define<string>({
  create: () => '',
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setDocPath)) value = effect.value
    }
    return value
  }
})
