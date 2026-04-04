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
}

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connecting: 'Connecting...',
  synced: 'Connected',
  disconnected: 'Disconnected',
}

export function HeaderBar({
  roomId,
  userName,
  setUserName,
  userCount,
  status,
  voice,
}: HeaderBarProps) {
  return (
    <div className="header-bar">
      <div className="header-left">
        <span className="header-logo">BrainCanvas</span>
        <span className="header-divider" />
        <span className="header-room">{roomId}</span>
      </div>

      <div className="header-center">
        <input
          className="header-name-input"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          maxLength={20}
          spellCheck={false}
          placeholder="Your name"
        />
        {userCount > 0 && (
          <span className="header-users">
            <span className="header-users-dot" />
            {userCount}
          </span>
        )}
      </div>

      <div className="header-right">
        <div className="header-voice">
          <button
            className={`header-voice-btn ${voice.isActive ? 'active' : ''}`}
            onClick={voice.isActive ? voice.stopVoice : voice.startVoice}
          >
            {voice.isActive ? '🔊 Leave' : '🎙 Join Voice'}
          </button>
          {voice.isActive && (
            <>
              <button
                className={`header-mute-btn ${voice.isMuted ? 'muted' : ''}`}
                onClick={voice.toggleMute}
              >
                {voice.isMuted ? '🔇' : '🔈'}
              </button>
              {voice.peerCount > 0 && (
                <span className="header-peer-count">
                  {voice.peerCount} in call
                </span>
              )}
            </>
          )}
        </div>

        <div className={`header-status ${status}`}>
          <span className="header-status-dot" />
          <span>{STATUS_LABEL[status]}</span>
        </div>
      </div>
    </div>
  )
}
