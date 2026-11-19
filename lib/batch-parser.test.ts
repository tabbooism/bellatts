import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_BATCH_LINES, parseBatchScript } from './batch-parser';

test('parseBatchScript handles plain lines and pipe-delimited filenames', () => {
  const input = `
    intro_greeting | What is up chat, welcome back to the stream!
    gg-callout | Good game everyone, queueing up the next match.
    Be right back grabbing coffee
  `;
  const parsed = parseBatchScript(input);
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].filename, 'intro_greeting');
  assert.equal(parsed[0].text, 'What is up chat, welcome back to the stream!');
  assert.equal(parsed[1].filename, 'gg-callout');
  assert.equal(parsed[2].filename, 'be-right-back-grabbing');
});

test('parseBatchScript deduplicates colliding slugs and enforces max line limit', () => {
  const dupes = parseBatchScript('same_name | First line\nsame_name | Second line');
  assert.equal(dupes[0].filename, 'same_name');
  assert.equal(dupes[1].filename, 'same_name-2');

  const manyLines = Array.from({ length: 40 }, (_, i) => `line_${i} | Hello ${i}`).join('\n');
  const capped = parseBatchScript(manyLines);
  assert.equal(capped.length, MAX_BATCH_LINES);
});
