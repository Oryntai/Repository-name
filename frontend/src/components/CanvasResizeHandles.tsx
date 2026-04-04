import { useCallback, useRef } from 'react'
import type { Editor } from 'tldraw'
import { usePageSize } from '../hooks/usePageSize'
import './CanvasResizeHandles.css'

interface Props {
  editor: Editor
}

type HandleType = 'right' | 'bottom' | 'corner'

export function CanvasResizeHandles({ editor }: Props) {
  const { w, h, setSize } = usePageSize()
  const dragging = useRef<{ type: HandleType; startX: number; startY: number; startW: number; startH: number } | null>(null)

  const toScreen = useCallback(
    (cx: number, cy: number) => {
      const cam = editor.getCamera()
      return { x: cx * cam.z + cam.x * cam.z, y: cy * cam.z + cam.y * cam.z }
    },
    [editor],
  )

  const onPointerDown = useCallback(
    (type: HandleType) => (e: React.PointerEvent) => {
      e.stopPropagation()
      e.preventDefault()
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      dragging.current = { type, startX: e.clientX, startY: e.clientY, startW: w, startH: h }
    },
    [w, h],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return
      const d = dragging.current
      const cam = editor.getCamera()
      const dx = (e.clientX - d.startX) / cam.z
      const dy = (e.clientY - d.startY) / cam.z

      let newW = d.startW
      let newH = d.startH
      if (d.type === 'right' || d.type === 'corner') newW = d.startW + dx
      if (d.type === 'bottom' || d.type === 'corner') newH = d.startH + dy

      setSize(newW, newH)
    },
    [editor, setSize],
  )

  const onPointerUp = useCallback(() => {
    dragging.current = null
  }, [])

  const cam = editor.getCamera()
  const HANDLE = 10

  // Position handles in screen coordinates
  const rightPos = toScreen(w, h / 2)
  const bottomPos = toScreen(w / 2, h)
  const cornerPos = toScreen(w, h)

  return (
    <div className="resize-handles" onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
      {/* Right edge handle */}
      <div
        className="resize-handle resize-handle-right"
        style={{
          left: rightPos.x - HANDLE / 2,
          top: rightPos.y - HANDLE,
          width: HANDLE,
          height: HANDLE * 2,
          cursor: 'ew-resize',
        }}
        onPointerDown={onPointerDown('right')}
      />
      {/* Bottom edge handle */}
      <div
        className="resize-handle resize-handle-bottom"
        style={{
          left: bottomPos.x - HANDLE,
          top: bottomPos.y - HANDLE / 2,
          width: HANDLE * 2,
          height: HANDLE,
          cursor: 'ns-resize',
        }}
        onPointerDown={onPointerDown('bottom')}
      />
      {/* Corner handle */}
      <div
        className="resize-handle resize-handle-corner"
        style={{
          left: cornerPos.x - HANDLE / 2,
          top: cornerPos.y - HANDLE / 2,
          width: HANDLE,
          height: HANDLE,
          cursor: 'nwse-resize',
        }}
        onPointerDown={onPointerDown('corner')}
      />
    </div>
  )
}
