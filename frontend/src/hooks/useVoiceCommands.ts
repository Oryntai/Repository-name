import { useEffect, useRef, useState, useCallback } from 'react'
import type { Editor } from 'tldraw'
import * as Y from 'yjs'

const WAKE_PHRASES = ['эй человек', 'эй, человек', 'hey human']
const SLEEP_PHRASES = ['пока человек', 'пока, человек', 'bye human']

const triggerSound = new Audio('/ai-trigger.mp3')
triggerSound.volume = 0.6

/**
 * STATE MACHINE:
 *
 * WAITING  — SpeechRecognition always on, only checking for "эй человек". Zero tokens.
 *    │
 *    ├── "эй человек" detected
 *    │       → play sound IMMEDIATELY
 *    │       → show "AI on"
 *    ▼
 * TRIGGERED — listening for the user's actual command (next utterance)
 *    │
 *    ├── "пока человек" → back to WAITING
 *    ├── any other speech → capture as command
 *    ▼
 * PROCESSING — command + canvas screenshot sent to server → LLM → TTS
 *    │
 *    └── after TTS finishes → back to WAITING
 */
type Phase = 'WAITING' | 'TRIGGERED' | 'PROCESSING'

interface VoiceEntry {
  type: 'transcript' | 'response'
  text: string
  user?: string
  image?: string // base64 canvas screenshot
  timestamp: number
}

