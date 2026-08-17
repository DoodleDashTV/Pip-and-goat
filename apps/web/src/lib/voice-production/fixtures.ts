import { GOAT_CHARACTER_ID, PIP_CHARACTER_ID, type RegisteredCharacterId } from './types';

export const FIXTURE_SAMPLE_RATE = 22050;
export const PIP_CHIME_HZ = [880, 1175] as const;
export const GOAT_CHIME_HZ = [330, 392] as const;
export const FIXTURE_PLAYBACK_LABEL = 'Playback test only — not Pip/Goat’s voice.';

export function fixtureChimeHz(characterId: RegisteredCharacterId): readonly [number, number] {
  return characterId === PIP_CHARACTER_ID ? PIP_CHIME_HZ : GOAT_CHIME_HZ;
}

function revisionSeed(revision: string): number {
  return Array.from(revision).reduce((sum, char) => (sum + char.charCodeAt(0)) % 97, 1);
}

function writeNote(pcm: Int16Array, start: number, length: number, freq: number, sampleRate: number) {
  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate;
    const attack = Math.min(1, i / 180);
    const release = Math.min(1, (length - i) / 420);
    const env = attack * release;
    const sample = Math.sin(2 * Math.PI * freq * t) * env * 0.58;
    pcm[start + i] = Math.max(-32767, Math.min(32767, Math.round(sample * 32767)));
  }
}

export function buildFixtureWavBytes(
  characterId: RegisteredCharacterId = PIP_CHARACTER_ID,
  revision = 'v1',
): Uint8Array {
  const sampleRate = FIXTURE_SAMPLE_RATE;
  const freqs = fixtureChimeHz(characterId);
  const noteSamples = Math.floor(sampleRate * 0.16);
  const gapSamples = 70 + (revisionSeed(revision) % 16);
  const total = noteSamples * 2 + gapSamples;
  const pcm = new Int16Array(total);
  writeNote(pcm, 0, noteSamples, freqs[0], sampleRate);
  writeNote(pcm, noteSamples + gapSamples, noteSamples, freqs[1], sampleRate);

  const dataSize = pcm.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (const sample of pcm) {
    view.setInt16(offset, sample, true);
    offset += 2;
  }
  return new Uint8Array(buffer);
}

export function encodeBytesBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Runtime-only playback-test chime. Nothing is committed as an audio file. */
export function buildFixtureWavBase64(
  characterId: RegisteredCharacterId = PIP_CHARACTER_ID,
  revision = 'v1',
): string {
  return encodeBytesBase64(buildFixtureWavBytes(characterId, revision));
}

export function fixtureObjectKey(
  characterId: RegisteredCharacterId,
  lineId: string,
  revision = 'v1',
): string {
  return `fixture:voice/${characterId}/${lineId}.${revision}.wav`;
}

export function fixturePlaybackDataUrl(
  characterId: RegisteredCharacterId = PIP_CHARACTER_ID,
  revision = 'v1',
): string {
  return `data:audio/wav;base64,${buildFixtureWavBase64(characterId, revision)}`;
}

export function decodeWavPcm(base64: string): { samples: Int16Array; sampleRate: number } {
  const binary = typeof Buffer !== 'undefined' ? Buffer.from(base64, 'base64') : Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const view = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  const sampleRate = view.getUint32(24, true);
  const dataSize = view.getUint32(40, true);
  const samples = new Int16Array(dataSize / 2);
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = view.getInt16(44 + i * 2, true);
  }
  return { samples, sampleRate };
}

export function maxAbsSample(samples: Int16Array): number {
  let max = 0;
  for (const sample of samples) {
    const abs = Math.abs(sample);
    if (abs > max) max = abs;
  }
  return max;
}

export function goertzelPower(samples: Int16Array, sampleRate: number, frequency: number): number {
  const omega = (2 * Math.PI * frequency) / sampleRate;
  const coeff = 2 * Math.cos(omega);
  let sPrev = 0;
  let sPrev2 = 0;
  for (const sample of samples) {
    const s = sample + coeff * sPrev - sPrev2;
    sPrev2 = sPrev;
    sPrev = s;
  }
  return sPrev2 * sPrev2 + sPrev * sPrev - coeff * sPrev * sPrev2;
}

export function fixtureIsAudible(base64: string): boolean {
  const { samples } = decodeWavPcm(base64);
  return maxAbsSample(samples) > 2000;
}

export function fixtureIsHigherPitched(leftBase64: string, rightBase64: string): boolean {
  const left = decodeWavPcm(leftBase64);
  const right = decodeWavPcm(rightBase64);
  const leftHigh = goertzelPower(left.samples, left.sampleRate, PIP_CHIME_HZ[0]);
  const rightLow = goertzelPower(right.samples, right.sampleRate, GOAT_CHIME_HZ[0]);
  const leftLow = goertzelPower(left.samples, left.sampleRate, GOAT_CHIME_HZ[0]);
  const rightHigh = goertzelPower(right.samples, right.sampleRate, PIP_CHIME_HZ[0]);
  return leftHigh > leftLow && rightLow > rightHigh;
}
