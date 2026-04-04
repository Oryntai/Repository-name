const AGENT_NAME = 'AI Assistant'

const SHAPE_W = 200
const SHAPE_H = 200

// Generate a unique tldraw-compatible ID
function makeId(prefix) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let id = ''
  for (let i = 0; i < 10; i++) id += chars[Math.floor(Math.random() * chars.length)]
  return `${prefix}:${id}`
}

// Generate tldraw index string (used for z-ordering)
let indexCounter = 0
function nextIndex() {
  indexCounter++
  return 'a' + indexCounter.toString().padStart(4, '0')
}

class ActionExecutor {
  constructor(doc, higgsClient) {
    this.doc = doc
    this.yStore = doc.getMap('tldraw')
    this.yChat = doc.getArray('chat')
    this.higgsClient = higgsClient
  }

  async execute(actions) {
    for (const action of actions) {
      try {
        switch (action.name) {
          case 'add_idea':
            this._addIdea(action.args)
            break
          case 'add_question':
            this._addQuestion(action.args)
            break
          case 'connect_ideas':
            this._connectIdeas(action.args)
            break
          case 'group_nodes':
            this._groupNodes(action.args)
            break
          case 'send_message':
            this._sendMessage(action.args)
            break
          case 'generate_image':
            await this._generateImage(action.args)
            break
          default:
            console.warn(`[executor] Unknown action: ${action.name}`)
        }
      } catch (err) {
        console.error(`[executor] Error executing ${action.name}:`, err.message)
      }
    }
  }

  _addIdea({ text, color, nearShapeId }) {
    const pos = this._computePosition(nearShapeId)
    const id = makeId('shape')

    this.doc.transact(() => {
      this.yStore.set(id, {
        id,
        typeName: 'shape',
        type: 'note',
        x: pos.x,
        y: pos.y,
        rotation: 0,
        index: nextIndex(),
        parentId: 'page:page',
        isLocked: false,
        opacity: 1,
        props: {
          text: text || '',
          color: color || 'violet',
          size: 'm',
          font: 'draw',
          align: 'middle',
          verticalAlign: 'middle',
          growY: 0.00001,
          fontSizeAdjustment: 0.00001,
          url: '',
          scale: 1,
        },
        meta: { createdBy: 'ai-agent' },
      })
    })

    console.log(`[executor] Added idea "${text}" at (${pos.x}, ${pos.y})`)
    return id
  }

  _addQuestion({ text }) {
    return this._addIdea({ text: `? ${text}`, color: 'red' })
  }

  _connectIdeas({ fromShapeId, toShapeId, label }) {
    const fromShape = this.yStore.get(fromShapeId)
    const toShape = this.yStore.get(toShapeId)
    if (!fromShape || !toShape) {
      console.warn(`[executor] Cannot connect: shape not found`)
      return
    }

    const id = makeId('shape')

    this.doc.transact(() => {
      this.yStore.set(id, {
        id,
        typeName: 'shape',
        type: 'arrow',
        x: 0,
        y: 0,
        rotation: 0,
        index: nextIndex(),
        parentId: 'page:page',
        isLocked: false,
        opacity: 1,
        props: {
          dash: 'draw',
          size: 'm',
          fill: 'none',
          color: 'violet',
          labelColor: 'black',
          bend: 0,
          start: { x: (fromShape.x || 0) + 100, y: (fromShape.y || 0) + 50 },
          end: { x: (toShape.x || 0), y: (toShape.y || 0) + 50 },
          arrowheadStart: 'none',
          arrowheadEnd: 'arrow',
          text: label || '',
          labelPosition: 0.5,
          font: 'draw',
          scale: 1,
        },
        meta: { createdBy: 'ai-agent' },
      })
    })

    console.log(`[executor] Connected ${fromShapeId} → ${toShapeId}`)
  }

  _groupNodes({ shapeIds, groupName }) {
    // Compute bounding box of all shapes
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

    const validShapes = []
    for (const sid of shapeIds) {
      const shape = this.yStore.get(sid)
      if (!shape) continue
      validShapes.push(shape)
      const sx = shape.x || 0
      const sy = shape.y || 0
      const sw = shape.props?.w || 200
      const sh = shape.props?.h || 200
      minX = Math.min(minX, sx)
      minY = Math.min(minY, sy)
      maxX = Math.max(maxX, sx + sw)
      maxY = Math.max(maxY, sy + sh)
    }

    if (validShapes.length === 0) return

    const padding = 40
    const frameId = makeId('shape')

    this.doc.transact(() => {
      this.yStore.set(frameId, {
        id: frameId,
        typeName: 'shape',
        type: 'frame',
        x: minX - padding,
        y: minY - padding,
        rotation: 0,
        index: nextIndex(),
        parentId: 'page:page',
        isLocked: false,
        opacity: 1,
        props: {
          w: maxX - minX + padding * 2,
          h: maxY - minY + padding * 2,
          name: groupName || 'Group',
        },
        meta: { createdBy: 'ai-agent' },
      })
    })

    console.log(`[executor] Grouped ${validShapes.length} shapes into "${groupName}"`)
  }

