import { useState } from 'react'
import type { Editor } from 'tldraw'
import type { ChatMessage } from '../hooks/useChat'
import { ChatPanel } from './ChatPanel'
import './LeftSidebar.css'

interface LeftSidebarProps {
  editor: Editor | null
  chat: {
    messages: ChatMessage[]
    sendMessage: (text: string) => void
  }
  userName: string
}

const TABS = [
  { id: 'shapes', icon: '⬡', label: 'Shapes' },
  { id: 'text', icon: 'T', label: 'Text' },
  { id: 'chat', icon: '💬', label: 'Chat' },
  { id: 'settings', icon: '⚙', label: 'Settings' },
] as const

type TabId = (typeof TABS)[number]['id']

const SHAPE_TOOLS = [
  { id: 'rectangle', icon: '▭', label: 'Rectangle' },
  { id: 'ellipse', icon: '○', label: 'Ellipse' },
  { id: 'diamond', icon: '◇', label: 'Diamond' },
  { id: 'triangle', icon: '△', label: 'Triangle' },
  { id: 'arrow', icon: '→', label: 'Arrow' },
  { id: 'line', icon: '─', label: 'Line' },
  { id: 'draw', icon: '✏', label: 'Draw' },
  { id: 'note', icon: '📝', label: 'Note' },
  { id: 'frame', icon: '⊞', label: 'Frame' },
]

const TEXT_OPTIONS = [
  { label: 'Heading', size: 'xl' as const },
  { label: 'Subheading', size: 'l' as const },
  { label: 'Body', size: 'm' as const },
  { label: 'Caption', size: 's' as const },
]

export function LeftSidebar({ editor, chat, userName }: LeftSidebarProps) {
  const [activeTab, setActiveTab] = useState<TabId | null>(null)

  const toggleTab = (id: TabId) => {
    setActiveTab((prev) => (prev === id ? null : id))
  }

  const handleToolSelect = (toolId: string) => {
    editor?.setCurrentTool(toolId)
  }

  const handleAddText = (size: 'xl' | 'l' | 'm' | 's') => {
    if (!editor) return
    editor.setCurrentTool('text')
    const { DefaultSizeStyle } = require('tldraw')
    editor.setStyleForNextShapes(DefaultSizeStyle, size)
  }

  return (
    <div className="left-sidebar">
      <div className="icon-rail">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`rail-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => toggleTab(tab.id)}
            title={tab.label}
          >
            <span className="rail-icon">{tab.icon}</span>
            <span className="rail-label">{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab && (
        <div className="content-panel">
          <div className="panel-header">
            <span className="panel-title">
              {TABS.find((t) => t.id === activeTab)?.label}
            </span>
            <button className="panel-close" onClick={() => setActiveTab(null)}>
              ✕
            </button>
          </div>

          <div className="panel-body">
            {activeTab === 'shapes' && (
              <div className="shapes-grid">
                {SHAPE_TOOLS.map((shape) => (
                  <button
                    key={shape.id}
                    className="shape-btn"
                    onClick={() => handleToolSelect(shape.id)}
                    title={shape.label}
                  >
                    <span className="shape-icon">{shape.icon}</span>
                    <span className="shape-label">{shape.label}</span>
                  </button>
                ))}
              </div>
            )}

            {activeTab === 'text' && (
              <div className="text-options">
                {TEXT_OPTIONS.map((opt) => (
                  <button
                    key={opt.size}
                    className="text-option-btn"
                    onClick={() => handleAddText(opt.size)}
                  >
                    <span
                      className="text-preview"
                      style={{
                        fontSize:
                          opt.size === 'xl'
                            ? 22
                            : opt.size === 'l'
                              ? 18
                              : opt.size === 'm'
                                ? 14
                                : 11,
                      }}
                    >
                      {opt.label}
                    </span>
                    <span className="text-hint">Click to add {opt.label.toLowerCase()}</span>
                  </button>
                ))}
              </div>
            )}

            {activeTab === 'chat' && (
              <ChatPanel
                messages={chat.messages}
                sendMessage={chat.sendMessage}
                userName={userName}
              />
            )}

            {activeTab === 'settings' && (
              <div className="settings-panel">
                <div className="settings-group">
                  <div className="settings-label">Canvas</div>
                  <div className="settings-hint">
                    Grid mode and snap-to-grid are enabled by default.
                  </div>
                </div>
                <div className="settings-group">
                  <div className="settings-label">About</div>
                  <div className="settings-hint">
                    AI Brainstorm Canvas — collaborative whiteboard with AI agent.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
