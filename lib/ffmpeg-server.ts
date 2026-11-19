import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { buildFfmpegArgs } from './audio-utils';
import type { AudioFormat } from './types';

const execFileAsync = promisify(execFile);

export interface ConvertAudioParams {
  inputBuffer: Buffer;
  inputExt: string;
  outputFormat: AudioFormat;
  startSec?: number;
  endSec?: number;
  pitchSemitones?: number;
  speed?: number;
  normalize?: boolean;
}

export async function convertAudioBuffer(params: ConvertAudioParams): Promise<Buffer> {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'voxforge-'));
  const cleanInExt = params.inputExt.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'wav';
  const inputPath = path.join(workDir, `input.${cleanInExt}`);
  const outputPath = path.join(workDir, `output.${params.outputFormat}`);

  try {
    await fs.writeFile(inputPath, params.inputBuffer);

    const needsProcessing =
      params.outputFormat !== cleanInExt ||
      (params.startSec !== undefined && params.startSec > 0) ||
      (params.endSec !== undefined && params.endSec > 0) ||
      (params.pitchSemitones !== undefined && params.pitchSemitones !== 0) ||
      (params.speed !== undefined && params.speed !== 1) ||
      Boolean(params.normalize);

    if (!needsProcessing) {
      return params.inputBuffer;
    }

    const args = buildFfmpegArgs({
      inputPath,
      outputPath,
      format: params.outputFormat,
      startSec: params.startSec,
      endSec: params.endSec,
      pitchSemitones: params.pitchSemitones,
      speed: params.speed,
      normalize: params.normalize,
    });

    await execFileAsync('ffmpeg', args, { timeout: 30000 });
    return await fs.readFile(outputPath);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
