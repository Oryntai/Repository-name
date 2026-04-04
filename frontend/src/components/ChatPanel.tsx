import { useState, useRef, useEffect } from 'react'
import type { ChatMessage } from '../hooks/useChat'
import './ChatPanel.css'

interface ChatPanelProps {
  messages: ChatMessage[]
  sendMessage: (text: string) => void
  userName: string
}

const aiSound = new Audio('/ai-trigger.mp3')
aiSound.volume = 0.5

export function ChatPanel({ messages, sendMessage, userName }: ChatPanelProps) {
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const prevCountRef = useRef(messages.length)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })

    // Play sound when AI sends a new message
    if (messages.length > prevCountRef.current) {
      const newMsgs = messages.slice(prevCountRef.current)
      if (newMsgs.some((m) => m.user === 'AI Assistant')) {
        aiSound.currentTime = 0
        aiSound.play().catch(() => {})
      }
    }
    prevCountRef.current = messages.length
  }, [messages])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    sendMessage(input)
    setInput('')
    inputRef.current?.focus()
  }

  const stopPropagation = (e: React.KeyboardEvent) => e.stopPropagation()

  return (
    <div className="chat-panel">
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">No messages yet</div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`chat-msg ${msg.user === userName ? 'own' : ''} ${msg.user === 'AI Assistant' ? 'ai-msg' : ''}`}
          >
            <span className="chat-user">{msg.user}</span>
            <span className="chat-text">{msg.text}</span>
            <span className="chat-time">
              {new Date(msg.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form className="chat-input" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={stopPropagation}
          onKeyUp={stopPropagation}
          placeholder="Type a message..."
        />
        <button type="submit" disabled={!input.trim()}>
          Send
        </button>
      </form>
    </div>
  )
}
