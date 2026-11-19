'use client';

import { useRef, useState } from 'react';
import JSZip from 'jszip';
import {
  CheckCircle2,
  Download,
  FileArchive,
  Loader2,
  Pause,
  Play,
  AlertCircle,
  ListPlus,
} from 'lucide-react';
import { formatBytes, sanitizeSlug } from '@/lib/audio-utils';
import { MAX_BATCH_LINES, parseBatchScript } from '@/lib/batch-parser';
import { base64ToBlob, downloadBase64Audio, downloadBlob } from '@/lib/client-audio';
import type { AudioFormat, BatchQueueItem, GeneratedClip, VoiceProfile } from '@/lib/types';

interface BatchStudioPanelProps {
  activeProfile: VoiceProfile;
  outputFormat: AudioFormat;
  onAddClips: (clips: GeneratedClip[]) => void;
}

const SAMPLE_BATCH_SCRIPT = `welcome_chat | Welcome into the stream everyone, glad you are here!
discord_drop | Check the Discord announcements channel for tonight's community match.
gg_wp | Good game everybody, that round was intense!
brb_snack | Stepping away for two minutes, keep the chat going.`;

export default function BatchStudioPanel({
  activeProfile,
  outputFormat,
  onAddClips,
}: BatchStudioPanelProps) {
  const [rawScript, setRawScript] = useState(SAMPLE_BATCH_SCRIPT);
  const [queue, setQueue] = useState<BatchQueueItem[]>(() =>
    parseBatchScript(SAMPLE_BATCH_SCRIPT).map((item) => ({
      ...item,
      status: 'pending',
    }))
  );
  const [isRunning, setIsRunning] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const handleParseScript = () => {
    const parsed = parseBatchScript(rawScript);
    setQueue(parsed.map((item) => ({ ...item, status: 'pending' })));
    setBatchError(null);
  };

  const handleRunBatch = async () => {
    const parsed = queue.length > 0 ? queue : parseBatchScript(rawScript).map((i) => ({ ...i, status: 'pending' as const }));
    if (parsed.length === 0) {
      setBatchError('Add at least one line to process.');
      return;
    }

    setIsRunning(true);
    setBatchError(null);
    setQueue(parsed.map((item) => ({ ...item, status: 'processing', error: undefined })));

    try {
      const res = await fetch('/api/v1/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: parsed.map((item) => ({
            id: item.id,
            filename: item.filename,
            text: item.text,
          })),
          voice: activeProfile.baseVoice,
          stylePrompt: activeProfile.stylePrompt,
          format: outputFormat,
          pitchSemitones: activeProfile.dsp.pitchSemitones,
          normalize: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Batch processing failed.');
      }

      const resultMap = new Map<
        string,
        {
          ok: boolean;
          error?: string;
          base64Audio?: string;
          mimeType?: string;
          sizeBytes?: number;
          filename?: string;
        }
      >();
      for (const r of data.results || []) {
        resultMap.set(r.id, r);
      }

      const completedClips: GeneratedClip[] = [];

      setQueue(
        parsed.map((item) => {
          const result = resultMap.get(item.id);
          if (result?.ok && result.base64Audio && result.mimeType) {
            const clip: GeneratedClip = {
              id: `batch-${item.id}-${Date.now()}`,
              label: sanitizeSlug(item.filename),
              text: item.text,
              voiceId: activeProfile.id,
              voiceName: activeProfile.name,
              format: outputFormat,
              mimeType: result.mimeType,
              base64Audio: result.base64Audio,
              sizeBytes: result.sizeBytes ?? 0,
              createdAt: new Date().toISOString(),
            };
            completedClips.push(clip);
            return { ...item, status: 'done', clip };
          }
          return {
            ...item,
            status: 'error',
            error: result?.error || 'Failed to synthesize line',
          };
        })
      );

      if (completedClips.length > 0) {
        onAddClips(completedClips);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Batch request failed.';
      setBatchError(msg);
      setQueue((prev) => prev.map((item) => ({ ...item, status: 'error', error: msg })));
    } finally {
      setIsRunning(false);
    }
  };

  const handleTogglePlay = (item: BatchQueueItem) => {
    if (!item.clip) return;
    if (playingId === item.id) {
      audioPlayerRef.current?.pause();
      setPlayingId(null);
      return;
    }

    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
    }
    const audio = new Audio(`data:${item.clip.mimeType};base64,${item.clip.base64Audio}`);
    audio.onended = () => setPlayingId(null);
    audioPlayerRef.current = audio;
    audio.play().catch(() => {});
    setPlayingId(item.id);
  };

  const handleDownloadZip = async () => {
    const doneItems = queue.filter((q) => q.status === 'done' && q.clip);
    if (doneItems.length === 0) return;

    const zip = new JSZip();
    for (const item of doneItems) {
      if (!item.clip) continue;
      zip.file(
        `${item.clip.label}.${item.clip.format}`,
        base64ToBlob(item.clip.base64Audio, item.clip.mimeType)
      );
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(blob, `VoxForge-Discord-Pack-${outputFormat}.zip`);
  };

  const completedCount = queue.filter((q) => q.status === 'done').length;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between border-b border-white/10 pb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Batch Audio Studio
          </h1>
          <p className="mt-1.5 text-sm text-slate-400">
            Format lines as <code className="text-amber-300">filename | spoken text</code> or plain lines (up to {MAX_BATCH_LINES} clips per batch) and export individually or as a ZIP pack.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={completedCount === 0}
            onClick={handleDownloadZip}
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-[#121722] px-4 py-2 text-xs font-semibold text-slate-200 hover:border-amber-400/60 disabled:opacity-40 transition-colors whitespace-nowrap min-h-[40px]"
          >
            <FileArchive className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
            <span className="tabular-nums">Download ZIP ({completedCount})</span>
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-[#121722] p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="batch-script-input" className="font-display text-sm font-semibold text-white">
            Batch Script Input
          </label>
          <span className="text-xs font-mono tabular-nums text-slate-400">
            {parseBatchScript(rawScript).length} / {MAX_BATCH_LINES} lines parsed
          </span>
        </div>

        <textarea
          id="batch-script-input"
          rows={6}
          value={rawScript}
          onChange={(e) => setRawScript(e.target.value)}
          placeholder="clip_name | Text to speak..."
          className="w-full rounded-lg border border-white/15 bg-[#0B0E14] px-3.5 py-3 font-mono text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none leading-relaxed"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleParseScript}
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-[#1A2130] px-4 py-2 text-xs font-medium text-slate-200 hover:border-white/30 transition-colors whitespace-nowrap min-h-[40px]"
          >
            <ListPlus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Load Lines to Queue</span>
          </button>

          <button
            type="button"
            onClick={handleRunBatch}
            disabled={isRunning}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60 transition-colors whitespace-nowrap min-h-[40px]"
          >
            {isRunning && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            <span>
              {isRunning
                ? 'Processing Batch...'
                : `Run Batch (${queue.length} · .${outputFormat.toUpperCase()})`}
            </span>
          </button>
        </div>

        {batchError && (
          <p role="alert" className="text-xs text-rose-400 bg-rose-950/40 border border-rose-500/30 rounded-lg px-3 py-2">
            {batchError}
          </p>
        )}
      </div>

      {/* Dense Queue Table */}
      <div className="rounded-xl border border-white/10 bg-[#121722] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-xs font-semibold text-slate-400 bg-[#0E131C]">
                <th className="py-3 px-4">Filename</th>
                <th className="py-3 px-4">Script</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Size</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm">
              {queue.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-xs text-slate-500">
                    Queue is empty. Enter lines above and click Load Lines to Queue.
                  </td>
                </tr>
              ) : (
                queue.map((item) => (
                  <tr key={item.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-200 whitespace-nowrap">
                      {item.filename}.{outputFormat}
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-300 max-w-md truncate">
                      {item.text}
                    </td>
                    <td className="py-2.5 px-4 text-xs whitespace-nowrap">
                      {item.status === 'pending' && (
                        <span className="text-slate-400">Queued</span>
                      )}
                      {item.status === 'processing' && (
                        <span className="inline-flex items-center gap-1.5 text-amber-400">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                          <span>Synthesizing</span>
                        </span>
                      )}
                      {item.status === 'done' && (
                        <span className="inline-flex items-center gap-1.5 text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Ready</span>
                        </span>
                      )}
                      {item.status === 'error' && (
                        <span
                          className="inline-flex items-center gap-1.5 text-rose-400"
                          title={item.error}
                        >
                          <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Error</span>
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-xs text-slate-400 tabular-nums whitespace-nowrap">
                      {item.clip ? formatBytes(item.clip.sizeBytes) : '—'}
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      {item.clip ? (
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleTogglePlay(item)}
                            aria-label={`Play ${item.filename}`}
                            className="rounded-md border border-white/15 bg-[#1A2130] p-1.5 text-slate-200 hover:border-amber-400/50 transition-colors"
                          >
                            {playingId === item.id ? (
                              <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                            ) : (
                              <Play className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              item.clip &&
                              downloadBase64Audio(
                                item.clip.base64Audio,
                                item.clip.mimeType,
                                `${item.clip.label}.${item.clip.format}`
                              )
                            }
                            aria-label={`Download ${item.filename}.${outputFormat}`}
                            className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2.5 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/25 transition-colors"
                          >
                            <Download className="h-3 w-3" aria-hidden="true" />
                            <span>Save</span>
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
