# BrainCanvas

Collaborative AI-powered brainstorming canvas with real-time multi-user synchronization, voice interaction, and an intelligent AI agent.

## Features

- **Real-time Collaboration** — Multiple users work on the same canvas simultaneously via Yjs CRDT sync
- **Shape Tools** — Rectangles, ellipses, diamonds, triangles, stars, hexagons, clouds, hearts, arrows, sticky notes, frames, and freehand drawing
- **AI Chat Agent** — Send messages in chat and the AI responds with ideas, sticky notes, connections, and image generation on the canvas
- **Voice Interaction** — Talk to the AI agent using a wake word ("эй человек" / "hey human"), it listens, sees the canvas, and responds via TTS
- **WebRTC Voice Chat** — Peer-to-peer voice communication between users
- **AI Image Generation** — The agent can generate and place images on the canvas via DALL-E
- **Canvas Vision** — The AI can see and analyze what's drawn on the canvas via screenshots

## Tech Stack

**Frontend:**
- React 18 + TypeScript
- [tldraw](https://tldraw.com) v2.4 — drawing engine
- Yjs + y-websocket — real-time sync
- Web Speech API — speech recognition & TTS
- WebRTC — voice chat

**Server:**
- Node.js + WebSocket (y-websocket server)
- OpenAI API (GPT-4o-mini) — LLM for the AI agent
- DALL-E — image generation

## Prerequisites

- Node.js 18+
- OpenAI API key

## Setup

1. **Clone the repository**
   ```bash
   git clone <repo-url>
   cd BrainCanvas
   ```

2. **Install dependencies**
   ```bash
   # Install root dependencies
   npm install

   # Install frontend dependencies
   cd frontend && npm install && cd ..

   # Install server dependencies
   cd server && npm install && cd ..
   ```

3. **Configure environment**

   Create `server/.env`:
   ```env
   OPENAI_API_KEY=your-openai-api-key
   OPENAI_MODEL=gpt-4o-mini
   ```

4. **Run the app**
   ```bash
   # Terminal 1 — start the server
   cd server && npm run dev

   # Terminal 2 — start the frontend
   cd frontend && npm run dev
   ```

5. Open `http://localhost:5173` in your browser. To join a specific room, add `?room=myroom` to the URL.

## Project Structure

```
├── frontend/
│   └── src/
│       ├── App.tsx                  # Main app — mounts tldraw + hooks
│       ├── components/
│       │   ├── LeftSidebar.tsx      # Elements, Draw, Text, Chat tabs
│       │   ├── HeaderBar.tsx        # User info, connection status, voice controls
│       │   ├── CanvasToolbar.tsx    # Color picker, size slider, zoom
│       │   ├── DotGrid.tsx         # Page grid + boundary resize handles
│       │   ├── ChatPanel.tsx       # Chat UI
│       │   └── PageMask.tsx        # Visual page boundary clipping
│       ├── hooks/
│       │   ├── useYjsConnection.ts # WebSocket + Yjs doc setup
│       │   ├── useCanvasSync.ts    # Bidirectional tldraw ↔ Yjs sync
│       │   ├── useVoiceCommands.ts # Wake word → STT → LLM → TTS pipeline
│       │   ├── useVoiceChat.ts     # WebRTC voice chat
│       │   ├── useChat.ts          # Chat messages via Yjs
│       │   ├── useRemoteCursors.ts # Multi-user cursor presence
│       │   └── usePageSize.ts      # Shared page dimensions
│       └── lib/
│           └── VoiceManager.ts     # WebRTC peer connection management
│
├── server/
│   └── src/
│       ├── index.js                # WebSocket server entry point
│       └── agent/
│           ├── AgentOrchestrator.js # Coordinates chat + voice AI sessions
│           ├── TriggerManager.js    # Watches Yjs arrays, triggers LLM calls
│           ├── ContextBuilder.js    # Builds canvas context for LLM prompts
│           ├── LLMClient.js         # OpenAI API calls with tool definitions
│           ├── ActionExecutor.js    # Executes LLM tool calls on the canvas
│           └── HiggsClient.js       # Image generation client
│
└── docs/
    └── Agent.md                     # AI agent architecture documentation
```

## How It Works

1. **Drawing & Shapes** — Users create shapes via the sidebar. All changes sync in real-time through Yjs CRDT over WebSocket.

2. **Chat → AI** — Every chat message is observed by the server's `TriggerManager`. It builds canvas context and calls the LLM, which can respond with chat messages, create sticky notes, draw arrows, group shapes, or generate images.

3. **Voice → AI** — The frontend listens for a wake word via the Web Speech API. Once triggered, it captures the user's speech + a canvas screenshot, sends both to the server, and the LLM responds with speech (played via TTS) and optional canvas actions.

## License

MIT
