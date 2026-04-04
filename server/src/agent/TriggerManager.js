const COOLDOWN_MS = 15000
const VOICE_COOLDOWN_MS = 5000 // Voice is faster — shorter cooldown
const STUCK_TIMEOUT_MS = 60000
const AGENT_NAME = 'AI Assistant'

const WAKE_WORDS = ['эй человек', 'эй, человек', 'hey human', '@ai']
const SLEEP_WORDS = ['пока человек', 'пока, человек', 'bye human']

const STATE = { IDLE: 'idle', CALLING: 'calling', COOLDOWN: 'cooldown' }

class TriggerManager {
  constructor(doc, { onChatTrigger, onVoiceTrigger }) {
    this.doc = doc
    this.onChatTrigger = onChatTrigger
    this.onVoiceTrigger = onVoiceTrigger

    // Separate state machines for chat and voice sessions
    this.chatState = STATE.IDLE
    this.voiceState = STATE.IDLE
    this.chatCooldownTimer = null
    this.voiceCooldownTimer = null
    this.chatStuckTimer = null
    this.voiceStuckTimer = null

    this.isAwake = false

    this._observeChat()
    this._observeVoiceChannel()
    this._observeAgentControl()

    console.log('[trigger] TriggerManager ready (agent sleeping, say "эй человек" to wake)')
  }

  // ========== CHAT SESSION ==========

  _observeChat() {
    const yChat = this.doc.getArray('chat')
    yChat.observe((event) => {
      if (event.changes.delta.length === 0) return
      for (const change of event.changes.delta) {
        if (!change.insert) continue
        for (const msg of change.insert) {
          if (msg.user === AGENT_NAME) continue
          this._processChatMessage(msg)
        }
      }
    })
  }

  _processChatMessage(msg) {
    const textLower = msg.text.toLowerCase()

    if (SLEEP_WORDS.some((kw) => textLower.includes(kw))) {
      if (this.isAwake) {
        this._sleep('chat')
        this._fireChatImmediate('sleep_ack', msg.text)
      }
      return
    }

    if (WAKE_WORDS.some((kw) => textLower.includes(kw))) {
      if (!this.isAwake) this._wake('chat')
      this._fireChatImmediate('wake_word', msg.text)
      return
    }

    if (this.isAwake) {
      this._fireChatImmediate('chat_while_awake', msg.text)
    }
  }

  _fireChatImmediate(reason, text) {
    if (this.chatState === STATE.CALLING) {
      console.log('[trigger-chat] Skipping — already processing')
      return
    }

    clearTimeout(this.chatCooldownTimer)
    this.chatState = STATE.CALLING

    this.chatStuckTimer = setTimeout(() => {
      if (this.chatState === STATE.CALLING) {
        console.warn('[trigger-chat] Force-reset from stuck CALLING')
        this.chatState = STATE.IDLE
      }
    }, STUCK_TIMEOUT_MS)

    console.log(`[trigger-chat] Firing: ${reason}`)

    this.onChatTrigger(reason, text)
      .then(() => {
        clearTimeout(this.chatStuckTimer)
        this.chatState = STATE.COOLDOWN
        this.chatCooldownTimer = setTimeout(() => {
          this.chatState = STATE.IDLE
          console.log('[trigger-chat] Cooldown ended')
        }, COOLDOWN_MS)
      })
      .catch((err) => {
        clearTimeout(this.chatStuckTimer)
        console.error('[trigger-chat] Error:', err.message)
        this.chatState = STATE.IDLE
      })
  }

  // ========== VOICE SESSION ==========

  _observeVoiceChannel() {
    const yVoice = this.doc.getArray('voice-channel')
    yVoice.observe((event) => {
      if (event.changes.delta.length === 0) return
      for (const change of event.changes.delta) {
        if (!change.insert) continue
        for (const entry of change.insert) {
          if (entry.type !== 'transcript') continue // Only process user transcripts
          if (!this.isAwake) continue
          this._fireVoiceImmediate(entry)
        }
      }
    })
  }

  _fireVoiceImmediate(entry) {
    if (this.voiceState === STATE.CALLING) {
      console.log('[trigger-voice] Skipping — already processing')
      return
    }

    clearTimeout(this.voiceCooldownTimer)
    this.voiceState = STATE.CALLING

    this.voiceStuckTimer = setTimeout(() => {
      if (this.voiceState === STATE.CALLING) {
        console.warn('[trigger-voice] Force-reset from stuck CALLING')
        this.voiceState = STATE.IDLE
      }
    }, STUCK_TIMEOUT_MS)

    console.log(`[trigger-voice] Firing for transcript: "${entry.text}"`)

    this.onVoiceTrigger(entry.text, entry.user)
      .then(() => {
        clearTimeout(this.voiceStuckTimer)
        this.voiceState = STATE.COOLDOWN
        this.voiceCooldownTimer = setTimeout(() => {
          this.voiceState = STATE.IDLE
          console.log('[trigger-voice] Cooldown ended')
        }, VOICE_COOLDOWN_MS)
      })
      .catch((err) => {
        clearTimeout(this.voiceStuckTimer)
        console.error('[trigger-voice] Error:', err.message)
        this.voiceState = STATE.IDLE
      })
  }

  // ========== AGENT CONTROL (wake/sleep from frontend) ==========

  _observeAgentControl() {
    const yControl = this.doc.getMap('agent-control')
    yControl.observe((event) => {
      for (const [key] of event.changes.keys) {
        if (key !== 'command') continue
        const cmd = yControl.get('command')
        if (!cmd) return
        console.log(`[trigger] Control command: ${JSON.stringify(cmd)}`)

        if (cmd.action === 'wake' && !this.isAwake) {
          this._wake(cmd.source || 'voice')
        } else if (cmd.action === 'sleep' && this.isAwake) {
          this._sleep(cmd.source || 'voice')
        }
      }
    })
  }

  // ========== SHARED STATE ==========

  _wake(source) {
    this.isAwake = true
    console.log(`[trigger] Agent AWAKE (via ${source})`)
    this.doc.getMap('agent-control').set('status', { awake: true, since: Date.now() })
  }

  _sleep(source) {
    this.isAwake = false
    clearTimeout(this.chatCooldownTimer)
    clearTimeout(this.voiceCooldownTimer)
    clearTimeout(this.chatStuckTimer)
    clearTimeout(this.voiceStuckTimer)
    this.chatState = STATE.IDLE
    this.voiceState = STATE.IDLE
    console.log(`[trigger] Agent SLEEPING (via ${source})`)
    this.doc.getMap('agent-control').set('status', { awake: false, since: Date.now() })
  }

  destroy() {
    clearTimeout(this.chatCooldownTimer)
    clearTimeout(this.voiceCooldownTimer)
    clearTimeout(this.chatStuckTimer)
    clearTimeout(this.voiceStuckTimer)
  }
}

module.exports = { TriggerManager }
