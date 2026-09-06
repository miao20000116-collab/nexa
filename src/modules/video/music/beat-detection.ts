/**
 * Local beat detection for PCM / WAV buffers.
 * Do NOT use LLM for beat detection.
 */

export interface BeatAnalysis {
  bpm: number | null;
  beats: number[];
  sections: Array<{ name: string; start: number; end: number }>;
  durationSec: number;
  method: "local_energy";
}

/** Parse a minimal WAV (PCM 16-bit mono/stereo) and detect beats via onset energy. */
export function detectBeatsFromWav(buffer: ArrayBuffer): BeatAnalysis {
  const view = new DataView(buffer);
  if (buffer.byteLength < 44 || getString(view, 0, 4) !== "RIFF") {
    return emptyAnalysis(0);
  }

  const numChannels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const bitsPerSample = view.getUint16(34, true);
  let dataOffset = 12;
  while (dataOffset + 8 < buffer.byteLength) {
    const id = getString(view, dataOffset, 4);
    const size = view.getUint32(dataOffset + 4, true);
    if (id === "data") {
      dataOffset += 8;
      break;
    }
    dataOffset += 8 + size;
  }

  if (bitsPerSample !== 16) {
    return emptyAnalysis(0);
  }

  const sampleCount =
    Math.floor((buffer.byteLength - dataOffset) / (2 * numChannels));
  const durationSec = sampleCount / sampleRate;
  const hop = Math.max(1, Math.floor(sampleRate * 0.02)); // 20ms
  const energies: number[] = [];

  for (let i = 0; i + hop < sampleCount; i += hop) {
    let sum = 0;
    for (let j = 0; j < hop; j++) {
      const idx = dataOffset + (i + j) * numChannels * 2;
      if (idx + 1 >= buffer.byteLength) break;
      const sample = view.getInt16(idx, true) / 32768;
      sum += sample * sample;
    }
    energies.push(sum / hop);
  }

  const beats: number[] = [];
  const thresholdMul = 1.4;
  const window = 20;
  for (let i = window; i < energies.length; i++) {
    let avg = 0;
    for (let k = i - window; k < i; k++) avg += energies[k];
    avg /= window;
    if (energies[i] > avg * thresholdMul && energies[i] > energies[i - 1]) {
      const t = (i * hop) / sampleRate;
      if (beats.length === 0 || t - beats[beats.length - 1] > 0.2) {
        beats.push(Math.round(t * 1000) / 1000);
      }
    }
  }

  let bpm: number | null = null;
  if (beats.length >= 4) {
    const intervals: number[] = [];
    for (let i = 1; i < beats.length; i++) {
      intervals.push(beats[i] - beats[i - 1]);
    }
    intervals.sort((a, b) => a - b);
    const median = intervals[Math.floor(intervals.length / 2)];
    if (median > 0.2 && median < 2) {
      bpm = Math.round(60 / median);
    }
  }

  const sections = buildSections(durationSec);

  return {
    bpm,
    beats,
    sections,
    durationSec: Math.round(durationSec * 100) / 100,
    method: "local_energy",
  };
}

function buildSections(durationSec: number) {
  if (durationSec <= 0) return [];
  const introEnd = Math.min(8, durationSec * 0.15);
  const outroStart = Math.max(introEnd, durationSec - Math.min(8, durationSec * 0.15));
  const mid = (introEnd + outroStart) / 2;
  return [
    { name: "Intro", start: 0, end: round2(introEnd) },
    {
      name: "Section",
      start: round2(introEnd),
      end: round2(mid),
    },
    {
      name: "高潮",
      start: round2(mid),
      end: round2(outroStart),
    },
    { name: "Outro", start: round2(outroStart), end: round2(durationSec) },
  ];
}

function emptyAnalysis(durationSec: number): BeatAnalysis {
  return {
    bpm: null,
    beats: [],
    sections: buildSections(durationSec),
    durationSec,
    method: "local_energy",
  };
}

function getString(view: DataView, offset: number, length: number) {
  let s = "";
  for (let i = 0; i < length; i++) {
    s += String.fromCharCode(view.getUint8(offset + i));
  }
  return s;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
