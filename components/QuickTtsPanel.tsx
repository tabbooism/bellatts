'use client';

import { useState } from 'react';
import { Download, Loader2, Play, Plus, Volume2 } from 'lucide-react';
import { checkDiscordCompatibility, formatBytes, sanitizeSlug } from '@/lib/audio-utils';
import { downloadBase64Audio } from '@/lib/client-audio';
import type { AudioFormat, GeneratedClip, VoiceProfile } from '@/lib/types';

interface QuickTtsPanelProps {
  activeProfile: VoiceProfile;
  outputFormat: AudioFormat;
  onAddClip: (clip: GeneratedClip) => void;
}

interface SoundboardCue {
  id: string;
  label: string;
  text: string;
}

const DEFAULT_CUES: SoundboardCue[] = [
  { id: 'cue-1', label: 'Live Now', text: 'Yo everyone, stream is live right now! Drop in!' },
  { id: 'cue-2', label: 'BRB Coffee', text: 'Be right back chat, grabbing a quick coffee.' },
  { id: 'cue-3', label: 'GG Match', text: 'GGs everybody! Queueing up the next round.' },
  { id: 'cue-4', label: 'Hold Up', text: '<breath> Wait hold on a second, let me check that.' },
];

const VOCAL_TAGS = ['<breath>', '<laugh>', '<gasp>', '|yeah|', '|mhm|'];

