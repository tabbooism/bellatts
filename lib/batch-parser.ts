import { sanitizeSlug } from './audio-utils';

export interface ParsedBatchLine {
  id: string;
  filename: string;
  text: string;
}

export const MAX_BATCH_LINES = 25;

export function parseBatchScript(rawInput: string): ParsedBatchLine[] {
  const lines = rawInput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const usedSlugs = new Map<string, number>();
  const results: ParsedBatchLine[] = [];

  for (let i = 0; i < Math.min(lines.length, MAX_BATCH_LINES); i++) {
    const line = lines[i];
    const pipeIndex = line.indexOf('|');

    let rawName = '';
    let text = line;

    if (pipeIndex > 0 && pipeIndex < 48) {
      const candidateName = line.slice(0, pipeIndex).trim();
      const candidateText = line.slice(pipeIndex + 1).trim();
      if (candidateName.length > 0 && candidateText.length > 0) {
        rawName = candidateName;
        text = candidateText;
      }
    }

    const baseSlug = sanitizeSlug(
      rawName || text.split(/\s+/).slice(0, 4).join('-'),
      `clip-${i + 1}`
    );

    const count = usedSlugs.get(baseSlug) ?? 0;
    usedSlugs.set(baseSlug, count + 1);
    const uniqueFilename = count === 0 ? baseSlug : `${baseSlug}-${count + 1}`;

    results.push({
      id: `batch-${i + 1}-${uniqueFilename}`,
      filename: uniqueFilename,
      text,
    });
  }

  return results;
}
