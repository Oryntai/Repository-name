const COOLDOWN_MS = 15000
const VOICE_COOLDOWN_MS = 5000
const STUCK_TIMEOUT_MS = 60000
const AGENT_NAME = 'AI Assistant'

const WAKE_WORDS = ['эй человек', 'эй, человек', 'hey human', '@ai']

const STATE = { IDLE: 'idle', CALLING: 'calling', COOLDOWN: 'cooldown' }

/**
 * Two fully independent channels:
 *
 * CHAT — fires only when a message contains a wake word. One-shot per message.
 *        Response goes to chat only.
 *
 * VOICE — fires for every transcript in voice-channel.
 *         The frontend state machine gates what gets sent (wake word → listen → send).
 *         Response goes to voice-channel only (TTS).
 */
class TriggerManager {
  constructor(doc, { onChatTrigger, onVoiceTrigger }) {
    this.doc = doc
    this.onChatTrigger = onChatTrigger
    this.onVoiceTrigger = onVoiceTrigger

    this.chatState = STATE.IDLE
    this.voiceState = STATE.IDLE
    this.chatCooldownTimer = null
    this.voiceCooldownTimer = null
    this.chatStuckTimer = null
    this.voiceStuckTimer = null

    this._observeChat()
    this._observeVoiceChannel()

    console.log('[trigger] TriggerManager ready (chat: wake word per-message, voice: frontend-gated)')
  }

  // ========== CHAT SESSION (self-contained) ==========

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

    // Chat only responds when a wake word is in the message
    if (WAKE_WORDS.some((kw) => textLower.includes(kw))) {
      this._fireChatImmediate('chat_wake', msg.text)
    }
    // No wake word → message is ignored by AI. No persistent "awake" state.
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

  // ========== VOICE SESSION (frontend-gated) ==========
  // The frontend only sends transcripts AFTER the user says "эй человек"
  // and gives their command. Every transcript here is a real command.

  _observeVoiceChannel() {
    const yVoice = this.doc.getArray('voice-channel')
    yVoice.observe((event) => {
      if (event.changes.delta.length === 0) return
      for (const change of event.changes.delta) {
        if (!change.insert) continue
        for (const entry of change.insert) {
          if (entry.type !== 'transcript') continue
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

  destroy() {
    clearTimeout(this.chatCooldownTimer)
    clearTimeout(this.voiceCooldownTimer)
    clearTimeout(this.chatStuckTimer)
    clearTimeout(this.voiceStuckTimer)
  }
}

module.exports = { TriggerManager }
