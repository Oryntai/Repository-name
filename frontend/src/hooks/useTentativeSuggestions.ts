import { useEffect, useRef, useCallback, useState } from 'react'
import type { Editor, TLShapeId } from 'tldraw'
import * as Y from 'yjs'

const INACTIVITY_DELAY = 4000
const COOLDOWN = 25000

interface TentativeShape {
  id: TLShapeId
  x: number
  y: number
  text: string
}

export function useTentativeSuggestions(
  editor: Editor | null,
  doc: Y.Doc | null,
) {
  const [tentative, setTentative] = useState<TentativeShape | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()
  const cooldownRef = useRef(0)
  const editorRef = useRef(editor)
  editorRef.current = editor
  const pausedRef = useRef(false)

  // Watch for tentative shapes appearing in the store
  useEffect(() => {
    if (!editor) return

    const check = () => {
      const shapes = editor.getCurrentPageShapes()
      const t = shapes.find((s) => (s.meta as any)?.tentative === true)
      if (t) {
        setTentative({
          id: t.id,
          x: t.x,
          y: t.y,
          text: (t.props as any)?.text || '',
        })
      } else {
        setTentative(null)
      }
    }

    const unsub = editor.store.listen(check, { source: 'all', scope: 'document' })
    check()
    return unsub
  }, [editor])

  // Watch for drawing activity and trigger suggestions after inactivity
  useEffect(() => {
    if (!editor || !doc) return

    const unsub = editor.store.listen(
      (entry) => {
        const hasDrawChange = Object.values(entry.changes.added).some(
          (r) => r.typeName === 'shape' && (r as any).type === 'draw',
        ) || Object.values(entry.changes.updated).some(
          ([, to]) => to.typeName === 'shape' && (to as any).type === 'draw',
        )

        if (!hasDrawChange) return
        if (pausedRef.current) return

        clearTimeout(timerRef.current)

        timerRef.current = setTimeout(() => {
          if (Date.now() - cooldownRef.current < COOLDOWN) return
          if (pausedRef.current) return
          const shapes = editorRef.current?.getCurrentPageShapes() || []
          if (shapes.some((s) => (s.meta as any)?.tentative)) return

          requestSuggestion()
        }, INACTIVITY_DELAY)
      },
      { source: 'user', scope: 'document' },
    )

    return () => {
      unsub()
      clearTimeout(timerRef.current)
    }
  }, [editor, doc])

  async function requestSuggestion() {
    const ed = editorRef.current
    if (!ed || !doc) return

    const shapeIds = [...ed.getCurrentPageShapeIds()]
    if (shapeIds.length === 0) return

    cooldownRef.current = Date.now()

    try {
      const allBounds = ed.getCurrentPageBounds()
      if (!allBounds) return

      const svg = await (ed as any).getSvg(shapeIds)
      if (!svg) return

      const svgString = new XMLSerializer().serializeToString(svg)
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(svgBlob)

      const image = await new Promise<string | null>((resolve) => {
        const img = new Image()
        img.onload = () => {
          const scale = Math.min(1, 800 / Math.max(img.width, img.height))
          const w = Math.round(img.width * scale)
          const h = Math.round(img.height * scale)
          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d')!
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, w, h)
          ctx.drawImage(img, 0, 0, w, h)
          URL.revokeObjectURL(url)
          resolve(canvas.toDataURL('image/jpeg', 0.5))
        }
        img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
        img.src = url
      })

      if (!image) return

      const ySuggestions = doc.getArray('suggestions')
      ySuggestions.push([{
        type: 'request',
        image,
        timestamp: Date.now(),
      }])
    } catch (err) {
      console.warn('[suggestions] Capture failed:', err)
    }
  }

  const accept = useCallback(() => {
    if (!editor || !tentative || !doc) return
    const text = tentative.text
    // Remove the ghost note
    editor.deleteShape(tentative.id)
    // Send accepted suggestion to server for real execution
    const ySuggestions = doc.getArray('suggestions')
    ySuggestions.push([{
      type: 'accepted',
      text,
      timestamp: Date.now(),
    }])
    // Pause suggestions
    cooldownRef.current = Date.now()
    pausedRef.current = true
    clearTimeout(timerRef.current)
    setTimeout(() => { pausedRef.current = false }, COOLDOWN)
    setTentative(null)
  }, [editor, tentative, doc])

  const dismiss = useCallback(() => {
    if (!editor || !tentative) return
    editor.deleteShape(tentative.id)
    // Pause suggestions
    cooldownRef.current = Date.now()
    pausedRef.current = true
    clearTimeout(timerRef.current)
    setTimeout(() => { pausedRef.current = false }, COOLDOWN)
    setTentative(null)
  }, [editor, tentative])

  return { tentative, accept, dismiss }
}
