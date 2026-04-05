const COOLDOWN_MS = 15000
const VOICE_COOLDOWN_MS = 5000
const STUCK_TIMEOUT_MS = 60000
const AGENT_NAME = 'AI Assistant'

const WAKE_WORDS = ['эй человек', 'эй, человек', 'hey human', '@ai']


/**
 * Single global lock: only one request (chat OR voice) can be processed at a time.
 * The second caller is ignored — they must re-trigger after the first completes.
 */
class TriggerManager {
  constructor(doc, { onChatTrigger, onVoiceTrigger }) {
    this.doc = doc
    this.onChatTrigger = onChatTrigger
    this.onVoiceTrigger = onVoiceTrigger

    // Global lock — only one request at a time across both channels
    this.busy = false
    this.cooldownTimer = null
    this.stuckTimer = null

    // Track init time — ignore entries that existed before agent started
    this._initTime = Date.now()

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
    // Skip messages that existed before agent started (initial Yjs sync)
    if (msg.timestamp && msg.timestamp < this._initTime) return

    const textLower = msg.text.toLowerCase()
    const isWake = WAKE_WORDS.some((kw) => textLower.includes(kw))
    const reason = isWake ? 'chat_wake' : 'chat_message'

    this._fireChatImmediate(reason, msg.text)
  }

  _fireChatImmediate(reason, text) {
    if (this.busy) {
      console.log('[trigger-chat] Skipping — agent is busy')
      return
    }

    this._lock()
    console.log(`[trigger-chat] Firing: ${reason}`)

    this.onChatTrigger(reason, text)
      .then(() => this._unlock(COOLDOWN_MS))
      .catch((err) => {
        console.error('[trigger-chat] Error:', err.message)
        this._unlock(0)
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
          // Skip old transcripts from before agent started
          if (entry.timestamp && entry.timestamp < this._initTime) continue
          this._fireVoiceImmediate(entry)
        }
      }
    })
  }

  _fireVoiceImmediate(entry) {
    if (this.busy) {
      console.log('[trigger-voice] Skipping — agent is busy')
      return
    }

    this._lock()
    console.log(`[trigger-voice] Firing for transcript: "${entry.text}"`)

    this.onVoiceTrigger(entry.text, entry.user)
      .then(() => this._unlock(VOICE_COOLDOWN_MS))
      .catch((err) => {
        console.error('[trigger-voice] Error:', err.message)
        this._unlock(0)
      })
  }

  _lock() {
    this.busy = true
    clearTimeout(this.cooldownTimer)
    clearTimeout(this.stuckTimer)
    this.stuckTimer = setTimeout(() => {
      if (this.busy) {
        console.warn('[trigger] Force-reset from stuck busy state')
        this.busy = false
      }
    }, STUCK_TIMEOUT_MS)
  }

  _unlock(cooldownMs) {
    clearTimeout(this.stuckTimer)
    if (cooldownMs > 0) {
      this.cooldownTimer = setTimeout(() => {
        this.busy = false
        console.log('[trigger] Cooldown ended — ready')
      }, cooldownMs)
    } else {
      this.busy = false
    }
  }

  destroy() {
    clearTimeout(this.cooldownTimer)
    clearTimeout(this.stuckTimer)
  }
}

module.exports = { TriggerManager }
