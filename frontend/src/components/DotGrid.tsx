import { useEditor, useValue } from 'tldraw'

const DOT_COLOR = '#c8c8c8'
const DOT_RADIUS = 1
const GRID_SPACING = 20 // px on screen — matches the reference density

export function DotGrid() {
  const editor = useEditor()

  const { x, y, z } = useValue('camera', () => editor.getCamera(), [editor])

  const screenW = editor.getViewportScreenBounds().w
  const screenH = editor.getViewportScreenBounds().h

  // Fixed visual spacing that stays constant regardless of zoom
  const step = GRID_SPACING

  // Offset so dots scroll with the canvas
  const offsetX = (x * z) % step
  const offsetY = (y * z) % step

  const id = `dot-grid`

  return (
    <svg className="tl-grid" width="100%" height="100%">
      <defs>
        <pattern
          id={id}
          x={offsetX}
          y={offsetY}
          width={step}
          height={step}
          patternUnits="userSpaceOnUse"
        >
          <circle cx={step / 2} cy={step / 2} r={DOT_RADIUS} fill={DOT_COLOR} />
        </pattern>
      </defs>
      <rect width={screenW} height={screenH} fill={`url(#${id})`} />
    </svg>
  )
}
