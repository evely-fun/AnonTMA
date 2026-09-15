import { request } from "@/shared/lib/api";
import { realtime } from "@/shared/lib/socket";

import { getAudioContext, isRunning, resumeAudio } from "./audioContext";
import { fingerprintsOf, safetyCode, tuneOpus } from "./dsp/codec";

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
  remoteFingerprints: string[];
  safety: string;
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

/** Half the six hour relay credential, so a peer never gets a stale one. */
const ICE_MAX_AGE_MS = 3 * 60 * 60 * 1000;
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
  private safetyListeners = new Set<(peerId: number, code: string) => void>();
  private levelTimer: number | null = null;
  private healthTimer: number | null = null;
  private playbackBlocked = false;
  private allowed: number[] | null = null;
  private configuredAt = 0;
  private icePromise: Promise<void> | null = null;

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
    this.configuredAt = Date.now();
  }

  /**
   * Relay credentials are time limited, so a session left open long enough
   * would start building peers with a password the relay no longer accepts and
   * calls would go quiet again in exactly the way they used to.
   */
  private async freshenIce(): Promise<void> {
    if (Date.now() - this.configuredAt < ICE_MAX_AGE_MS) {
      return;
    }
    if (this.icePromise) {
      await this.icePromise;
      return;
    }
    this.icePromise = (async () => {
      try {
        const payload = await request<IceConfig>("/config/ice");
        this.configure(payload);
      } catch {
        // Keep the credentials we have rather than losing the relay entirely.
        this.configuredAt = Date.now();
      } finally {
        this.icePromise = null;
      }
    })();
    await this.icePromise;
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
    this.note(
      `attachLocalTrack track=${Boolean(this.localTrack)} tx=${entry.connection.getTransceivers().length} mid=${transceiver.mid} dir=${transceiver.direction}`,
    );
    void transceiver.sender.replaceTrack(this.localTrack).catch(() => undefined);
    // The direction stays sendrecv for the life of the call. Dropping it to
    // recvonly when the mic goes away would renegotiate the m line and invite
    // the same duplicate line the constructor comment describes; a muted call
    // is a sender with no track, not a changed direction.
    if (transceiver.direction !== "sendrecv") {
      transceiver.direction = "sendrecv";
    }
  }

  private audioTransceiver(entry: PeerEntry): RTCRtpTransceiver | null {
    const transceivers = entry.connection
      .getTransceivers()
      .filter((item) => item.currentDirection !== "stopped");
    // The one that can actually send comes first. Picking by "has an audio
    // track" would happily return a receive only line and quietly drop the
    // microphone into a transceiver that never transmits.
    return (
      transceivers.find(
        (item) => item.direction === "sendrecv" || item.direction === "sendonly",
      ) ??
      transceivers.find((item) => item.receiver.track?.kind === "audio") ??
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

  trace: string[] = [];

  /** A short negotiation log, kept only in development for diagnosing calls. */
  private note(line: string): void {
    if (!import.meta.env.DEV) {
      return;
    }
    this.trace.push(`${Date.now() % 100000} ${line}`);
    if (this.trace.length > 80) {
      this.trace.shift();
    }
  }

  private createPeer(peerId: number, polite: boolean): PeerEntry {
    this.note(`createPeer ${peerId} polite=${polite} localTrack=${Boolean(this.localTrack)}`);
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
      remoteFingerprints: [],
      safety: "",
    };

    // Only the side that opens the call lays out the session. The polite side
    // used to create a transceiver of its own as well, and applying the
    // incoming offer then left it with two: one carrying the offer and its own
    // spare, which the answer turned into a second half duplex m line. The
    // microphone could land on either of them, and when it landed on the
    // receive only one the other side heard nothing at all while ICE stayed
    // connected and the stats looked perfectly healthy.
    //
    // The polite side gets its transceiver from the offer instead, so there is
    // exactly one audio m line and it is sendrecv for the life of the call. A
    // sendrecv transceiver with no track sends nothing until replaceTrack
    // fills it, and replaceTrack never renegotiates.
    if (!polite) {
      const transceiver = connection.addTransceiver("audio", { direction: "sendrecv" });
      if (this.localTrack) {
        void transceiver.sender.replaceTrack(this.localTrack).catch(() => undefined);
      }
    }

    connection.onnegotiationneeded = () => {
      // Only the impolite peer opens a session. Both sides build their peer the
      // moment the roster lands, so if both offered we would collide on every
      // single call, and resolving that collision is what left the session with
      // two half duplex m lines rather than one duplex line. Once a remote
      // description exists the polite side may renegotiate normally.
      if (entry.polite && !connection.currentRemoteDescription) {
        return;
      }
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
      this.note(`offer ${peerId} tx=${connection.getTransceivers().length}`);
      const description = await connection.createOffer();
      if (connection.signalingState !== "stable") {
        return;
      }
      const sdp = tuneOpus(description.sdp ?? "");
      await connection.setLocalDescription({ type: description.type, sdp });
      realtime.send("rtc.signal", {
        kind: "offer",
        to: peerId,
        sdpType: description.type,
        sdp: connection.localDescription?.sdp ?? sdp,
      });
    } catch {
      /* negotiation is retried by the health loop */
    } finally {
      entry.makingOffer = false;
    }
  }

  /**
   * Works out the code that proves nobody is sitting in the middle, and hands
   * it to whoever is listening. Called once each side has both descriptions.
   */
  private async verify(peerId: number, entry: PeerEntry): Promise<void> {
    if (entry.safety) {
      return;
    }
    const local = fingerprintsOf(entry.connection.localDescription?.sdp ?? "");
    if (local.length === 0 || entry.remoteFingerprints.length === 0) {
      return;
    }
    try {
      entry.safety = await safetyCode(local, entry.remoteFingerprints);
    } catch {
      return;
    }
    if (entry.safety) {
      this.safetyListeners.forEach((listener) => listener(peerId, entry.safety));
    }
  }

  /** The safety code for a peer, once both descriptions have been exchanged. */
  safetyOf(peerId: number): string {
    return this.peers.get(peerId)?.safety ?? "";
  }

  onSafety(listener: (peerId: number, code: string) => void): () => void {
    this.safetyListeners.add(listener);
    return () => {
      this.safetyListeners.delete(listener);
    };
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
    if (peerId <= 0) {
      return;
    }
    const existing = this.peers.get(peerId);
    if (existing) {
      // The server decides who is polite, and that decision is the only thing
      // keeping both ends from offering at once. A peer built from an early
      // signal has to guess the role, and an ICE candidate routinely beats the
      // roster message, so the guess was landing on both sides at once: either
      // both polite and nobody opened the call, or both impolite and the
      // collision left two half duplex m lines instead of one duplex line.
      // The real answer overwrites the guess as soon as it arrives.
      if (existing.polite !== polite) {
        existing.polite = polite;
        if (!polite && !existing.connection.currentRemoteDescription) {
          this.enqueue(existing, () => this.offer(peerId, existing));
        }
      }
      return;
    }
    void this.freshenIce().then(() => {
      if (!this.peers.has(peerId)) {
        this.createPeer(peerId, polite);
      }
    });
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
        entry.remoteFingerprints = fingerprintsOf(description.sdp ?? "");
        this.note(
          `setRemote ${description.type} ${peerId} tx=${connection.getTransceivers().length}`,
        );
        entry.settingRemoteAnswer = false;
        void this.verify(peerId, entry);

        for (const candidate of entry.pendingCandidates.splice(0)) {
          await connection.addIceCandidate(candidate).catch(() => undefined);
        }

        if (description.type === "offer") {
          this.attachLocalTrack(entry);
          const answer = await connection.createAnswer();
          const tuned = tuneOpus(answer.sdp ?? "");
          await connection.setLocalDescription({ type: answer.type, sdp: tuned });
          realtime.send("rtc.signal", {
            kind: "answer",
            to: peerId,
            sdpType: answer.type,
            sdp: connection.localDescription?.sdp ?? tuned,
          });
          // The answering side only has both descriptions once its own answer
          // is set. Verifying any earlier reads an empty local fingerprint and
          // leaves this end without a code to compare.
          void this.verify(peerId, entry);
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
