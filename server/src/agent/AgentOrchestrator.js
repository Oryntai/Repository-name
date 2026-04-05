const { TriggerManager } = require('./TriggerManager')
const { ContextBuilder } = require('./ContextBuilder')
const { LLMClient } = require('./LLMClient')
const { ActionExecutor } = require('./ActionExecutor')
const { HiggsClient } = require('./HiggsClient')

const AGENT_NAME = 'AI Assistant'

class AgentOrchestrator {
  constructor(doc) {
    this.doc = doc

    // Initialize modules
    this.contextBuilder = new ContextBuilder(doc)
    this.llmClient = new LLMClient()
    this.higgsClient = new HiggsClient()
    this.actionExecutor = new ActionExecutor(doc, this.higgsClient)

    // Two separate trigger callbacks: chat session + voice session
    this.triggerManager = new TriggerManager(doc, {
      onChatTrigger: this._onChatTrigger.bind(this),
      onVoiceTrigger: this._onVoiceTrigger.bind(this),
      onSuggestionTrigger: this._onSuggestionTrigger.bind(this),
    })

    this._setupPresence()
    this._setupCleanup()

    console.log(`[agent] ${AGENT_NAME} initialized — chat + voice sessions ready`)
  }

  _setupPresence() {
    if (!this.doc.awareness) {
      console.warn('[agent] No awareness on doc — agent presence will not be visible')
      return
    }

    this.doc.awareness.setLocalStateField('user', { name: AGENT_NAME })
    this.doc.awareness.setLocalStateField('presence', {
      odcursor: { x: 500, y: 300, type: 'default', rotation: 0 },
      color: '#7c6fff',
      camera: { x: 0, y: 0, z: 1 },
      currentPageId: 'page:page',
      selectedShapeIds: [],
      screenBounds: { x: 0, y: 0, w: 1920, h: 1080 },
      lastActivity: Date.now(),
    })

    this._presenceInterval = setInterval(() => {
      if (this.doc.awareness) {
        this.doc.awareness.setLocalStateField('presence', {
          ...this.doc.awareness.getLocalState()?.presence,
          lastActivity: Date.now(),
        })
      }
    }, 15000)

    // Watch for AI status reset ("пока человек") — clear busy/cooldown
    const yStatus = this.doc.getMap('ai-status')
    let lastPhase = yStatus.get('phase') || 'WAITING'
    yStatus.observe(() => {
      const phase = yStatus.get('phase') || 'WAITING'
      if (phase === 'WAITING' && lastPhase !== 'WAITING') {
        this.triggerManager.forceReset()
      }
      lastPhase = phase
    })
  }

  // ========== CHAT SESSION ==========
  // Reads chat + canvas → LLM with tools → creates shapes / sends chat messages

  async _onChatTrigger(reason, mentionText) {
    console.log(`[agent-chat] Processing: ${reason}`)

    const context = this.contextBuilder.build(reason, mentionText)
    const actions = await this.llmClient.call(context)

    if (actions.length === 0) {
      console.log('[agent-chat] LLM returned no actions')
      return
    }

    this._moveCursorNear(actions)
    await this.actionExecutor.execute(actions)
  }

  // ========== VOICE SESSION ==========
  // Reads voice transcript + canvas context → LLM (no tools) → returns text for TTS

  async _onVoiceTrigger(transcript, userName) {
    console.log(`[agent-voice] Processing transcript from ${userName}: "${transcript}"`)

    // Get canvas screenshot + bounds if available (from the latest voice-channel entry)
    const yVoice = this.doc.getArray('voice-channel')
    const allEntries = yVoice.toArray()
    const latestTranscript = allEntries.filter((e) => e.type === 'transcript').pop()
    const canvasImage = latestTranscript?.image || null
    const canvasImageBounds = latestTranscript?.imageBounds || null

    const canvasContext = this.contextBuilder.buildVoiceContext()
    const { speech, actions } = await this.llmClient.callVoice(transcript, canvasContext, canvasImage)

    // Execute canvas actions if any
    if (actions.length > 0) {
      this._moveCursorNear(actions)
      this.actionExecutor.canvasImage = canvasImage
      this.actionExecutor.canvasImageBounds = canvasImageBounds
      await this.actionExecutor.execute(actions)
      this.actionExecutor.canvasImage = null
      this.actionExecutor.canvasImageBounds = null
    }

    // Push speech response for frontend TTS
    if (speech.trim()) {
      yVoice.push([{
        type: 'response',
        text: speech,
        timestamp: Date.now(),
      }])
      const yLog = this.doc.getArray('action-log')
      yLog.push([{ user: 'AI Assistant', action: `spoke: "${speech.substring(0, 60)}"`, timestamp: Date.now() }])
      console.log(`[agent-voice] TTS: "${speech.substring(0, 60)}..."`)
    }
  }

