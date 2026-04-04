import { useEffect, useRef } from 'react'
import type { Editor } from 'tldraw'
import { usePageSize } from '../hooks/usePageSize'

/**
 * Clips tldraw shapes to the page boundary.
 * Uses clip-path in canvas coordinates on the .tl-shapes element
 * (which is already transformed by the camera, so we use world coords).
 */
export function PageMask({ editor }: { editor: Editor }) {
  const { w: pageW, h: pageH } = usePageSize()
  const rafRef = useRef(0)

  useEffect(() => {
    const shapesEl = document.querySelector('.tl-shapes') as HTMLElement | null
    if (!shapesEl) return

    // .tl-shapes is in canvas/world coordinates (camera transform is applied to it)
    // So we clip using canvas coordinates directly
    shapesEl.style.clipPath = `polygon(0px 0px, ${pageW}px 0px, ${pageW}px ${pageH}px, 0px ${pageH}px)`

    return () => {
      shapesEl.style.clipPath = ''
    }
  }, [editor, pageW, pageH])

  return null
}
