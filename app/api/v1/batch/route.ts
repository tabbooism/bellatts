import { NextRequest, NextResponse } from 'next/server';
import {
  GEMINI_VOICES,
  getMimeTypeForFormat,
  isValidAudioFormat,
  sanitizeSlug,
} from '@/lib/audio-utils';
import { MAX_BATCH_LINES } from '@/lib/batch-parser';
import { convertAudioBuffer } from '@/lib/ffmpeg-server';
import { extractGeminiErrorMessage, getGeminiClient } from '@/lib/gemini-server';
import type { AudioFormat, GeminiVoiceName } from '@/lib/types';

interface BatchInputItem {
  id?: string;
  filename?: string;
  text: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      items?: BatchInputItem[];
      voice?: string;
      stylePrompt?: string;
      format?: string;
      pitchSemitones?: number;
      speed?: number;
      normalize?: boolean;
    };

    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (rawItems.length === 0) {
      return NextResponse.json({ error: 'Provide at least one batch item.' }, { status: 400 });
    }
    if (rawItems.length > MAX_BATCH_LINES) {
      return NextResponse.json(
        { error: `Maximum ${MAX_BATCH_LINES} items per batch request.` },
        { status: 400 }
      );
    }

    const format: AudioFormat = isValidAudioFormat(body.format) ? body.format : 'mp3';
    const validNames = GEMINI_VOICES.map((v) => v.name);
    const voiceName: GeminiVoiceName = validNames.includes(body.voice as GeminiVoiceName)
      ? (body.voice as GeminiVoiceName)
      : 'Zephyr';

    const stylePrompt = (body.stylePrompt || '').trim();
    const model = stylePrompt ? 'gemini-3.8-flash-tts' : 'gemini-3.8-flash-lite-tts';
    const ai = getGeminiClient();

    const results = await Promise.all(
      rawItems.map(async (item, index) => {
        const text = (item.text || '').trim();
        const filename = sanitizeSlug(item.filename || `clip-${index + 1}`);
        if (!text) {
          return {
            id: item.id || `item-${index}`,
            filename: `${filename}.${format}`,
            ok: false,
            error: 'Empty text',
          };
        }

        try {
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
                  prebuiltVoiceConfig: { voiceName },
                },
              },
            },
          });

          const base64Wav = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
          if (!base64Wav) {
            return {
              id: item.id || `item-${index}`,
              filename: `${filename}.${format}`,
              ok: false,
              error: 'No audio returned',
            };
          }

          const outBuffer = await convertAudioBuffer({
            inputBuffer: Buffer.from(base64Wav, 'base64'),
            inputExt: 'wav',
            outputFormat: format,
            pitchSemitones: body.pitchSemitones ?? 0,
            speed: body.speed ?? 1,
            normalize: body.normalize ?? true,
          });

          return {
            id: item.id || `item-${index}`,
            filename: `${filename}.${format}`,
            format,
            mimeType: getMimeTypeForFormat(format),
            sizeBytes: outBuffer.length,
            base64Audio: outBuffer.toString('base64'),
            ok: true,
          };
        } catch (itemErr) {
          const { message } = extractGeminiErrorMessage(itemErr);
          return {
            id: item.id || `item-${index}`,
            filename: `${filename}.${format}`,
            ok: false,
            error: message,
          };
        }
      })
    );

    return NextResponse.json({
      voice: voiceName,
      format,
      total: results.length,
      succeeded: results.filter((r) => r.ok).length,
      results,
    });
  } catch (err) {
    const { status, message } = extractGeminiErrorMessage(err);
    return NextResponse.json({ error: message }, { status });
  }
}
