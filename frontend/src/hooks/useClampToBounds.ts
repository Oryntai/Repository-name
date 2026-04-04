import type { Editor } from 'tldraw'

/**
 * Boundary enforcement for shapes.
 *
 * Visual clipping is handled by the PageMask component (CSS clip-path on
 * .tl-shapes).  No programmatic position clamping is applied so that
 * tldraw's built-in tools (create, select, drag, resize, double-click to
 * edit) work without interference.
 */
export function useClampToBounds(_editor: Editor | null) {
  // intentionally empty – PageMask handles visual clipping
}
