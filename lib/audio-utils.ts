import type { AudioFormat, DspSettings, GeminiVoiceName, VoiceProfile } from './types';

export const ALLOWED_AUDIO_FORMATS: AudioFormat[] = ['mp3', 'ogg', 'wav'];

export const GEMINI_VOICES: Array<{
  name: GeminiVoiceName;
  character: string;
  register: string;
}> = [
  { name: 'Zephyr', character: 'Bright, natural, conversational', register: 'Mid-High' },
  { name: 'Kore', character: 'Clear, poised, articulate', register: 'Mid' },
  { name: 'Puck', character: 'Energetic, expressive, upbeat', register: 'Mid-High' },
  { name: 'Charon', character: 'Deep, grounded, broadcast calm', register: 'Low' },
  { name: 'Fenrir', character: 'Bold, resonant, commanding', register: 'Low-Mid' },
];

export const DEFAULT_DSP_SETTINGS: DspSettings = {
  pitchSemitones: 0,
  lowGainDb: 0,
  midGainDb: 1.5,
  highGainDb: 2,
  highPassHz: 80,
  compression: 35,
  outputGain: 1,
  noiseGateDb: -55,
};

export interface DspPreset {
  id: string;
  name: string;
  summary: string;
  settings: DspSettings;
}

export const DSP_PRESETS: DspPreset[] = [
  {
    id: 'natural',
    name: 'Natural Clean',
    summary: 'Transparent mic pass-through with subtle rumble cut',
    settings: {
      pitchSemitones: 0,
      lowGainDb: 0,
      midGainDb: 0,
      highGainDb: 0,
      highPassHz: 75,
      compression: 15,
      outputGain: 1,
      noiseGateDb: -65,
    },
  },
  {
    id: 'studio-broadcast',
    name: 'Studio Broadcast',
    summary: 'Warm low-end, crisp vocal presence, leveled compression',
    settings: {
      pitchSemitones: 0,
      lowGainDb: 3.5,
      midGainDb: 2.5,
      highGainDb: 3,
      highPassHz: 90,
      compression: 65,
      outputGain: 1.15,
      noiseGateDb: -52,
    },
  },
  {
    id: 'deep-radio',
    name: 'Deep Radio',
    summary: 'Subtle pitch drop with rich chest resonance',
    settings: {
      pitchSemitones: -2,
      lowGainDb: 6,
      midGainDb: 1,
      highGainDb: 1.5,
      highPassHz: 65,
      compression: 70,
      outputGain: 1.2,
      noiseGateDb: -55,
    },
  },
  {
    id: 'bright-streamer',
    name: 'Bright Streamer',
    summary: 'Cuts through game audio and Discord voice chat',
    settings: {
      pitchSemitones: 0.5,
      lowGainDb: -1,
      midGainDb: 4,
      highGainDb: 4.5,
      highPassHz: 110,
      compression: 60,
      outputGain: 1.15,
      noiseGateDb: -48,
    },
  },
  {
    id: 'pitch-up',
    name: 'Pitch +3st',
    summary: 'Light character shift upward by 3 semitones',
    settings: {
      pitchSemitones: 3,
      lowGainDb: -2,
      midGainDb: 2,
      highGainDb: 3,
      highPassHz: 100,
      compression: 45,
      outputGain: 1.05,
      noiseGateDb: -55,
    },
  },
  {
    id: 'pitch-down',
    name: 'Pitch -3st',
    summary: 'Lowered character tone by 3 semitones',
    settings: {
      pitchSemitones: -3,
      lowGainDb: 4,
      midGainDb: 1.5,
      highGainDb: 0,
      highPassHz: 65,
      compression: 55,
      outputGain: 1.15,
      noiseGateDb: -55,
    },
  },
];

export const DEFAULT_USER_VOICE_PROFILE: VoiceProfile = {
  id: 'my-voice-sample',
  name: 'My Voice (Uploaded Sample)',
  description:
    'Your primary creator voice profile loaded from your sample recording. Use directly in the Voice FX & Exporter or as a style-matched TTS profile.',
  isUserSample: true,
  sampleUrl: '/assets/aistudio/bytheway_12835942.mp3',
  sampleFilename: 'bytheway_12835942.mp3',
  baseVoice: 'Zephyr',
  stylePrompt:
    'Candid, confident, conversational creator voice with relaxed pacing, natural vocal fry on phrase endings, and direct-to-audience warmth.',
  dsp: { ...DEFAULT_DSP_SETTINGS },
  createdAt: '2026-11-18T18:20:00.000Z',
};

export function isValidAudioFormat(value: unknown): value is AudioFormat {
  return typeof value === 'string' && ALLOWED_AUDIO_FORMATS.includes(value as AudioFormat);
}

