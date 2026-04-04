import { useEditor, useValue } from 'tldraw'
import { usePageSize } from '../hooks/usePageSize'
import { useRef, useCallback } from 'react'

const DOT_COLOR = '#c8c8c8'
const DOT_RADIUS = 1
const GRID_SPACING = 20
const HANDLE = 8

export function DotGrid() {
  const editor = useEditor()
  const { w: PAGE_W, h: PAGE_H, setSize } = usePageSize()
  const dragRef = useRef<{ type: string; startX: number; startY: number; startW: number; startH: number } | null>(null)

  const { x, y, z } = useValue('camera', () => editor.getCamera(), [editor])

  const screenW = editor.getViewportScreenBounds().w
  const screenH = editor.getViewportScreenBounds().h

  const step = GRID_SPACING
  const offsetX = (x * z) % step
  const offsetY = (y * z) % step

  // Page in screen coords
  const px = x * z
  const py = y * z
  const pw = PAGE_W * z
  const ph = PAGE_H * z

  const onPointerDown = useCallback((type: string) => (e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    ;(e.target as SVGElement).setPointerCapture(e.pointerId)
    dragRef.current = { type, startX: e.clientX, startY: e.clientY, startW: PAGE_W, startH: PAGE_H }
  }, [PAGE_W, PAGE_H])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return
    const d = dragRef.current
    const dx = (e.clientX - d.startX) / z
    const dy = (e.clientY - d.startY) / z

    let newW = d.startW
    let newH = d.startH
    if (d.type === 'right' || d.type === 'corner') newW = d.startW + dx
    if (d.type === 'bottom' || d.type === 'corner') newH = d.startH + dy
    setSize(newW, newH)
  }, [z, setSize])

  const onPointerUp = useCallback(() => { dragRef.current = null }, [])

  return (
    <svg
      className="tl-grid"
      width="100%"
      height="100%"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <defs>
        <pattern
          id="dot-grid"
          x={offsetX}
          y={offsetY}
          width={step}
          height={step}
          patternUnits="userSpaceOnUse"
        >
          <circle cx={step / 2} cy={step / 2} r={DOT_RADIUS} fill={DOT_COLOR} />
        </pattern>
        <clipPath id="page-clip">
          <rect x={px} y={py} width={pw} height={ph} />
        </clipPath>
      </defs>

      {/* Grey background */}
      <rect width={screenW} height={screenH} fill="#e0e0e4" />

      {/* Drop shadow */}
      <rect x={px + 3} y={py + 3} width={pw} height={ph} fill="rgba(0,0,0,0.1)" />

      {/* White page */}
      <rect x={px} y={py} width={pw} height={ph} fill="#ffffff" stroke="#b0b0b8" strokeWidth={1} />

      {/* Dot grid inside page */}
      <rect width={screenW} height={screenH} fill="url(#dot-grid)" clipPath="url(#page-clip)" />

      {/* Resize handle: right edge */}
      <rect
        x={px + pw - 1}
        y={py + ph / 2 - HANDLE}
        width={HANDLE}
        height={HANDLE * 2}
        rx={2}
        fill="#4a90d9"
        stroke="#fff"
        strokeWidth={1}
        style={{ cursor: 'ew-resize', pointerEvents: 'all' }}
        onPointerDown={onPointerDown('right')}
      />

      {/* Resize handle: bottom edge */}
      <rect
        x={px + pw / 2 - HANDLE}
        y={py + ph - 1}
        width={HANDLE * 2}
        height={HANDLE}
        rx={2}
        fill="#4a90d9"
        stroke="#fff"
        strokeWidth={1}
        style={{ cursor: 'ns-resize', pointerEvents: 'all' }}
        onPointerDown={onPointerDown('bottom')}
      />

      {/* Resize handle: bottom-right corner */}
      <rect
        x={px + pw - 1}
        y={py + ph - 1}
        width={HANDLE}
        height={HANDLE}
        rx={2}
        fill="#4a90d9"
        stroke="#fff"
        strokeWidth={1}
        style={{ cursor: 'nwse-resize', pointerEvents: 'all' }}
        onPointerDown={onPointerDown('corner')}
      />
    </svg>
  )
}
