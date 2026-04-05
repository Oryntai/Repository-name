import { useState } from 'react'
import { type Editor, DefaultSizeStyle, DefaultFillStyle, DefaultColorStyle, GeoShapeGeoStyle } from 'tldraw'
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

/* ---- Tab definitions ---- */

const TABS = [
  {
    id: 'elements',
    label: 'Elements',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1"/>
        <rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/>
        <circle cx="17.5" cy="17.5" r="3.5"/>
      </svg>
    ),
  },
  {
    id: 'draw',
    label: 'Draw',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9"/>
        <path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z"/>
      </svg>
    ),
  },
  {
    id: 'text',
    label: 'Text',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 7 4 4 20 4 20 7"/>
        <line x1="9.5" y1="20" x2="14.5" y2="20"/>
        <line x1="12" y1="4" x2="12" y2="20"/>
      </svg>
    ),
  },
  {
    id: 'chat',
    label: 'Chat',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
      </svg>
    ),
  },
] as const

type TabId = (typeof TABS)[number]['id']

/* ---- Shape definitions ---- */

// Geo shapes use editor.setCurrentTool('geo') + GeoShapeGeoStyle
const GEO_SHAPES = [
  {
    geo: 'rectangle',
    label: 'Rectangle',
    icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="5" width="18" height="14" rx="2"/></svg>,
  },
  {
    geo: 'ellipse',
    label: 'Ellipse',
    icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><ellipse cx="12" cy="12" rx="10" ry="7"/></svg>,
  },
  {
    geo: 'diamond',
    label: 'Diamond',
    icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2l10 10-10 10L2 12z"/></svg>,
  },
  {
    geo: 'triangle',
    label: 'Triangle',
    icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 3L2 21h20z"/></svg>,
  },
  {
    geo: 'star',
    label: 'Star',
    icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg>,
  },
  {
    geo: 'hexagon',
    label: 'Hexagon',
    icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><path d="M12 2l8.66 5v10L12 22l-8.66-5V7z"/></svg>,
  },
  {
    geo: 'cloud',
    label: 'Cloud',
    icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/></svg>,
  },
  {
    geo: 'heart',
    label: 'Heart',
    icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>,
  },
  {
    geo: 'arrow-right',
    label: 'Arrow block',
    icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><path d="M4 8h10v-4l6 8-6 8v-4H4z"/></svg>,
  },
]

// Direct tools (not geo)
const DIRECT_TOOLS = [
  {
    tool: 'arrow',
    label: 'Arrow',
    icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
  },
  {
    tool: 'line',
    label: 'Line',
    icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><line x1="4" y1="20" x2="20" y2="4"/></svg>,
  },
  {
    tool: 'sticky-note',
    label: 'Sticky Note',
    icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15.5 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V8.5L15.5 3z"/><polyline points="14 3 14 9 21 9"/></svg>,
  },
  {
    tool: 'frame',
    label: 'Frame',
    icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/></svg>,
  },
]

// Draw tools
const DRAW_TOOLS = [
  {
    tool: 'draw',
    label: 'Freehand',
    icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z"/></svg>,
  },
  {
    tool: 'highlight',
    label: 'Highlighter',
    icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15.5 3.5l5 5L8 21H3v-5z"/><path d="M12 7l5 5" opacity="0.5"/></svg>,
  },
  {
    tool: 'eraser',
    label: 'Eraser',
    icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 20H7L3 16l9-9 8 8-4 4z"/><line x1="6" y1="11" x2="13" y2="18"/></svg>,
  },
  {
    tool: 'laser',
    label: 'Laser',
    icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="2"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>,
  },
]

const TEXT_OPTIONS = [
  { label: 'Heading', size: 'xl' as const, fontSize: 22, weight: 700 },
  { label: 'Subheading', size: 'l' as const, fontSize: 17, weight: 600 },
  { label: 'Body text', size: 'm' as const, fontSize: 14, weight: 400 },
  { label: 'Caption', size: 's' as const, fontSize: 11, weight: 400 },
]