export function sanitizeSlug(input: string, fallback = 'voice-clip'): string {
  const cleaned = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return cleaned || fallback;
}

export function getMimeTypeForFormat(format: AudioFormat): string {
  switch (format) {
    case 'mp3':
      return 'audio/mpeg';
    case 'ogg':
      return 'audio/ogg';
    case 'wav':
      return 'audio/wav';
  }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

export interface DiscordCompatibilityReport {
  soundboardEligible: boolean; // <= 512 KB and <= 5.2s typical
  standardUploadEligible: boolean; // <= 10 MB free tier / 25 MB
  recommendedFormatLabel: string;
  notes: string;
}

export function checkDiscordCompatibility(
  sizeBytes: number,
  format: AudioFormat,
  durationSec?: number
): DiscordCompatibilityReport {
  const soundboardSizeOk = sizeBytes <= 512 * 1024;
  const soundboardDurationOk = durationSec === undefined || durationSec <= 5.2;
  const soundboardEligible = soundboardSizeOk && soundboardDurationOk;
  const standardUploadEligible = sizeBytes <= 10 * 1024 * 1024;

  const recommendedFormatLabel =
    format === 'ogg'
      ? 'OGG Opus (48kHz Discord Native)'
      : format === 'mp3'
        ? 'MP3 (192kbps Universal)'
        : 'WAV (24kHz Uncompressed)';

  let notes = 'Ready for Discord channel uploads.';
  if (soundboardEligible) {
    notes = 'Fits Discord Server Soundboard limits (under 512 KB).';
  } else if (!soundboardDurationOk) {
    notes = 'Exceeds 5.2s Soundboard cap; ready for Discord chat & bot playback.';
  } else if (!soundboardSizeOk) {
    notes = 'Exceeds 512 KB Soundboard limit; switch to OGG/MP3 or trim clip.';
  }

  return {
    soundboardEligible,
    standardUploadEligible,
    recommendedFormatLabel,
    notes,
  };
}

export interface FfmpegConversionOptions {
  inputPath: string;
  outputPath: string;
  format: AudioFormat;
  startSec?: number;
  endSec?: number;
  pitchSemitones?: number;
  speed?: number;
  normalize?: boolean;
  sampleRateHz?: number;
}

export function buildFfmpegArgs(opts: FfmpegConversionOptions): string[] {
  const args: string[] = ['-y', '-hide_banner', '-loglevel', 'error'];

  if (typeof opts.startSec === 'number' && opts.startSec > 0) {
    args.push('-ss', opts.startSec.toFixed(3));
  }
  if (
    typeof opts.endSec === 'number' &&
    opts.endSec > 0 &&
    (opts.startSec === undefined || opts.endSec > opts.startSec)
  ) {
    args.push('-to', opts.endSec.toFixed(3));
  }

  args.push('-i', opts.inputPath);

  const filters: string[] = [];
  const baseRate = opts.sampleRateHz ?? (opts.format === 'ogg' ? 48000 : 44100);
  const pitch = clampNumber(opts.pitchSemitones ?? 0, -12, 12);
  const speed = clampNumber(opts.speed ?? 1, 0.5, 2.0);

  if (pitch !== 0) {
    const pitchFactor = Math.pow(2, pitch / 12);
    const invTempo = 1 / pitchFactor;
    filters.push(`asetrate=${Math.round(baseRate * pitchFactor)}`);
    filters.push(`aresample=${baseRate}`);
    filters.push(buildAtempoFilterChain(invTempo * speed));
  } else if (speed !== 1) {
    filters.push(buildAtempoFilterChain(speed));
  }

  if (opts.normalize) {
    filters.push('loudnorm=I=-16:TP=-1.5:LRA=11');
  }

  if (filters.length > 0) {
    args.push('-af', filters.join(','));
  }

  if (opts.format === 'mp3') {
    args.push('-ar', '44100', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '192k', opts.outputPath);
  } else if (opts.format === 'ogg') {
    args.push('-ar', '48000', '-ac', '1', '-c:a', 'libopus', '-b:a', '96k', opts.outputPath);
  } else {
    args.push('-ar', '24000', '-ac', '1', '-c:a', 'pcm_s16le', opts.outputPath);
  }

  return args;
}

function buildAtempoFilterChain(targetTempo: number): string {
  const clamped = clampNumber(targetTempo, 0.25, 4.0);
  const parts: string[] = [];
  let remaining = clamped;
  while (remaining > 2.0) {
    parts.push('atempo=2.0');
    remaining /= 2.0;
  }
  while (remaining < 0.5) {
    parts.push('atempo=0.5');
    remaining /= 0.5;
  }
  parts.push(`atempo=${remaining.toFixed(4)}`);
  return parts.join(',');
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
