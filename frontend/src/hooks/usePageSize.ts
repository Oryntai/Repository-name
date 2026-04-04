import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import * as Y from 'yjs'

const DEFAULT_W = 1600
const DEFAULT_H = 900
const MIN_W = 400
const MIN_H = 300

export interface PageSize {
  w: number
  h: number
  setSize: (w: number, h: number) => void
}

export const PageSizeContext = createContext<PageSize>({
  w: DEFAULT_W,
  h: DEFAULT_H,
  setSize: () => {},
})

export function usePageSizeProvider(doc: Y.Doc | null): PageSize {
  const [w, setW] = useState(DEFAULT_W)
  const [h, setH] = useState(DEFAULT_H)

  useEffect(() => {
    if (!doc) return

    const ySettings = doc.getMap('canvas-settings')

    const sync = () => {
      setW((ySettings.get('pageW') as number) || DEFAULT_W)
      setH((ySettings.get('pageH') as number) || DEFAULT_H)
    }

    // Initialize defaults if empty
    if (!ySettings.has('pageW')) {
      doc.transact(() => {
        ySettings.set('pageW', DEFAULT_W)
        ySettings.set('pageH', DEFAULT_H)
      })
    }

    ySettings.observe(sync)
    sync()

    return () => ySettings.unobserve(sync)
  }, [doc])

  const setSize = useCallback(
    (newW: number, newH: number) => {
      if (!doc) return
      const cw = Math.max(MIN_W, Math.round(newW))
      const ch = Math.max(MIN_H, Math.round(newH))
      const ySettings = doc.getMap('canvas-settings')
      doc.transact(() => {
        ySettings.set('pageW', cw)
        ySettings.set('pageH', ch)
      })
    },
    [doc],
  )

  return { w, h, setSize }
}

export function usePageSize(): PageSize {
  return useContext(PageSizeContext)
}
