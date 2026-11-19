import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFfmpegArgs,
  checkDiscordCompatibility,
  clampNumber,
  formatBytes,
  getMimeTypeForFormat,
  isValidAudioFormat,
  sanitizeSlug,
} from './audio-utils';

test('audio format validation and mime mapping', () => {
  assert.equal(isValidAudioFormat('mp3'), true);
  assert.equal(isValidAudioFormat('ogg'), true);
  assert.equal(isValidAudioFormat('wav'), true);
  assert.equal(isValidAudioFormat('exe'), false);
  assert.equal(getMimeTypeForFormat('mp3'), 'audio/mpeg');
  assert.equal(getMimeTypeForFormat('ogg'), 'audio/ogg');
  assert.equal(getMimeTypeForFormat('wav'), 'audio/wav');
});

test('sanitizeSlug creates safe Discord-ready filenames', () => {
  assert.equal(sanitizeSlug('Hello World! 123'), 'hello-world-123');
  assert.equal(sanitizeSlug('   ---   ', 'fallback'), 'fallback');
  assert.equal(sanitizeSlug('gg_everyone.ogg'), 'gg_everyone-ogg');
});

test('formatBytes formats human-readable sizes', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(2048), '2.0 KB');
  assert.equal(formatBytes(1048576), '1.00 MB');
});

test('checkDiscordCompatibility identifies soundboard vs upload limits', () => {
  const sbOk = checkDiscordCompatibility(220 * 1024, 'ogg', 3.4);
  assert.equal(sbOk.soundboardEligible, true);
  assert.equal(sbOk.standardUploadEligible, true);

  const tooLong = checkDiscordCompatibility(120 * 1024, 'mp3', 8.5);
  assert.equal(tooLong.soundboardEligible, false);
  assert.equal(tooLong.standardUploadEligible, true);

  const tooBig = checkDiscordCompatibility(12 * 1024 * 1024, 'wav', 4.0);
  assert.equal(tooBig.soundboardEligible, false);
  assert.equal(tooBig.standardUploadEligible, false);
});

test('buildFfmpegArgs constructs safe codec arguments for mp3, ogg, and wav', () => {
  const mp3Args = buildFfmpegArgs({
    inputPath: '/tmp/in.wav',
    outputPath: '/tmp/out.mp3',
    format: 'mp3',
    normalize: true,
  });
  assert.ok(mp3Args.includes('libmp3lame'));
  assert.ok(mp3Args.includes('loudnorm=I=-16:TP=-1.5:LRA=11'));

  const oggArgs = buildFfmpegArgs({
    inputPath: '/tmp/in.wav',
    outputPath: '/tmp/out.ogg',
    format: 'ogg',
    pitchSemitones: 3,
    startSec: 1.5,
    endSec: 4.5,
  });
  assert.ok(oggArgs.includes('libopus'));
  assert.ok(oggArgs.includes('-ss'));
  assert.ok(oggArgs.includes('1.500'));
  assert.ok(oggArgs.includes('-to'));
  assert.ok(oggArgs.includes('4.500'));
  assert.ok(oggArgs.some((arg) => arg.includes('asetrate=')));

  const wavArgs = buildFfmpegArgs({
    inputPath: '/tmp/in.mp3',
    outputPath: '/tmp/out.wav',
    format: 'wav',
  });
  assert.ok(wavArgs.includes('pcm_s16le'));
});

test('clampNumber enforces bounds safely', () => {
  assert.equal(clampNumber(15, -12, 12), 12);
  assert.equal(clampNumber(-20, -12, 12), -12);
  assert.equal(clampNumber(Number.NaN, 0, 10), 0);
});
