import * as Y from 'yjs'

interface Awareness {
  clientID: number
  getStates(): Map<number, Record<string, any>>
  setLocalStateField(field: string, value: any): void
  on(event: string, cb: (...args: any[]) => void): void
  off(event: string, cb: (...args: any[]) => void): void
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
}

export class VoiceManager {
  private doc: Y.Doc
  private awareness: Awareness
  private myId: number
  private localStream: MediaStream | null = null
  private peers = new Map<number, RTCPeerConnection>()
  private audioElements = new Map<number, HTMLAudioElement>()
  private ySignaling: Y.Map<any>
  private signalSeq = 0
  private joinedAt = 0
  private onChange: () => void
  private boundAwareness: () => void
  private boundSignaling: (e: Y.YMapEvent<any>) => void

  constructor(doc: Y.Doc, awareness: Awareness, onChange: () => void) {
    this.doc = doc
    this.awareness = awareness
    this.myId = awareness.clientID
    this.ySignaling = doc.getMap('voice-signaling')
    this.onChange = onChange

    this.boundAwareness = this.onAwarenessChange.bind(this)
    this.boundSignaling = this.onSignalingChange.bind(this)

    awareness.on('change', this.boundAwareness)
    this.ySignaling.observe(this.boundSignaling)
  }

  async start() {
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
    })
    this.joinedAt = Date.now()
    this.awareness.setLocalStateField('voice', {
      active: true,
      joinedAt: this.joinedAt,
    })

    // Connect to peers already in voice — lower clientID initiates
    this.awareness.getStates().forEach((state, clientId) => {
      if (clientId !== this.myId && state.voice?.active) {
        if (this.myId < clientId) {
          this.createConnection(clientId, true)
        }
      }
    })

    this.onChange()
  }

  stop() {
    this.localStream?.getTracks().forEach((t) => t.stop())
    this.localStream = null
    this.peers.forEach((pc) => pc.close())
    this.peers.clear()
    this.audioElements.forEach((el) => {
      el.srcObject = null
      el.remove()
    })
    this.audioElements.clear()
    this.awareness.setLocalStateField('voice', { active: false })
    this.onChange()
  }

  toggleMute(): boolean {
    const track = this.localStream?.getAudioTracks()[0]
    if (!track) return false
    track.enabled = !track.enabled
    return !track.enabled
  }

  getActivePeerCount(): number {
    return this.peers.size
  }

  destroy() {
    this.stop()
    this.awareness.off('change', this.boundAwareness)
    this.ySignaling.unobserve(this.boundSignaling)
  }

  // --- Awareness: detect peers joining / leaving voice ---

  private onAwarenessChange() {
    if (!this.localStream) return

    this.awareness.getStates().forEach((state, clientId) => {
      if (clientId === this.myId) return

      if (state.voice?.active && !this.peers.has(clientId)) {
        if (this.myId < clientId) {
          this.createConnection(clientId, true)
        }
      } else if (!state.voice?.active && this.peers.has(clientId)) {
        this.closeConnection(clientId)
      }
    })
    this.onChange()
  }

  // --- Signaling via Y.Map ---

  private onSignalingChange(event: Y.YMapEvent<any>) {
    event.changes.keys.forEach((change, key) => {
      if (change.action !== 'add' && change.action !== 'update') return

      const signal = this.ySignaling.get(key)
      if (!signal || signal.to !== this.myId) return
      if (signal.timestamp < this.joinedAt) return

      switch (signal.type) {
        case 'offer':
          this.handleOffer(signal.from, signal.data)
          break
        case 'answer':
          this.handleAnswer(signal.from, signal.data)
          break
        case 'ice-candidate':
          this.handleIceCandidate(signal.from, signal.data)
          break
      }
    })
  }

  private sendSignal(to: number, type: string, data: unknown) {
    const key = `${type}-${this.myId}-${to}-${this.signalSeq++}`
    this.ySignaling.set(key, {
      from: this.myId,
      to,
      type,
      data,
      timestamp: Date.now(),
    })
  }

  // --- WebRTC ---

  private async createConnection(peerId: number, initiator: boolean) {
    if (this.peers.has(peerId)) return

    const pc = new RTCPeerConnection(RTC_CONFIG)
    this.peers.set(peerId, pc)

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        pc.addTrack(track, this.localStream)
      }
    }

    pc.ontrack = (event) => {
      const audio = new Audio()
      audio.srcObject = event.streams[0]
      audio.autoplay = true
      this.audioElements.set(peerId, audio)
      this.onChange()
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal(peerId, 'ice-candidate', event.candidate.toJSON())
      }
    }

    pc.onconnectionstatechange = () => {
      if (
        pc.connectionState === 'failed' ||
        pc.connectionState === 'disconnected'
      ) {
        this.closeConnection(peerId)
      }
    }

    if (initiator) {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      this.sendSignal(peerId, 'offer', { type: offer.type, sdp: offer.sdp })
    }
  }

  private async handleOffer(from: number, data: RTCSessionDescriptionInit) {
    if (!this.localStream) return

    await this.createConnection(from, false)
    const pc = this.peers.get(from)
    if (!pc) return

    await pc.setRemoteDescription(new RTCSessionDescription(data))
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    this.sendSignal(from, 'answer', { type: answer.type, sdp: answer.sdp })
  }

  private async handleAnswer(from: number, data: RTCSessionDescriptionInit) {
    const pc = this.peers.get(from)
    if (!pc) return
    await pc.setRemoteDescription(new RTCSessionDescription(data))
  }

  private async handleIceCandidate(from: number, data: RTCIceCandidateInit) {
    const pc = this.peers.get(from)
    if (!pc) return
    try {
      await pc.addIceCandidate(new RTCIceCandidate(data))
    } catch {
      // may arrive before remote description is set
    }
  }

  private closeConnection(peerId: number) {
    this.peers.get(peerId)?.close()
    this.peers.delete(peerId)
    const audio = this.audioElements.get(peerId)
    if (audio) {
      audio.srcObject = null
      audio.remove()
      this.audioElements.delete(peerId)
    }
    this.onChange()
  }
}
