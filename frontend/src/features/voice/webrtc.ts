import { realtime } from "@/shared/lib/socket";

import { getAudioContext, isRunning, resumeAudio } from "./audioContext";

export type PeerState = "new" | "connecting" | "connected" | "failed" | "closed";

interface PeerEntry {
  connection: RTCPeerConnection;
  stream: MediaStream;
  audio: HTMLAudioElement;
  analyser: AnalyserNode | null;
  analyserSource: MediaStreamAudioSourceNode | null;
  polite: boolean;
  makingOffer: boolean;
  settingRemoteAnswer: boolean;
  pendingCandidates: RTCIceCandidateInit[];
  queue: Promise<void>;
  restarts: number;
  restartTimer: number | null;
  lastBytes: number;
  starvedChecks: number;
  outputMuted: boolean;
}

type StreamListener = (peerId: number, stream: MediaStream) => void;
type StateListener = (peerId: number, state: PeerState) => void;
type LevelListener = (levels: Map<number, number>) => void;

export interface IceConfig {
  iceServers: RTCIceServer[];
  iceTransportPolicy?: RTCIceTransportPolicy;
  iceCandidatePoolSize?: number;
}

const DEFAULT_ICE: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

const MAX_ICE_RESTARTS = 4;
const STARVED_CHECKS_BEFORE_RESTART = 3;
const HEALTH_INTERVAL_MS = 3000;
const LEVEL_INTERVAL_MS = 120;

export class PeerManager {
  private peers = new Map<number, PeerEntry>();
  private localTrack: MediaStreamTrack | null = null;
  private config: IceConfig = { iceServers: DEFAULT_ICE };
  private streamListeners = new Set<StreamListener>();
  private stateListeners = new Set<StateListener>();
  private levelListeners = new Set<LevelListener>();
  private blockedListeners = new Set<(blocked: boolean) => void>();
  private levelTimer: number | null = null;
  private healthTimer: number | null = null;
  private playbackBlocked = false;
  private allowed: number[] | null = null;

  configure(config: IceConfig | RTCIceServer[]): void {
    const next = Array.isArray(config) ? { iceServers: config } : config;
    if (!next.iceServers || next.iceServers.length === 0) {
      return;
    }
    this.config = {
      iceServers: next.iceServers,
      iceTransportPolicy: next.iceTransportPolicy ?? "all",
      iceCandidatePoolSize: next.iceCandidatePoolSize ?? 0,
    };
  }

  get hasRelay(): boolean {
    return this.config.iceServers.some((server) => {
      const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
      return urls.some((url) => url.startsWith("turn:") || url.startsWith("turns:"));
    });
  }

  /**
   * Called every time the capture pipeline swaps the outgoing track, which it
   * does when the processing graph comes up or falls back to the raw
   * microphone. replaceTrack never renegotiates, so the transceiver direction
   * is restored by hand for peers that were built before the mic was ready.
   */
  setLocalTrack(track: MediaStreamTrack | null): void {
    this.localTrack = track;
    this.peers.forEach((entry) => this.attachLocalTrack(entry));
  }

  private attachLocalTrack(entry: PeerEntry): void {
    const transceiver = this.audioTransceiver(entry);
    if (!transceiver) {
      return;
    }
    void transceiver.sender.replaceTrack(this.localTrack).catch(() => undefined);
    const wanted = this.localTrack ? "sendrecv" : "recvonly";
    if (transceiver.direction !== wanted) {
      transceiver.direction = wanted;
    }
  }

  private audioTransceiver(entry: PeerEntry): RTCRtpTransceiver | null {
    const transceivers = entry.connection.getTransceivers();
    return (
      transceivers.find(
        (item) =>
          item.sender.track?.kind === "audio" ||
          item.receiver.track?.kind === "audio" ||
          item.mid === "0",
      ) ??
      transceivers[0] ??
      null
    );
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
    await resumeAudio();
    // play() can stay pending forever on a device with no audio output, so the
    // unlock gives up on its own rather than spinning the button.
    await Promise.race([
      Promise.all([...this.peers.values()].map((entry) => this.play(entry))),
      new Promise((resolve) => window.setTimeout(resolve, 1500)),
    ]);
    this.peers.forEach((entry) => this.attachAnalyser(entry));
  }