export default function QuickTtsPanel({
  activeProfile,
  outputFormat,
  onAddClip,
}: QuickTtsPanelProps) {
  const [text, setText] = useState(
    "What's up everyone, welcome back! Drop your questions in Discord and let's get into it."
  );
  const [filename, setFilename] = useState('discord-quick-message');
  const [mode, setMode] = useState<'expressive' | 'fast'>('expressive');
  const [speed, setSpeed] = useState<number>(1);
  const [pitchSemitones, setPitchSemitones] = useState<number>(
    activeProfile.dsp.pitchSemitones
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestClip, setLatestClip] = useState<GeneratedClip | null>(null);
  const [cues, setCues] = useState<SoundboardCue[]>(DEFAULT_CUES);
  const [runningCueId, setRunningCueId] = useState<string | null>(null);

  const synthesize = async (
    targetText: string,
    targetFilename: string,
    cueId?: string
  ) => {
    const cleaned = targetText.trim();
    if (!cleaned) {
      setError('Enter a message to synthesize.');
      return;
    }

    if (cueId) setRunningCueId(cueId);
    setIsGenerating(true);
    setError(null);

    try {
      const res = await fetch('/api/v1/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: cleaned,
          voice: activeProfile.baseVoice,
          stylePrompt: mode === 'expressive' ? activeProfile.stylePrompt : '',
          format: outputFormat,
          pitchSemitones,
          speed,
          normalize: true,
          filename: sanitizeSlug(targetFilename),
          mode,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Synthesis failed.');
      }

      const clip: GeneratedClip = {
        id: `tts-${Date.now()}`,
        label: sanitizeSlug(targetFilename),
        text: cleaned,
        voiceId: activeProfile.id,
        voiceName: activeProfile.name,
        format: outputFormat,
        mimeType: data.mimeType,
        base64Audio: data.base64Audio,
        sizeBytes: data.sizeBytes,
        createdAt: new Date().toISOString(),
      };

      setLatestClip(clip);
      onAddClip(clip);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to synthesize audio.');
    } finally {
      setIsGenerating(false);
      setRunningCueId(null);
    }
  };

  const handlePinCue = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const label = filename.trim() || trimmed.split(/\s+/).slice(0, 2).join(' ');
    setCues((prev) => [
      { id: `cue-${Date.now()}`, label: label.slice(0, 24), text: trimmed },
      ...prev,
    ]);
  };

  const insertVocalTag = (tag: string) => {
    setText((prev) => (prev.endsWith(' ') || prev.length === 0 ? `${prev}${tag} ` : `${prev} ${tag} `));
  };

  const discordCheck = latestClip
    ? checkDiscordCompatibility(latestClip.sizeBytes, latestClip.format)
    : null;

  return (
    <div className="space-y-8">
      <div className="border-b border-white/10 pb-6">
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white">
          Quick TTS & Discord Soundboard
        </h1>
        <p className="mt-1.5 text-sm text-slate-400">
          Active profile: <span className="text-slate-200 font-medium">{activeProfile.name}</span> · Base timbre <span className="text-slate-200">{activeProfile.baseVoice}</span> · Output <span className="font-mono text-amber-400">.{outputFormat}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        <section className="xl:col-span-7 space-y-5 rounded-xl border border-white/10 bg-[#121722] p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label htmlFor="quick-tts-script" className="font-display text-base font-semibold text-white">
              Message Script
            </label>
            <div className="flex items-center gap-1 p-1 rounded-lg bg-[#0B0E14] border border-white/10">
              <button
                type="button"
                onClick={() => setMode('expressive')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  mode === 'expressive'
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Expressive Style
              </button>
              <button
                type="button"
                onClick={() => setMode('fast')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  mode === 'fast'
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Fast Lite
              </button>
            </div>
          </div>

          <textarea
            id="quick-tts-script"
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={2500}
            placeholder="Type a fast Discord message or announcement..."
            className="w-full rounded-lg border border-white/15 bg-[#0B0E14] px-3.5 py-3 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none leading-relaxed"
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-400 mr-1">Vocal cues:</span>
              {VOCAL_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => insertVocalTag(tag)}
                  className="rounded-md border border-white/10 bg-[#1A2130] px-2.5 py-1 text-xs font-mono text-slate-300 hover:border-amber-400/50 hover:text-white transition-colors"
                >
                  {tag}
                </button>
              ))}
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-400">
              {text.length} / 2500
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-2 border-t border-white/10">
            <div className="sm:col-span-2">
              <label htmlFor="quick-tts-filename" className="block text-xs font-medium text-slate-300 mb-1.5">
                Clip Filename
              </label>
              <input
                id="quick-tts-filename"
                type="text"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-[#0B0E14] px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <label htmlFor="quick-tts-pitch" className="font-medium text-slate-300">
                  Pitch
                </label>
                <span className="font-mono tabular-nums text-amber-400">
                  {pitchSemitones >= 0 ? `+${pitchSemitones}` : pitchSemitones} st
                </span>
              </div>
              <input
                id="quick-tts-pitch"
                type="range"
                min={-8}
                max={8}
                step={0.5}
                value={pitchSemitones}
                onChange={(e) => setPitchSemitones(Number(e.target.value))}
                className="w-full studio-slider mt-1"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <label htmlFor="quick-tts-speed" className="font-medium text-slate-300">
                  Speed
                </label>
                <span className="font-mono tabular-nums text-amber-400">
                  {speed.toFixed(2)}x
                </span>
              </div>
              <input
                id="quick-tts-speed"
                type="range"
                min={0.75}
                max={1.45}
                step={0.05}
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="w-full studio-slider mt-1"
              />
            </div>
          </div>

          {error && (
            <p role="alert" className="text-xs text-rose-400 bg-rose-950/40 border border-rose-500/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={handlePinCue}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-[#1A2130] px-3.5 py-2 text-xs font-medium text-slate-200 hover:border-white/30 transition-colors whitespace-nowrap min-h-[40px]"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Pin to Soundboard</span>
            </button>

            <button
              type="button"
              onClick={() => synthesize(text, filename)}
              disabled={isGenerating}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-2.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60 transition-colors whitespace-nowrap min-h-[40px]"
            >
              {isGenerating && !runningCueId ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Volume2 className="h-4 w-4" aria-hidden="true" />
              )}
              <span>{isGenerating && !runningCueId ? 'Synthesizing...' : 'Synthesize Audio'}</span>
            </button>
          </div>

          {latestClip && discordCheck && (
            <div className="rounded-lg border border-white/15 bg-[#0B0E14] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-white">
                    {latestClip.label}.{latestClip.format}
                  </p>
                  <p className="text-xs text-slate-400 font-mono tabular-nums">
                    {formatBytes(latestClip.sizeBytes)} · {discordCheck.recommendedFormatLabel}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    downloadBase64Audio(
                      latestClip.base64Audio,
                      latestClip.mimeType,
                      `${latestClip.label}.${latestClip.format}`
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 transition-colors whitespace-nowrap min-h-[36px]"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Download .{latestClip.format.toUpperCase()}</span>
                </button>
              </div>
              <audio
                controls
                autoPlay
                src={`data:${latestClip.mimeType};base64,${latestClip.base64Audio}`}
                className="w-full h-9"
              />
              <p className="text-xs text-slate-400">{discordCheck.notes}</p>
            </div>
          )}
        </section>

        {/* Right column: Fast Discord Soundboard Pad */}
        <section className="xl:col-span-5 rounded-xl border border-white/10 bg-[#121722] p-6 space-y-4">
          <div>
            <h2 className="font-display text-base font-semibold text-white">
              Fast Discord Soundboard
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              One-click synthesis for recurring stream callouts and community replies.
            </p>
          </div>

          <div className="space-y-2.5">
            {cues.map((cue) => {
              const busy = runningCueId === cue.id;
              return (
                <div
                  key={cue.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#0B0E14] p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white truncate">{cue.label}</p>
                    <p className="mt-0.5 text-xs text-slate-400 truncate">{cue.text}</p>
                  </div>
                  <button
                    type="button"
                    disabled={isGenerating}
                    onClick={() => synthesize(cue.text, cue.label, cue.id)}
                    aria-label={`Synthesize soundboard cue ${cue.label}`}
                    className="inline-flex items-center gap-1.5 rounded-md bg-[#1A2130] border border-white/15 px-3 py-2 text-xs font-medium text-amber-300 hover:border-amber-400/60 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 min-h-[36px]"
                  >
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Play className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    <span>{busy ? 'Working' : 'Fire'}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
