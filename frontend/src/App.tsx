import { useCallback, useState } from 'react'
import { Tldraw, Editor } from 'tldraw'
import 'tldraw/tldraw.css'
import { useYjsConnection } from './hooks/useYjsConnection'
import { useCanvasSync } from './hooks/useCanvasSync'
import { useChat } from './hooks/useChat'
import { useVoiceChat } from './hooks/useVoiceChat'
import { useRemoteCursors } from './hooks/useRemoteCursors'
import { useVoiceCommands } from './hooks/useVoiceCommands'
import { HeaderBar } from './components/HeaderBar'
import { LeftSidebar } from './components/LeftSidebar'
import { DotGrid } from './components/DotGrid'
import { CanvasToolbar } from './components/CanvasToolbar'
import './App.css'

function getRoomId(): string {
  const params = new URLSearchParams(window.location.search)
  return params.get('room') || 'main'
}

export default function App() {
  const [roomId] = useState(getRoomId)
  const [editor, setEditor] = useState<Editor | null>(null)

  const { doc, provider, status, userCount, userName, setUserName } =
    useYjsConnection(roomId)
  useCanvasSync(editor, doc, provider)
  useRemoteCursors(editor, provider)
  const chat = useChat(doc, userName)
  const voice = useVoiceChat(doc, provider)
  const voiceCmd = useVoiceCommands(doc, voice.isActive)

  const handleMount = useCallback((e: Editor) => {
    setEditor(e)
    e.updateInstanceState({ isGridMode: true })
    e.user.updateUserPreferences({ isSnapMode: true })
  }, [])

  return (
    <div className="app">
      <HeaderBar
        roomId={roomId}
        userName={userName}
        setUserName={setUserName}
        userCount={userCount}
        status={status}
        voice={voice}
        editor={editor}
        agentAwake={voiceCmd.agentAwake}
        isListening={voiceCmd.isListening}
        onToggleAgent={voiceCmd.agentAwake ? voiceCmd.manualSleep : voiceCmd.manualWake}
      />
      <div className="workspace">
        <LeftSidebar editor={editor} chat={chat} userName={userName} />
        <div className="canvas-container">
          <Tldraw
            onMount={handleMount}
            components={{
              Grid: DotGrid,
              StylePanel: null,
              NavigationPanel: null,
              DebugMenu: null,
              DebugPanel: null,
              HelpMenu: null,
              MainMenu: null,
              PageMenu: null,
              ActionsMenu: null,
              QuickActions: null,
            }}
          />
          {editor && <CanvasToolbar editor={editor} />}
        </div>
      </div>
    </div>
  )
}
