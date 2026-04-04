import { useEffect, useRef, useState, useCallback } from 'react'
import * as Y from 'yjs'

const WAKE_PHRASES = ['эй человек', 'эй, человек', 'hey human']
const SLEEP_PHRASES = ['пока человек', 'пока, человек', 'bye human']
const COMMAND_DEBOUNCE_MS = 3000
const aiSound = new Audio('/ai-trigger.mp3')
aiSound.volume = 0.5

interface VoiceEntry {
  type: 'transcript' | 'response'
  text: string
  user?: string
  timestamp: number
}

/**
 * Voice commands hook — handles two things:
 * 1. SpeechRecognition: listens to mic, detects wake/sleep, transcribes speech → Y.Array('voice-channel')
 * 2. SpeechSynthesis: watches voice-channel for AI responses → reads them aloud (TTS)
 */
export function useVoiceCommands(
  doc: Y.Doc | null,
  isVoiceActive: boolean,
  userName: string,
) {
  const [isListening, setIsListening] = useState(false)
  const [agentAwake, setAgentAwake] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const recognitionRef = useRef<any>(null)
  const lastCommandTimeRef = useRef<number>(0)
  const restartTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const processedResponsesRef = useRef<Set<number>>(new Set())

  // --- Watch agent status from server ---
  useEffect(() => {
    if (!doc) return
    const yControl = doc.getMap('agent-control')
    const onUpdate = () => {
      const status = yControl.get('status') as { awake: boolean } | undefined
      if (status) setAgentAwake(status.awake)
    }
    yControl.observe(onUpdate)
    onUpdate()
    return () => yControl.unobserve(onUpdate)
  }, [doc])

  // --- Watch voice-channel for AI responses → TTS ---
  useEffect(() => {
    if (!doc) return
    const yVoice = doc.getArray<VoiceEntry>('voice-channel')

    const onVoiceUpdate = (event: Y.YArrayEvent<VoiceEntry>) => {
      for (const change of event.changes.delta) {
        if (!change.insert) continue
        for (const entry of change.insert as VoiceEntry[]) {
          if (entry.type !== 'response') continue
          if (processedResponsesRef.current.has(entry.timestamp)) continue
          processedResponsesRef.current.add(entry.timestamp)
          aiSound.currentTime = 0
          aiSound.play().catch(() => {})
          speakText(entry.text)
        }
      }
    }

    yVoice.observe(onVoiceUpdate)
    return () => yVoice.unobserve(onVoiceUpdate)
  }, [doc])

  // --- Start/stop recognition based on voice chat ---
  useEffect(() => {
    if (!doc || !isVoiceActive) {
      stopRecognition()
      return
    }
    startRecognition(doc)
    return () => stopRecognition()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, isVoiceActive])

  // ========== SPEECH RECOGNITION ==========

  function startRecognition(yjsDoc: Y.Doc) {
    if (recognitionRef.current) return

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      console.warn('[voice-cmd] SpeechRecognition not supported')
      return
    }

    const recognition = new SR()
    recognition.continuous = true
    recognition.interimResults = false
    recognition.lang = 'ru-RU'
    recognition.maxAlternatives = 3

    recognition.onstart = () => {
      console.log('[voice-cmd] Listening...')
      setIsListening(true)
    }

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (!result.isFinal) continue

        const transcript = result[0].transcript.toLowerCase().trim()
        const confidence = result[0].confidence
        console.log(`[voice-cmd] "${transcript}" (${(confidence * 100).toFixed(0)}%)`)

        if (!transcript) continue

        const now = Date.now()

        // Check all alternatives for wake/sleep commands
        let isCommand = false
        for (let j = 0; j < result.length; j++) {
          const alt = result[j].transcript.toLowerCase().trim()

          if (WAKE_PHRASES.some((p) => alt.includes(p))) {
            if (now - lastCommandTimeRef.current > COMMAND_DEBOUNCE_MS) {
              lastCommandTimeRef.current = now
              console.log('[voice-cmd] >>> WAKE')
              sendControl(yjsDoc, 'wake')
              isCommand = true
            }
            break
          }
          if (SLEEP_PHRASES.some((p) => alt.includes(p))) {
            if (now - lastCommandTimeRef.current > COMMAND_DEBOUNCE_MS) {
              lastCommandTimeRef.current = now
              console.log('[voice-cmd] >>> SLEEP')
              sendControl(yjsDoc, 'sleep')
              isCommand = true
            }
            break
          }
        }

        // If agent is awake and this wasn't a command, send as transcript for AI to process
        if (!isCommand && agentAwakeRef.current) {
          const rawTranscript = result[0].transcript.trim() // Preserve original casing
          if (rawTranscript.length > 2) {
            sendTranscript(yjsDoc, rawTranscript)
          }
        }
      }
    }

    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return
      console.warn(`[voice-cmd] Error: ${event.error}`)
    }

    recognition.onend = () => {
      // Auto-restart — Chrome stops after ~60s of silence
      if (recognitionRef.current) {
        clearTimeout(restartTimerRef.current)
        restartTimerRef.current = setTimeout(() => {
          try { recognitionRef.current?.start() } catch { /* already running */ }
        }, 300)
      } else {
        setIsListening(false)
      }
    }

    try {
      recognition.start()
      recognitionRef.current = recognition
    } catch (err) {
      console.error('[voice-cmd] Start failed:', err)
    }
  }

  function stopRecognition() {
    clearTimeout(restartTimerRef.current)
    if (recognitionRef.current) {
      const r = recognitionRef.current
      recognitionRef.current = null // Prevent auto-restart
      r.onend = null
      try { r.stop() } catch { /* already stopped */ }
    }
    setIsListening(false)
  }

  // Keep a ref so the onresult callback sees current value
  const agentAwakeRef = useRef(agentAwake)
  agentAwakeRef.current = agentAwake

  // ========== SPEECH SYNTHESIS (TTS) ==========

  function speakText(text: string) {
    if (!text.trim()) return
    if (!window.speechSynthesis) {
      console.warn('[voice-cmd] SpeechSynthesis not supported')
      return
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = /[а-яё]/i.test(text) ? 'ru-RU' : 'en-US'
    utterance.rate = 1.05
    utterance.pitch = 1.0
    utterance.volume = 1.0

    // Try to pick a good voice
    const voices = window.speechSynthesis.getVoices()
    const preferred = voices.find(
      (v) => v.lang.startsWith(utterance.lang.substring(0, 2)) && v.localService
    )
    if (preferred) utterance.voice = preferred

    utterance.onstart = () => setIsSpeaking(true)
    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = () => setIsSpeaking(false)

    window.speechSynthesis.speak(utterance)
    console.log(`[voice-cmd] TTS: "${text.substring(0, 60)}..."`)
  }

  // ========== YJS WRITES ==========

  function sendControl(yjsDoc: Y.Doc, action: 'wake' | 'sleep') {
    yjsDoc.getMap('agent-control').set('command', {
      action,
      source: 'voice',
      timestamp: Date.now(),
    })
  }

  function sendTranscript(yjsDoc: Y.Doc, text: string) {
    const yVoice = yjsDoc.getArray('voice-channel')
    yVoice.push([
      {
        type: 'transcript',
        text,
        user: userName,
        timestamp: Date.now(),
      } as VoiceEntry,
    ])
    console.log(`[voice-cmd] Transcript sent: "${text}"`)
  }

  // Manual controls for non-voice users
  const manualWake = useCallback(() => {
    if (!doc) return
    sendControl(doc, 'wake')
  }, [doc])

  const manualSleep = useCallback(() => {
    if (!doc) return
    sendControl(doc, 'sleep')
  }, [doc])

  return { isListening, agentAwake, isSpeaking, manualWake, manualSleep }
}
