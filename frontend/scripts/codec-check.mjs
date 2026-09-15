/**
 * The transport half: what we say about Opus, and what the two ends can prove
 * about each other.
 *
 * Usage: node scripts/codec-check.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { webcrypto } from "node:crypto";
import { transform } from "esbuild";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const here = dirname(fileURLToPath(import.meta.url));
const file = resolve(here, "../src/features/voice/dsp/codec.ts");

// Transpiled with the same tool the app is built with rather than by stripping
// types with regular expressions, so what is tested is what ships.
const { code } = await transform(readFileSync(file, "utf8"), { loader: "ts", format: "esm" });
const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);

const results = [];
const check = (name, passed, detail) => {
  results.push({ name, passed, detail });
  console.log(`${passed ? "  ok  " : " FAIL "} ${name}${detail ? ` — ${detail}` : ""}`);
};

const OFFER = [
  "v=0",
  "o=- 1 2 IN IP4 127.0.0.1",
  "s=-",
  "t=0 0",
  "m=audio 9 UDP/TLS/RTP/SAVPF 111 63 9 0 8 110",
  "c=IN IP4 0.0.0.0",
  "a=rtpmap:111 opus/48000/2",
  "a=fmtp:111 minptime=10;useinbandfec=1",
  "a=rtpmap:63 red/48000/2",
  "a=fmtp:63 111/111",
  "a=rtpmap:110 telephone-event/48000",
  "a=fingerprint:sha-256 AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89",
  "a=setup:actpass",
].join("\r\n");

console.log("\nOpus parameters\n");

{
  const tuned = module.tuneOpus(OFFER);
  const line = tuned.split("\r\n").find((entry) => entry.startsWith("a=fmtp:111"));

  check("discontinuous transmission is asked for", /usedtx=1/.test(line), line);
  check("forward error correction is asked for", /useinbandfec=1/.test(line));
  check("the bitrate is capped", /maxaveragebitrate=24000/.test(line));
  check("what was already there survives", /minptime=10/.test(line));
  check("the setting is not repeated", (line.match(/useinbandfec/g) ?? []).length === 1);
  check("packet length is stated", /a=ptime:20/.test(tuned));

  // The red and telephone-event payloads must not be touched: writing Opus
  // parameters onto another payload type is how one end ends up talking a
  // codec the other is not listening for.
  const red = tuned.split("\r\n").find((entry) => entry.startsWith("a=fmtp:63"));
  check("other payload types are left alone", red === "a=fmtp:63 111/111", red);

  const twice = module.tuneOpus(module.tuneOpus(OFFER));
  const twiceLine = twice.split("\r\n").find((entry) => entry.startsWith("a=fmtp:111"));
  check("tuning twice changes nothing", twiceLine === line);

  const noOpus = module.tuneOpus("v=0\r\nm=audio 9 RTP/AVP 0\r\na=rtpmap:0 PCMU/8000");
  check("a description without opus is returned as it was", noOpus.includes("PCMU"));

  const missing = module.tuneOpus(OFFER.replace("a=fmtp:111 minptime=10;useinbandfec=1\r\n", ""));
  check("a missing fmtp line is added", /a=fmtp:111 .*usedtx=1/.test(missing));
}

console.log("\nSafety code\n");

{
  const mine = ["aa:bb:cc:dd"];
  const theirs = ["11:22:33:44"];

  const here = await module.safetyCode(mine, theirs);
  const there = await module.safetyCode(theirs, mine);
  check("both ends read the same code", here === there && here.length > 0, here);

  // The attack this exists for: a server that relays the call hands each side
  // its own fingerprint instead of the other's. Both calls are encrypted, both
  // browsers are satisfied, and the server hears everything. The codes are
  // what disagree.
  const attacker = ["99:88:77:66"];
  const victimOne = await module.safetyCode(mine, attacker);
  const victimTwo = await module.safetyCode(theirs, attacker);
  check("a relay in the middle is visible", victimOne !== here && victimTwo !== there,
    `${here} became ${victimOne} and ${victimTwo}`);

  check("the code is short enough to read out", /^[0-9A-Z]{3} [0-9A-Z]{3}$/.test(here), here);
  check("no fingerprints, no code", (await module.safetyCode([], [])) === "");

  const fingerprints = module.fingerprintsOf(OFFER);
  check("fingerprints are found in a description", fingerprints.length === 1, fingerprints[0]?.slice(0, 11));
  check("fingerprints are compared in one case", fingerprints[0] === fingerprints[0].toLowerCase());
}

const failed = results.filter((entry) => !entry.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed\n`);
process.exit(failed.length === 0 ? 0 : 1);