  private createPeer(peerId: number, polite: boolean): PeerEntry {
    const connection = new RTCPeerConnection({
      iceServers: this.config.iceServers,
      iceTransportPolicy: this.config.iceTransportPolicy,
      iceCandidatePoolSize: this.config.iceCandidatePoolSize,
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
    });

    const audio = document.createElement("audio");
    audio.autoplay = true;
    audio.setAttribute("playsinline", "");
    audio.setAttribute("autoplay", "");
    audio.volume = 1;
    audio.style.display = "none";
    // Some webviews refuse to start playback on a detached element.
    document.body.appendChild(audio);

    const entry: PeerEntry = {
      connection,
      stream: new MediaStream(),
      audio,
      analyser: null,
      analyserSource: null,
      polite,
      makingOffer: false,
      settingRemoteAnswer: false,
      pendingCandidates: [],
      queue: Promise.resolve(),
      restarts: 0,
      restartTimer: null,
      lastBytes: 0,
      starvedChecks: 0,
      outputMuted: false,
    };

    // One audio transceiver, always. Adding a track later would open a second
    // m line and the answer would never carry the microphone.
    const transceiver = connection.addTransceiver("audio", {
      direction: this.localTrack ? "sendrecv" : "recvonly",
    });
    if (this.localTrack) {
      void transceiver.sender.replaceTrack(this.localTrack).catch(() => undefined);
    }

    connection.onnegotiationneeded = () => {
      this.enqueue(entry, () => this.offer(peerId, entry));
    };

    connection.onicecandidate = (event) => {
      realtime.send("rtc.signal", {
        kind: "ice",
        to: peerId,
        candidate: event.candidate
          ? {
              candidate: event.candidate.candidate,
              sdpMid: event.candidate.sdpMid,
              sdpMLineIndex: event.candidate.sdpMLineIndex,
              usernameFragment: event.candidate.usernameFragment,
            }
          : { candidate: "", sdpMid: null, sdpMLineIndex: null, usernameFragment: null },
      });
    };

    connection.ontrack = (event) => {
      // Assigning the stream that arrived with the track is the only variant
      // Safari and the Telegram webview reliably play. Handing them an empty
      // MediaStream up front and filling it later leaves the element silent.
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      entry.stream = stream;
      entry.audio.srcObject = stream;
      entry.outputMuted = this.allowed !== null && !this.allowed.includes(peerId);
      entry.audio.muted = entry.outputMuted;
      void this.play(entry);
      this.attachAnalyser(entry);
      this.streamListeners.forEach((listener) => listener(peerId, stream));

      event.track.onunmute = () => {
        void this.play(entry);
      };
    };

    connection.oniceconnectionstatechange = () => {
      const state = connection.iceConnectionState;
      if (state === "failed") {
        this.scheduleRestart(peerId, entry, 0);
      } else if (state === "disconnected") {
        this.scheduleRestart(peerId, entry, 4000);
      } else if (state === "connected" || state === "completed") {
        this.clearRestart(entry);
        entry.restarts = 0;
      }
    };

    connection.onconnectionstatechange = () => {
      const state = connection.connectionState as PeerState;
      this.stateListeners.forEach((listener) => listener(peerId, state));
      if (state === "failed") {
        this.scheduleRestart(peerId, entry, 0);
      }
    };

    this.peers.set(peerId, entry);
    this.startTimers();
    return entry;
  }

  private enqueue(entry: PeerEntry, task: () => Promise<void>): void {
    // Offers, answers and candidates arrive interleaved over one socket.
    // Running them concurrently corrupts the signalling state, so each peer
    // gets a strict queue.
    entry.queue = entry.queue.then(task).catch(() => undefined);
  }

  private async offer(peerId: number, entry: PeerEntry): Promise<void> {
    const connection = entry.connection;
    if (connection.signalingState === "closed") {
      return;
    }
    try {
      entry.makingOffer = true;
      const description = await connection.createOffer();
      if (connection.signalingState !== "stable") {
        return;
      }
      await connection.setLocalDescription(description);
      realtime.send("rtc.signal", {
        kind: "offer",
        to: peerId,
        sdpType: description.type,
        sdp: connection.localDescription?.sdp ?? description.sdp,
      });
    } catch {
      /* negotiation is retried by the health loop */
    } finally {
      entry.makingOffer = false;
    }
  }

