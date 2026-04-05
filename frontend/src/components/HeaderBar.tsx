import { useEffect, useRef, useState } from 'react'
import { type Editor, exportAs } from 'tldraw'
import { ConnectionStatus } from '../hooks/useYjsConnection'
import './HeaderBar.css'

interface VoiceState {
  isActive: boolean
  isMuted: boolean
  peerCount: number
  startVoice: () => Promise<void>
  stopVoice: () => void
  toggleMute: () => void
}

interface HeaderBarProps {
  roomId: string
  userName: string
  setUserName: (name: string) => void
  userCount: number
  status: ConnectionStatus
  voice: VoiceState
  editor: Editor | null
  agentAwake: boolean
  isListening: boolean
  isSpeaking: boolean
  phase: 'WAITING' | 'TRIGGERED' | 'PROCESSING'
  onToggleAgent: () => void
}

export function HeaderBar({
  roomId,
  userName,
  setUserName,
  userCount,
  status,
  voice,
  editor,
  agentAwake,
  isListening,
  isSpeaking,
  phase,
  onToggleAgent,
}: HeaderBarProps) {
  const [exportOpen, setExportOpen] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!exportOpen) return
    const close = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false)
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [exportOpen])

  const handleExport = async (format: 'png' | 'svg' | 'json') => {
    if (!editor) return

    if (format === 'json') {
      const allRecords = editor.store.allRecords()
      const blob = new Blob([JSON.stringify(allRecords, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `BrainCanvas-${roomId}.json`
      a.click()
      URL.revokeObjectURL(url)
      return
    }

    const shapeIds = editor.getCurrentPageShapeIds()
    if (shapeIds.size === 0) return
    await exportAs(editor, [...shapeIds], format, `BrainCanvas-${roomId}`)
  }
  return (
    <header className="hdr">
      {/* Left: brand + room */}
      <div className="hdr-left">
        <div className="hdr-brand">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7c6fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
          <span className="hdr-brand-text">BrainCanvas</span>
        </div>
        <div className="hdr-sep" />
        <span className="hdr-room">{roomId}</span>

        {/* Undo / Redo */}
        <div className="hdr-sep" />
        <div className="hdr-actions">
          <button className="hdr-icon-btn" title="Undo" onClick={() => editor?.undo()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 00-9-9 9 9 0 00-6.69 3L3 13"/></svg>
          </button>
          <button className="hdr-icon-btn" title="Redo" onClick={() => editor?.redo()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 019-9 9 9 0 016.69 3L21 13"/></svg>
          </button>
        </div>
      </div>

      {/* Center: username + users + AI status */}
      <div className="hdr-center">
        <div className="hdr-user-group">
          <svg className="hdr-user-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <input
            className="hdr-name"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            maxLength={20}
            spellCheck={false}
            onKeyDown={(e) => e.stopPropagation()}
            onKeyUp={(e) => e.stopPropagation()}
          />
        </div>
        {userCount > 0 && (
          <div className="hdr-users-pill">
            <span className="hdr-users-dot" />
            {userCount} online
          </div>
        )}
        <button
          className={`hdr-ai-badge ${phase === 'WAITING' ? 'sleeping' : 'awake'} ${isSpeaking ? 'speaking' : ''} ${phase === 'TRIGGERED' ? 'triggered' : ''}`}
          onClick={onToggleAgent}
          title={agentAwake ? 'AI is listening — click or say "пока человек" to dismiss' : 'Say "эй человек" to wake AI'}
        >
          <span className="hdr-ai-dot" />
          <span>{
            isSpeaking ? 'AI speaking...'
            : phase === 'PROCESSING' ? 'AI thinking...'
            : phase === 'TRIGGERED' ? 'AI listening...'
            : 'AI off'
          }</span>
          {isListening && phase === 'WAITING' && <span className="hdr-ai-ear" title="Keyword spotter active">🎤</span>}
        </button>
      </div>

      {/* Right: voice + status */}
      <div className="hdr-right">
        <div className="hdr-voice">
          <button
            className={`hdr-voice-btn ${voice.isActive ? 'active' : ''}`}
            onClick={voice.isActive ? voice.stopVoice : voice.startVoice}
          >
            {voice.isActive ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 9h6v6H9z"/><rect x="2" y="2" width="20" height="20" rx="5"/></svg>
                <span>Leave</span>
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                <span>Voice</span>
              </>
            )}
          </button>
          {voice.isActive && (
            <>
              <button
                className={`hdr-mute-btn ${voice.isMuted ? 'muted' : ''}`}
                onClick={voice.toggleMute}
                title={voice.isMuted ? 'Unmute' : 'Mute'}
              >
                {voice.isMuted ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6"/><path d="M17 16.95A7 7 0 015 12v-2m14 0v2c0 .67-.09 1.32-.27 1.93"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                )}
              </button>
              {voice.peerCount > 0 && (
                <span className="hdr-peers">{voice.peerCount} in call</span>
              )}
            </>
          )}
        </div>

        <div className="hdr-sep" />

        <div className="hdr-export" ref={exportRef}>
          <button className="hdr-export-btn" title="Export session" onClick={() => setExportOpen(!exportOpen)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <span>Export</span>
          </button>
          <div className={`hdr-export-menu ${exportOpen ? 'open' : ''}`}>
            <button onClick={() => { handleExport('png'); setExportOpen(false) }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
              PNG Image
            </button>
            <button onClick={() => { handleExport('svg'); setExportOpen(false) }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
              SVG Vector
            </button>
            <button onClick={() => { handleExport('json'); setExportOpen(false) }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              JSON Data
            </button>
          </div>
        </div>

        <div className="hdr-sep" />

        <div className={`hdr-conn ${status}`}>
          <span className="hdr-conn-dot" />
          <span className="hdr-conn-label">
            {status === 'synced' ? 'Connected' : status === 'connecting' ? 'Connecting...' : 'Offline'}
          </span>
        </div>
      </div>
    </header>
  )
}
