class ContextBuilder {
  constructor(doc) {
    this.doc = doc
  }

  build(triggerReason, mentionText = null) {
    const shapes = this._getShapes()
    const chat = this._getRecentChat(10)
    const actions = this._getRecentActions(15)

    let prompt = ''

    // Canvas state
    if (shapes.length > 0) {
      prompt += 'Canvas shapes:\n'
      for (const s of shapes) {
        const text = s.text ? ` text="${s.text}"` : ''
        const color = s.color ? ` color=${s.color}` : ''
        const size = s.w && s.h ? ` size=${s.w}x${s.h}` : ''
        prompt += `- id="${s.id}" type=${s.type} pos=(${Math.round(s.x)},${Math.round(s.y)})${size}${color}${text}\n`
      }
    } else {
      prompt += 'Canvas is empty.\n'
    }

    // Recent user actions — what users have been doing
    if (actions.length > 0) {
      prompt += '\nRecent user actions (newest last):\n'
      for (const a of actions) {
        prompt += `- ${a.user}: ${a.action}\n`
      }
    }

    // Recent chat
    if (chat.length > 0) {
      prompt += '\nRecent chat:\n'
      for (const msg of chat) {
        prompt += `- ${msg.user}: "${msg.text}"\n`
      }
    }

    // Trigger context
    prompt += `\nTrigger: ${triggerReason}`
    if (triggerReason === 'suggestion_accepted') {
      prompt += `\nThe user ACCEPTED your suggestion: "${mentionText}". Now EXECUTE it — use generate_image to create the visual, or add_idea/connect_ideas as needed. Do NOT just send a chat message — actually create the content on the canvas.`
    } else if (mentionText) {
      prompt += `\nUser message to you: "${mentionText}"`
    }

    return prompt
  }

  /** Canvas + recent voice conversation. Used by voice session. */
  buildVoiceContext() {
    const shapes = this._getShapes()
    const actions = this._getRecentActions(10)
    let prompt = ''

    if (shapes.length > 0) {
      prompt += 'Canvas shapes:\n'
      for (const s of shapes) {
        const text = s.text ? ` text="${s.text}"` : ''
        const size = s.w && s.h ? ` size=${s.w}x${s.h}` : ''
        prompt += `- id="${s.id}" type=${s.type} pos=(${Math.round(s.x)},${Math.round(s.y)})${size}${text}\n`
      }
    } else {
      prompt += 'Canvas is empty.\n'
    }

    // Recent user actions
    if (actions.length > 0) {
      prompt += '\nRecent user actions (newest last):\n'
      for (const a of actions) {
        prompt += `- ${a.user}: ${a.action}\n`
      }
    }

    // Last 4 voice-channel entries as conversation memory
    const voiceHistory = this._getRecentVoice(4)
    if (voiceHistory.length > 0) {
      prompt += '\nRecent voice conversation:\n'
      for (const entry of voiceHistory) {
        if (entry.type === 'transcript') {
          prompt += `- ${entry.user || 'User'}: "${entry.text}"\n`
        } else if (entry.type === 'response') {
          prompt += `- AI Assistant: "${entry.text}"\n`
        }
      }
    }

    return prompt
  }

  _getRecentVoice(count) {
    const yVoice = this.doc.getArray('voice-channel')
    const all = yVoice.toArray()
    return all.slice(-count)
  }

  _getShapes() {
    const yStore = this.doc.getMap('tldraw')
    const shapes = []

    yStore.forEach((record, key) => {
      if (record?.typeName !== 'shape') return
      // Skip tentative suggestion shapes — they are ghost previews, not real content
      if (record?.meta?.tentative) return
      if (key.startsWith('shape:suggest_')) return

      const shape = {
        id: key,
        type: record.type,
        x: record.x || 0,
        y: record.y || 0,
        w: 0,
        h: 0,
        text: null,
        color: null,
      }

      // Compute dimensions
      if (record.type === 'draw') {
        // Draw shapes: compute bounds from segment points
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        const segments = record.props?.segments
        if (segments && Array.isArray(segments)) {
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
        shape.w = maxX > minX ? Math.round(maxX - minX) : 0
        shape.h = maxY > minY ? Math.round(maxY - minY) : 0
      } else {
        shape.w = Math.round(record.props?.w || 0)
        shape.h = Math.round(record.props?.h || 0)
      }

      // Extract text from various shape types
      if (record.props) {
        if (record.props.text) shape.text = record.props.text.substring(0, 100)
        if (record.props.color) shape.color = record.props.color
        // For geo shapes with label
        if (record.props.label) shape.text = record.props.label.substring(0, 100)
      }

      shapes.push(shape)
    })

    return shapes
  }

  _getRecentActions(count) {
    try {
      const yLog = this.doc.getArray('action-log')
      const all = yLog.toArray()
      return all.slice(-count)
    } catch {
      return []
    }
  }

  _getRecentChat(count) {
    const yChat = this.doc.getArray('chat')
    const all = yChat.toArray()
    return all.slice(-count)
  }
}

module.exports = { ContextBuilder }
