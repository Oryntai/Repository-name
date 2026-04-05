const OpenAI = require('openai')

const SYSTEM_PROMPT = `You are an AI brainstorming assistant named "AI Assistant" participating on a shared collaborative canvas with other users. You can see all shapes and chat messages on the canvas.

Your role:
- Contribute useful ideas, questions, and connections during brainstorming sessions
- Add sticky notes with ideas when you see opportunities to help
- Add free-form text (add_text) for speech bubbles, labels, dialogue, captions — anything that should feel like part of the drawing
- Connect related ideas with arrows when relationships are clear
- Ask clarifying questions to push thinking deeper
- Generate images to visualize ideas when appropriate
- Edit text on existing shapes when asked to complete or change text
- Be concise and helpful — keep sticky note text short (under 40 chars)

IMPORTANT — choosing between add_idea vs add_text:
- add_idea: creates a sticky note card — use for brainstorming ideas, questions, concepts
- add_text: places plain text on canvas — use for speech bubbles, dialogue ("Привет!"), labels on drawings, captions, any text that is part of the visual scene
- When a user says "добавь слова", "пусть говорит", "напиши текст рядом", "подпиши" — use add_text, NOT add_idea

Rules:
- Only act when you have something genuinely useful to contribute
- Don't repeat ideas already on the canvas
- When responding to a direct mention, address the user's request specifically
- You can use multiple tools in a single response if needed
- Keep chat messages brief and natural. ALWAYS respond in the same language the user writes in (Russian if they write Russian, English if English)
- When users ask to edit, complete, or change text on existing shapes, use edit_text with the shape ID from the canvas shapes list. NEVER use add_idea for this — find the existing shape and update it.
- Shape IDs are listed like [shape:abc123]. When referencing a shape, ALWAYS copy the EXACT full ID including "shape:" prefix. NEVER invent IDs.
- IMPORTANT: All content you create MUST be placed inside the canvas page boundary. Never place shapes outside the visible page area.`

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'add_idea',
      description: 'Add a sticky note with an idea to the canvas. When user asks for multiple ideas, call this tool MULTIPLE times.',
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
          insideShapeId: {
            type: 'string',
            description: 'Place INSIDE this shape (frame or geo shape). Use when user says "в моем квадрате", "внутри рамки", etc. The sticky note will be positioned within the bounds of the referenced shape.',
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
      description: 'Generate a NEW standalone image and place it on the canvas. Do NOT use this to modify existing drawings — use edit_drawing for that.',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Image generation prompt' },
          nearShapeId: { type: 'string', description: 'Place near this shape ID. The generated image will be positioned relative to this shape.' },
          position: {
            type: 'string',
            enum: ['right', 'left', 'below', 'above'],
            description: 'Where to place the image relative to nearShapeId. Use "below" for body parts under a head, "above" for hats/hair, "right"/"left" for side-by-side placement. Default: "right".',
          },
          relative_scale: {
            type: 'number',
            description: 'Size relative to the referenced shape (nearShapeId). 1.0 = same size as that shape. For body below head: 2.0-2.5. For hat above head: 0.4. For arm beside body: 0.8. Range: 0.1 to 3.0.',
          },
        },
        required: ['prompt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_text',
      description: 'Edit/replace the text content of an existing shape on the canvas (sticky note, geo shape, text, etc.). Use this when the user asks to change, complete, or add text to a shape that is already on the canvas.',
      parameters: {
        type: 'object',
        properties: {
          shapeId: { type: 'string', description: 'The ID of the shape to edit (from the canvas shapes list)' },
          text: { type: 'string', description: 'The new full text content for the shape. This REPLACES existing text entirely — include any original text you want to keep.' },
        },
        required: ['shapeId', 'text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_shape',
      description: 'Delete a shape from the canvas. Use when the user asks to remove, delete, or clear a specific shape.',
      parameters: {
        type: 'object',
        properties: {
          shapeId: { type: 'string', description: 'The exact ID of the shape to delete (copy from canvas shapes list)' },
        },
        required: ['shapeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_text',
      description: 'Add free-form text directly on the canvas (not a sticky note). Use for speech bubbles, labels, captions, dialogue, or any text that should appear as part of the drawing rather than as a note.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The text content' },
          nearShapeId: { type: 'string', description: 'Place near this shape ID' },
          insideShapeId: {
            type: 'string',
            description: 'Place INSIDE this shape (frame or geo shape). Use when user says "в моем квадрате", "внутри", etc.',
          },
          position: {
            type: 'string',
            enum: ['right', 'left', 'below', 'above'],
            description: 'Where to place relative to nearShapeId',
          },
          size: {
            type: 'string',
            enum: ['s', 'm', 'l', 'xl'],
            description: 'Text size (default: m)',
          },
        },
        required: ['text'],
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
      max_tokens: 4096,
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
IMPORTANT: When the user asks for MULTIPLE items (e.g. "несколько идей", "список", "3 идеи"), you MUST call the tool MULTIPLE times — one call per item. Do NOT combine them into one call.

Rules for "speak" text:
- 1-3 short sentences, will be read aloud via TTS
- Natural, conversational
- Same language as the user (Russian or English)
- No markdown, no lists — plain spoken text
- If you see drawings on the canvas, describe what you actually see
- IMPORTANT: All shapes you create MUST be placed inside the canvas page boundary. Never place anything outside the visible page area.

CRITICAL — shape IDs:
- Shape IDs are listed in the canvas context like [shape:abc123]. When using any tool that takes a shapeId, copy the EXACT full ID including the "shape:" prefix. NEVER invent or guess IDs.

CRITICAL — tool selection:
- "edit_text": Use when user asks to change, complete, or add TEXT on an existing shape (sticky note, rectangle, etc.). This directly updates the text property. ALWAYS use this for text editing — NEVER use edit_drawing for text changes. The shapeId MUST be copied exactly from the canvas shapes list above.
- "edit_drawing": Use ONLY when user asks to modify VISUAL parts of their drawing IN-PLACE (e.g. "color the shirt", "make the eyes bigger", "erase the hat"). This edits the canvas screenshot and replaces it. NEVER use for text changes.
- "generate_image": Use when user asks to ADD new visual elements to the scene (e.g. "draw a body", "add a hat", "generate a sun", "create a tree", "add arms"). This creates a new image and places it relative to existing shapes. ALWAYS specify nearShapeId, position, and relative_scale.
- "add_idea": Use ONLY for adding NEW brainstorming sticky notes. NEVER use for editing existing shapes. When user asks for MULTIPLE ideas (e.g. "несколько идей", "3 идеи", "список"), call this tool MULTIPLE times — one call per idea!
- "add_text": Use for speech bubbles, dialogue, labels, captions — text that belongs to the visual scene. When user says "пусть говорит", "добавь слова", "подпиши" — use this, NOT add_idea.

CRITICAL — placing items INSIDE shapes:
- When user says "в моем квадрате/рамке", "внутри", "в этот бокс" — they want items placed INSIDE a specific shape.
- Use "insideShapeId" parameter with the exact shape ID of the container. The items will be placed within the container's bounds.
- Look at the canvas shapes list: find the geo/frame shape that matches what the user is referring to (by type, position, or context from the screenshot).

CRITICAL — spatial awareness for generate_image:
- Canvas shapes have positions (x,y) and sizes (w×h) listed above. Use these to decide placement and scaling.
- ALWAYS set "nearShapeId" to the shape the new image should attach to.
- ALWAYS set "position" to control placement: "below" for body under head, "above" for hair/hat on head, "right"/"left" for side placement.
- ALWAYS set "relative_scale" based on the referenced shape's size and real-world proportions:
  - Body below a head → 2.0-2.5 (bodies are bigger than heads)
  - Hair/hat above head → 0.3-0.5
  - Arms beside body → 0.8
  - Legs below body → 1.2
  - Small accessory → 0.2-0.4
  - Tree next to a person → 1.3, house → 1.5, sun → 0.5, ant → 0.15`

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
      {
        type: 'function',
        function: {
          name: 'edit_drawing',
          description: 'Edit/modify the existing drawing on the canvas. Use this when the user asks to change, add to, or modify their current drawing (e.g. "add hair", "color the shirt", "draw eyes"). This takes a screenshot of the current canvas and uses AI image editing to apply the requested changes.',
          parameters: {
            type: 'object',
            properties: {
              instruction: {
                type: 'string',
                description: 'What to change in the drawing (e.g. "add curly hair to the character", "draw eyes on the face")',
              },
            },
            required: ['instruction'],
          },
        },
      },
      ...TOOLS.filter((t) => t.function.name !== 'send_message' && t.function.name !== 'add_text'),
      // add_text is already in TOOLS, but let's ensure it's included with voice-specific description
      {
        type: 'function',
        function: {
          name: 'add_text',
          description: 'Add free-form text on the canvas — for speech bubbles, labels, dialogue, captions. Use when user says "пусть говорит", "добавь слова", "подпиши", etc.',
          parameters: {
            type: 'object',
            properties: {
              text: { type: 'string', description: 'The text content (e.g. "Привет, мир!")' },
              nearShapeId: { type: 'string', description: 'Place near this shape ID' },
              position: { type: 'string', enum: ['right', 'left', 'below', 'above'], description: 'Where to place' },
              size: { type: 'string', enum: ['s', 'm', 'l', 'xl'], description: 'Text size' },
            },
            required: ['text'],
          },
        },
      },
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
      max_tokens: 4096,
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

  /**
   * Tentative suggestion — analyze canvas screenshot and suggest one idea.
   * Returns { text, color } or null.
   */
  async callSuggestion(canvasImage, canvasContext) {
    console.log(`[llm-suggest] Calling ${this.model} for tentative suggestion`)

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: `You are an AI brainstorming assistant observing a collaborative canvas. The user just stopped drawing. Look at what's on the canvas and suggest ONE short idea that would complement or extend their work.

Rules:
- Reply with ONLY a JSON object: {"text": "your idea", "color": "light-blue"}
- "text" must be under 35 characters — a short, actionable idea
- "color" must be one of: yellow, violet, blue, green, orange, red, grey, light-blue
- Pick a color that visually relates to the content theme
- The idea should feel like a helpful teammate's suggestion, not obvious
- If the canvas is mostly drawings, suggest what concept or label could be added
- If there are already text notes, suggest a related or contrasting idea
- Same language as existing canvas content (Russian or English)
- If you genuinely have nothing useful to add, reply {"text": "", "color": "grey"}`,
        },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: canvasImage, detail: 'low' } },
            { type: 'text', text: canvasContext || 'Canvas shown in image.' },
          ],
        },
      ],
      temperature: 0.8,
      max_tokens: 100,
    })

    const content = response.choices[0]?.message?.content || ''
    try {
      const parsed = JSON.parse(content.replace(/```json?\s*/g, '').replace(/```/g, '').trim())
      if (!parsed.text || parsed.text.trim() === '') return null
      return { text: parsed.text, color: parsed.color || 'light-blue' }
    } catch (err) {
      console.error('[llm-suggest] Failed to parse response:', content)
      return null
    }
  }
}

module.exports = { LLMClient }
