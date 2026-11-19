'use client';

import { Mic, Trash2, Volume2 } from 'lucide-react';
import { ALLOWED_AUDIO_FORMATS, GEMINI_VOICES, formatBytes } from '@/lib/audio-utils';
import { downloadBase64Audio } from '@/lib/client-audio';
import type { AudioFormat, GeneratedClip, VoiceProfile } from '@/lib/types';

interface VoiceSidebarProps {
  profiles: VoiceProfile[];
  activeProfileId: string;
  onSelectProfile: (id: string) => void;
  onDeleteProfile: (id: string) => void;
  outputFormat: AudioFormat;
  onChangeFormat: (format: AudioFormat) => void;
  recentClips: GeneratedClip[];
  onPlayClip: (clip: GeneratedClip) => void;
}

export default function VoiceSidebar({
  profiles,
  activeProfileId,
  onSelectProfile,
  onDeleteProfile,
  outputFormat,
  onChangeFormat,
  recentClips,
  onPlayClip,
}: VoiceSidebarProps) {
  return (
    <aside className="w-full lg:w-[280px] shrink-0 border-b lg:border-b-0 lg:border-r border-white/10 bg-[#0E131C] p-5 flex flex-col gap-6">
      <section aria-labelledby="sidebar-voices-heading">
        <div className="flex items-center justify-between mb-3">
          <h2
            id="sidebar-voices-heading"
            className="text-xs font-semibold tracking-wide text-slate-300"
          >
            Voice Profiles
          </h2>
          <span className="text-xs text-slate-500 tabular-nums">{profiles.length} saved</span>
        </div>

        <div className="space-y-1.5">
          {profiles.map((profile) => {
            const isActive = profile.id === activeProfileId;
            return (
              <div
                key={profile.id}
                className={`group flex items-center justify-between rounded-lg border transition-colors ${
                  isActive
                    ? 'border-amber-500/40 bg-amber-500/10'
                    : 'border-white/5 bg-[#121824] hover:border-white/15'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectProfile(profile.id)}
                  className="flex-1 text-left px-3 py-2.5 min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    {profile.isUserSample ? (
                      <Mic className="h-3.5 w-3.5 text-amber-400 shrink-0" aria-hidden="true" />
                    ) : (
                      <Volume2 className="h-3.5 w-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                    )}
                    <span
                      className={`text-sm font-medium truncate ${
                        isActive ? 'text-amber-200' : 'text-slate-200'
                      }`}
                    >
                      {profile.name}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400 truncate">
                    {profile.baseVoice} base · {profile.dsp.pitchSemitones >= 0 ? `+${profile.dsp.pitchSemitones}` : profile.dsp.pitchSemitones}st
                  </p>
                </button>

                {profile.id !== 'my-voice-sample' && (
                  <button
                    type="button"
                    onClick={() => onDeleteProfile(profile.id)}
                    aria-label={`Delete profile ${profile.name}`}
                    className="p-2 mr-1 text-slate-500 hover:text-rose-400 transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="sidebar-format-heading" className="pt-4 border-t border-white/10">
        <h2
          id="sidebar-format-heading"
          className="text-xs font-semibold tracking-wide text-slate-300 mb-2.5"
        >
          Export Format
        </h2>
        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-[#121824] border border-white/10">
          {ALLOWED_AUDIO_FORMATS.map((fmt) => {
            const active = outputFormat === fmt;
            return (
              <button
                key={fmt}
                type="button"
                onClick={() => onChangeFormat(fmt)}
                className={`py-2 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap min-h-[36px] ${
                  active
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                .{fmt}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-400 leading-relaxed">
          {outputFormat === 'ogg'
            ? 'OGG Opus 48kHz — native Discord voice & soundboard format.'
            : outputFormat === 'mp3'
              ? 'MP3 192kbps — universal creator & Discord chat download.'
              : 'WAV 24kHz PCM — uncompressed studio master audio.'}
        </p>
      </section>

      <section aria-labelledby="sidebar-base-voices" className="pt-4 border-t border-white/10">
        <h2
          id="sidebar-base-voices"
          className="text-xs font-semibold tracking-wide text-slate-300 mb-2"
        >
          Base Synthesis Timbres
        </h2>
        <ul className="space-y-1.5 text-xs text-slate-400">
          {GEMINI_VOICES.map((v) => (
            <li key={v.name} className="flex items-center justify-between gap-2">
              <span className="text-slate-200 font-medium">{v.name}</span>
              <span className="truncate text-slate-500">{v.register}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="sidebar-recent-clips" className="pt-4 border-t border-white/10 flex-1">
        <div className="flex items-center justify-between mb-2.5">
          <h2
            id="sidebar-recent-clips"
            className="text-xs font-semibold tracking-wide text-slate-300"
          >
            Recent Exports
          </h2>
          <span className="text-xs text-slate-500 tabular-nums">{recentClips.length}</span>
        </div>

        {recentClips.length === 0 ? (
          <p className="text-xs text-slate-500 leading-relaxed">
            Generated clips and converted voice bites appear here for quick replay and download.
          </p>
        ) : (
          <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
            {recentClips.slice(0, 8).map((clip) => (
              <div
                key={clip.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#121824] px-3 py-2"
              >
                <button
                  type="button"
                  onClick={() => onPlayClip(clip)}
                  className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded"
                >
                  <p className="text-xs font-medium text-slate-200 truncate">{clip.label}</p>
                  <p className="text-[11px] text-slate-400 tabular-nums">
                    .{clip.format} · {formatBytes(clip.sizeBytes)}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    downloadBase64Audio(
                      clip.base64Audio,
                      clip.mimeType,
                      `${clip.label}.${clip.format}`
                    )
                  }
                  aria-label={`Download ${clip.label}.${clip.format}`}
                  className="rounded-md px-2 py-1 text-xs text-amber-400 hover:bg-amber-500/15 transition-colors whitespace-nowrap shrink-0"
                >
                  Save
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </aside>
  );
}
