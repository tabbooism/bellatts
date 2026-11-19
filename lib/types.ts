export type AudioFormat = 'mp3' | 'ogg' | 'wav';

export type GeminiVoiceName = 'Zephyr' | 'Kore' | 'Puck' | 'Charon' | 'Fenrir';

export interface DspSettings {
  pitchSemitones: number; // -12 to +12
  lowGainDb: number; // -12 to +12 (warmth around 140Hz)
  midGainDb: number; // -12 to +12 (presence around 2.4kHz)
  highGainDb: number; // -12 to +12 (air around 8kHz)
  highPassHz: number; // 20 to 250 Hz
  compression: number; // 0 to 100%
  outputGain: number; // 0.5 to 2.0
  noiseGateDb: number; // -80 to -20 dB
}

export interface VoiceProfile {
  id: string;
  name: string;
  description: string;
  isUserSample: boolean;
  sampleUrl?: string;
  sampleFilename?: string;
  transcript?: string;
  baseVoice: GeminiVoiceName;
  stylePrompt: string;
  dsp: DspSettings;
  createdAt: string;
}

export interface GeneratedClip {
  id: string;
  label: string;
  text: string;
  voiceId: string;
  voiceName: string;
  format: AudioFormat;
  mimeType: string;
  base64Audio: string;
  sizeBytes: number;
  durationSec?: number;
  createdAt: string;
}

export interface BatchQueueItem {
  id: string;
  filename: string;
  text: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  error?: string;
  clip?: GeneratedClip;
}

export type StudioTab = 'my-voice' | 'quick-tts' | 'batch' | 'live-dsp' | 'api-docs';
