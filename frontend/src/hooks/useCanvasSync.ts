import { useEffect, useRef } from 'react'
import type { Editor, TLRecord } from 'tldraw'
import type { WebsocketProvider } from 'y-websocket'
import type * as Y from 'yjs'

const SYNCED_TYPES = new Set(['document', 'page', 'shape', 'asset', 'binding'])

function isSyncable(record: TLRecord): boolean {
  return SYNCED_TYPES.has(record.typeName)
}

export function useCanvasSync(
  editor: Editor | null,
  doc: Y.Doc | null,
  provider: WebsocketProvider | null,
) {
  const didSyncRef = useRef(false)
  const cleanups = useRef<(() => void)[]>([])

  useEffect(() => {
    if (!editor || !doc || !provider) return
    didSyncRef.current = false

    const yStore = doc.getMap('tldraw')

    const applyRemoteRecords = () => {
      if (yStore.size === 0) return

      const remoteRecords: TLRecord[] = []
      yStore.forEach((value) => remoteRecords.push(value as TLRecord))

      const localDocRecords = editor.store.allRecords().filter(isSyncable)
      const remoteIds = new Set(remoteRecords.map((r) => r.id))

      editor.store.mergeRemoteChanges(() => {
        const toRemove = localDocRecords
          .filter((r) => !remoteIds.has(r.id))
          .map((r) => r.id)
        if (toRemove.length) editor.store.remove(toRemove)
        editor.store.put(remoteRecords)
      })

      console.log(`[sync] Applied ${remoteRecords.length} remote records`)
    }

    const handleSync = (synced: boolean) => {
      if (!synced || didSyncRef.current) return
      didSyncRef.current = true

      // --- Initial load ---
      if (yStore.size > 0) {
        applyRemoteRecords()
      } else {
        doc.transact(() => {
          for (const record of editor.store.allRecords()) {
            if (isSyncable(record)) {
              yStore.set(record.id, structuredClone(record))
            }
          }
        })
      }

      // Safety: re-apply after a short delay in case of race conditions
      setTimeout(() => {
        if (yStore.size > 0) {
          applyRemoteRecords()
        }
      }, 1000)

      // --- Bidirectional sync ---

      // Local -> Yjs
      const unsubLocal = editor.store.listen(
        (entry) => {
          doc.transact(() => {
            for (const record of Object.values(entry.changes.added)) {
              if (isSyncable(record))
                yStore.set(record.id, structuredClone(record))
            }
            for (const [, [, to]] of Object.entries(entry.changes.updated)) {
              if (isSyncable(to)) yStore.set(to.id, structuredClone(to))
            }
            for (const record of Object.values(entry.changes.removed)) {
              if (isSyncable(record)) yStore.delete(record.id)
            }
          })
        },
        { source: 'user', scope: 'document' },
      )
      cleanups.current.push(unsubLocal)

      // Yjs -> Local
      // We compare incoming records by value to avoid the "echo" problem:
      // local change → Yjs → observer → store.put(structuredClone) would
      // overwrite the store with a new object reference even though the data
      // is identical, which can interfere with tldraw's active tool state.
      const handleYjsUpdate = (event: Y.YMapEvent<unknown>) => {
        editor.store.mergeRemoteChanges(() => {
          event.changes.keys.forEach((change, key) => {
            switch (change.action) {
              case 'add':
              case 'update': {
                const record = yStore.get(key) as TLRecord
                if (!record) break
                // Skip the echo: if the local store already has this exact data, do nothing.
                const existing = editor.store.get(key as TLRecord['id'])
                if (
                  existing &&
                  change.action === 'update' &&
                  existing.typeName === (record as any).typeName &&
                  JSON.stringify(existing) === JSON.stringify(record)
                ) {
                  break
                }
                editor.store.put([record])
                break
              }
              case 'delete': {
                try {
                  editor.store.remove([key as TLRecord['id']])
                } catch {
                  // already deleted locally
                }
                break
              }
            }
          })
        })
      }
      yStore.observe(handleYjsUpdate)
      cleanups.current.push(() => yStore.unobserve(handleYjsUpdate))
    }

    provider.on('sync', handleSync)
    if (provider.synced) handleSync(true)

    return () => {
      cleanups.current.forEach((fn) => fn())
      cleanups.current = []
      provider.off('sync', handleSync)
    }
  }, [editor, doc, provider])
}
