# AI Agent — Architecture & Behavior

## Role

The AI agent is a **third participant** in the brainstorming session. It observes the canvas, listens to voice commands, reads chat messages, and contributes ideas — just like a human teammate.

---

## How the Agent Works

```
                    ┌─────────────────────┐
                    │   Yjs Document      │
                    │                     │
                    │  chat[]             │◄── User sends message
                    │  voice-channel[]    │◄── User says command
                    │  suggestions[]      │◄── User idle 3s
                    │  tldraw{}           │◄── Canvas shapes
                    └─────────┬───────────┘
                              │ observes
                    ┌─────────▼───────────┐
                    │   TriggerManager    │
                    │                     │
                    │  • Chat observer    │
                    │  • Voice observer   │
                    │  • Suggestion obs.  │
                    │  • Global lock      │
                    │  • Cooldown timer   │
                    └─────────┬───────────┘
                              │ fires
                    ┌─────────▼───────────┐
                    │ AgentOrchestrator   │
                    │                     │
                    │  • Chat sessions    │
                    │  • Voice sessions   │
                    │  • Suggestion gen.  │
                    └─────────┬───────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
     ┌────────────┐  ┌────────────┐  ┌────────────────┐
     │ContextBuild│  │ LLMClient  │  │ ActionExecutor │
     │            │  │            │  │                │
     │ Shapes     │  │ GPT-4o-mini│  │ add_idea       │
     │ Chat hist. │  │ Tool calls │  │ add_text       │
     │ Voice hist.│  │ Vision     │  │ connect_ideas  │
     │ Action log │  │            │  │ generate_image │
     └────────────┘  └────────────┘  │ edit_drawing   │
                                     │ edit_text      │
                                     │ delete_shape   │
                                     │ group_nodes    │
                                     └────────────────┘
```

---

## Trigger System

| Trigger | Source | What Happens |
|---|---|---|
| Chat message | Any user sends a message | AI reads canvas + chat, responds with actions |
| Voice command | User says "Эй человек!" + command | AI sees canvas screenshot + transcript, responds via TTS |
| Suggestion request | User idle for 3 seconds | AI analyzes canvas screenshot, places ghost card |
| Suggestion accepted | User clicks accept on ghost card | AI executes the suggested action |

**Global lock:** Only one request processes at a time. Others are dropped until cooldown ends (3s chat, 2s voice).

---

## Voice State Machine

```
WAITING ──── "Эй человек!" ────▶ TRIGGERED
   ▲                                  │
   │                            user speaks
   │                                  │
   │                                  ▼
   └──── TTS finishes ◄──── PROCESSING
              or timeout        (LLM + actions)
```

- **WAITING:** SpeechRecognition always on, checking for wake word only. Zero API cost.
- **TRIGGERED:** Listening for the user's actual command. Trigger sound plays for all users.
- **PROCESSING:** Command + canvas screenshot sent to LLM. Response played via TTS.

Phase is broadcast to all clients via Yjs `ai-status` map — everyone sees the same AI state.

---

## Canvas Context for LLM

The agent doesn't send raw Yjs data. ContextBuilder creates a readable text summary:

```
Canvas shapes:
- id="shape:abc123" type=draw pos=(100,50) size=200x150
- id="shape:def456" type=geo pos=(400,200) size=300x250 text="My idea"

Recent user actions (newest last):
- User1: drew a shape at (100,50)
- User2: created rectangle at (400,200)

Recent chat:
- User1: "add more ideas here"
```

For voice sessions, a canvas screenshot (JPEG, max 800px) is also sent for vision understanding.

---

## What the Agent Does NOT Do

- Does not interrupt active speech (listens only in pauses)
- Does not delete user content unless explicitly asked
- Does not respond to every message (cooldown prevents spam)
- Does not require a button press to activate (wake word is enough)
- Does not process tentative suggestion shapes (filtered from context)
