# BrainCanvas — System Architecture

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                             │
│                   (React + tldraw + Yjs)                    │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │  Canvas   │  │   Chat   │  │  Voice   │  │ Suggestions│  │
│  │ (tldraw)  │  │  Panel   │  │ Commands │  │  Overlay   │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └─────┬──────┘  │
│       │              │             │               │         │
│       └──────────────┴─────────────┴───────────────┘         │
│                          │                                   │
│                    Yjs CRDT Doc                               │
│                          │                                   │
│                   WebSocket (/ws)                             │
└──────────────────────────┬───────────────────────────────────┘
                           │
                    ┌──────┴──────┐
                    │  y-websocket │
                    │   Server     │
                    └──────┬──────┘
                           │
┌──────────────────────────┴───────────────────────────────────┐
│                     AI AGENT (Server)                         │
│                                                              │
│  ┌────────────────┐                                          │
│  │ TriggerManager │──── observes Yjs arrays:                 │
│  │                │     • chat (messages)                     │
│  │                │     • voice-channel (transcripts)         │
│  │                │     • suggestions (accept/dismiss)        │
│  └───────┬────────┘                                          │
│          │ triggers                                          │
│  ┌───────▼────────┐                                          │
│  │ AgentOrchest-  │──── coordinates request lifecycle        │
│  │ rator          │     • chat sessions                      │
│  │                │     • voice sessions                     │
│  │                │     • suggestion generation              │
│  └───────┬────────┘                                          │
│          │                                                   │
│  ┌───────▼────────┐     ┌────────────────┐                   │
│  │ ContextBuilder │────▶│   LLM Client   │                   │
│  │                │     │  (GPT-4o-mini) │                   │
│  │ • canvas state │     │                │                   │
│  │ • chat history │     │ • tool calling │                   │
│  │ • voice history│     │ • vision (img) │                   │
│  │ • action log   │     └───────┬────────┘                   │
│  └────────────────┘             │                            │
│                         ┌───────▼────────┐                   │
│                         │ ActionExecutor │                   │
│                         │                │                   │
│                         │ • add_idea     │──▶ Yjs Store      │
│                         │ • add_text     │   (tldraw shapes) │
│                         │ • connect_ideas│                   │
│                         │ • edit_text    │                   │
│                         │ • generate_img │──▶ HiggsField API │
│                         │ • edit_drawing │──▶ OpenAI gpt-image│
│                         │ • delete_shape │                   │
│                         │ • group_nodes  │                   │
│                         └────────────────┘                   │
└──────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Real-Time Canvas Sync
```
User A draws ──▶ tldraw store ──▶ Yjs Map('tldraw') ──▶ WebSocket ──▶ User B's tldraw
```
All shapes, assets, and bindings sync bidirectionally via Yjs CRDT — no conflicts, no merge issues.

### 2. Chat → AI Agent
```
User types message
    ──▶ Yjs Array('chat').push(msg)
    ──▶ TriggerManager observes new entry
    ──▶ ContextBuilder.build() — canvas shapes + chat history
    ──▶ LLMClient.call() — GPT-4o-mini with function calling
    ──▶ ActionExecutor — creates shapes / sends messages
    ──▶ Yjs Store updated ──▶ all clients see changes
```

### 3. Voice → AI Agent
```
User clicks "Voice" button (enables microphone)
    ──▶ Web Speech API (SpeechRecognition) starts listening
    ──▶ WAITING phase: only checking for wake word

User says "Эй человек!"
    ──▶ TRIGGERED phase: trigger sound plays for all users
    ──▶ Next utterance captured as command

User says command (e.g., "добавь 5 идей для игры")
    ──▶ PROCESSING phase
    ──▶ Canvas screenshot captured (SVG → JPEG)
    ──▶ Yjs Array('voice-channel').push({ type: 'transcript', text, image })
    ──▶ TriggerManager fires voice trigger
    ──▶ LLMClient.callVoice() — with vision (sees canvas screenshot)
    ──▶ ActionExecutor runs canvas actions
    ──▶ Speech response pushed to voice-channel
    ──▶ Frontend plays response via Web Speech Synthesis (TTS)
    ──▶ Back to WAITING
```

### 4. Tentative Suggestions
```
User stops drawing (idle 3s)
    ──▶ Frontend captures canvas screenshot
    ──▶ Yjs Array('suggestions').push({ type: 'request', image })
    ──▶ LLMClient.callSuggestion() — analyzes canvas
    ──▶ Ghost shape placed (opacity: 0.4) with accept/dismiss overlay
    ──▶ User accepts → full AI action executed
    ──▶ User dismisses → ghost shape deleted
```

## Shared State (Yjs Document)

| Yjs Structure | Type | Purpose |
|---|---|---|
| `tldraw` | Y.Map | All canvas shapes, assets, bindings |
| `chat` | Y.Array | Chat messages |
| `voice-channel` | Y.Array | Voice transcripts & AI responses |
| `ai-status` | Y.Map | AI phase (WAITING/TRIGGERED/PROCESSING) |
| `suggestions` | Y.Array | Tentative suggestion requests |
| `action-log` | Y.Array | User & AI action history |
| `canvas-settings` | Y.Map | Page dimensions |

## AI Agent Tools

| Tool | Description |
|---|---|
| `add_idea` | Create a colored card with text on canvas |
| `add_text` | Place free-form text (speech bubbles, labels) |
| `add_question` | Add a question card to prompt deeper thinking |
| `connect_ideas` | Draw an arrow between two shapes with bindings |
| `edit_text` | Modify text on an existing shape |
| `delete_shape` | Remove a shape from canvas |
| `group_nodes` | Create a frame around related shapes |
| `generate_image` | Generate an image via HiggsField API |
| `edit_drawing` | Edit existing drawing via OpenAI gpt-image-1 |
| `send_message` | Send a chat message (no canvas changes) |

## Deployment

- **Platform:** Fly.io (Docker container)
- **URL:** https://ai-brainstorm-canvas.fly.dev
- **Region:** Amsterdam (ams)
- Single container serves both static frontend and WebSocket server
