'use client';

import { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Loader2,
  Mic,
  Scissors,
  Sparkles,
  Square,
  Upload,
} from 'lucide-react';
import {
  GEMINI_VOICES,
  checkDiscordCompatibility,
  formatBytes,
  sanitizeSlug,
} from '@/lib/audio-utils';
import { downloadBase64Audio } from '@/lib/client-audio';
import type {
  AudioFormat,
  GeminiVoiceName,
  GeneratedClip,
  VoiceProfile,
} from '@/lib/types';

interface MyVoicePanelProps {
  activeProfile: VoiceProfile;
  outputFormat: AudioFormat;
  onUpdateProfile: (updated: VoiceProfile) => void;
  onCreateProfile: (created: VoiceProfile) => void;
  onAddClip: (clip: GeneratedClip) => void;
  onSwitchToQuickTts: () => void;
}

export default function MyVoicePanel({
  activeProfile,
  outputFormat,
  onUpdateProfile,
  onCreateProfile,
  onAddClip,
  onSwitchToQuickTts,
}: MyVoicePanelProps) {
  const [sourceAudioUrl, setSourceAudioUrl] = useState<string>(
    activeProfile.sampleUrl || '/assets/aistudio/bytheway_12835942.mp3'
  );
  const [sourceFilename, setSourceFilename] = useState<string>(
    activeProfile.sampleFilename || 'bytheway_12835942.mp3'
  );
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [recordError, setRecordError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [durationSec, setDurationSec] = useState<number>(0);

  // Trim & FX controls for direct "My Voice" export
  const [clipName, setClipName] = useState('my-voice-discord-clip');
  const [trimStart, setTrimStart] = useState<number>(0);
  const [trimEnd, setTrimEnd] = useState<number>(0);
  const [pitchSemitones, setPitchSemitones] = useState<number>(
    activeProfile.dsp.pitchSemitones
  );
  const [speed, setSpeed] = useState<number>(1);
  const [normalize, setNormalize] = useState<boolean>(true);

  const [isConverting, setIsConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [exportedClip, setExportedClip] = useState<GeneratedClip | null>(null);

  // Gemini Voice Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState(activeProfile.transcript || '');
  const [vocalSummary, setVocalSummary] = useState(activeProfile.description || '');
  const [stylePrompt, setStylePrompt] = useState(activeProfile.stylePrompt);
  const [baseVoice, setBaseVoice] = useState<GeminiVoiceName>(activeProfile.baseVoice);
  const [profileNameInput, setProfileNameInput] = useState(activeProfile.name);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  const handleFileUpload = (file: File | undefined) => {
    if (!file) return;
    setUploadedFile(file);
    setSourceFilename(file.name);
    const url = URL.createObjectURL(file);
    setSourceAudioUrl(url);
    setTrimStart(0);
    setTrimEnd(0);
    setConvertError(null);
    setAnalyzeError(null);
  };

  const startRecording = async () => {
    setRecordError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const ext = blob.type.includes('ogg') ? 'ogg' : 'webm';
        const file = new File([blob], `mic-recording-${Date.now()}.${ext}`, {
          type: blob.type,
        });
        handleFileUpload(file);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setRecordSeconds(0);
      timerRef.current = window.setInterval(() => {
        setRecordSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      setRecordError(
        err instanceof Error
          ? err.message
          : 'Microphone access was blocked or unavailable in this browser.'
      );
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleAnalyzeVoice = async () => {
    setIsAnalyzing(true);
    setAnalyzeError(null);
    setSavedNotice(null);

    try {
      let res: Response;
      if (uploadedFile) {
        const form = new FormData();
        form.append('audio', uploadedFile);
        res = await fetch('/api/voices/analyze', { method: 'POST', body: form });
      } else {
        res = await fetch('/api/voices/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            samplePath: '/assets/aistudio/bytheway_12835942.mp3',
          }),
        });
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Voice analysis failed.');
      }

      setTranscript(data.transcript || '');
      setVocalSummary(data.vocalSummary || '');
      setStylePrompt(data.stylePrompt || '');
      setBaseVoice(data.recommendedBaseVoice || 'Zephyr');
      setPitchSemitones(data.suggestedPitchSemitones ?? 0);

      onUpdateProfile({
        ...activeProfile,
        transcript: data.transcript || activeProfile.transcript,
        description: data.vocalSummary || activeProfile.description,
        baseVoice: data.recommendedBaseVoice || activeProfile.baseVoice,
        stylePrompt: data.stylePrompt || activeProfile.stylePrompt,
        dsp: {
          ...activeProfile.dsp,
          pitchSemitones: data.suggestedPitchSemitones ?? activeProfile.dsp.pitchSemitones,
        },
      });
      setSavedNotice('Voice analysis synced to active profile.');
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : 'Unable to analyze audio.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleConvertAndExport = async () => {
    setIsConverting(true);
    setConvertError(null);

    try {
      let res: Response;
      const safeName = sanitizeSlug(clipName, 'my-voice-clip');
      if (uploadedFile) {
        const form = new FormData();
        form.append('audio', uploadedFile);
        form.append('format', outputFormat);
        form.append('filename', safeName);
        if (trimStart > 0) form.append('startSec', String(trimStart));
        if (trimEnd > trimStart) form.append('endSec', String(trimEnd));
        form.append('pitchSemitones', String(pitchSemitones));
        form.append('speed', String(speed));
        form.append('normalize', String(normalize));
        res = await fetch('/api/audio/convert', { method: 'POST', body: form });
      } else {
        res = await fetch('/api/audio/convert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            samplePath: '/assets/aistudio/bytheway_12835942.mp3',
            format: outputFormat,
            filename: safeName,
            startSec: trimStart > 0 ? trimStart : undefined,
            endSec: trimEnd > trimStart ? trimEnd : undefined,
            pitchSemitones,
            speed,
            normalize,
          }),
        });
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Conversion failed.');
      }

      const clip: GeneratedClip = {
        id: `voice-${Date.now()}`,
        label: safeName,
        text: transcript ? transcript.slice(0, 90) : `Processed ${sourceFilename}`,
        voiceId: activeProfile.id,
        voiceName: 'My Recorded Voice',
        format: outputFormat,
        mimeType: data.mimeType,
        base64Audio: data.base64Audio,
        sizeBytes: data.sizeBytes,
        durationSec: trimEnd > trimStart ? trimEnd - trimStart : durationSec || undefined,
        createdAt: new Date().toISOString(),
      };

      setExportedClip(clip);
      onAddClip(clip);
    } catch (err) {
      setConvertError(err instanceof Error ? err.message : 'Failed to convert audio.');
    } finally {
      setIsConverting(false);
    }
  };

  const handleSaveAsNewProfile = () => {
    const trimmedName = profileNameInput.trim() || 'My Custom Voice';
    const updated: VoiceProfile = {
      ...activeProfile,
      name: trimmedName,
      description: vocalSummary,
      baseVoice,
      stylePrompt,
      transcript,
      dsp: {
        ...activeProfile.dsp,
        pitchSemitones,
      },
    };
    onUpdateProfile(updated);
    setSavedNotice(`Saved changes to "${trimmedName}".`);
  };

  const handleDuplicateProfile = () => {
    const newProfile: VoiceProfile = {
      id: `profile-${Date.now()}`,
      name: `${profileNameInput.trim() || 'My Voice'} Variant`,
      description: vocalSummary || 'Custom voice design variant',
      isUserSample: true,
      sampleUrl: sourceAudioUrl,
      sampleFilename: sourceFilename,
      transcript,
      baseVoice,
      stylePrompt,
      dsp: {
        ...activeProfile.dsp,
        pitchSemitones,
      },
      createdAt: new Date().toISOString(),
    };
    onCreateProfile(newProfile);
    setSavedNotice(`Created new profile "${newProfile.name}".`);
  };

  const discordReport = exportedClip
    ? checkDiscordCompatibility(exportedClip.sizeBytes, exportedClip.format, exportedClip.durationSec)
    : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between border-b border-white/10 pb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white">
            My Voice Studio
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-slate-400 leading-relaxed">
            Use your own voice recording directly for Discord-ready clips and soundboard exports, or extract a style-matched TTS profile for rapid text-to-speech synthesis.
          </p>
        </div>

        <button
          type="button"
          onClick={onSwitchToQuickTts}
          className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-[#121722] px-4 py-2 text-xs font-medium text-slate-200 hover:border-amber-400/50 hover:text-white transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
        >
          <span>Open Quick TTS</span>
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        {/* Left column: Source Recording, Playback, Direct Discord Clip Exporter */}
        <section className="xl:col-span-7 space-y-5">
          <div className="rounded-xl border border-white/10 bg-[#121722] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-base font-semibold text-white">
                  1. Active Voice Recording
                </h2>
                <p className="mt-0.5 text-xs text-slate-400 font-mono">
                  {sourceFilename}
                  {durationSec > 0 ? ` · ${durationSec.toFixed(1)}s` : ''}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {!isRecording ? (
                  <button
                    type="button"
                    onClick={startRecording}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-[#1A2130] px-3.5 py-2 text-xs font-medium text-slate-100 hover:border-amber-400/60 transition-colors whitespace-nowrap min-h-[40px]"
                  >
                    <Mic className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
                    <span>Record Mic</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-rose-500 transition-colors whitespace-nowrap min-h-[40px]"
                  >
                    <Square className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="tabular-nums">Stop ({recordSeconds}s)</span>
                  </button>
                )}

                <label className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-[#1A2130] px-3.5 py-2 text-xs font-medium text-slate-100 hover:border-amber-400/60 transition-colors cursor-pointer whitespace-nowrap min-h-[40px]">
                  <Upload className="h-3.5 w-3.5 text-slate-300" aria-hidden="true" />
                  <span>Upload Audio</span>
                  <input
                    type="file"
                    accept="audio/*"
                    className="sr-only"
                    onChange={(e) => handleFileUpload(e.target.files?.[0])}
                  />
                </label>
              </div>
            </div>

            {recordError && (
              <p role="alert" className="text-xs text-rose-400 bg-rose-950/40 border border-rose-500/30 rounded-lg px-3 py-2">
                {recordError}
              </p>
            )}

            <div className="rounded-lg border border-white/10 bg-[#0B0E14] p-2.5">
              <audio
                ref={audioRef}
                src={sourceAudioUrl}
                controls
                onLoadedMetadata={(e) => {
                  const dur = e.currentTarget.duration;
                  if (Number.isFinite(dur)) {
                    setDurationSec(dur);
                    setTrimEnd((prev) => (prev === 0 ? Math.min(5, Number(dur.toFixed(1))) : prev));
                  }
                }}
                className="w-full h-9 accent-amber-500"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <p className="text-xs text-slate-400">
                Loaded directly from your studio recording. Analyze it to auto-configure your Voice Design profile.
              </p>
              <button
                type="button"
                onClick={handleAnalyzeVoice}
                disabled={isAnalyzing}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60 transition-colors whitespace-nowrap min-h-[40px]"
              >
                {isAnalyzing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>{isAnalyzing ? 'Analyzing Voice...' : 'Analyze Voice Sample'}</span>
              </button>
            </div>

            {analyzeError && (
              <p role="alert" className="text-xs text-rose-400 bg-rose-950/40 border border-rose-500/30 rounded-lg px-3 py-2">
                {analyzeError}
              </p>
            )}
          </div>

          {/* Direct Voice Clipper & Discord Exporter */}
          <div className="rounded-xl border border-white/10 bg-[#121722] p-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-base font-semibold text-white flex items-center gap-2">
                  <Scissors className="h-4 w-4 text-amber-400" aria-hidden="true" />
                  <span>2. Direct Voice Clip & Discord Exporter</span>
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  Trim, pitch-adjust, normalize, and export your genuine voice as .{outputFormat} for Discord soundboards or community packs.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="voice-clip-filename"
                  className="block text-xs font-medium text-slate-300 mb-1.5"
                >
                  Output Filename
                </label>
                <input
                  id="voice-clip-filename"
                  type="text"
                  value={clipName}
                  onChange={(e) => setClipName(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-[#0B0E14] px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="voice-trim-start"
                  className="block text-xs font-medium text-slate-300 mb-1.5"
                >
                  Trim Start (sec)
                </label>
                <input
                  id="voice-trim-start"
                  type="number"
                  min={0}
                  step={0.1}
                  value={trimStart}
                  onChange={(e) => setTrimStart(Math.max(0, Number(e.target.value)))}
                  className="w-full rounded-lg border border-white/15 bg-[#0B0E14] px-3 py-2 text-sm font-mono tabular-nums text-white focus:border-amber-400 focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="voice-trim-end"
                  className="block text-xs font-medium text-slate-300 mb-1.5"
                >
                  Trim End (sec, 0 = full)
                </label>
                <input
                  id="voice-trim-end"
                  type="number"
                  min={0}
                  step={0.1}
                  value={trimEnd}
                  onChange={(e) => setTrimEnd(Math.max(0, Number(e.target.value)))}
                  className="w-full rounded-lg border border-white/15 bg-[#0B0E14] px-3 py-2 text-sm font-mono tabular-nums text-white focus:border-amber-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-1">
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <label htmlFor="myvoice-pitch" className="font-medium text-slate-300">
                    Pitch Shift
                  </label>
                  <span className="font-mono tabular-nums text-amber-400">
                    {pitchSemitones >= 0 ? `+${pitchSemitones}` : pitchSemitones} st
                  </span>
                </div>
                <input
                  id="myvoice-pitch"
                  type="range"
                  min={-12}
                  max={12}
                  step={0.5}
                  value={pitchSemitones}
                  onChange={(e) => setPitchSemitones(Number(e.target.value))}
                  className="w-full studio-slider"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <label htmlFor="myvoice-speed" className="font-medium text-slate-300">
                    Playback Tempo
                  </label>
                  <span className="font-mono tabular-nums text-amber-400">
                    {speed.toFixed(2)}x
                  </span>
                </div>
                <input
                  id="myvoice-speed"
                  type="range"
                  min={0.7}
                  max={1.5}
                  step={0.05}
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  className="w-full studio-slider"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-white/10">
              <label className="inline-flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={normalize}
                  onChange={(e) => setNormalize(e.target.checked)}
                  className="h-4 w-4 rounded border-white/20 bg-[#0B0E14] accent-amber-500"
                />
                <span>Broadcast Loudness Normalize (-16 LUFS)</span>
              </label>

              <button
                type="button"
                onClick={handleConvertAndExport}
                disabled={isConverting}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60 transition-colors whitespace-nowrap min-h-[40px]"
              >
                {isConverting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>
                  {isConverting
                    ? 'Processing...'
                    : `Process & Export .${outputFormat.toUpperCase()}`}
                </span>
              </button>
            </div>

            {convertError && (
              <p role="alert" className="text-xs text-rose-400 bg-rose-950/40 border border-rose-500/30 rounded-lg px-3 py-2">
                {convertError}
              </p>
            )}

            {exportedClip && discordReport && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
                    <span className="text-sm font-semibold text-white">
                      {exportedClip.label}.{exportedClip.format}
                    </span>
                    <span className="text-xs text-slate-400 font-mono tabular-nums">
                      {formatBytes(exportedClip.sizeBytes)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      downloadBase64Audio(
                        exportedClip.base64Audio,
                        exportedClip.mimeType,
                        `${exportedClip.label}.${exportedClip.format}`
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 transition-colors whitespace-nowrap"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Download File</span>
                  </button>
                </div>

                <audio
                  controls
                  src={`data:${exportedClip.mimeType};base64,${exportedClip.base64Audio}`}
                  className="w-full h-9"
                />

                <p className="text-xs text-slate-300">
                  {discordReport.recommendedFormatLabel} · {discordReport.notes}
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Right column: Voice Design Profile Editor & Transcript */}
        <section className="xl:col-span-5 space-y-6">
          <div className="rounded-xl border border-white/10 bg-[#121722] p-6 space-y-5">
            <div>
              <h2 className="font-display text-base font-semibold text-white">
                3. Voice Design Profile (TTS Match)
              </h2>
              <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                Gemini TTS synthesizes new phrases using curated base voices shaped by Voice Design style prompts rather than cloning private vocal biometrics. Use this profile to generate unlimited custom TTS lines matching your cadence and tone.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="profile-name-input"
                  className="block text-xs font-medium text-slate-300 mb-1.5"
                >
                  Profile Name
                </label>
                <input
                  id="profile-name-input"
                  type="text"
                  value={profileNameInput}
                  onChange={(e) => setProfileNameInput(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-[#0B0E14] px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="base-voice-select"
                  className="block text-xs font-medium text-slate-300 mb-1.5"
                >
                  Matched Base Timbre
                </label>
                <select
                  id="base-voice-select"
                  value={baseVoice}
                  onChange={(e) => setBaseVoice(e.target.value as GeminiVoiceName)}
                  className="w-full rounded-lg border border-white/15 bg-[#0B0E14] px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
                >
                  {GEMINI_VOICES.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name} — {v.character} ({v.register})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="style-prompt-textarea"
                  className="block text-xs font-medium text-slate-300 mb-1.5"
                >
                  Delivery & Cadence Direction
                </label>
                <textarea
                  id="style-prompt-textarea"
                  rows={3}
                  value={stylePrompt}
                  onChange={(e) => setStylePrompt(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-[#0B0E14] px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none leading-relaxed"
                />
              </div>

              <div>
                <label
                  htmlFor="transcript-preview"
                  className="block text-xs font-medium text-slate-300 mb-1.5"
                >
                  Sample Transcript
                </label>
                <textarea
                  id="transcript-preview"
                  rows={3}
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  placeholder="Click 'Analyze Voice Sample' above to transcribe your recording and calibrate this profile."
                  className="w-full rounded-lg border border-white/15 bg-[#0B0E14] px-3 py-2 text-xs text-slate-300 focus:border-amber-400 focus:outline-none leading-relaxed"
                />
              </div>
            </div>

            {savedNotice && (
              <p className="text-xs text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{savedNotice}</span>
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={handleSaveAsNewProfile}
                className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 transition-colors whitespace-nowrap min-h-[40px]"
              >
                Save Profile
              </button>
              <button
                type="button"
                onClick={handleDuplicateProfile}
                className="rounded-lg border border-white/15 bg-[#1A2130] px-4 py-2 text-xs font-medium text-slate-200 hover:border-white/30 transition-colors whitespace-nowrap min-h-[40px]"
              >
                Save as New Variant
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
