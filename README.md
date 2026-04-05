# BrainCanvas

**AI-powered collaborative brainstorming canvas** where teams draw, chat, and talk to an intelligent AI agent in real time.

> Live: [ai-brainstorm-canvas.fly.dev](https://ai-brainstorm-canvas.fly.dev)

---

## What It Does

BrainCanvas is a shared whiteboard with an AI teammate built in. Multiple users connect to the same canvas, draw ideas, and interact with an AI agent that can see the canvas, hear voice commands, and contribute ideas — all in real time.

### Key Features

- **Real-time collaboration** — Multiple users draw and edit simultaneously via Yjs CRDT sync. Zero conflicts.
- **Voice-activated AI** — Say "Эй человек!" to wake the AI, give it a command, and it responds with speech + canvas actions.
- **Canvas vision** — The AI sees what you've drawn via screenshots and responds contextually.
- **Smart suggestions** — AI observes your work and proactively suggests ideas as ghost cards you can accept or dismiss.
- **AI image generation** — Ask the AI to generate images and it places them on the canvas.
- **Drawing editing** — AI can modify your existing drawings in-place (add hair, color a shirt, etc.)
- **WebRTC voice chat** — Talk to your teammates peer-to-peer while brainstorming.
- **Chat panel** — Text-based interaction with the AI agent alongside drawing.

---

## Architecture

```
Frontend (React + tldraw)          Server (Node.js)
┌───────────────────┐              ┌───────────────────────┐
│  Canvas (tldraw)  │◄────Yjs────►│  y-websocket server   │
│  Chat Panel       │  WebSocket   │                       │
│  Voice Commands   │              │  AI Agent:            │
│  Suggestions UI   │              │  ├─ TriggerManager    │
│                   │              │  ├─ ContextBuilder     │
│  Speech Recognition│             │  ├─ LLMClient (GPT)   │
│  (Web Speech API) │              │  ├─ ActionExecutor     │
│  TTS Synthesis    │              │  └─ HiggsClient (imgs) │
└───────────────────┘              └───────────────────────┘
```

For detailed architecture diagrams, see [docs/architecture.md](docs/architecture.md).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Drawing Engine | [tldraw](https://tldraw.com) v2.4 |
| Frontend | React 18 + TypeScript + Vite |
| Real-time Sync | Yjs CRDT + y-websocket |
| Voice Input | Web Speech API (SpeechRecognition) |
| Voice Output | Web Speech Synthesis (TTS) |
| Voice Chat | WebRTC (peer-to-peer) |
| AI Model | GPT-4o-mini (OpenAI) |
| Image Generation | HiggsField API |
| Drawing Editing | OpenAI gpt-image-1 |
| Deployment | Fly.io (Docker) |

---

## Quick Start

```bash
# Install dependencies
npm run install:all

# Configure environment
cp .env.example .env
# Edit .env with your API keys

# Run (starts both server and frontend)
npm run dev
```

Open http://localhost:5173. Share the URL (or use ngrok) for multi-user sessions.

---

## Voice Commands

| Command | What happens |
|---|---|
| "Эй человек!" | Wakes the AI agent (trigger sound plays) |
| Any speech after wake | AI processes command + canvas screenshot |
| "Пока человек" | Dismisses the AI agent |

The AI can: add ideas, draw connections, generate images, edit drawings, add text labels, group shapes, and answer questions — all by voice.

---

## Project Structure

```
frontend/src/
├── App.tsx                     # Main app — mounts tldraw + all hooks
├── components/
│   ├── HeaderBar.tsx           # User info, AI status, voice controls
│   ├── LeftSidebar.tsx         # Elements, Draw, Text, Chat tabs
│   ├── CanvasToolbar.tsx       # Color picker, brush size
│   ├── SuggestionOverlay.tsx   # Accept/dismiss ghost suggestions
│   ├── DotGrid.tsx             # Page grid with resize handles
│   └── PageMask.tsx            # Visual page boundary
├── hooks/
│   ├── useYjsConnection.ts    # WebSocket + Yjs document setup
│   ├── useCanvasSync.ts       # Bidirectional tldraw <-> Yjs sync
│   ├── useVoiceCommands.ts    # Wake word -> STT -> LLM -> TTS
│   ├── useVoiceChat.ts        # WebRTC voice chat management
│   ├── useChat.ts             # Chat messages via Yjs
│   ├── useTentativeSuggestions.ts  # AI suggestion ghost shapes
│   └── useActionLog.ts        # User action tracking
└── lib/
    └── VoiceManager.ts        # WebRTC peer connection management

server/src/
├── index.js                   # HTTP + WebSocket server
└── agent/
    ├── AgentOrchestrator.js   # Coordinates chat + voice + suggestions
    ├── TriggerManager.js      # Observes Yjs, fires AI triggers
    ├── ContextBuilder.js      # Builds LLM context from canvas state
    ├── LLMClient.js           # OpenAI API with function calling + vision
    ├── ActionExecutor.js      # Executes tool calls on canvas via Yjs
    └── HiggsClient.js         # HiggsField image generation
```

---

## License

MIT
