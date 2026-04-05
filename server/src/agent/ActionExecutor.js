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
    this.yLog = doc.getArray('action-log')
    this.higgsClient = higgsClient
    this.canvasImage = null
    this.canvasImageBounds = null
  }

  /** Log AI action to shared action-log (same format as user actions) */
  _log(action) {
    this.yLog.push([{ user: AGENT_NAME, action, timestamp: Date.now() }])
  }

  /** Send short feedback to chat about what AI just did */
  _feedback(text) {
    this.yChat.push([{
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      user: AGENT_NAME,
      text,
      timestamp: Date.now(),
    }])
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
          case 'edit_text':
            this._editText(action.args)
            break
          case 'edit_drawing':
            await this._editDrawing(action.args)
            break
          case 'delete_shape':
            this._deleteShape(action.args)
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

    this._log(`added note "${text}" at (${pos.x},${pos.y})`)
    this._feedback(`Добавил заметку: "${text}"`)
    console.log(`[executor] Added idea "${text}" at (${pos.x}, ${pos.y})`)
    return id
  }

  _addQuestion({ text }) {
    return this._addIdea({ text: `? ${text}`, color: 'red' })
  }

  _editText({ shapeId, text }) {
    // Try exact ID first, then with/without "shape:" prefix
    let resolvedId = shapeId
    let shape = this.yStore.get(resolvedId)

    if (!shape && !shapeId.startsWith('shape:')) {
      resolvedId = `shape:${shapeId}`
      shape = this.yStore.get(resolvedId)
    }

    if (!shape && shapeId.startsWith('shape:')) {
      resolvedId = shapeId.replace('shape:', '')
      shape = this.yStore.get(resolvedId)
    }

    // Last resort: find by partial ID match
    if (!shape) {
      const bare = shapeId.replace('shape:', '')
      this.yStore.forEach((record, key) => {
        if (!shape && key.includes(bare)) {
          shape = record
          resolvedId = key
        }
      })
    }

    if (!shape) {
      console.warn(`[executor] edit_text: shape ${shapeId} not found anywhere`)
      return
    }

    const updated = JSON.parse(JSON.stringify(shape))
    if (updated.props) {
      if ('text' in updated.props) {
        updated.props.text = text
      } else if ('label' in updated.props) {
        updated.props.label = text
      } else {
        updated.props.text = text
      }
    }

    this.doc.transact(() => {
      this.yStore.set(resolvedId, updated)
    })

    this._log(`edited text on ${resolvedId}: "${text.substring(0, 40)}"`)
    this._feedback(`Обновил текст: "${text.substring(0, 40)}${text.length > 40 ? '...' : ''}"`)
    console.log(`[executor] Edited text on ${resolvedId}: "${text.substring(0, 50)}"`)
  }

  _deleteShape({ shapeId }) {
    let resolvedId = shapeId
    let shape = this.yStore.get(resolvedId)
    if (!shape && !shapeId.startsWith('shape:')) {
      resolvedId = `shape:${shapeId}`
      shape = this.yStore.get(resolvedId)
    }
    if (!shape) {
      const bare = shapeId.replace('shape:', '')
      this.yStore.forEach((record, key) => {
        if (!shape && key.includes(bare)) {
          shape = record
          resolvedId = key
        }
      })
    }
    if (!shape) {
      console.warn(`[executor] delete_shape: ${shapeId} not found`)
      this._feedback(`Не нашёл фигуру для удаления.`)
      return
    }

    const label = shape.props?.text || shape.props?.label || shape.type
    this.doc.transact(() => {
      this.yStore.delete(resolvedId)
    })

    this._log(`deleted ${shape.type} "${label}"`)
    this._feedback(`Удалил: ${label}`)
    console.log(`[executor] Deleted ${resolvedId}`)
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

    this._log(`connected ${fromShapeId} → ${toShapeId}${label ? ` label="${label}"` : ''}`)
    this._feedback(`Соединил фигуры${label ? `: "${label}"` : ''}`)
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

    this._log(`grouped ${validShapes.length} shapes into "${groupName}"`)
    this._feedback(`Сгруппировал ${validShapes.length} фигур: "${groupName}"`)
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

  async _generateImage({ prompt, nearShapeId, position, relative_scale }) {
    if (!this.higgsClient) {
      this._feedback(`Генерация изображений не настроена.`)
      return
    }

    this._feedback(`Генерирую: "${prompt.substring(0, 50)}"...`)

    try {
      const imageUrl = await this.higgsClient.generate(prompt)
      if (!imageUrl) {
        this._feedback('Не удалось получить изображение.')
        return
      }

      // Download image and embed as base64 data URL (external URLs break due to CORS/expiry)
      const src = await this._downloadAsDataUrl(imageUrl)
      if (!src) {
        this._feedback('Не удалось скачать изображение.')
        return
      }

      // Smart sizing: scale relative to the reference shape (or canvas if no reference)
      const refShape = nearShapeId ? this.yStore.get(nearShapeId) : null
      const refBounds = refShape ? this._getShapeBounds(refShape) : null
      const scale = Math.max(0.1, Math.min(3.0, relative_scale || 1.0))

      let imgSize
      if (refBounds) {
        // Size relative to the reference shape
        const refSize = Math.max(refBounds.w, refBounds.h)
        imgSize = Math.round(Math.max(40, Math.min(800, refSize * scale)))
      } else {
        // Fallback: size relative to overall drawings
        const drawingBounds = this._getDrawingBounds()
        const baseSize = Math.max(drawingBounds.w, drawingBounds.h)
        imgSize = Math.round(Math.max(80, Math.min(800, baseSize * scale)))
      }

      // Compute position using directional placement
      const pos = this._computePositionDirectional(nearShapeId, position, imgSize)
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

      this._log(`generated image "${prompt.substring(0, 40)}" at (${Math.round(pos.x)},${Math.round(pos.y)})`)
      this._feedback(`Готово! Сгенерировал изображение: "${prompt.substring(0, 50)}"`)
      console.log(`[executor] Generated image "${prompt}" at (${pos.x},${pos.y}) ${imgSize}x${imgSize} (scale=${scale}, position=${position || 'default'})`)
    } catch (err) {
      console.error('[executor] Image generation error:', err.stack || err.message)
      this._feedback(`Не удалось сгенерировать изображение: ${err.message}`)
    }
  }

  async _editDrawing({ instruction }) {
    if (!this.canvasImage) {
      this._feedback('Нет скриншота canvas для редактирования.')
      return
    }

    this._feedback(`Редактирую рисунок: "${instruction.substring(0, 50)}"...`)

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
        this._feedback('Не удалось отредактировать рисунок.')
        return
      }

      // Place the edited image on the canvas, covering the original capture area
      // Use frontend capture bounds (matches the screenshot exactly) or fall back to computed bounds
      const bounds = this.canvasImageBounds || this._getDrawingBounds()
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

      this._log(`edited drawing: "${instruction.substring(0, 40)}"`)
      this._feedback(`Отредактировал рисунок: "${instruction.substring(0, 50)}"`)
      console.log(`[executor] Edited drawing: "${instruction}"`)
    } catch (err) {
      console.error('[executor] Drawing edit error:', err.stack || err.message)
      this._feedback(`Не удалось отредактировать: ${err.message}`)
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

  /** Get bounding box of a single shape */
  _getShapeBounds(record) {
    const sx = record.x || 0
    const sy = record.y || 0

    if (record.type === 'draw') {
      let minX = 0, minY = 0, maxX = 0, maxY = 0
      const segments = record.props?.segments
      if (segments && Array.isArray(segments)) {
        minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity
        for (const seg of segments) {
          if (!seg.points) continue
          for (const pt of seg.points) {
            minX = Math.min(minX, pt.x || 0)
            minY = Math.min(minY, pt.y || 0)
            maxX = Math.max(maxX, pt.x || 0)
            maxY = Math.max(maxY, pt.y || 0)
          }
        }
      }
      return { x: sx + minX, y: sy + minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) }
    }

    const w = record.props?.w || 200
    const h = record.props?.h || 200
    return { x: sx, y: sy, w, h }
  }

  /** Position a new shape relative to a reference shape with directional placement */
  _computePositionDirectional(nearShapeId, position, imgSize) {
    if (!nearShapeId || !position) {
      return this._computePosition(nearShapeId)
    }

    const ref = this.yStore.get(nearShapeId)
    if (!ref) {
      return this._computePosition(nearShapeId)
    }

    const rb = this._getShapeBounds(ref)
    // Center the new image relative to the reference shape's center
    const refCenterX = rb.x + rb.w / 2
    let x, y

    switch (position) {
      case 'below':
        x = refCenterX - imgSize / 2
        y = rb.y + rb.h + 5 // small gap
        break
      case 'above':
        x = refCenterX - imgSize / 2
        y = rb.y - imgSize - 5
        break
      case 'left':
        x = rb.x - imgSize - 5
        y = rb.y + rb.h / 2 - imgSize / 2
        break
      case 'right':
        x = rb.x + rb.w + 5
        y = rb.y + rb.h / 2 - imgSize / 2
        break
      default:
        return this._computePosition(nearShapeId)
    }

    return this._clampXY(x, y, imgSize, imgSize)
  }

  /** Clamp position for a shape of given size to stay within page bounds */
  _clampXY(x, y, w, h) {
    const b = this._getPageBounds()
    return {
      x: Math.max(b.x + 5, Math.min(x, b.x + b.w - w - 5)),
      y: Math.max(b.y + 5, Math.min(y, b.y + b.h - h - 5)),
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