  // ========== TENTATIVE SUGGESTIONS ==========
  // Analyzes canvas screenshot and places a ghost shape the user can accept/dismiss

  async _onSuggestionTrigger(canvasImage) {
    console.log('[agent-suggest] Analyzing canvas for suggestion...')

    const canvasContext = this.contextBuilder.buildVoiceContext()
    const suggestion = await this.llmClient.callSuggestion(canvasImage, canvasContext)

    if (!suggestion) {
      console.log('[agent-suggest] No suggestion from LLM')
      return
    }

    // Create a ghost sticky note with low opacity + tentative flag
    const pos = this.actionExecutor._computePosition(null)
    const id = `shape:suggest_${Date.now()}`
    const yStore = this.doc.getMap('tldraw')

    this.doc.transact(() => {
      yStore.set(id, {
        id,
        typeName: 'shape',
        type: 'geo',
        x: pos.x,
        y: pos.y,
        rotation: 0,
        index: 'a' + Date.now().toString().slice(-4),
        parentId: 'page:page',
        isLocked: false,
        opacity: 0.4,
        props: {
          geo: 'rectangle',
          w: 200,
          h: 100,
          dash: 'draw',
          size: 'l',
          font: 'sans',
          color: suggestion.color || 'light-blue',
          fill: 'solid',
          align: 'middle',
          verticalAlign: 'middle',
          text: '',
          label: suggestion.text,
          labelColor: 'black',
          growY: 0,
          url: '',
          scale: 1,
        },
        meta: { tentative: true, createdBy: 'ai-agent' },
      })
    })

    console.log(`[agent-suggest] Placed tentative: "${suggestion.text}"`)
  }

  // Trim voice-channel and chat arrays to prevent unbounded growth
  _setupCleanup() {
    const MAX_VOICE_ENTRIES = 20
    const MAX_CHAT_ENTRIES = 50

    this._cleanupInterval = setInterval(() => {
      try {
        const yVoice = this.doc.getArray('voice-channel')
        if (yVoice.length > MAX_VOICE_ENTRIES) {
          const toRemove = yVoice.length - MAX_VOICE_ENTRIES
          this.doc.transact(() => { yVoice.delete(0, toRemove) })
          console.log(`[agent] Trimmed ${toRemove} old voice-channel entries`)
        }

        const yChat = this.doc.getArray('chat')
        if (yChat.length > MAX_CHAT_ENTRIES) {
          const toRemove = yChat.length - MAX_CHAT_ENTRIES
          this.doc.transact(() => { yChat.delete(0, toRemove) })
          console.log(`[agent] Trimmed ${toRemove} old chat entries`)
        }

        const ySuggestions = this.doc.getArray('suggestions')
        if (ySuggestions.length > 5) {
          const toRemove = ySuggestions.length - 5
          this.doc.transact(() => { ySuggestions.delete(0, toRemove) })
        }

        const yLog = this.doc.getArray('action-log')
        if (yLog.length > 30) {
          const toRemove = yLog.length - 30
          this.doc.transact(() => { yLog.delete(0, toRemove) })
        }
      } catch (err) {
        console.warn('[agent] Cleanup error:', err.message)
      }
    }, 30000) // Every 30 seconds
  }

  _moveCursorNear(actions) {
    if (!this.doc.awareness) return

    const addAction = actions.find(
      (a) => a.name === 'add_idea' || a.name === 'add_question'
    )
    if (!addAction?.args?.nearShapeId) return

    const refShape = this.doc.getMap('tldraw').get(addAction.args.nearShapeId)
    if (refShape) {
      this.doc.awareness.setLocalStateField('presence', {
        ...this.doc.awareness.getLocalState()?.presence,
        odcursor: {
          x: (refShape.x || 500) + 100,
          y: (refShape.y || 300) + 50,
          type: 'default',
          rotation: 0,
        },
        lastActivity: Date.now(),
      })
    }
  }

  destroy() {
    clearInterval(this._presenceInterval)
    clearInterval(this._cleanupInterval)
    this.triggerManager.destroy()
  }
}

module.exports = { AgentOrchestrator }
