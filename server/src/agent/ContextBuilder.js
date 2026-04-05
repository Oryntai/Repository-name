class ContextBuilder {
  constructor(doc) {
    this.doc = doc
  }

  build(triggerReason, mentionText = null) {
    const shapes = this._getShapes()
    const chat = this._getRecentChat(10)

    let prompt = ''

    // Canvas state
    if (shapes.length > 0) {
      prompt += 'Canvas shapes:\n'
      for (const s of shapes) {
        const text = s.text ? ` "${s.text}"` : ''
        const color = s.color ? ` color:${s.color}` : ''
        const size = s.w && s.h ? ` size ${s.w}x${s.h}` : ''
        prompt += `- [${s.id}] ${s.type}${text} at (${Math.round(s.x)},${Math.round(s.y)})${size}${color}\n`
      }
    } else {
      prompt += 'Canvas is empty.\n'
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
    if (mentionText) {
      prompt += `\nUser message to you: "${mentionText}"`
    }

    return prompt
  }

  /** Canvas + recent voice conversation. Used by voice session. */
  buildVoiceContext() {
    const shapes = this._getShapes()
    let prompt = ''

    if (shapes.length > 0) {
      prompt += 'Canvas shapes:\n'
      for (const s of shapes) {
        const text = s.text ? ` "${s.text}"` : ''
        const size = s.w && s.h ? ` size ${s.w}x${s.h}` : ''
        prompt += `- [${s.id}] ${s.type}${text} at (${Math.round(s.x)},${Math.round(s.y)})${size}\n`
      }
    } else {
      prompt += 'Canvas is empty.\n'
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

  _getRecentChat(count) {
    const yChat = this.doc.getArray('chat')
    const all = yChat.toArray()
    return all.slice(-count)
  }
}

module.exports = { ContextBuilder }
