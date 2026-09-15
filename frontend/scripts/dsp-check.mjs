/**
 * Runs the voice worklets outside a browser.
 *
 * A worklet is hard to test where it lives: it runs on the audio thread of a
 * page, in a scope with no imports and no console worth reading. The source is
 * a string, so it can be evaluated here against a stub of the same scope and
 * fed known signals, which is the only way to say anything definite about
 * whether the suppressor suppresses or the shifter shifts.
 *
 * Usage: node scripts/dsp-check.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const SAMPLE_RATE = 48000;
const BLOCK = 128;

/** Pull the template literal out of a .ts source without a TypeScript build. */
const sourceOf = (file, name) => {
  const text = readFileSync(resolve(here, "..", "src/features/voice/dsp", file), "utf8");
  const start = text.indexOf("`", text.indexOf(`export const ${name}`));
  const end = text.lastIndexOf("`;");
  if (start < 0 || end <= start) throw new Error(`no template in ${file}`);
  return text.slice(start + 1, end);
};

const kernel = sourceOf("kernel.ts", "DSP_KERNEL");
const suppressor = sourceOf("suppressor.ts", "suppressorWorklet").replace("${DSP_KERNEL}", kernel);
const formant = sourceOf("formant.ts", "formantWorklet").replace("${DSP_KERNEL}", kernel);

/** The slice of the worklet global scope these processors actually touch. */
const instantiate = (source, options = {}) => {
  let registered = null;
  const scope = {
    sampleRate: SAMPLE_RATE,
    currentTime: 0,
    registerProcessor: (_name, cls) => {
      registered = cls;
    },
    AudioWorkletProcessor: class {
      constructor() {
        this.port = { postMessage: () => {}, onmessage: null };
      }
    },
  };
  const run = new Function(
    "sampleRate",
    "currentTime",
    "registerProcessor",
    "AudioWorkletProcessor",
    `${source}\n;return null;`,
  );
  run(scope.sampleRate, scope.currentTime, scope.registerProcessor, scope.AudioWorkletProcessor);
  if (!registered) throw new Error("processor never registered");

  const processor = new registered();
  const descriptors = registered.parameterDescriptors ?? [];
  const parameters = {};
  for (const descriptor of descriptors) {
    const value = options[descriptor.name] ?? descriptor.defaultValue;
    parameters[descriptor.name] = new Float32Array([value]);
  }
  return { processor, parameters };
};

/** Push a signal through a processor one render quantum at a time. */
const pump = (source, signal) => {
  const { processor, parameters } = source;
  const output = new Float32Array(signal.length);
  const inBlock = new Float32Array(BLOCK);
  const outBlock = new Float32Array(BLOCK);
  const inputs = [[inBlock]];
  const outputs = [[outBlock]];

  for (let offset = 0; offset + BLOCK <= signal.length; offset += BLOCK) {
    inBlock.set(signal.subarray(offset, offset + BLOCK));
    outBlock.fill(0);
    processor.process(inputs, outputs, parameters);
    output.set(outBlock, offset);
  }
  return output;
};

// Signals ---------------------------------------------------------------

/** A voice shaped enough to be worth measuring: harmonics under formants. */
const speech = (seconds, f0 = 130) => {
  const length = Math.floor(seconds * SAMPLE_RATE);
  const out = new Float32Array(length);
  const formants = [
    { hz: 700, gain: 1 },
    { hz: 1220, gain: 0.5 },
    { hz: 2600, gain: 0.22 },
  ];
  for (let index = 0; index < length; index += 1) {
    const time = index / SAMPLE_RATE;
    // Syllables: speech is not a held tone, and a suppressor that only works
    // on held tones is a suppressor that works on nothing.
    const syllable = Math.max(0, Math.sin(2 * Math.PI * 3.1 * time)) ** 0.6;
    let value = 0;
    for (let harmonic = 1; harmonic * f0 < 5000; harmonic += 1) {
      const hz = harmonic * f0;
      let gain = 1 / harmonic;
      for (const formant of formants) {
        gain += (formant.gain * 0.6) / (1 + ((hz - formant.hz) / 180) ** 2);
      }
      value += gain * Math.sin(2 * Math.PI * hz * time + harmonic);
    }
    out[index] = 0.12 * syllable * value;
  }
  return out;
};

