import { useCallback, useEffect, useRef, useState } from 'react'
import type * as Y from 'yjs'
import type { WebsocketProvider } from 'y-websocket'
import { VoiceManager } from '../lib/VoiceManager'

export function useVoiceChat(
  doc: Y.Doc | null,
  provider: WebsocketProvider | null,
) {
  const [isActive, setIsActive] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [peerCount, setPeerCount] = useState(0)
  const managerRef = useRef<VoiceManager | null>(null)

  useEffect(() => {
    if (!doc || !provider) return

    const manager = new VoiceManager(doc, provider.awareness, () => {
      setPeerCount(manager.getActivePeerCount())
    })
    managerRef.current = manager

    return () => {
      manager.destroy()
      managerRef.current = null
      setIsActive(false)
      setIsMuted(false)
      setPeerCount(0)
    }
  }, [doc, provider])

  const startVoice = useCallback(async () => {
    try {
      await managerRef.current?.start()
      setIsActive(true)
    } catch (err) {
      console.error('Failed to start voice:', err)
    }
  }, [])

  const stopVoice = useCallback(() => {
    managerRef.current?.stop()
    setIsActive(false)
    setIsMuted(false)
    setPeerCount(0)
  }, [])

  const toggleMute = useCallback(() => {
    const muted = managerRef.current?.toggleMute() ?? false
    setIsMuted(muted)
  }, [])

  return { isActive, isMuted, peerCount, startVoice, stopVoice, toggleMute }
}
