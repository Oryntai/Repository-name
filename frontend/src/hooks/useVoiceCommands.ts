import { useEffect, useRef, useState, useCallback } from 'react'
import * as Y from 'yjs'

// Extend Window for webkit prefix
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
  resultIndex: number
}

const WAKE_PHRASES = ['эй человек', 'эй, человек', 'hey human']
const SLEEP_PHRASES = ['пока человек', 'пока, человек', 'bye human']
const DEBOUNCE_MS = 3000 // Prevent repeated triggers within 3s

/**
 * Uses the browser's Web Speech API to listen for voice wake/sleep commands.
 * Only active when the user is in voice chat.
 * Writes commands to Y.Map('agent-control') for the server-side agent to observe.
 */
export function useVoiceCommands(
  doc: Y.Doc | null,
  isVoiceActive: boolean,
) {
  const [isListening, setIsListening] = useState(false)
  const [agentAwake, setAgentAwake] = useState(false)
  const recognitionRef = useRef<any>(null)
  const lastCommandRef = useRef<number>(0)
  const restartTimerRef = useRef<ReturnType<typeof setTimeout>>()

  // Watch agent status from server
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

  // Start/stop speech recognition based on voice chat state
  useEffect(() => {
    if (!doc || !isVoiceActive) {
      stopRecognition()
      return
    }

    startRecognition(doc)

    return () => stopRecognition()
  }, [doc, isVoiceActive])

  function startRecognition(yjsDoc: Y.Doc) {
    if (recognitionRef.current) return // Already running

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

    if (!SpeechRecognition) {
      console.warn('[voice-cmd] SpeechRecognition not supported in this browser')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = false
    recognition.lang = 'ru-RU'
    recognition.maxAlternatives = 3

    recognition.onstart = () => {
      console.log('[voice-cmd] Speech recognition started')
      setIsListening(true)
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (!result.isFinal) continue

        // Check all alternatives for better matching
        for (let j = 0; j < result.length; j++) {
          const transcript = result[j].transcript.toLowerCase().trim()
          console.log(`[voice-cmd] Heard: "${transcript}" (confidence: ${result[j].confidence.toFixed(2)})`)

          // Debounce: prevent repeated commands within 3s
          const now = Date.now()
          if (now - lastCommandRef.current < DEBOUNCE_MS) continue

          if (WAKE_PHRASES.some((p) => transcript.includes(p))) {
            lastCommandRef.current = now
            console.log('[voice-cmd] WAKE command detected')
            sendCommand(yjsDoc, 'wake')
            return
          }

          if (SLEEP_PHRASES.some((p) => transcript.includes(p))) {
            lastCommandRef.current = now
            console.log('[voice-cmd] SLEEP command detected')
            sendCommand(yjsDoc, 'sleep')
            return
          }
        }
      }
    }

    recognition.onerror = (event: any) => {
      // 'no-speech' and 'aborted' are normal when user is quiet
      if (event.error === 'no-speech' || event.error === 'aborted') return
      console.warn(`[voice-cmd] Error: ${event.error}`)
    }

    recognition.onend = () => {
      // Auto-restart if voice is still active (Chrome stops after ~60s of silence)
      if (isVoiceActive && recognitionRef.current) {
        clearTimeout(restartTimerRef.current)
        restartTimerRef.current = setTimeout(() => {
          try {
            recognitionRef.current?.start()
          } catch {
            // Already started or destroyed
          }
        }, 300)
      } else {
        setIsListening(false)
      }
    }

    try {
      recognition.start()
      recognitionRef.current = recognition
    } catch (err) {
      console.error('[voice-cmd] Failed to start:', err)
    }
  }

  function stopRecognition() {
    clearTimeout(restartTimerRef.current)
    if (recognitionRef.current) {
      recognitionRef.current.onend = null // Prevent auto-restart
      try {
        recognitionRef.current.stop()
      } catch {
        // Already stopped
      }
      recognitionRef.current = null
    }
    setIsListening(false)
  }

  function sendCommand(yjsDoc: Y.Doc, action: 'wake' | 'sleep') {
    const yControl = yjsDoc.getMap('agent-control')
    yControl.set('command', {
      action,
      source: 'voice',
      timestamp: Date.now(),
    })
  }

  // Manual wake/sleep from chat (for non-voice users)
  const manualWake = useCallback(() => {
    if (!doc) return
    sendCommand(doc, 'wake')
  }, [doc])

  const manualSleep = useCallback(() => {
    if (!doc) return
    sendCommand(doc, 'sleep')
  }, [doc])

  return { isListening, agentAwake, manualWake, manualSleep }
}
