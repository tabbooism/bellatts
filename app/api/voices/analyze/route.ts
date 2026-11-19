import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Type } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { extractGeminiErrorMessage, getGeminiClient } from '@/lib/gemini-server';
import type { GeminiVoiceName } from '@/lib/types';

const VALID_BASE_VOICES: GeminiVoiceName[] = ['Zephyr', 'Kore', 'Puck', 'Charon', 'Fenrir'];

export async function POST(req: NextRequest) {
  try {
    let audioBuffer: Buffer;
    let mimeType = 'audio/mp3';

    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('audio');
      if (!file || !(file instanceof File)) {
        return NextResponse.json(
          { error: 'Missing audio file field in multipart upload.' },
          { status: 400 }
        );
      }
      if (file.size > 15 * 1024 * 1024) {
        return NextResponse.json(
          { error: 'Audio sample exceeds 15 MB limit.' },
          { status: 400 }
        );
      }
      audioBuffer = Buffer.from(await file.arrayBuffer());
      mimeType = file.type || 'audio/mp3';
    } else {
      const body = (await req.json()) as { samplePath?: string };
      const samplePath = body.samplePath || '/assets/aistudio/bytheway_12835942.mp3';

      const publicRoot = path.resolve(process.cwd(), 'public', 'assets', 'aistudio');
      const relative = samplePath.replace(/^\/+assets\/aistudio\//, '');
      const resolved = path.resolve(publicRoot, relative);

      if (!resolved.startsWith(publicRoot + path.sep)) {
        return NextResponse.json({ error: 'Invalid sample path.' }, { status: 400 });
      }

      audioBuffer = await fs.readFile(resolved);
      mimeType = resolved.endsWith('.wav')
        ? 'audio/wav'
        : resolved.endsWith('.ogg')
          ? 'audio/ogg'
          : 'audio/mp3';
    }

    const ai = getGeminiClient();
    const base64Audio = audioBuffer.toString('base64');

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64Audio,
            },
          },
          {
            text: `Analyze the speaker's voice in this audio recording so the speaker can create a Voice Design profile for their own creator studio.
Return JSON with:
1. transcript: accurate verbatim transcript of what the speaker says.
2. vocalSummary: concise 1-2 sentence description of the speaker's vocal tone, pitch register, cadence, energy, and accent/delivery.
3. recommendedBaseVoice: choose the closest match among exactly: Zephyr, Kore, Puck, Charon, Fenrir.
4. stylePrompt: a detailed Voice Design style direction (max 30 words) describing pacing, warmth, cadence, and attitude for TTS delivery.
5. suggestedPitchSemitones: a small integer or half-step between -4 and 4 for subtle alignment.`,
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            transcript: { type: Type.STRING },
            vocalSummary: { type: Type.STRING },
            recommendedBaseVoice: { type: Type.STRING },
            stylePrompt: { type: Type.STRING },
            suggestedPitchSemitones: { type: Type.NUMBER },
          },
          required: [
            'transcript',
            'vocalSummary',
            'recommendedBaseVoice',
            'stylePrompt',
            'suggestedPitchSemitones',
          ],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim()) as {
      transcript?: string;
      vocalSummary?: string;
      recommendedBaseVoice?: string;
      stylePrompt?: string;
      suggestedPitchSemitones?: number;
    };

    const recommendedBaseVoice = VALID_BASE_VOICES.includes(
      parsed.recommendedBaseVoice as GeminiVoiceName
    )
      ? (parsed.recommendedBaseVoice as GeminiVoiceName)
      : 'Zephyr';

    return NextResponse.json({
      transcript: parsed.transcript || '',
      vocalSummary: parsed.vocalSummary || 'Conversational creator vocal profile.',
      recommendedBaseVoice,
      stylePrompt:
        parsed.stylePrompt ||
        'Natural conversational creator cadence, relaxed pacing, warm presence.',
      suggestedPitchSemitones:
        typeof parsed.suggestedPitchSemitones === 'number'
          ? Math.max(-4, Math.min(4, parsed.suggestedPitchSemitones))
          : 0,
    });
  } catch (err) {
    const { status, message } = extractGeminiErrorMessage(err);
    return NextResponse.json({ error: message }, { status });
  }
}