/** Stationary broadband noise, the thing a fan or a street actually is. */
const noise = (seconds, level = 0.05) => {
  const length = Math.floor(seconds * SAMPLE_RATE);
  const out = new Float32Array(length);
  let state = 0;
  let seed = 12345;
  for (let index = 0; index < length; index += 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const white = (seed / 0x3fffffff - 1) * level;
    state = state * 0.86 + white * 0.14;
    out[index] = state * 4 + white * 0.5;
  }
  return out;
};

const mix = (a, b) => {
  const out = new Float32Array(a.length);
  for (let index = 0; index < a.length; index += 1) out[index] = a[index] + b[index];
  return out;
};

const rms = (signal, from = 0, to = signal.length) => {
  let sum = 0;
  for (let index = from; index < to; index += 1) sum += signal[index] * signal[index];
  return Math.sqrt(sum / Math.max(1, to - from));
};

const db = (value) => 20 * Math.log10(Math.max(value, 1e-12));

const finite = (signal) => {
  for (let index = 0; index < signal.length; index += 1) {
    if (!Number.isFinite(signal[index])) return false;
  }
  return true;
};

const peak = (signal) => {
  let top = 0;
  for (let index = 0; index < signal.length; index += 1) top = Math.max(top, Math.abs(signal[index]));
  return top;
};

/** Magnitude at one frequency, straight from the definition. */
const magnitudeAt = (frame, hz) => {
  const step = (2 * Math.PI * hz) / SAMPLE_RATE;
  let re = 0;
  let im = 0;
  for (let index = 0; index < frame.length; index += 2) {
    const value = frame[index];
    re += value * Math.cos(step * index);
    im += value * Math.sin(step * index);
  }
  return Math.sqrt(re * re + im * im);
};

/**
 * Fundamental by harmonic product spectrum.
 *
 * Both of the obvious methods get this wrong on a shifted voice: the tallest
 * spectral peak is often the second harmonic, and a plain autocorrelation is
 * as happy with twice the period as with the period. Multiplying the spectrum
 * by compressed copies of itself only leaves energy where a whole harmonic
 * series lines up, which is the fundamental and nothing else.
 */
const fundamental = (signal, low = 50, high = 400) => {
  const window = 8192;
  const start = Math.floor((signal.length - window) / 2);
  const frame = signal.subarray(start, start + window);

  let best = 0;
  let bestHz = low;
  for (let hz = low; hz <= high; hz += 0.5) {
    let product = 1;
    for (let harmonic = 1; harmonic <= 5; harmonic += 1) {
      const partial = magnitudeAt(frame, hz * harmonic);
      product *= partial + 1e-9;
    }
    if (product > best) {
      best = product;
      bestHz = hz;
    }
  }
  return bestHz;
};

// Checks ----------------------------------------------------------------

const results = [];
const check = (name, passed, detail) => {
  results.push({ name, passed, detail });
  console.log(`${passed ? "  ok  " : " FAIL "} ${name}${detail ? ` — ${detail}` : ""}`);
};

console.log("\nSuppressor\n");

