const OpenAI = require('openai')
const { toFile } = require('openai')

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
    this.canvasImage = null // set per-request by orchestrator
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
          case 'edit_drawing':
            await this._editDrawing(action.args)
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

  async _generateImage({ prompt, nearShapeId, relative_scale }) {
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

      // Download image and embed as base64 data URL (external URLs break due to CORS/expiry)
      const src = await this._downloadAsDataUrl(imageUrl)
      if (!src) {
        this._sendMessage({ text: 'Image generation failed — could not download image.' })
        return
      }

      // Smart sizing: scale relative to existing drawings on canvas
      const drawingBounds = this._getDrawingBounds()
      const scale = Math.max(0.1, Math.min(3.0, relative_scale || 1.0))
      const baseSize = Math.max(drawingBounds.w, drawingBounds.h)
      const imgSize = Math.round(Math.max(80, Math.min(800, baseSize * scale)))

      const pos = this._computePosition(nearShapeId)
      const assetId = makeId('asset')
      const shapeId = makeId('shape')

      this.doc.transact(() => {
        this.yStore.set(assetId, {
          id: assetId,
          typeName: 'asset',
          type: 'image',
          props: {
            name: prompt.substring(0, 30),
            src,
            w: imgSize,
            h: imgSize,
            mimeType: 'image/png',
            isAnimated: false,
          },
          meta: { createdBy: 'ai-agent' },
        })

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
            w: imgSize,
            h: imgSize,
            playing: true,
            url: '',
            crop: null,
            flipX: false,
            flipY: false,
          },
          meta: { createdBy: 'ai-agent' },
        })
      })

      console.log(`[executor] Generated image "${prompt}" at ${imgSize}x${imgSize} (scale=${scale})`)
    } catch (err) {
      console.error('[executor] Image generation error:', err.stack || err.message)
      this._sendMessage({ text: `Image generation failed: ${err.message}` })
    }
  }

  async _editDrawing({ instruction }) {
    if (!this.canvasImage) {
      this._sendMessage({ text: 'Cannot edit drawing — no canvas screenshot available.' })
      return
    }

    this._sendMessage({ text: `Editing your drawing: "${instruction}"...` })

    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

      // Convert data-URL → Buffer → File for the API
      const base64Data = this.canvasImage.replace(/^data:image\/\w+;base64,/, '')
      const imageBuffer = Buffer.from(base64Data, 'base64')
      // Detect actual format from the data URL (frontend sends JPEG)
      const mimeMatch = this.canvasImage.match(/^data:(image\/\w+);/)
      const mime = mimeMatch?.[1] || 'image/jpeg'
      const ext = mime === 'image/png' ? 'png' : 'jpg'
      const imageFile = await toFile(imageBuffer, `canvas.${ext}`, { type: mime })

      console.log(`[executor] Sending image to OpenAI edit API (${imageBuffer.length} bytes)...`)

      const response = await openai.images.edit({
        model: 'gpt-image-1',
        image: imageFile,
        prompt: `You are editing a hand-drawn sketch on a whiteboard canvas. ${instruction}. Keep the existing drawing intact and only add/modify what was requested. Maintain the same sketch/drawing style.`,
        size: '1024x1024',
      })

      // gpt-image-1 returns b64_json by default; dall-e-2 returns url
      const resultData = response.data?.[0]
      let src = null

      if (resultData?.b64_json) {
        src = `data:image/png;base64,${resultData.b64_json}`
      } else if (resultData?.url) {
        src = await this._downloadAsDataUrl(resultData.url)
      }

      if (!src) {
        this._sendMessage({ text: 'Drawing edit failed — no image returned.' })
        return
      }

      // Place the edited image on the canvas, covering the original drawing area
      const bounds = this._getDrawingBounds()
      const assetId = makeId('asset')
      const shapeId = makeId('shape')

      this.doc.transact(() => {
        this.yStore.set(assetId, {
          id: assetId,
          typeName: 'asset',
          type: 'image',
          props: {
            name: `edit-${instruction.substring(0, 20)}`,
            src,
            w: bounds.w,
            h: bounds.h,
            mimeType: 'image/png',
            isAnimated: false,
          },
          meta: { createdBy: 'ai-agent' },
        })

        this.yStore.set(shapeId, {
          id: shapeId,
          typeName: 'shape',
          type: 'image',
          x: bounds.x,
          y: bounds.y,
          rotation: 0,
          index: nextIndex(),
          parentId: 'page:page',
          isLocked: false,
          opacity: 1,
          props: {
            assetId,
            w: bounds.w,
            h: bounds.h,
            playing: true,
            url: '',
            crop: null,
            flipX: false,
            flipY: false,
          },
          meta: { createdBy: 'ai-agent' },
        })
      })

      console.log(`[executor] Edited drawing: "${instruction}"`)
    } catch (err) {
      console.error('[executor] Drawing edit error:', err.stack || err.message)
      this._sendMessage({ text: `Drawing edit failed: ${err.message}` })
    }
  }

  /** Get bounding box of all user-drawn shapes */
  _getDrawingBounds() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    let found = false

    this.yStore.forEach((record) => {
      if (record?.typeName !== 'shape' || record?.meta?.createdBy) return

      const sx = record.x || 0
      const sy = record.y || 0

      if (record.type === 'draw') {
        // Draw shapes: compute bounds from segment points (relative to shape origin)
        const segments = record.props?.segments
        if (segments && Array.isArray(segments)) {
          for (const seg of segments) {
            if (!seg.points) continue
            for (const pt of seg.points) {
              minX = Math.min(minX, sx + (pt.x || 0))
              minY = Math.min(minY, sy + (pt.y || 0))
              maxX = Math.max(maxX, sx + (pt.x || 0))
              maxY = Math.max(maxY, sy + (pt.y || 0))
            }
          }
          found = true
        }
      } else {
        // Other shapes (geo, note, image, etc.): use props.w/h
        const w = record.props?.w || 200
        const h = record.props?.h || 200
        minX = Math.min(minX, sx)
        minY = Math.min(minY, sy)
        maxX = Math.max(maxX, sx + w)
        maxY = Math.max(maxY, sy + h)
        found = true
      }
    })

    if (!found) {
      const page = this._getPageBounds()
      return { x: page.x + 50, y: page.y + 50, w: 500, h: 500 }
    }

    const padding = 20
    return {
      x: minX - padding,
      y: minY - padding,
      w: Math.max(100, maxX - minX + padding * 2),
      h: Math.max(100, maxY - minY + padding * 2),
    }
  }

  /** Download an image URL and return as a base64 data URL (avoids CORS/expiry issues) */
  async _downloadAsDataUrl(url) {
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const buffer = Buffer.from(await response.arrayBuffer())
      const mimeType = response.headers.get('content-type') || 'image/png'
      return `data:${mimeType};base64,${buffer.toString('base64')}`
    } catch (err) {
      console.error('[executor] Image download failed:', err.message)
      return null
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