  _sendMessage({ text }) {
    this.yChat.push([
      {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        user: AGENT_NAME,
        text,
        timestamp: Date.now(),
      },
    ])
    console.log(`[executor] Sent chat: "${text}"`)
  }

  async _generateImage({ prompt, nearShapeId }) {
    if (!this.higgsClient) {
      this._sendMessage({ text: `I'd like to generate an image for "${prompt}" but image generation is not configured.` })
      return
    }

    this._sendMessage({ text: `Generating image: "${prompt}"...` })

    try {
      const imageUrl = await this.higgsClient.generate(prompt)
      if (!imageUrl) {
        this._sendMessage({ text: 'Image generation failed — no URL returned.' })
        return
      }

      const pos = this._computePosition(nearShapeId)
      const assetId = makeId('asset')
      const shapeId = makeId('shape')

      this.doc.transact(() => {
        // Create asset
        this.yStore.set(assetId, {
          id: assetId,
          typeName: 'asset',
          type: 'image',
          props: {
            name: prompt.substring(0, 30),
            src: imageUrl,
            w: 400,
            h: 400,
            mimeType: 'image/png',
            isAnimated: false,
          },
          meta: { createdBy: 'ai-agent' },
        })

        // Create image shape
        this.yStore.set(shapeId, {
          id: shapeId,
          typeName: 'shape',
          type: 'image',
          x: pos.x,
          y: pos.y,
          rotation: 0,
          index: nextIndex(),
          parentId: 'page:page',
          isLocked: false,
          opacity: 1,
          props: {
            assetId,
            w: 300,
            h: 300,
            playing: true,
            url: '',
            crop: null,
            flipX: false,
            flipY: false,
          },
          meta: { createdBy: 'ai-agent' },
        })
      })

      console.log(`[executor] Generated and placed image for "${prompt}"`)
    } catch (err) {
      console.error('[executor] Image generation error:', err.message)
      this._sendMessage({ text: `Image generation failed: ${err.message}` })
    }
  }

  _computePosition(nearShapeId) {
    // 1. Near a referenced shape (offset to the right)
    if (nearShapeId) {
      const ref = this.yStore.get(nearShapeId)
      if (ref) {
        return this._clamp((ref.x || 0) + 230, ref.y || 0)
      }
    }

    // 2. Near the last AI-created shape (keeps AI output clustered)
    const lastAi = this._findLastAiShape()
    if (lastAi) {
      return this._clamp(lastAi.x + 230, lastAi.y + Math.floor(Math.random() * 80) - 40)
    }

    // 3. Near existing user shapes (so AI content appears close to user work)
    const userShape = this._findAnyUserShape()
    if (userShape) {
      return this._clamp(userShape.x + 230, userShape.y)
    }

    // 4. Fallback: random position within page bounds
    const b = this._getPageBounds()
    return this._clamp(
      b.x + 100 + Math.floor(Math.random() * (b.w - SHAPE_W - 200)),
      b.y + 100 + Math.floor(Math.random() * (b.h - SHAPE_H - 200)),
    )
  }

  /** Clamp position to stay within canvas page boundary */
  _clamp(x, y) {
    const b = this._getPageBounds()
    return {
      x: Math.max(b.x + 20, Math.min(x, b.x + b.w - SHAPE_W - 20)),
      y: Math.max(b.y + 20, Math.min(y, b.y + b.h - SHAPE_H - 20)),
    }
  }

  _getPageBounds() {
    const settings = this.doc.getMap('canvas-settings')
    return {
      x: 0,
      y: 0,
      w: (settings.get('pageW')) || 1600,
      h: (settings.get('pageH')) || 900,
    }
  }

  _findLastAiShape() {
    let last = null
    this.yStore.forEach((record) => {
      if (record?.typeName === 'shape' && record?.meta?.createdBy === 'ai-agent' && record.type !== 'frame') {
        last = record
      }
    })
    return last
  }

  _findAnyUserShape() {
    let found = null
    this.yStore.forEach((record) => {
      if (record?.typeName === 'shape' && !record?.meta?.createdBy && record.type !== 'frame') {
        found = record
      }
    })
    return found
  }
}

module.exports = { ActionExecutor }