export function useVoiceCommands(
  doc: Y.Doc | null,
  isVoiceActive: boolean,
  userName: string,
  editor: Editor | null,
) {
  const [phase, setPhase] = useState<Phase>('WAITING')
  const [isSpeaking, setIsSpeaking] = useState(false)
  const phaseRef = useRef<Phase>('WAITING')
  const recognitionRef = useRef<any>(null)
  const restartTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const processedRef = useRef<Set<number>>(new Set())
  const editorRef = useRef(editor)
  editorRef.current = editor

  // Sync ref with state
  useEffect(() => { phaseRef.current = phase }, [phase])

  // --- Watch voice-channel for AI responses → TTS ---
  useEffect(() => {
    if (!doc) return
    const yVoice = doc.getArray<VoiceEntry>('voice-channel')

    const onUpdate = (event: Y.YArrayEvent<VoiceEntry>) => {
      for (const change of event.changes.delta) {
        if (!change.insert) continue
        for (const entry of change.insert as VoiceEntry[]) {
          if (entry.type !== 'response') continue
          if (processedRef.current.has(entry.timestamp)) continue
          processedRef.current.add(entry.timestamp)
          speakText(entry.text)
        }
      }
    }

    yVoice.observe(onUpdate)
    return () => yVoice.unobserve(onUpdate)
  }, [doc])

  // --- Start/stop recognition with voice chat ---
  useEffect(() => {
    if (!doc || !isVoiceActive) {
      stopRecognition()
      goToWaiting()
      return
    }
    startRecognition(doc)
    return () => stopRecognition()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, isVoiceActive])

  // ========== SPEECH RECOGNITION (always-on keyword spotter) ==========

  function startRecognition(yjsDoc: Y.Doc) {
    if (recognitionRef.current) return

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      console.warn('[voice] SpeechRecognition not supported')
      return
    }

    const recognition = new SR()
    recognition.continuous = true
    recognition.interimResults = false
    recognition.lang = 'ru-RU'
    recognition.maxAlternatives = 3

    recognition.onstart = () => console.log('[voice] Keyword spotter active')

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (!result.isFinal) continue

        const allTranscripts: string[] = []
        for (let j = 0; j < result.length; j++) {
          allTranscripts.push(result[j].transcript.toLowerCase().trim())
        }

        const primary = result[0].transcript.trim()
        console.log(`[voice] Heard: "${primary}" (phase=${phaseRef.current})`)

        handleSpeechResult(yjsDoc, allTranscripts, primary)
      }
    }

    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return
      console.warn(`[voice] Error: ${event.error}`)
    }

    recognition.onend = () => {
      // Auto-restart (Chrome stops after ~60s silence)
      if (recognitionRef.current) {
        clearTimeout(restartTimerRef.current)
        restartTimerRef.current = setTimeout(() => {
          try { recognitionRef.current?.start() } catch { /* ok */ }
        }, 300)
      }
    }

    try {
      recognition.start()
      recognitionRef.current = recognition
    } catch (err) {
      console.error('[voice] Start failed:', err)
    }
  }

  function stopRecognition() {
    clearTimeout(restartTimerRef.current)
    if (recognitionRef.current) {
      const r = recognitionRef.current
      recognitionRef.current = null
      r.onend = null
      try { r.stop() } catch { /* ok */ }
    }
  }

  // ========== STATE MACHINE ==========

  function handleSpeechResult(yjsDoc: Y.Doc, alternatives: string[], rawPrimary: string) {
    const current = phaseRef.current

    // Check for sleep command in any phase
    if (alternatives.some((t) => SLEEP_PHRASES.some((p) => t.includes(p)))) {
      console.log('[voice] Sleep command → WAITING')
      goToWaiting()
      return
    }

    if (current === 'WAITING') {
      // Only check for wake word — ignore everything else (zero tokens)
      if (alternatives.some((t) => WAKE_PHRASES.some((p) => t.includes(p)))) {
        console.log('[voice] >>> WAKE WORD DETECTED')
        triggerSound.currentTime = 0
        triggerSound.play().catch(() => {})
        setPhase('TRIGGERED')
        phaseRef.current = 'TRIGGERED'
        // Broadcast awake state to all clients
        yjsDoc.getMap('agent-control').set('command', { action: 'wake', source: 'voice', timestamp: Date.now() })
      }
      // Everything else is silently ignored — no tokens spent
      return
    }

    if (current === 'TRIGGERED') {
      // This is the user's actual command — send it to the LLM
      if (rawPrimary.length < 3) return // Too short, probably noise

      console.log(`[voice] Command captured: "${rawPrimary}"`)
      setPhase('PROCESSING')
      phaseRef.current = 'PROCESSING'

      // Capture canvas screenshot + send transcript
      captureAndSend(yjsDoc, rawPrimary)
      return
    }

    // PROCESSING — ignore speech while LLM is working
  }

  async function captureAndSend(yjsDoc: Y.Doc, transcript: string) {
    let image: string | null = null
    try {
      image = await captureCanvas()
    } catch (err) {
      console.warn('[voice] Canvas capture failed:', err)
    }

    const yVoice = yjsDoc.getArray('voice-channel')
    const entry: VoiceEntry = {
      type: 'transcript',
      text: transcript,
      user: userName,
      timestamp: Date.now(),
    }
    if (image) (entry as any).image = image

    yVoice.push([entry])
    console.log(`[voice] Transcript sent (image: ${image ? 'yes' : 'no'})`)
  }

  // ========== CANVAS SCREENSHOT (for vision) ==========

  async function captureCanvas(): Promise<string | null> {
    const ed = editorRef.current
    if (!ed) return null

    const shapeIds = [...ed.getCurrentPageShapeIds()]
    if (shapeIds.length === 0) return null

    try {
      // tldraw v2.4: getSvg returns an SVG element
      const svg = await (ed as any).getSvg(shapeIds)
      if (!svg) return null

      const svgString = new XMLSerializer().serializeToString(svg)
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(svgBlob)

      return await new Promise<string | null>((resolve) => {
        const img = new Image()
        img.onload = () => {
          // Scale down to save tokens — 800px max dimension
          const scale = Math.min(1, 800 / Math.max(img.width, img.height))
          const w = Math.round(img.width * scale)
          const h = Math.round(img.height * scale)

          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d')!
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, w, h)
          ctx.drawImage(img, 0, 0, w, h)

          URL.revokeObjectURL(url)
          resolve(canvas.toDataURL('image/jpeg', 0.6))
        }
        img.onerror = () => {
          URL.revokeObjectURL(url)
          resolve(null)
        }
        img.src = url
      })
    } catch {
      return null
    }
  }

  // ========== TTS ==========

  function speakText(text: string) {
    if (!text.trim() || !window.speechSynthesis) return

    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = /[а-яё]/i.test(text) ? 'ru-RU' : 'en-US'
    utterance.rate = 1.05
    utterance.volume = 1.0

    const voices = window.speechSynthesis.getVoices()
    const preferred = voices.find(
      (v) => v.lang.startsWith(utterance.lang.substring(0, 2)) && v.localService
    )
    if (preferred) utterance.voice = preferred

    utterance.onstart = () => setIsSpeaking(true)
    utterance.onend = () => {
      setIsSpeaking(false)
      // After TTS finishes → back to WAITING
      goToWaiting()
    }
    utterance.onerror = () => {
      setIsSpeaking(false)
      goToWaiting()
    }

    window.speechSynthesis.speak(utterance)
  }

  function goToWaiting() {
    setPhase('WAITING')
    phaseRef.current = 'WAITING'
  }

  // ========== MANUAL CONTROLS (for chat / button) ==========

  const manualWake = useCallback(() => {
    if (!doc) return
    triggerSound.currentTime = 0
    triggerSound.play().catch(() => {})
    setPhase('TRIGGERED')
    phaseRef.current = 'TRIGGERED'
    doc.getMap('agent-control').set('command', { action: 'wake', source: 'button', timestamp: Date.now() })
  }, [doc])

  const manualSleep = useCallback(() => {
    if (!doc) return
    goToWaiting()
    doc.getMap('agent-control').set('command', { action: 'sleep', source: 'button', timestamp: Date.now() })
  }, [doc])

  const agentAwake = phase !== 'WAITING'
  const isListening = recognitionRef.current !== null

  return { phase, agentAwake, isListening, isSpeaking, manualWake, manualSleep }
}
