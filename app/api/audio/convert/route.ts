import { promises as fs } from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import {
  getMimeTypeForFormat,
  isValidAudioFormat,
  sanitizeSlug,
} from '@/lib/audio-utils';
import { convertAudioBuffer } from '@/lib/ffmpeg-server';
import type { AudioFormat } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';

    let inputBuffer: Buffer;
    let inputExt = 'mp3';
    let format: AudioFormat = 'ogg';
    let startSec: number | undefined;
    let endSec: number | undefined;
    let pitchSemitones = 0;
    let speed = 1;
    let normalize = false;
    let filename = 'my-voice-clip';
    let binary = false;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('audio');
      if (!file || !(file instanceof File)) {
        return NextResponse.json({ error: 'Missing audio file.' }, { status: 400 });
      }
      if (file.size > 25 * 1024 * 1024) {
        return NextResponse.json({ error: 'Audio exceeds 25 MB limit.' }, { status: 400 });
      }
      inputBuffer = Buffer.from(await file.arrayBuffer());
      const nameExt = file.name.split('.').pop()?.toLowerCase();
      inputExt = nameExt || (file.type.includes('webm') ? 'webm' : file.type.includes('wav') ? 'wav' : 'mp3');

      const rawFormat = String(formData.get('format') || 'ogg');
      if (!isValidAudioFormat(rawFormat)) {
        return NextResponse.json({ error: 'Unsupported format. Use mp3, ogg, or wav.' }, { status: 400 });
      }
      format = rawFormat;
      startSec = parseOptionalNum(formData.get('startSec'));
      endSec = parseOptionalNum(formData.get('endSec'));
      pitchSemitones = parseOptionalNum(formData.get('pitchSemitones')) ?? 0;
      speed = parseOptionalNum(formData.get('speed')) ?? 1;
      normalize = String(formData.get('normalize') || 'false') === 'true';
      filename = sanitizeSlug(String(formData.get('filename') || 'my-voice-clip'));
      binary = String(formData.get('binary') || 'false') === 'true';
    } else {
      const body = (await req.json()) as {
        samplePath?: string;
        format?: string;
        startSec?: number;
        endSec?: number;
        pitchSemitones?: number;
        speed?: number;
        normalize?: boolean;
        filename?: string;
        binary?: boolean;
      };

      const rawFormat = body.format || 'ogg';
      if (!isValidAudioFormat(rawFormat)) {
        return NextResponse.json({ error: 'Unsupported format. Use mp3, ogg, or wav.' }, { status: 400 });
      }
      format = rawFormat;

      const samplePath = body.samplePath || '/assets/aistudio/bytheway_12835942.mp3';
      const publicRoot = path.resolve(process.cwd(), 'public', 'assets', 'aistudio');
      const relative = samplePath.replace(/^\/+assets\/aistudio\//, '');
      const resolved = path.resolve(publicRoot, relative);
      if (!resolved.startsWith(publicRoot + path.sep)) {
        return NextResponse.json({ error: 'Invalid sample path.' }, { status: 400 });
      }

      inputBuffer = await fs.readFile(resolved);
      inputExt = path.extname(resolved).replace('.', '') || 'mp3';
      startSec = body.startSec;
      endSec = body.endSec;
      pitchSemitones = body.pitchSemitones ?? 0;
      speed = body.speed ?? 1;
      normalize = Boolean(body.normalize);
      filename = sanitizeSlug(body.filename || 'my-voice-clip');
      binary = Boolean(body.binary);
    }

    const outBuffer = await convertAudioBuffer({
      inputBuffer,
      inputExt,
      outputFormat: format,
      startSec,
      endSec,
      pitchSemitones,
      speed,
      normalize,
    });

    const mimeType = getMimeTypeForFormat(format);

    if (binary) {
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
      sizeBytes: outBuffer.length,
      base64Audio: outBuffer.toString('base64'),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Audio conversion failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function parseOptionalNum(val: FormDataEntryValue | null): number | undefined {
  if (val === null || val === '') return undefined;
  const num = Number(val);
  return Number.isFinite(num) ? num : undefined;
}
