import { realtime } from "@/shared/lib/socket";

export type PeerState = "new" | "connecting" | "connected" | "failed" | "closed";

interface PeerEntry {
  connection: RTCPeerConnection;
  stream: MediaStream;
  audio: HTMLAudioElement;
  analyser: AnalyserNode | null;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  renegotiate: boolean;
  pendingCandidates: RTCIceCandidateInit[];
}

type StreamListener = (peerId: number, stream: MediaStream) => void;
type StateListener = (peerId: number, state: PeerState) => void;
type LevelListener = (levels: Map<number, number>) => void;

const DEFAULT_ICE: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302"] }];

export class PeerManager {
  private peers = new Map<number, PeerEntry>();
  private localStream: MediaStream | null = null;
  private iceServers: RTCIceServer[] = DEFAULT_ICE;
  private context: AudioContext | null = null;
  private streamListeners = new Set<StreamListener>();
  private stateListeners = new Set<StateListener>();
  private levelListeners = new Set<LevelListener>();
  private levelTimer: number | null = null;
  private outputMuted = new Set<number>();
  private blockedListeners = new Set<(blocked: boolean) => void>();
  private playbackBlocked = false;
  private silence: HTMLAudioElement | null = null;

  configure(servers: RTCIceServer[]): void {
    if (servers.length > 0) {
      this.iceServers = servers;
    }
  }

  setLocalStream(stream: MediaStream | null): void {
    this.localStream = stream;
    const track = stream?.getAudioTracks()[0] ?? null;
    this.peers.forEach((entry) => this.attachLocalTrack(entry, track));
  }

  /**
   * Puts the microphone on the peer's existing audio transceiver. Adding a
   * track instead would open a second m line, and a peer built before the
   * microphone was ready has already answered recvonly, so the direction has to
   * be restored as well: replaceTrack never renegotiates on its own, and
   * without that the side stays connected but is never heard.
   */
  private attachLocalTrack(entry: PeerEntry, track: MediaStreamTrack | null): void {
    const transceivers = entry.connection.getTransceivers();
    const audio =
      transceivers.find(
        (item) => item.sender.track?.kind === "audio" || item.receiver.track?.kind === "audio",
      ) ?? transceivers[0];

    if (!audio) {
      if (track && this.localStream) {
        entry.connection.addTrack(track, this.localStream);
      }
      return;
    }

    void audio.sender.replaceTrack(track);
    if (track && audio.direction !== "sendrecv") {
      audio.direction = "sendrecv";
    }
  }

