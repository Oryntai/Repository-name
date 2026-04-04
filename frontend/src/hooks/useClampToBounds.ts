import { useEffect } from 'react'
import type { Editor, TLShape } from 'tldraw'
import { usePageSize } from './usePageSize'

/**
 * Clamps non-draw shapes (sticky notes, images, geo, arrows) to stay within the page.
 * Draw shapes are handled visually by the DotGrid overlay mask.
 */
export function useClampToBounds(editor: Editor | null) {
  const { w: pageW, h: pageH } = usePageSize()

  useEffect(() => {
    if (!editor) return

    const clamp = (shape: TLShape): TLShape => {
      // Don't clamp frames or draw shapes (draw is visually masked)
      if (shape.type === 'frame' || shape.type === 'draw' || shape.type === 'highlight') return shape

      const sw = (shape.props as any)?.w ?? 200
      const sh = (shape.props as any)?.h ?? 200
      const cx = Math.max(0, Math.min(shape.x, pageW - Math.min(sw, pageW)))
      const cy = Math.max(0, Math.min(shape.y, pageH - Math.min(sh, pageH)))

      if (cx !== shape.x || cy !== shape.y) {
        return { ...shape, x: cx, y: cy }
      }
      return shape
    }

    const removeCreate = editor.sideEffects.registerBeforeCreateHandler('shape', clamp)
    const removeChange = editor.sideEffects.registerBeforeChangeHandler('shape', (_prev, next) => clamp(next))

    return () => {
      removeCreate()
      removeChange()
    }
  }, [editor, pageW, pageH])
}
