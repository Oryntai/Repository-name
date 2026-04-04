AI Brainstorm Canvas

---

## The Problem

Teams brainstorm in tools like Miro or FigJam while talking on Zoom.

AI sits in a separate tab.

To use it, you:

- switch context
- re-explain everything
- copy results back

So AI ends up underused — and blind to the actual session:

it doesn’t see the canvas, the conversation, or the flow.

**What if AI wasn’t a tool you consult — but a teammate already in the room?**

---

## The Challenge

Build an **AI brainstorming agent that lives inside a canvas**.

- The **agent is the product**
- The **canvas is its environment**

The agent should:

- See the workspace
- Understand what’s happening
- Contribute directly on the canvas

Not a chatbot.

Not a sidebar.

👉 A **spatial participant** that creates, organizes, and reacts alongside humans.

---

## **Tech & Development Guidelines**

- **Any LLM allowed** — there is no requirement to use Claude. Choose the models and APIs that best fit your idea and workflow.
- **Higgsfield API is available** for media generation:
    - text → image
    - image → video
    Use it to power visual outputs directly inside your canvas experience.
- **Open source is a starting point, not the final product** — you can use existing libraries or tools, but you’re expected to build meaningful functionality on top. Think about what unique value your solution adds beyond a simple wrapper.
- **AI-assisted development is encouraged** — use tools like Cursor, Copilot, ChatGPT, Claude, etc. This is not cheating; it’s part of modern development. What matters is the quality of the product and experience you deliver.

---

## Important Constraint

⚠️ A canvas without a working agent will not be evaluated.

Use an existing canvas library.

Focus your time on **agent behavior and interaction**.

---

## Scope Anchor

- Build a **working demo of a single session**
- 2+ users + AI agent
- ~10 minutes long
- Demo-ready, not production-ready

The goal:

👉 It should *feel like the AI is genuinely participating*

---

## 🧩 Agent Behavior Note

The agent does **not** need to operate in strict real-time like a human user (e.g., continuous cursor movement or live editing).

What matters is the **perception of participation**:

- The agent should feel **present in the session**
- Its actions should feel **timely, contextual, and intentional**
- Contributions can be slightly delayed or batched — as long as they feel natural

👉 Focus on making the agent feel like a **real collaborator**, not a real-time system

---

## Success Criteria

At demo time, we want to see:

### 1. Collaborative Canvas

- Real-time multi-user interaction
- Users can create, organize, and structure ideas
- Supports media generation (images, video)

---

### 2. AI as a Participant

- The agent acts **on the canvas itself**
- Creates, moves, or edits elements
- Not limited to chat responses

---

### 3. Communication & Interaction Layer

- Users interact with the agent via **text, voice, or both**
- Users also communicate with each other through the same channels
- The system is **canvas-aware** — all interactions are grounded in what’s happening on the canvas

👉 The agent understands the **conversation + the workspace**, not just prompts

---

### 4. Media Generation on Canvas

- Users and the agent can generate **images and video directly on the canvas**
- Media appears as **first-class elements** (movable, editable, organizable)
- The agent can use media generation as part of its contributions (e.g., visualizing ideas)

---

### 5. User Control

- Users can control:
    - when the agent acts
    - what it focuses on
    - how much it contributes

---

## What We’re NOT Looking For

- A chatbot with a canvas in the background
- An AI that only responds in a sidebar
- A polished product

👉 Rough is fine. Interaction quality matters more

---

## Judging Criteria

| Criteria | Weight | What We Look For |
| --- | --- | --- |
| **AI as canvas participant** | 35% | Agent acts spatially inside the canvas |
| **Usefulness** | 25% | Clearly improves brainstorming |
| **Collaboration** | 15% | Smooth real-time interaction |
| **UX** | 15% | Intuitive, not overwhelming |
| **Ambition** | 10% | Creative extensions |

---

## 🎯 Final Note

This is not about building a better canvas.

It’s about exploring a new interaction model:

👉 **AI as a true participant in human collaboration**