export function LeftSidebar({ editor, chat, userName }: LeftSidebarProps) {
  const [activeTab, setActiveTab] = useState<TabId | null>(null)

  const toggleTab = (id: TabId) => {
    setActiveTab((prev) => (prev === id ? null : id))
  }

  const handleGeoShape = (geo: string) => {
    if (!editor) return
    editor.setStyleForNextShapes(GeoShapeGeoStyle, geo as any)
    editor.setCurrentTool('geo')
  }

  const handleDirectTool = (tool: string) => {
    editor?.setCurrentTool(tool)
  }

  const handleStickyNote = () => {
    if (!editor) return
    editor.setStyleForNextShapes(GeoShapeGeoStyle, 'rectangle' as any)
    editor.setStyleForNextShapes(DefaultFillStyle, 'solid' as any)
    editor.setStyleForNextShapes(DefaultColorStyle, 'yellow' as any)
    editor.setCurrentTool('geo')
  }

  const handleAddText = (size: 'xl' | 'l' | 'm' | 's') => {
    if (!editor) return
    editor.setStyleForNextShapes(DefaultSizeStyle, size)
    editor.setCurrentTool('text')
  }

  return (
    <div className="sidebar">
      <nav className="sidebar-rail">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`sidebar-rail-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => toggleTab(tab.id)}
            title={tab.label}
          >
            {tab.icon}
            <span className="sidebar-rail-label">{tab.label}</span>
          </button>
        ))}
      </nav>

      {activeTab && (
        <div className="sidebar-panel">
          <div className="sidebar-panel-hdr">
            <h3 className="sidebar-panel-title">
              {TABS.find((t) => t.id === activeTab)?.label}
            </h3>
            <button className="sidebar-panel-close" onClick={() => setActiveTab(null)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div className="sidebar-panel-body">
            {/* ---- Elements tab ---- */}
            {activeTab === 'elements' && (
              <div className="elements-panel">
                <div className="section-label">Shapes</div>
                <div className="shapes-grid">
                  {GEO_SHAPES.map((s) => (
                    <button
                      key={s.geo}
                      className="shape-card"
                      onClick={() => handleGeoShape(s.geo)}
                      title={s.label}
                    >
                      <div className="shape-card-icon">{s.icon}</div>
                      <span className="shape-card-label">{s.label}</span>
                    </button>
                  ))}
                </div>

                <div className="section-label">Connectors & Frames</div>
                <div className="shapes-grid">
                  {DIRECT_TOOLS.map((t) => (
                    <button
                      key={t.tool}
                      className="shape-card"
                      onClick={() => t.tool === 'sticky-note' ? handleStickyNote() : handleDirectTool(t.tool)}
                      title={t.label}
                    >
                      <div className="shape-card-icon">{t.icon}</div>
                      <span className="shape-card-label">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ---- Draw tab ---- */}
            {activeTab === 'draw' && (
              <div className="elements-panel">
                <div className="section-label">Drawing Tools</div>
                <div className="shapes-grid cols-2">
                  {DRAW_TOOLS.map((t) => (
                    <button
                      key={t.tool}
                      className="shape-card"
                      onClick={() => handleDirectTool(t.tool)}
                      title={t.label}
                    >
                      <div className="shape-card-icon">{t.icon}</div>
                      <span className="shape-card-label">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ---- Text tab ---- */}
            {activeTab === 'text' && (
              <div className="elements-panel">
                <div className="section-label">Add text to canvas</div>
                <div className="text-list">
                  {TEXT_OPTIONS.map((opt) => (
                    <button
                      key={opt.size}
                      className="text-card"
                      onClick={() => handleAddText(opt.size)}
                    >
                      <span
                        className="text-card-preview"
                        style={{ fontSize: opt.fontSize, fontWeight: opt.weight }}
                      >
                        {opt.label}
                      </span>
                      <span className="text-card-hint">Click, then draw on canvas</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ---- Chat tab ---- */}
            {activeTab === 'chat' && (
              <ChatPanel
                messages={chat.messages}
                sendMessage={chat.sendMessage}
                userName={userName}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
