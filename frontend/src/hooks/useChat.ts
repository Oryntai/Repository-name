import { useCallback, useEffect, useState } from 'react'
import * as Y from 'yjs'

export interface ChatMessage {
  id: string
  user: string
  text: string
  timestamp: number
}

export function useChat(doc: Y.Doc | null, userName: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([])

  useEffect(() => {
    if (!doc) return

    const yMessages = doc.getArray<ChatMessage>('chat')

    const update = () => setMessages(yMessages.toArray())
    yMessages.observe(update)
    update()

    return () => yMessages.unobserve(update)
  }, [doc])

  const sendMessage = useCallback(
    (text: string) => {
      if (!doc || !text.trim()) return
      const yMessages = doc.getArray<ChatMessage>('chat')
      yMessages.push([
        {
          id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          user: userName,
          text: text.trim(),
          timestamp: Date.now(),
        },
      ])
    },
    [doc, userName],
  )

  return { messages, sendMessage }
}