  private attachAnalyser(entry: PeerEntry): void {
    if (entry.analyser || entry.stream.getAudioTracks().length === 0 || !isRunning()) {
      return;
    }
    try {
      const context = getAudioContext();
      const source = context.createMediaStreamSource(entry.stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.7;
      source.connect(analyser);
      entry.analyserSource = source;
      entry.analyser = analyser;
    } catch {
      entry.analyser = null;
      entry.analyserSource = null;
    }
  }

  private clearRestart(entry: PeerEntry): void {
    if (entry.restartTimer !== null) {
      window.clearTimeout(entry.restartTimer);
      entry.restartTimer = null;
    }
  }

  private scheduleRestart(peerId: number, entry: PeerEntry, delay: number): void {
    if (entry.restartTimer !== null || entry.restarts >= MAX_ICE_RESTARTS) {
      return;
    }
    entry.restartTimer = window.setTimeout(() => {
      entry.restartTimer = null;
      const state = entry.connection.iceConnectionState;
      if (state === "connected" || state === "completed" || state === "closed") {
        return;
      }
      entry.restarts += 1;
      entry.starvedChecks = 0;
      this.enqueue(entry, async () => {
        try {
          entry.connection.restartIce();
        } catch {
          /* nothing else to try */
        }
        // An impolite peer drives the restart, otherwise both sides would
        // offer at once and burn a round trip resolving the collision.
        if (!entry.polite) {
          await this.offer(peerId, entry);
        }
      });
    }, delay);
  }

  connect(peerId: number, polite: boolean): void {
    if (this.peers.has(peerId) || peerId <= 0) {
      return;
    }
    this.createPeer(peerId, polite);
  }

  handleSignal(kind: string, peerId: number, data: Record<string, unknown>): void {
    let entry = this.peers.get(peerId);
    if (!entry) {
      // A peer that signals before the roster reached us is treated as polite
      // here, the remote side already picked the opposite role.
      entry = this.createPeer(peerId, true);
    }
    const target = entry;
    this.enqueue(target, () => this.applySignal(kind, peerId, target, data));
  }

  private async applySignal(
    kind: string,
    peerId: number,
    entry: PeerEntry,
    data: Record<string, unknown>,
  ): Promise<void> {
    const connection = entry.connection;
    if (connection.signalingState === "closed") {
      return;
    }

    if (kind === "offer" || kind === "answer") {
      const description = data as unknown as RTCSessionDescriptionInit;
      if (!description?.sdp || !description.type) {
        return;
      }
      const readyForOffer =
        !entry.makingOffer && (connection.signalingState === "stable" || entry.settingRemoteAnswer);
      const collision = description.type === "offer" && !readyForOffer;

      if (collision && !entry.polite) {
        return;
      }

      try {
        entry.settingRemoteAnswer = description.type === "answer";
        // Implicit rollback. Explicit setLocalDescription({ type: "rollback" })
        // is broken on mobile Safari, which is what the Telegram iOS webview
        // runs on, and would strand the call in have-local-offer.
        await connection.setRemoteDescription(description);
        entry.settingRemoteAnswer = false;

        for (const candidate of entry.pendingCandidates.splice(0)) {
          await connection.addIceCandidate(candidate).catch(() => undefined);
        }

        if (description.type === "offer") {
          this.attachLocalTrack(entry);
          const answer = await connection.createAnswer();
          await connection.setLocalDescription(answer);
          realtime.send("rtc.signal", {
            kind: "answer",
            to: peerId,
            sdpType: answer.type,
            sdp: connection.localDescription?.sdp ?? answer.sdp,
          });
        }
      } catch {
        entry.settingRemoteAnswer = false;
      }
      return;
    }

    if (kind === "ice") {
      const raw = data as RTCIceCandidateInit;
      const candidate: RTCIceCandidateInit = {
        candidate: raw.candidate ?? "",
        sdpMid: raw.sdpMid ?? undefined,
        sdpMLineIndex: raw.sdpMLineIndex ?? undefined,
        usernameFragment: raw.usernameFragment ?? undefined,
      };
      if (!candidate.candidate) {
        await connection.addIceCandidate(undefined).catch(() => undefined);
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
    entry.outputMuted = muted;
    entry.audio.muted = muted;
  }

  restrictAudio(allowed: number[] | null): void {
    this.allowed = allowed;
    this.peers.forEach((entry, peerId) => {
      entry.outputMuted = allowed !== null && !allowed.includes(peerId);
      entry.audio.muted = entry.outputMuted;
    });
  }

  /**
   * Polls the inbound audio counters. A pair can sit in connected while the
   * selected candidate quietly stops passing media, which is the one failure
   * no connection state ever reports.
   */
  private checkHealth(): void {
    this.peers.forEach((entry, peerId) => {
      if (entry.connection.connectionState !== "connected") {
        return;
      }
      void entry.connection
        .getStats()
        .then((report) => {
          let bytes = 0;
          report.forEach((item) => {
            if (item.type === "inbound-rtp" && item.kind === "audio") {
              bytes += Number(item.bytesReceived ?? 0);
            }
          });
          if (bytes > entry.lastBytes) {
            entry.lastBytes = bytes;
            entry.starvedChecks = 0;
            return;
          }
          entry.starvedChecks += 1;
          if (entry.starvedChecks >= STARVED_CHECKS_BEFORE_RESTART) {
            entry.starvedChecks = 0;
            this.scheduleRestart(peerId, entry, 0);
          }
        })
        .catch(() => undefined);

      if (entry.audio.paused) {
        void this.play(entry);
      }
    });
  }

  disconnect(peerId: number): void {
    const entry = this.peers.get(peerId);
    if (!entry) {
      return;
    }
    this.clearRestart(entry);
    entry.analyserSource?.disconnect();
    entry.analyser?.disconnect();
    entry.connection.getSenders().forEach((sender) => {
      void sender.replaceTrack(null).catch(() => undefined);
    });
    entry.connection.onicecandidate = null;
    entry.connection.ontrack = null;
    entry.connection.onnegotiationneeded = null;
    entry.connection.close();
    entry.audio.srcObject = null;
    entry.audio.remove();
    this.peers.delete(peerId);
    this.stateListeners.forEach((listener) => listener(peerId, "closed"));
    if (this.peers.size === 0) {
      this.stopTimers();
    }
  }

  closeAll(): void {
    [...this.peers.keys()].forEach((peerId) => this.disconnect(peerId));
    this.stopTimers();
    this.allowed = null;
    this.announceBlocked(false);
  }

  get peerIds(): number[] {
    return [...this.peers.keys()];
  }

  onStream(listener: StreamListener): () => void {
    this.streamListeners.add(listener);
    return () => {
      this.streamListeners.delete(listener);
    };
  }

  onState(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  onLevels(listener: LevelListener): () => void {
    this.levelListeners.add(listener);
    this.startTimers();
    return () => {
      this.levelListeners.delete(listener);
    };
  }

  private startTimers(): void {
    if (this.levelTimer === null) {
      const buffer = new Float32Array(512);
      this.levelTimer = window.setInterval(() => {
        if (this.levelListeners.size === 0) {
          return;
        }
        const levels = new Map<number, number>();
        this.peers.forEach((entry, peerId) => {
          if (!entry.analyser) {
            this.attachAnalyser(entry);
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
      }, LEVEL_INTERVAL_MS);
    }

    if (this.healthTimer === null) {
      this.healthTimer = window.setInterval(() => this.checkHealth(), HEALTH_INTERVAL_MS);
    }
  }

  private stopTimers(): void {
    if (this.levelTimer !== null) {
      window.clearInterval(this.levelTimer);
      this.levelTimer = null;
    }
    if (this.healthTimer !== null) {
      window.clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
  }
}

export const peerManager = new PeerManager();

if (import.meta.env.DEV) {
  (window as unknown as { __peerManager?: PeerManager }).__peerManager = peerManager;
}

realtime.on("rtc.offer", (payload) => {
  peerManager.handleSignal("offer", Number(payload.from), payload.description as Record<string, unknown>);
});

realtime.on("rtc.answer", (payload) => {
  peerManager.handleSignal("answer", Number(payload.from), payload.description as Record<string, unknown>);
});

realtime.on("rtc.ice", (payload) => {
  peerManager.handleSignal("ice", Number(payload.from), payload.candidate as Record<string, unknown>);
});
