import { NextResponse } from 'next/server';
import { ALLOWED_AUDIO_FORMATS, DSP_PRESETS, GEMINI_VOICES } from '@/lib/audio-utils';

export async function GET() {
  return NextResponse.json({
    service: 'VoxForge Studio API',
    version: '1.0.0',
    formats: ALLOWED_AUDIO_FORMATS,
    voices: GEMINI_VOICES,
    dspPresets: DSP_PRESETS.map((p) => ({
      id: p.id,
      name: p.name,
      summary: p.summary,
      pitchSemitones: p.settings.pitchSemitones,
    })),
    endpoints: [
      { method: 'GET', path: '/api/v1/voices', description: 'List voices, presets, and supported output formats' },
      { method: 'POST', path: '/api/v1/tts', description: 'Synthesize text to mp3, ogg (Discord Opus), or wav' },
      { method: 'POST', path: '/api/v1/batch', description: 'Batch synthesize up to 25 lines' },
      { method: 'POST', path: '/api/audio/convert', description: 'Convert, trim, pitch-shift, and normalize user voice audio' },
      { method: 'POST', path: '/api/voices/analyze', description: 'Transcribe and extract Voice Design metadata from a voice sample' },
    ],
  });
}
