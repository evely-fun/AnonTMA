/**
 * What the offer says about Opus, and what the two ends can prove about each
 * other once the call is up.
 *
 * Neither of these is exotic. Both are the parts of a WebRTC call that browsers
 * leave at a default nobody chose, and on a phone in a mesh those defaults are
 * the difference between a call that holds and one that does not.
 */

export interface CodecOptions {
  /** Discontinuous transmission: stop sending packets while nobody speaks. */
  dtx: boolean;
  /** In band forward error correction, which buys back a lost packet. */
  fec: boolean;
  /** Ceiling on the encoder, in bits per second. */
  bitrate: number;
}

export const SPEECH_CODEC: CodecOptions = {
  dtx: true,
  fec: true,
  // Opus is transparent on speech well below this. The ceiling matters in a
  // mesh, where every participant is sending to everyone else at once: four
  // people at twenty four kilobits is a hundred kilobits up, which a phone on
  // mobile data can hold. The browser's own default is nearly twice that.
  bitrate: 24000,
};

/**
 * Rewrites the Opus format parameters in an offer or an answer.
 *
 * The line is built rather than patched with a regular expression over the
 * whole description: the fmtp of the wrong payload type is a call where one
 * side is talking a codec the other is not listening for.
 */
export const tuneOpus = (sdp: string, options: CodecOptions = SPEECH_CODEC): string => {
  const lines = sdp.split(/\r\n|\n/);
  const payloads = new Set<string>();

  for (const line of lines) {
    const match = /^a=rtpmap:(\d+) opus\/48000/i.exec(line);
    if (match) {
      payloads.add(match[1]);
    }
  }
  if (payloads.size === 0) {
    return sdp;
  }

  const wanted = [
    "useinbandfec=" + (options.fec ? 1 : 0),
    "usedtx=" + (options.dtx ? 1 : 0),
    // One channel, and a playback rate that covers speech without paying for
    // the top octave nobody speaks in.
    "stereo=0",
    "maxplaybackrate=24000",
    "maxaveragebitrate=" + options.bitrate,
  ];

  const output: string[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const fmtp = /^a=fmtp:(\d+) (.*)$/.exec(line);
    if (fmtp && payloads.has(fmtp[1])) {
      const kept = fmtp[2]
        .split(";")
        .map((part) => part.trim())
        .filter((part) => part && !wanted.some((entry) => part.startsWith(entry.split("=")[0] + "=")));
      output.push(`a=fmtp:${fmtp[1]} ${[...kept, ...wanted].join(";")}`);
      seen.add(fmtp[1]);
      continue;
    }
    output.push(line);
  }

  // A browser that sent no fmtp line at all still needs one.
  for (const payload of payloads) {
    if (seen.has(payload)) {
      continue;
    }
    const at = output.findIndex((line) => line.startsWith(`a=rtpmap:${payload} opus`));
    if (at >= 0) {
      output.splice(at + 1, 0, `a=fmtp:${payload} ${wanted.join(";")}`);
    }
  }

  // Twenty millisecond packets. Smaller means more headers for the same audio,
  // larger means more lost at once when one goes missing.
  if (!output.some((line) => line.startsWith("a=ptime:"))) {
    const at = output.findIndex((line) => line.startsWith("m=audio"));
    if (at >= 0) {
      output.splice(at + 1, 0, "a=ptime:20", "a=maxptime:40");
    }
  }

  return output.join("\r\n");
};

/** Every DTLS fingerprint a description carries, lower cased and bare. */
export const fingerprintsOf = (sdp: string): string[] => {
  const found: string[] = [];
  for (const line of sdp.split(/\r\n|\n/)) {
    const match = /^a=fingerprint:\S+ (.+)$/i.exec(line.trim());
    if (match) {
      found.push(match[1].trim().toLowerCase());
    }
  }
  return found;
};

const ALPHABET = "23456789ACDEFGHJKLMNPQRSTUVWXYZ";

/**
 * A short code both ends can read out to each other.
 *
 * The media is encrypted by DTLS-SRTP whatever we do, but the keys are agreed
 * through our own signalling server: a server that wanted to listen could hand
 * each side its own fingerprint, sit in the middle of two perfectly encrypted
 * calls, and neither browser would notice. Nothing in TLS prevents that,
 * because the server is a party to the exchange rather than an eavesdropper on
 * it.
 *
 * Hashing both fingerprints together and showing the result on both phones is
 * the check that closes it, the same trick ZRTP uses. If the two codes match,
 * there is nobody in between: an attacker would have to produce a fingerprint
 * that hashes to the same six characters as the one it replaced.
 */
export const safetyCode = async (local: string[], remote: string[]): Promise<string> => {
  const parts = [...local, ...remote].filter(Boolean).sort();
  if (parts.length < 2) {
    return "";
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts.join("|")));
  const bytes = new Uint8Array(digest);
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += ALPHABET[bytes[index] % ALPHABET.length];
  }
  return `${code.slice(0, 3)} ${code.slice(3)}`;
};
