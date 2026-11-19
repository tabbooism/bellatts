'use client';

import { useState, useSyncExternalStore } from 'react';
import JSZip from 'jszip';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import ApiDocsPanel from '@/components/ApiDocsPanel';
import BatchStudioPanel from '@/components/BatchStudioPanel';
import LiveDspPanel from '@/components/LiveDspPanel';
import MyVoicePanel from '@/components/MyVoicePanel';
import QuickTtsPanel from '@/components/QuickTtsPanel';
import TopBar from '@/components/TopBar';
import VoiceSidebar from '@/components/VoiceSidebar';
import { DEFAULT_DSP_SETTINGS, DEFAULT_USER_VOICE_PROFILE } from '@/lib/audio-utils';
import { base64ToBlob, downloadBlob } from '@/lib/client-audio';
import type { AudioFormat, GeneratedClip, StudioTab, VoiceProfile } from '@/lib/types';

const STORAGE_KEY_PROFILES = 'voxforge.profiles.v1';
const PROFILES_EVENT = 'voxforge:profiles-updated';

const INITIAL_PROFILES: VoiceProfile[] = [
  DEFAULT_USER_VOICE_PROFILE,
  {
    id: 'preset-charon-broadcast',
    name: 'Late Night Radio',
    description: 'Deep, calm broadcast voice ideal for intros and announcements.',
    isUserSample: false,
    baseVoice: 'Charon',
    stylePrompt: 'Deep, measured late-night radio host with calm authority and warm cadence.',
    dsp: { ...DEFAULT_DSP_SETTINGS, pitchSemitones: -1.5, lowGainDb: 4 },
    createdAt: '2026-11-18T18:20:00.000Z',
  },
  {
    id: 'preset-puck-hype',
    name: 'Streamer Hype',
    description: 'Upbeat, crisp gaming callout voice for Discord soundboards.',
    isUserSample: false,
    baseVoice: 'Puck',
    stylePrompt: 'High-energy gaming streamer, fast snappy pacing, enthusiastic reactions.',
    dsp: { ...DEFAULT_DSP_SETTINGS, pitchSemitones: 0.5, highGainDb: 3.5 },
    createdAt: '2026-11-18T18:20:00.000Z',
  },
];

let cachedRawProfiles: string | null = null;
let cachedParsedProfiles: VoiceProfile[] = INITIAL_PROFILES;

function subscribeProfiles(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener(PROFILES_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(PROFILES_EVENT, callback);
  };
}

function getProfilesSnapshot(): VoiceProfile[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_PROFILES);
    if (!raw) return INITIAL_PROFILES;
    if (raw === cachedRawProfiles) return cachedParsedProfiles;
    const parsed = JSON.parse(raw) as VoiceProfile[];
    if (Array.isArray(parsed) && parsed.length > 0) {
      cachedRawProfiles = raw;
      cachedParsedProfiles = parsed;
      return cachedParsedProfiles;
    }
  } catch {
    // Ignore malformed storage
  }
  return INITIAL_PROFILES;
}

function getProfilesServerSnapshot(): VoiceProfile[] {
  return INITIAL_PROFILES;
}

