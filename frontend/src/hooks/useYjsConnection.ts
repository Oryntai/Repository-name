import { useCallback, useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

const WS_URL =
  import.meta.env.VITE_WS_URL ||
  `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`

export type ConnectionStatus = 'connecting' | 'synced' | 'disconnected'

export function useYjsConnection(roomId: string) {
  const [state, setState] = useState<{
    doc: Y.Doc
    provider: WebsocketProvider
  } | null>(null)
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [userCount, setUserCount] = useState(0)
  const [userName, setUserName] = useState(
    () =>
      sessionStorage.getItem('canvas-username') ||
      `User-${Math.random().toString(36).substring(2, 5)}`,
  )

  const userNameRef = useRef(userName)
  userNameRef.current = userName

  useEffect(() => {
    const doc = new Y.Doc()
    const provider = new WebsocketProvider(WS_URL, roomId, doc)
    const awareness = provider.awareness

    awareness.setLocalStateField('user', { name: userNameRef.current })

    const updateUsers = () => setUserCount(awareness.getStates().size)
    awareness.on('change', updateUsers)
    updateUsers()

    let synced = false
    provider.on('sync', (s: boolean) => {
      if (s) {
        synced = true
        setStatus('synced')
      }
    })
    provider.on('status', ({ status: s }: { status: string }) => {
      if (s === 'disconnected') setStatus('disconnected')
      else if (s === 'connected' && synced) setStatus('synced')
      else if (s === 'connected') setStatus('connecting')
    })

    setState({ doc, provider })

    return () => {
      awareness.off('change', updateUsers)
      provider.destroy()
      doc.destroy()
      setState(null)
      setStatus('connecting')
    }
  }, [roomId])

  // Update awareness when userName changes (without reconnecting)
  useEffect(() => {
    if (!state?.provider) return
    state.provider.awareness.setLocalStateField('user', { name: userName })
    sessionStorage.setItem('canvas-username', userName)
  }, [userName, state?.provider])

  const updateUserName = useCallback((name: string) => {
    if (name.length <= 20) setUserName(name)
  }, [])

  return {
    doc: state?.doc ?? null,
    provider: state?.provider ?? null,
    status,
    userCount,
    userName,
    setUserName: updateUserName,
  }
}
