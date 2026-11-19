import { NextRequest, NextResponse } from 'next/server';
import {
  GEMINI_VOICES,
  getMimeTypeForFormat,
  isValidAudioFormat,
  sanitizeSlug,
} from '@/lib/audio-utils';
import { convertAudioBuffer } from '@/lib/ffmpeg-server';
import { extractGeminiErrorMessage, getGeminiClient } from '@/lib/gemini-server';
import type { AudioFormat, GeminiVoiceName } from '@/lib/types';

export interface TtsRequestBody {
  text?: string;
  voice?: string;
  stylePrompt?: string;
  format?: string;
  pitchSemitones?: number;
  speed?: number;
  normalize?: boolean;
  filename?: string;
  mode?: 'fast' | 'expressive';
  binary?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as TtsRequestBody;
    const text = (body.text || '').trim();
    if (!text) {
      return NextResponse.json({ error: 'Text input is required.' }, { status: 400 });
    }
    if (text.length > 2500) {
      return NextResponse.json(
        { error: 'Text exceeds 2500 character single-clip limit. Use /api/v1/batch for longer scripts.' },
        { status: 400 }
      );
    }

    const format: AudioFormat = isValidAudioFormat(body.format) ? body.format : 'mp3';
    const validNames = GEMINI_VOICES.map((v) => v.name);
    const voiceName: GeminiVoiceName = validNames.includes(body.voice as GeminiVoiceName)
      ? (body.voice as GeminiVoiceName)
      : 'Zephyr';

    const stylePrompt = (body.stylePrompt || '').trim();
    const useExpressive =
      body.mode === 'expressive' ||
      stylePrompt.length > 0 ||
      /<(laugh|gasp|breath)>|\|[a-z]+\|/i.test(text);

    const model = useExpressive ? 'gemini-3.8-flash-tts' : 'gemini-3.8-flash-lite-tts';
    const ai = getGeminiClient();

    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text,
              ...(stylePrompt ? { speechMetadata: { style: stylePrompt } } : {}),
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName,
            },
          },
        },
      },
    });

    const base64Wav = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Wav) {
      return NextResponse.json(
        { error: 'TTS model returned no audio data.' },
        { status: 502 }
      );
    }

    const wavBuffer = Buffer.from(base64Wav, 'base64');
    const outBuffer = await convertAudioBuffer({
      inputBuffer: wavBuffer,
      inputExt: 'wav',
      outputFormat: format,
      pitchSemitones: body.pitchSemitones ?? 0,
      speed: body.speed ?? 1,
      normalize: body.normalize ?? true,
    });

    const filename = sanitizeSlug(body.filename || text.split(/\s+/).slice(0, 4).join('-'));
    const mimeType = getMimeTypeForFormat(format);

    if (body.binary || req.headers.get('accept')?.includes('audio/')) {
      return new NextResponse(new Uint8Array(outBuffer), {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Content-Disposition': `attachment; filename="${filename}.${format}"`,
          'Content-Length': String(outBuffer.length),
        },
      });
    }

    return NextResponse.json({
      filename: `${filename}.${format}`,
      format,
      mimeType,
      voice: voiceName,
      model,
      sizeBytes: outBuffer.length,
      base64Audio: outBuffer.toString('base64'),
    });
  } catch (err) {
    const { status, message } = extractGeminiErrorMessage(err);
    return NextResponse.json({ error: message }, { status });
  }
}