export default function StudioWorkspace() {
  const prefersReducedMotion = useReducedMotion();
  const profiles = useSyncExternalStore(
    subscribeProfiles,
    getProfilesSnapshot,
    getProfilesServerSnapshot
  );

  const [activeTab, setActiveTab] = useState<StudioTab>('my-voice');
  const [activeProfileId, setActiveProfileId] = useState<string>(DEFAULT_USER_VOICE_PROFILE.id);
  const [outputFormat, setOutputFormat] = useState<AudioFormat>('ogg');
  const [recentClips, setRecentClips] = useState<GeneratedClip[]>([]);
  const [previewAudioClip, setPreviewAudioClip] = useState<GeneratedClip | null>(null);

  const persistProfiles = (next: VoiceProfile[]) => {
    try {
      const serialized = JSON.stringify(next);
      cachedRawProfiles = serialized;
      cachedParsedProfiles = next;
      window.localStorage.setItem(STORAGE_KEY_PROFILES, serialized);
      window.dispatchEvent(new Event(PROFILES_EVENT));
    } catch {
      // Ignore storage quota issues
    }
  };

  const activeProfile =
    profiles.find((p) => p.id === activeProfileId) || profiles[0] || DEFAULT_USER_VOICE_PROFILE;

  const handleUpdateProfile = (updated: VoiceProfile) => {
    persistProfiles(profiles.map((p) => (p.id === updated.id ? updated : p)));
  };

  const handleCreateProfile = (created: VoiceProfile) => {
    persistProfiles([created, ...profiles]);
    setActiveProfileId(created.id);
  };

  const handleDeleteProfile = (id: string) => {
    const next = profiles.filter((p) => p.id !== id);
    if (next.length === 0) return;
    persistProfiles(next);
    if (activeProfileId === id) {
      setActiveProfileId(next[0].id);
    }
  };

  const handleAddClip = (clip: GeneratedClip) => {
    setRecentClips((prev) => [clip, ...prev].slice(0, 30));
  };

  const handleAddClips = (clips: GeneratedClip[]) => {
    setRecentClips((prev) => [...clips, ...prev].slice(0, 30));
  };

  const handleExportPack = async () => {
    if (recentClips.length === 0) {
      setActiveTab('batch');
      return;
    }
    const zip = new JSZip();
    for (const clip of recentClips) {
      zip.file(
        `${clip.label}.${clip.format}`,
        base64ToBlob(clip.base64Audio, clip.mimeType)
      );
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(blob, 'VoxForge-Studio-Pack.zip');
  };

  return (
    <div id="top" className="min-h-screen flex flex-col bg-[#0B0E14] text-[#E5E7EB]">
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        clipCount={recentClips.length}
        onExportPack={handleExportPack}
      />

      <div className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col lg:flex-row">
        <div className="order-2 lg:order-1">
          <VoiceSidebar
            profiles={profiles}
            activeProfileId={activeProfile.id}
            onSelectProfile={setActiveProfileId}
            onDeleteProfile={handleDeleteProfile}
            outputFormat={outputFormat}
            onChangeFormat={setOutputFormat}
            recentClips={recentClips}
            onPlayClip={setPreviewAudioClip}
          />
        </div>

        <main className="order-1 lg:order-2 flex-1 min-w-0 p-4 sm:p-8">
          {previewAudioClip && (
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-500/30 bg-[#121722] px-4 py-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white truncate">
                  Playing: {previewAudioClip.label}.{previewAudioClip.format}
                </p>
                <p className="text-[11px] text-slate-400 truncate">
                  {previewAudioClip.text}
                </p>
              </div>
              <audio
                key={previewAudioClip.id}
                controls
                autoPlay
                src={`data:${previewAudioClip.mimeType};base64,${previewAudioClip.base64Audio}`}
                className="h-9 max-w-sm flex-1"
              />
              <button
                type="button"
                onClick={() => setPreviewAudioClip(null)}
                className="text-xs text-slate-400 hover:text-white px-2 py-1"
              >
                Close
              </button>
            </div>
          )}

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0, y: -4 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            >
              {activeTab === 'my-voice' && (
                <MyVoicePanel
                  key={activeProfile.id}
                  activeProfile={activeProfile}
                  outputFormat={outputFormat}
                  onUpdateProfile={handleUpdateProfile}
                  onCreateProfile={handleCreateProfile}
                  onAddClip={handleAddClip}
                  onSwitchToQuickTts={() => setActiveTab('quick-tts')}
                />
              )}

              {activeTab === 'quick-tts' && (
                <QuickTtsPanel
                  key={activeProfile.id}
                  activeProfile={activeProfile}
                  outputFormat={outputFormat}
                  onAddClip={handleAddClip}
                />
              )}

              {activeTab === 'batch' && (
                <BatchStudioPanel
                  activeProfile={activeProfile}
                  outputFormat={outputFormat}
                  onAddClips={handleAddClips}
                />
              )}

              {activeTab === 'live-dsp' && (
                <LiveDspPanel
                  activeProfile={activeProfile}
                  outputFormat={outputFormat}
                  onAddClip={handleAddClip}
                />
              )}

              {activeTab === 'api-docs' && (
                <ApiDocsPanel
                  activeProfile={activeProfile}
                  outputFormat={outputFormat}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
