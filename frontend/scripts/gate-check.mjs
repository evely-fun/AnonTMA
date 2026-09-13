import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(here, "../src/features/voice/worklet.ts"), "utf8");
const body = source.slice(source.indexOf("`") + 1, source.lastIndexOf("`"));

const SAMPLE_RATE = 48000;
const BLOCK = 128;

globalThis.sampleRate = SAMPLE_RATE;
globalThis.AudioWorkletProcessor = class {
  constructor() {
    this.port = { postMessage() {}, close() {} };
  }
};
let Processor = null;
globalThis.registerProcessor = (_name, ctor) => {
  Processor = ctor;
};

new Function(body)();

const parameter = (value) => [value];

const profiles = {
  light: { threshold: 2, ratio: 1.6, floorGain: 0.5, release: 0.3 },
  medium: { threshold: 2.6, ratio: 2.2, floorGain: 0.28, release: 0.26 },
  high: { threshold: 3.2, ratio: 3.2, floorGain: 0.12, release: 0.22 },
};

const runProfile = (name, profile, seconds) => {
  const node = new Processor();
  const parameters = {
    threshold: parameter(profile.threshold),
    ratio: parameter(profile.ratio),
    attack: parameter(0.006),
    release: parameter(profile.release),
    floorGain: parameter(profile.floorGain),
    bypass: parameter(0),
  };

  const blocks = Math.floor((seconds * SAMPLE_RATE) / BLOCK);
  const input = [new Float32Array(BLOCK)];
  const output = [new Float32Array(BLOCK)];

  let phase = 0;
  const samples = [];

  for (let block = 0; block < blocks; block += 1) {
    const elapsed = (block * BLOCK) / SAMPLE_RATE;
    // Speech-like envelope: 1.8 s of voice, 0.4 s of gap, over a quiet room.
    const cycle = elapsed % 2.2;
    const voiced = cycle < 1.8;
    const amplitude = voiced ? 0.09 : 0.0015;

    for (let index = 0; index < BLOCK; index += 1) {
      phase += (2 * Math.PI * 190) / SAMPLE_RATE;
      const tone = Math.sin(phase) * 0.6 + Math.sin(phase * 2.3) * 0.3 + Math.sin(phase * 4.1) * 0.1;
      input[0][index] = tone * amplitude + (Math.random() - 0.5) * 0.0015;
    }

    node.process([input], [output], parameters);

    if (voiced && cycle > 1.2) {
      let inPeak = 0;
      let outPeak = 0;
      for (let index = 0; index < BLOCK; index += 1) {
        inPeak = Math.max(inPeak, Math.abs(input[0][index]));
        outPeak = Math.max(outPeak, Math.abs(output[0][index]));
      }
      samples.push({ elapsed, ratio: inPeak > 0 ? outPeak / inPeak : 0 });
    }
  }

  const buckets = [0, 15, 30, 45, 60, 90, 120];
  const rows = [];
  for (let index = 0; index < buckets.length - 1; index += 1) {
    const from = buckets[index];
    const to = buckets[index + 1];
    const slice = samples.filter((item) => item.elapsed >= from && item.elapsed < to);
    if (slice.length === 0) {
      continue;
    }
    const mean = slice.reduce((sum, item) => sum + item.ratio, 0) / slice.length;
    rows.push({ window: `${from}-${to}s`, passthrough: Number(mean.toFixed(3)) });
  }

  const worst = Math.min(...rows.map((row) => row.passthrough));
  console.log(`\nprofile ${name} (threshold ${profile.threshold}, ratio ${profile.ratio})`);
  console.table(rows);
  return worst;
};

let failed = false;
for (const [name, profile] of Object.entries(profiles)) {
  const worst = runProfile(name, profile, 120);
  // Speech has to keep passing through for the whole call. The old gate let
  // its noise floor climb onto the speaker's own voice and collapsed to the
  // floor gain after about a minute.
  if (worst < 0.6) {
    console.error(`FAIL: ${name} attenuated speech to ${worst} of its input`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}
console.log("\nPASS: speech keeps passing on every profile across a two minute call");