  private ensureContext(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext();
    }
    return this.context;
  }

  onBlocked(listener: (blocked: boolean) => void): () => void {
    this.blockedListeners.add(listener);
    return () => {
      this.blockedListeners.delete(listener);
    };
  }

  private announceBlocked(blocked: boolean): void {
    if (this.playbackBlocked === blocked) {
      return;
    }
    this.playbackBlocked = blocked;
    this.blockedListeners.forEach((listener) => listener(blocked));
  }

  private async play(entry: PeerEntry): Promise<void> {
    try {
      await entry.audio.play();
      this.announceBlocked(false);
    } catch {
      // Telegram webviews and iOS Safari refuse playback that did not start
      // from a user gesture, so the call surfaces a tap to hear affordance.
      this.announceBlocked(true);
    }
  }

  /** Must run inside a user gesture: primes playback and the audio context. */
  async unlock(): Promise<void> {
    const context = this.ensureContext();
    if (context.state === "suspended") {
      await context.resume().catch(() => undefined);
    }
    if (!this.silence) {
      const element = document.createElement("audio");
      element.setAttribute("playsinline", "");
      element.muted = true;
      element.loop = true;
      element.style.display = "none";
      // A one sample silent wav is enough to mark the element as user started.
      element.src =
        "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=";
      document.body.appendChild(element);
      this.silence = element;
    }
    await this.silence.play().catch(() => undefined);
    // play() can stay pending forever on a device with no audio output, and the
    // tap to hear button would spin with it, so the unlock gives up on its own.
    await Promise.race([
      Promise.all([...this.peers.values()].map((entry) => this.play(entry))),
      new Promise((resolve) => window.setTimeout(resolve, 1500)),
    ]);
  }

  private async offer(peerId: number, entry: PeerEntry): Promise<void> {
    try {
      entry.makingOffer = true;
      await entry.connection.setLocalDescription();
      const description = entry.connection.localDescription;
      if (description) {
        realtime.send("rtc.signal", {
          kind: "offer",
          to: peerId,
          sdpType: description.type,
          sdp: description.sdp,
        });
      }
    } catch {
      /* negotiation retried on the next event */
    } finally {
      entry.makingOffer = false;
    }
  }

  private createPeer(peerId: number, polite: boolean): PeerEntry {
    const connection = new RTCPeerConnection({
      iceServers: this.iceServers,
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
    });

    const stream = new MediaStream();
    const audio = document.createElement("audio");
    audio.autoplay = true;
    audio.srcObject = stream;
    audio.setAttribute("playsinline", "");
    audio.setAttribute("autoplay", "");
    audio.style.display = "none";
    // Some webviews refuse to start playback on a detached element.
    document.body.appendChild(audio);

    const entry: PeerEntry = {
      connection,
      stream,
      audio,
      analyser: null,
      polite,
      makingOffer: false,
      ignoreOffer: false,
      renegotiate: false,
      pendingCandidates: [],
    };

    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        connection.addTrack(track, this.localStream as MediaStream);
      });
    } else {
      connection.addTransceiver("audio", { direction: "sendrecv" });
    }

    connection.onnegotiationneeded = () => {
      void this.offer(peerId, entry);
    };

    connection.onicecandidate = (event) => {
      if (event.candidate) {
        realtime.send("rtc.signal", {
          kind: "ice",
          to: peerId,
          candidate: {
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex,
          },
        });
      }
    };

    connection.ontrack = (event) => {
      event.streams[0]?.getTracks().forEach((track) => {
        if (!stream.getTracks().includes(track)) {
          stream.addTrack(track);
        }
      });
      void this.play(entry);
      this.attachAnalyser(peerId, entry);
      this.streamListeners.forEach((listener) => listener(peerId, stream));
    };

    connection.onsignalingstatechange = () => {
      if (connection.signalingState !== "stable" || !entry.renegotiate) {
        return;
      }
      entry.renegotiate = false;
      void this.offer(peerId, entry);
    };

    connection.onconnectionstatechange = () => {
      const state = connection.connectionState as PeerState;
      this.stateListeners.forEach((listener) => listener(peerId, state));
      if (state === "failed") {
        void connection.restartIce();
      }
    };

    this.peers.set(peerId, entry);
    this.startLevelLoop();
    return entry;
  }

  private attachAnalyser(peerId: number, entry: PeerEntry): void {
    if (entry.analyser || entry.stream.getAudioTracks().length === 0) {
      return;
    }
    try {
      const context = this.ensureContext();
      const source = context.createMediaStreamSource(entry.stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.7;
      source.connect(analyser);
      entry.analyser = analyser;
      void peerId;
    } catch {
      entry.analyser = null;
    }
  }

  connect(peerId: number, polite: boolean): void {
    if (this.peers.has(peerId)) {
      return;
    }
    this.createPeer(peerId, polite);
  }

  async handleSignal(kind: string, peerId: number, data: Record<string, unknown>): Promise<void> {
    let entry = this.peers.get(peerId);
    if (!entry) {
      entry = this.createPeer(peerId, true);
    }
    const connection = entry.connection;

    if (kind === "offer" || kind === "answer") {
      const description = data as unknown as RTCSessionDescriptionInit;
      const offerCollision =
        description.type === "offer" && (entry.makingOffer || connection.signalingState !== "stable");
      entry.ignoreOffer = !entry.polite && offerCollision;
      if (entry.ignoreOffer) {
        entry.renegotiate = true;
        return;
      }
      try {
        if (offerCollision) {
          await connection.setLocalDescription({ type: "rollback" });
        }
        await connection.setRemoteDescription(description);
        for (const candidate of entry.pendingCandidates.splice(0)) {
          await connection.addIceCandidate(candidate).catch(() => undefined);
        }
        if (description.type === "offer") {
          await connection.setLocalDescription();
          const local = connection.localDescription;
          if (local) {
            realtime.send("rtc.signal", {
              kind: "answer",
              to: peerId,
              sdpType: local.type,
              sdp: local.sdp,
            });
          }
        }
      } catch {
        /* ignore malformed descriptions */
      }
      return;
    }

    if (kind === "ice") {
      const candidate = data as RTCIceCandidateInit;
      if (!candidate.candidate) {
        return;
      }
      if (!connection.remoteDescription) {
        entry.pendingCandidates.push(candidate);
        return;
      }
      await connection.addIceCandidate(candidate).catch(() => undefined);
    }
  }

  debugPeers(): { peerId: number; connection: RTCPeerConnection }[] {
    return [...this.peers.entries()].map(([peerId, entry]) => ({
      peerId,
      connection: entry.connection,
    }));
  }

  setPeerMuted(peerId: number, muted: boolean): void {
    const entry = this.peers.get(peerId);
    if (!entry) {
      return;
    }
    entry.audio.muted = muted;
    if (muted) {
      this.outputMuted.add(peerId);
    } else {
      this.outputMuted.delete(peerId);
    }
  }

  restrictAudio(allowed: number[] | null): void {
    this.peers.forEach((entry, peerId) => {
      const muted = allowed !== null && !allowed.includes(peerId);
      entry.audio.muted = muted;
    });
  }

  disconnect(peerId: number): void {
    const entry = this.peers.get(peerId);
    if (entry) {
      entry.audio.remove();
    }
    if (!entry) {
      return;
    }
    entry.connection.getSenders().forEach((sender) => {
      try {
        entry.connection.removeTrack(sender);
      } catch {
        /* already detached */
      }
    });
    entry.connection.close();
    entry.audio.srcObject = null;
    this.peers.delete(peerId);
    this.stateListeners.forEach((listener) => listener(peerId, "closed"));
    if (this.peers.size === 0) {
      this.stopLevelLoop();
    }
  }

  closeAll(): void {
    [...this.peers.keys()].forEach((peerId) => this.disconnect(peerId));
    this.stopLevelLoop();
    void this.context?.close();
    this.context = null;
  }

  get peerIds(): number[] {
    return [...this.peers.keys()];
  }

  onStream(listener: StreamListener): () => void {
    this.streamListeners.add(listener);
    return () => this.streamListeners.delete(listener);
  }

  onState(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onLevels(listener: LevelListener): () => void {
    this.levelListeners.add(listener);
    this.startLevelLoop();
    return () => {
      this.levelListeners.delete(listener);
    };
  }

  private startLevelLoop(): void {
    if (this.levelTimer !== null) {
      return;
    }
    const buffer = new Float32Array(512);
    this.levelTimer = window.setInterval(() => {
      if (this.levelListeners.size === 0) {
        return;
      }
      const levels = new Map<number, number>();
      this.peers.forEach((entry, peerId) => {
        if (!entry.analyser) {
          levels.set(peerId, 0);
          return;
        }
        entry.analyser.getFloatTimeDomainData(buffer);
        let sum = 0;
        for (let index = 0; index < buffer.length; index += 1) {
          sum += buffer[index] * buffer[index];
        }
        levels.set(peerId, Math.min(1, Math.sqrt(sum / buffer.length) * 16));
      });
      this.levelListeners.forEach((listener) => listener(levels));
    }, 120);
  }

  private stopLevelLoop(): void {
    if (this.levelTimer !== null) {
      window.clearInterval(this.levelTimer);
      this.levelTimer = null;
    }
  }
}

export const peerManager = new PeerManager();

if (import.meta.env.DEV) {
  (window as unknown as { __peerManager?: PeerManager }).__peerManager = peerManager;
}

realtime.on("rtc.offer", (payload) => {
  void peerManager.handleSignal(
    "offer",
    Number(payload.from),
    payload.description as Record<string, unknown>,
  );
});

realtime.on("rtc.answer", (payload) => {
  void peerManager.handleSignal(
    "answer",
    Number(payload.from),
    payload.description as Record<string, unknown>,
  );
});

realtime.on("rtc.ice", (payload) => {
  void peerManager.handleSignal("ice", Number(payload.from), payload.candidate as Record<string, unknown>);
});
