import { useState, useRef, useEffect } from 'react'
import type { ChatMessage } from '../hooks/useChat'
import './ChatPanel.css'

interface ChatPanelProps {
  messages: ChatMessage[]
  sendMessage: (text: string) => void
  userName: string
}

export function ChatPanel({ messages, sendMessage, userName }: ChatPanelProps) {
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
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
            className={`chat-msg ${msg.user === userName ? 'own' : ''}`}
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
