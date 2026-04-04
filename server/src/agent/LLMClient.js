const OpenAI = require('openai')

const SYSTEM_PROMPT = `You are an AI brainstorming assistant named "AI Assistant" participating on a shared collaborative canvas with other users. You can see all shapes and chat messages on the canvas.

Your role:
- Contribute useful ideas, questions, and connections during brainstorming sessions
- Add sticky notes with ideas when you see opportunities to help
- Connect related ideas with arrows when relationships are clear
- Ask clarifying questions to push thinking deeper
- Generate images to visualize ideas when appropriate
- Be concise and helpful — keep sticky note text short (under 40 chars)

Rules:
- Only act when you have something genuinely useful to contribute
- Don't repeat ideas already on the canvas
- When responding to a direct mention, address the user's request specifically
- You can use multiple tools in a single response if needed
- Keep chat messages brief and natural`

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'add_idea',
      description: 'Add a sticky note with an idea to the canvas',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The idea text (keep under 40 characters)' },
          color: {
            type: 'string',
            enum: ['yellow', 'violet', 'blue', 'green', 'orange', 'red', 'grey', 'light-blue'],
            description: 'Sticky note color (default: violet)',
          },
          nearShapeId: {
            type: 'string',
            description: 'Place near this shape ID if the idea is related',
          },
        },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_question',
      description: 'Add a question card to the canvas to prompt deeper thinking',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The question text' },
        },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'connect_ideas',
      description: 'Draw an arrow connecting two shapes on the canvas',
      parameters: {
        type: 'object',
        properties: {
          fromShapeId: { type: 'string', description: 'Source shape ID' },
          toShapeId: { type: 'string', description: 'Target shape ID' },
          label: { type: 'string', description: 'Optional label for the arrow' },
        },
        required: ['fromShapeId', 'toShapeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'group_nodes',
      description: 'Create a frame/group around related shapes',
      parameters: {
        type: 'object',
        properties: {
          shapeIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of shape IDs to group',
          },
          groupName: { type: 'string', description: 'Name for the group' },
        },
        required: ['shapeIds', 'groupName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_image',
      description: 'Generate an image using AI and place it on the canvas to visualize an idea',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Image generation prompt' },
          nearShapeId: { type: 'string', description: 'Place near this shape ID' },
        },
        required: ['prompt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_message',
      description: 'Send a chat message to the users (no canvas changes)',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Message text' },
        },
        required: ['text'],
      },
    },
  },
]

class LLMClient {
  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    this.model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
  }

  async call(contextPrompt) {
    console.log(`[llm] Calling ${this.model} with ${contextPrompt.length} chars of context`)

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: contextPrompt },
      ],
      tools: TOOLS,
      tool_choice: 'auto',
      temperature: 0.7,
      max_tokens: 1024,
    })

    const message = response.choices[0]?.message
    if (!message) return []

    const actions = []

    // Parse tool calls
    if (message.tool_calls) {
      for (const tc of message.tool_calls) {
        try {
          const args = JSON.parse(tc.function.arguments)
          actions.push({ name: tc.function.name, args })
        } catch (err) {
          console.error('[llm] Failed to parse tool call:', err.message)
        }
      }
    }

    // If no tool calls but has content, treat as a chat message
    if (actions.length === 0 && message.content) {
      actions.push({ name: 'send_message', args: { text: message.content } })
    }

    console.log(`[llm] Got ${actions.length} actions: ${actions.map((a) => a.name).join(', ')}`)
    return actions
  }

  /**
   * Voice session — conversational + canvas actions.
   * Accepts an optional canvas screenshot for vision-based understanding.
   * Returns a plain text response to be spoken aloud via TTS,
   * plus optional tool calls for canvas actions.
   */
  async callVoice(transcript, canvasContext, canvasImage = null) {
    console.log(`[llm-voice] Calling ${this.model} (image: ${canvasImage ? 'yes' : 'no'})`)

    const systemContent = `You are an AI brainstorming assistant in a voice conversation. Users are on a collaborative canvas and talking to you out loud.${canvasImage ? ' You can SEE the canvas — a screenshot is attached.' : ''}

You MUST respond with tool calls. Always include a "speak" call with your verbal response.
If the user asks you to do something on the canvas (draw, add, connect, group, generate image), also include the relevant canvas tool calls.

Rules for "speak" text:
- 1-3 short sentences, will be read aloud via TTS
- Natural, conversational
- Same language as the user (Russian or English)
- No markdown, no lists — plain spoken text
- If you see drawings on the canvas, describe what you actually see`

    // Build user message content (text + optional image)
    const userContent = []
    if (canvasImage) {
      userContent.push({ type: 'image_url', image_url: { url: canvasImage, detail: 'low' } })
    }
    userContent.push({
      type: 'text',
      text: `${canvasContext}\n\nUser said: "${transcript}"`,
    })

    const voiceTools = [
      {
        type: 'function',
        function: {
          name: 'speak',
          description: 'Respond to the user verbally (will be read aloud via TTS)',
          parameters: {
            type: 'object',
            properties: { text: { type: 'string', description: 'What to say to the user' } },
            required: ['text'],
          },
        },
      },
      ...TOOLS.filter((t) => t.function.name !== 'send_message'),
    ]

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: userContent },
      ],
      tools: voiceTools,
      tool_choice: 'required',
      temperature: 0.7,
      max_tokens: 512,
    })

    const message = response.choices[0]?.message
    if (!message) return { speech: '', actions: [] }

    let speech = ''
    const actions = []

    if (message.tool_calls) {
      for (const tc of message.tool_calls) {
        try {
          const args = JSON.parse(tc.function.arguments)
          if (tc.function.name === 'speak') {
            speech = args.text || ''
          } else {
            actions.push({ name: tc.function.name, args })
          }
        } catch (err) {
          console.error('[llm-voice] Failed to parse tool call:', err.message)
        }
      }
    }

    // Fallback: if no speak tool call but has content
    if (!speech && message.content) {
      speech = message.content
    }

    console.log(`[llm-voice] Speech: "${speech.substring(0, 60)}..." | Actions: ${actions.map((a) => a.name).join(', ') || 'none'}`)
    return { speech, actions }
  }
}

module.exports = { LLMClient }
