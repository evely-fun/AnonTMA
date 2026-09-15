# The voice stack

What carries the audio, what cleans it, what disguises it, and why each of
those is where it is rather than somewhere else.

## The engine question

Two pieces of research proposed moving the media onto the server: a Python
transport (aiortc, Pipecat, FastRTC) in one, and a LiveKit SFU with a
`livekit-agents` worker running DeepFilterNet, Pedalboard and RVC in the other.
Both are competent pieces of work and the second describes a good architecture.
Neither is the right architecture for this product, for three reasons that are
worth writing down so the question does not get reopened from memory.

**It breaks the promise the app is sold on.** Audio today is DTLS-SRTP between
two phones. We relay the signalling and cannot decrypt a single second of a
conversation even if we wanted to, which is what makes "nothing links back to
you" true rather than a slogan. An SFU terminates that encryption by
definition: every call would be decoded on a machine we own, and server side
DSP means holding it in plaintext long enough to filter it. That turns an
anonymous chat into a service that processes voice, with everything that
follows from that.

**The arithmetic does not work.** The research puts DeepFilterNet at about a
quarter of a core per stream. An eight person room is eight decode, filter and
encode chains, so something over two cores, sustained, for one room. RVC needs
an NVIDIA card. The API runs on a Render instance with half a gigabyte of
memory and a shared CPU. This is not a tuning problem, it is two orders of
magnitude.

**It would be slower.** The second report budgets its own design at 80-100 ms,
and 135-155 ms with neural voice conversion. A mesh call between two phones is
30-60 ms, because the audio does not travel to Frankfurt and back to be
filtered. For the one to one conversations that are most of the product, the
server path is strictly worse.

So the transport stays a mesh, and the reports' real contribution is taken
where it belongs: **their algorithms, reimplemented on the client**, which is
the one machine in this system that is already holding the audio in the clear
and has spare capacity to work on it.

### Where a media server would earn its place

Rooms, not dialogues. A mesh is n-1 upstreams per participant: fine at three,
punishing at eight, hopeless at twelve. If rooms become the centre of the
product, the answer is an SFU — LiveKit, as the research says — and at that
point the anonymity argument has to be answered with end to end encryption
through the server (WebRTC insertable streams with a room key the server never
sees), not with a promise. Until then, the cap on room size is the honest
mitigation, and the safety code below is the first half of that E2EE work.

## What runs now

```
microphone
  → high pass                     tame rumble before anything else sees it
  → low pass
  → spectral suppressor           our own, per band, in a worklet
  → compressor
  → formant voice changer         our own, pitch and tract moved separately
  → gain
  → WebRTC, Opus with DTX and FEC
```

### Noise suppression: `dsp/suppressor.ts`

The shape DeepFilterNet and RNNoise use, without the network: a 512 point STFT
at a 128 sample hop, magnitudes grouped into 24 ERB bands, a noise level
tracked inside each band, and a gain decided per band.

The estimator is the part that matters. Noise is tracked by minimum statistics
over four quarter second windows, so the number the gain is computed against is
the quietest that band has been in the last second, corrected for the downward
bias a minimum has. Speech raises a band's power; it cannot raise the band's
minimum. That is what makes it safe to keep tracking noise **while somebody is
talking**, which is the whole difference from the gate this replaced: a gate
can only duck the signal between words, so a fan or a street stayed in the call
for as long as anyone was speaking over it.

Gains come from a decision directed a priori SNR, the Ephraim and Malah
estimator, which is what stops the per band decisions from chattering frame to
frame. Chattering gains are what musical noise is.

Measured, on synthetic speech over broadband noise:

| | |
|---|---|
| noise between words | **13.0 dB** quieter |
| speech kept | within **5 dB** of the clean signal |
| signal to noise | **8.0 dB** better |
| cost | **2.1%** of one core |
| added delay | 512 samples, about **10.7 ms** |

### Voice changer: `dsp/formant.ts`

A phase vocoder that separates what is said from who is saying it. The spectral
envelope is lifted out with a cepstrum, the excitation underneath is shifted on
its own, the envelope is warped on its own, and the two are multiplied back
together.

That separation is the whole point. The granular shifter this replaced moved
the entire spectrum at once, so a lowered voice was a slowed tape and a raised
one was a chipmunk: the vocal tract appeared to change size along with the
pitch, which no real body does. Moving the two independently is what makes a
mask sound like a different person, and it is the same separation Pedalboard
and the WORLD vocoder make.

Robot is a phase reset every frame rather than a ring modulator, which is the
honest version of the effect: no carrier tone mixed over the top.

Measured: pitch lands within 1% of what was asked for in both directions, a
formant change alone leaves the pitch where it was, and it costs 3.9% of one
core.

### Transport: `dsp/codec.ts`

Three parameters the browser leaves at a default nobody chose, and on a phone
in a mesh they are the difference between a call that holds and one that does
not:

- **DTX**, so the encoder stops sending while nobody is speaking. Confirmed
  negotiated on both ends in a live call, which took the stream down to about
  5.7 kbit/s while quiet.
- **In band FEC**, which buys back a lost packet.
- **A 24 kbit/s ceiling and 20 ms packets.** In a mesh every participant sends
  to everyone else at once; four people at this rate is 72 kbit/s up, which a
  phone on mobile data can hold. The browser's own default is nearly twice as
  much per stream.

### The safety code

The media is encrypted whatever we do, but the keys are agreed through our own
signalling server. A server that wanted to listen could hand each side its own
fingerprint, sit between two perfectly encrypted calls, and neither browser
would notice. Nothing in TLS prevents that, because the server is a party to
the exchange rather than an eavesdropper on it.

Both ends hash the two DTLS fingerprints together and derive six characters.
The codes match if and only if nobody is in between. This is ZRTP's trick, and
it is also the piece the E2EE work would build on if the media ever moves onto
a server.

## Running the checks

```
node --expose-gc scripts/dsp-check.mjs     # 16 checks, the DSP
node scripts/codec-check.mjs               # 16 checks, SDP and the safety code
node scripts/voice-check.mjs               # two browsers, a real call
```

The first two need no server. `voice-check` needs the API, Redis and the app
running, and takes about a minute.

A note for whoever changes the codec settings next: **a byte rate is no longer
a measure of a healthy call.** With DTX the encoder is supposed to go quiet,
and a liveness check written against kilobytes per second will fail on a call
that is working perfectly. Count packets.
