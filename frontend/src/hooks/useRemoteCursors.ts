import { useEffect } from 'react'
import type { Editor } from 'tldraw'
import { InstancePresenceRecordType } from '@tldraw/tlschema'
import type { WebsocketProvider } from 'y-websocket'

const USER_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
  '#BB8FCE', '#85C1E9', '#F0B27A', '#82E0AA',
]

function colorForClient(clientId: number): string {
  return USER_COLORS[clientId % USER_COLORS.length]
}

/**
 * Syncs local cursor → Yjs awareness, and remote awareness → tldraw presence records.
 * This gives each remote user a colored cursor with their name.
 */
export function useRemoteCursors(
  editor: Editor | null,
  provider: WebsocketProvider | null,
) {
  useEffect(() => {
    if (!editor || !provider) return

    const awareness = provider.awareness
    const cleanups: (() => void)[] = []

    // --- Local → Awareness ---
    // Push local pointer, camera, and selection into awareness so others can see us.

    const pushLocal = () => {
      const user = editor.user.getUserPreferences()
      const camera = editor.getCamera()
      const pointer = editor.inputs.currentPagePoint
      const pageId = editor.getCurrentPageId()
      const selectedIds = editor.getSelectedShapeIds()

      awareness.setLocalStateField('presence', {
        odcursor: {
          x: pointer.x,
          y: pointer.y,
          type: 'default' as const,
          rotation: 0,
        },
        camera: { x: camera.x, y: camera.y, z: camera.z },
        currentPageId: pageId,
        selectedShapeIds: selectedIds,
        screenBounds: {
          x: 0,
          y: 0,
          w: window.innerWidth,
          h: window.innerHeight,
        },
        color: user.color ?? colorForClient(awareness.clientID),
        lastActivity: Date.now(),
      })
    }

    // Throttle pointer updates to ~30fps
    let rafId = 0
    let dirty = false
    const scheduleUpdate = () => {
      dirty = true
      if (!rafId) {
        rafId = requestAnimationFrame(() => {
          rafId = 0
          if (dirty) {
            dirty = false
            pushLocal()
          }
        })
      }
    }

    // Listen to pointer move + camera change + selection change
    const unsubPointer = editor.store.listen(scheduleUpdate, {
      source: 'user',
      scope: 'session',
    })
    cleanups.push(unsubPointer)

    // Also push on pointermove for smoother tracking
    const handlePointerMove = () => scheduleUpdate()
    const container = document.querySelector('.tl-container')
    container?.addEventListener('pointermove', handlePointerMove)
    cleanups.push(() =>
      container?.removeEventListener('pointermove', handlePointerMove),
    )

    // Initial push
    pushLocal()

    // --- Awareness → tldraw presence records ---
    const presenceIds = new Map<number, string>() // clientId → presence record id

    const syncRemotePresence = () => {
      const localClientId = awareness.clientID
      const states = awareness.getStates() as Map<number, Record<string, any>>
      const activeClients = new Set<number>()

      editor.store.mergeRemoteChanges(() => {
        states.forEach((state, clientId) => {
          if (clientId === localClientId) return
          const p = state.presence
          const userName = state.user?.name ?? `User-${clientId}`
          if (!p?.odcursor) return

          activeClients.add(clientId)

          const presenceId =
            presenceIds.get(clientId) ??
            InstancePresenceRecordType.createId(String(clientId))
          presenceIds.set(clientId, presenceId)

          const record = InstancePresenceRecordType.create({
            id: presenceId as any,
            userId: String(clientId),
            userName,
            currentPageId: p.currentPageId ?? editor.getCurrentPageId(),
            cursor: p.odcursor,
            color: p.color ?? colorForClient(clientId),
            camera: p.camera ?? { x: 0, y: 0, z: 1 },
            selectedShapeIds: p.selectedShapeIds ?? [],
            screenBounds: p.screenBounds ?? {
              x: 0,
              y: 0,
              w: 1920,
              h: 1080,
            },
            lastActivityTimestamp: p.lastActivity ?? Date.now(),
            brush: null,
            scribbles: [],
            followingUserId: null,
            chatMessage: '',
            meta: {},
          })

          editor.store.put([record])
        })

        // Remove stale presence records
        for (const [clientId, presenceId] of presenceIds.entries()) {
          if (!activeClients.has(clientId)) {
            try {
              editor.store.remove([presenceId as any])
            } catch {
              // already gone
            }
            presenceIds.delete(clientId)
          }
        }
      })
    }

    awareness.on('change', syncRemotePresence)
    cleanups.push(() => awareness.off('change', syncRemotePresence))

    // Initial sync
    syncRemotePresence()

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      cleanups.forEach((fn) => fn())

      // Clean up all presence records we created
      editor.store.mergeRemoteChanges(() => {
        for (const presenceId of presenceIds.values()) {
          try {
            editor.store.remove([presenceId as any])
          } catch {
            // ok
          }
        }
      })
    }
  }, [editor, provider])
}
