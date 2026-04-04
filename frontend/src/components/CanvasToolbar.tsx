import { useEffect, useState, useCallback } from 'react'
import { Editor, DefaultColorStyle, DefaultSizeStyle } from 'tldraw'
import './CanvasToolbar.css'

const COLORS = [
  { id: 'black', hex: '#1d1d1d' },
  { id: 'red', hex: '#e03131' },
  { id: 'orange', hex: '#f76707' },
  { id: 'yellow', hex: '#ffc034' },
  { id: 'green', hex: '#099268' },
  { id: 'light-blue', hex: '#4dabf7' },
  { id: 'violet', hex: '#ae3ec9' },
  { id: 'grey', hex: '#adb5bd' },
] as const

const SIZES = ['s', 'm', 'l', 'xl'] as const

/** Re-render when editor store changes (RAF-throttled). */
function useEditorRerender(editor: Editor) {
  const [, update] = useState(0)
  useEffect(() => {
    let raf = 0
    const handler = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => update((n) => n + 1))
    }
    const unsub = editor.store.listen(handler)
    return () => {
      unsub()
      cancelAnimationFrame(raf)
    }
  }, [editor])
}

export function CanvasToolbar({ editor }: { editor: Editor }) {
  useEditorRerender(editor)

  // --- Current styles ---
  const styles = editor.getSharedStyles()

  const colorStyle = styles.get(DefaultColorStyle)
  const currentColor =
    colorStyle?.type === 'shared' ? colorStyle.value : 'black'

  const sizeStyle = styles.get(DefaultSizeStyle)
  const currentSize = sizeStyle?.type === 'shared' ? sizeStyle.value : 'm'
  const sizeIndex = Math.max(
    0,
    SIZES.indexOf(currentSize as (typeof SIZES)[number]),
  )

  // --- Zoom ---
  const zoom = Math.round(editor.getZoomLevel() * 100)

  const setColor = useCallback(
    (id: string) => {
      editor.setStyleForNextShapes(DefaultColorStyle, id as any)
      editor.setStyleForSelectedShapes(DefaultColorStyle, id as any)
    },
    [editor],
  )

  const setSize = useCallback(
    (index: number) => {
      editor.setStyleForNextShapes(DefaultSizeStyle, SIZES[index])
      editor.setStyleForSelectedShapes(DefaultSizeStyle, SIZES[index])
    },
    [editor],
  )

  return (
    <>
      {/* Color bar + size slider — sits above tldraw's toolbar */}
      <div className="custom-color-bar">
        {COLORS.map((c) => (
          <button
            key={c.id}
            className={`color-dot ${currentColor === c.id ? 'active' : ''}`}
            style={{ backgroundColor: c.hex }}
            onClick={() => setColor(c.id)}
          />
        ))}

        <div className="size-divider" />

        <input
          type="range"
          className="size-slider"
          min={0}
          max={3}
          step={1}
          value={sizeIndex}
          onChange={(e) => setSize(parseInt(e.target.value))}
        />
      </div>

      {/* Zoom control — bottom-left */}
      <div className="custom-zoom">
        <button onClick={() => editor.zoomOut()}>−</button>
        <span className="zoom-level" onClick={() => editor.resetZoom()}>
          {zoom}%
        </span>
        <button onClick={() => editor.zoomIn()}>+</button>
      </div>
    </>
  )
}
