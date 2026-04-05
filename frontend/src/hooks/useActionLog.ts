import { useEffect, useRef } from 'react'
import type { Editor, TLRecord } from 'tldraw'
import * as Y from 'yjs'

/**
 * Logs meaningful user actions to Yjs `action-log` array.
 * The server reads these to give AI full context of what users are doing.
 */
export function useActionLog(
  editor: Editor | null,
  doc: Y.Doc | null,
  userName: string,
) {
  const userNameRef = useRef(userName)
  userNameRef.current = userName

  useEffect(() => {
    if (!editor || !doc) return

    const yLog = doc.getArray('action-log')

    function push(action: string) {
      yLog.push([{
        user: userNameRef.current,
        action,
        timestamp: Date.now(),
      }])
    }

    function describeShape(record: TLRecord): string {
      const r = record as any
      const type = r.type || r.typeName
      const x = Math.round(r.x || 0)
      const y = Math.round(r.y || 0)

      let desc = `${type} at (${x},${y})`

      if (r.props?.text) {
        desc += ` text="${r.props.text.substring(0, 50)}"`
      }
      if (r.props?.label) {
        desc += ` label="${r.props.label.substring(0, 50)}"`
      }
      if (r.props?.color) {
        desc += ` color=${r.props.color}`
      }
      if (r.props?.w && r.props?.h) {
        desc += ` size=${Math.round(r.props.w)}x${Math.round(r.props.h)}`
      }
      return desc
    }

    const unsub = editor.store.listen(
      (entry) => {
        // Added shapes
        for (const record of Object.values(entry.changes.added)) {
          if (record.typeName !== 'shape') continue
          push(`added ${describeShape(record)}`)
        }

        // Updated shapes — only log meaningful changes (text, position, size)
        for (const [, [from, to]] of Object.entries(entry.changes.updated)) {
          if (to.typeName !== 'shape') continue
          const f = from as any
          const t = to as any

          // Text changed
          const oldText = f.props?.text || f.props?.label || ''
          const newText = t.props?.text || t.props?.label || ''
          if (newText && newText !== oldText) {
            push(`edited text on ${t.type} at (${Math.round(t.x)},${Math.round(t.y)}): "${newText.substring(0, 50)}"`)
            continue
          }

          // Moved significantly (>20px)
          const dx = Math.abs((t.x || 0) - (f.x || 0))
          const dy = Math.abs((t.y || 0) - (f.y || 0))
          if (dx > 20 || dy > 20) {
            push(`moved ${t.type} to (${Math.round(t.x)},${Math.round(t.y)})`)
            continue
          }

          // Resized
          const oldW = f.props?.w || 0
          const newW = t.props?.w || 0
          const oldH = f.props?.h || 0
          const newH = t.props?.h || 0
          if (Math.abs(newW - oldW) > 10 || Math.abs(newH - oldH) > 10) {
            push(`resized ${t.type} to ${Math.round(newW)}x${Math.round(newH)}`)
          }
        }

        // Deleted shapes
        for (const record of Object.values(entry.changes.removed)) {
          if (record.typeName !== 'shape') continue
          const r = record as any
          const label = r.props?.text || r.props?.label || r.type
          push(`deleted ${label}`)
        }
      },
      { source: 'user', scope: 'document' },
    )

    return unsub
  }, [editor, doc])
}
