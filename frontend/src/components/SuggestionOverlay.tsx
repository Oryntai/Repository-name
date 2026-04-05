import type { Editor, TLShapeId } from 'tldraw'
import './SuggestionOverlay.css'

interface SuggestionOverlayProps {
  editor: Editor
  shapeId: TLShapeId
  shapeX: number
  shapeY: number
  text: string
  onAccept: () => void
  onDismiss: () => void
}

export function SuggestionOverlay({
  editor,
  shapeId,
  shapeX,
  shapeY,
  text,
  onAccept,
  onDismiss,
}: SuggestionOverlayProps) {
  const shape = editor.getShape(shapeId)
  if (!shape) return null

  const w = (shape.props as any)?.w || 200
  const point = editor.pageToViewport({ x: shapeX + w / 2, y: shapeY })
  const screenX = point.x
  const screenY = point.y - 12

  return (
    <div
      className="suggestion-overlay"
      style={{ left: screenX, top: screenY }}
    >
      <div className="suggestion-pill">
        <span className="suggestion-text">{text}</span>
        <div className="suggestion-actions">
          <button className="suggestion-btn accept" onClick={onAccept} title="Accept">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
          <button className="suggestion-btn dismiss" onClick={onDismiss} title="Dismiss">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