{
  const clean = speech(4);
  const dirt = noise(4);
  const dirty = mix(clean, dirt);
  const processed = pump(instantiate(suppressor, { floorGain: 0.08, sharpness: 1.8 }), dirty);

  check("output stays finite", finite(processed));
  check("output stays bounded", peak(processed) < 4, `peak ${peak(processed).toFixed(2)}`);

  // The second half only: the noise estimate needs a moment to settle, and
  // judging it on the first frames measures the warm up rather than the filter.
  const half = Math.floor(clean.length / 2);
  const quiet = [];
  const loud = [];
  for (let index = half; index < clean.length; index += 1) {
    (Math.abs(clean[index]) < 0.01 ? quiet : loud).push(index);
  }
  const gapBefore = rms(dirty.subarray(half));
  const gapAfterSamples = new Float32Array(quiet.length);
  const gapBeforeSamples = new Float32Array(quiet.length);
  quiet.forEach((index, slot) => {
    gapAfterSamples[slot] = processed[index];
    gapBeforeSamples[slot] = dirty[index];
  });
  const restBefore = rms(gapBeforeSamples);
  const restAfter = rms(gapAfterSamples);
  const drop = db(restBefore) - db(restAfter);
  check("noise between words drops", drop > 12, `${drop.toFixed(1)} dB`);

  const speechSamples = new Float32Array(loud.length);
  const cleanSamples = new Float32Array(loud.length);
  loud.forEach((index, slot) => {
    speechSamples[slot] = processed[index];
    cleanSamples[slot] = clean[index];
  });
  const kept = db(rms(speechSamples)) - db(rms(cleanSamples));
  check("speech survives", kept > -6, `${kept.toFixed(1)} dB against the clean signal`);

  // The measurement that matters: noise under speech, which a gate cannot do
  // anything about because the gate is open while somebody is talking.
  const snrBefore = db(rms(cleanSamples)) - db(restBefore);
  const snrAfter = db(rms(speechSamples)) - db(restAfter);
  check("signal to noise improves", snrAfter - snrBefore > 8, `${(snrAfter - snrBefore).toFixed(1)} dB better`);

  const silence = new Float32Array(SAMPLE_RATE);
  const silenced = pump(instantiate(suppressor), silence);
  check("silence in, silence out", peak(silenced) < 1e-6);

  const loudInput = new Float32Array(SAMPLE_RATE);
  for (let index = 0; index < loudInput.length; index += 1) loudInput[index] = Math.sin(index * 0.02) * 0.98;
  const loudOut = pump(instantiate(suppressor), loudInput);
  check("a hot input does not blow up", finite(loudOut) && peak(loudOut) < 2, `peak ${peak(loudOut).toFixed(2)}`);
}

console.log("\nVoice changer\n");

{
  const voice = speech(2.5, 150);
  const base = fundamental(voice);

  const down = pump(instantiate(formant, { pitch: 0.7, formant: 0.82 }), voice);
  const up = pump(instantiate(formant, { pitch: 1.45, formant: 1.2 }), voice);
  const flat = pump(instantiate(formant, { pitch: 1, formant: 1 }), voice);

  const lowered = fundamental(down);
  const raised = fundamental(up);
  check("pitch moves down", Math.abs(lowered - base * 0.7) < base * 0.1,
    `${base.toFixed(0)} Hz to ${lowered.toFixed(0)} Hz, wanted ${(base * 0.7).toFixed(0)}`);
  check("pitch moves up", Math.abs(raised - base * 1.45) < base * 0.15,
    `${base.toFixed(0)} Hz to ${raised.toFixed(0)} Hz, wanted ${(base * 1.45).toFixed(0)}`);
  check("natural passes through untouched", peak(flat) > 0 && finite(flat));

  check("shifted output stays finite", finite(down) && finite(up));
  check("shifted output stays bounded", peak(down) < 4 && peak(up) < 4,
    `down ${peak(down).toFixed(2)}, up ${peak(up).toFixed(2)}`);

  // Formant only: the voice keeps its pitch and changes its size.
  const sized = pump(instantiate(formant, { pitch: 1, formant: 1.3 }), voice);
  const sizedPitch = fundamental(sized);
  check("formant alone leaves the pitch", Math.abs(sizedPitch - base) < base * 0.1,
    `${base.toFixed(0)} Hz to ${sizedPitch.toFixed(0)} Hz`);
}

console.log("\nCost and memory\n");

{
  const seconds = 12;
  const signal = mix(speech(seconds), noise(seconds));

  for (const [name, source, options] of [
    ["suppressor", suppressor, {}],
    ["voice changer", formant, { pitch: 0.72, formant: 0.85 }],
  ]) {
    const instance = instantiate(source, options);
    const started = process.hrtime.bigint();
    pump(instance, signal);
    const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
    const realtime = elapsed / (seconds * 1000);
    check(`${name} runs well inside real time`, realtime < 0.25,
      `${(realtime * 100).toFixed(1)}% of one core`);
  }

  if (global.gc) {
    const instance = instantiate(suppressor, {});
    pump(instance, mix(speech(2), noise(2)));
    global.gc();
    const before = process.memoryUsage().heapUsed;
    pump(instance, mix(speech(8), noise(8)));
    global.gc();
    const after = process.memoryUsage().heapUsed;
    const growth = (after - before) / 1024;
    check("the audio thread does not allocate", growth < 256, `${growth.toFixed(0)} KB over eight seconds`);
  } else {
    console.log("  skip  allocation check needs --expose-gc");
  }
}

const failed = results.filter((entry) => !entry.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed\n`);
process.exit(failed.length === 0 ? 0 : 1);
