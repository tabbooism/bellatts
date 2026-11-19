'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  Download,
  Headphones,
  Loader2,
  Mic,
  Play,
  Radio,
  Square,
} from 'lucide-react';
import { DSP_PRESETS, formatBytes } from '@/lib/audio-utils';
import {
  createLiveDspChain,
  downloadBase64Audio,
  type LiveDspChain,
} from '@/lib/client-audio';
import type { AudioFormat, DspSettings, GeneratedClip, VoiceProfile } from '@/lib/types';

interface LiveDspPanelProps {
  activeProfile: VoiceProfile;
  outputFormat: AudioFormat;
  onAddClip: (clip: GeneratedClip) => void;
}

export default function LiveDspPanel({
  activeProfile,
  outputFormat,
  onAddClip,
}: LiveDspPanelProps) {
  const [sourceMode, setSourceMode] = useState<'mic' | 'sample'>('sample');
  const [settings, setSettings] = useState<DspSettings>(activeProfile.dsp);
  const [activePresetId, setActivePresetId] = useState<string>('custom');
  const [isRunning, setIsRunning] = useState(false);
  const [monitorEnabled, setMonitorEnabled] = useState(true);
  const [peakDb, setPeakDb] = useState<number>(-60);
  const [error, setError] = useState<string | null>(null);

  const [isRecordingOutput, setIsRecordingOutput] = useState(false);
  const [isConvertingCapture, setIsConvertingCapture] = useState(false);
  const [capturedClip, setCapturedClip] = useState<GeneratedClip | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const chainRef = useRef<LiveDspChain | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const sampleAudioRef = useRef<HTMLAudioElement | null>(null);
  const sampleSourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);
  const rafRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const cleanupAudioNodes = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    if (rafRef.current) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (sampleAudioRef.current) {
      sampleAudioRef.current.pause();
      sampleAudioRef.current = null;
    }
    if (sampleSourceNodeRef.current) {
      sampleSourceNodeRef.current.disconnect();
      sampleSourceNodeRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (chainRef.current) {
      chainRef.current.destroy();
      chainRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  };

  useEffect(() => {
    chainRef.current?.updateSettings(settings);
  }, [settings]);

  useEffect(() => {
    chainRef.current?.setMonitorEnabled(monitorEnabled);
  }, [monitorEnabled]);

  useEffect(() => {
    return () => {
      cleanupAudioNodes();
    };
  }, []);

  const drawVisualizer = () => {
    const canvas = canvasRef.current;
    const chain = chainRef.current;
    if (!canvas || !chain) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = chain.analyser.fftSize;
    const dataArray = new Float32Array(bufferLength);

    const renderFrame = () => {
      if (!chainRef.current) return;
      chain.analyser.getFloatTimeDomainData(dataArray);

      let maxAmp = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const abs = Math.abs(dataArray[i]);
        if (abs > maxAmp) maxAmp = abs;
      }
      const db = maxAmp > 0.0001 ? 20 * Math.log10(maxAmp) : -60;
      setPeakDb(Math.max(-60, Math.min(0, Math.round(db))));

      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = '#0B0E14';
      ctx.fillRect(0, 0, w, h);

      // Center reference line
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      // Waveform path
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const sliceWidth = w / bufferLength;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] * 1.6;
        const y = (h / 2) + v * (h / 2);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }
      ctx.stroke();

      rafRef.current = window.requestAnimationFrame(renderFrame);
    };

    rafRef.current = window.requestAnimationFrame(renderFrame);
  };

  const startEngine = async () => {
    setError(null);
    stopEngine();

    try {
      const ctx = new AudioContext();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      audioCtxRef.current = ctx;

      const shouldMonitor = sourceMode === 'sample' ? true : monitorEnabled;
      setMonitorEnabled(shouldMonitor);
      const chain = await createLiveDspChain(ctx, settings, shouldMonitor);
      chainRef.current = chain;

      if (sourceMode === 'mic') {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: false,
          },
        });
        micStreamRef.current = stream;
        const micSource = ctx.createMediaStreamSource(stream);
        micSource.connect(chain.inputNode);
      } else {
        const sampleEl = new Audio(
          activeProfile.sampleUrl || '/assets/aistudio/bytheway_12835942.mp3'
        );
        sampleEl.loop = true;
        sampleEl.crossOrigin = 'anonymous';
        sampleAudioRef.current = sampleEl;

        const mediaNode = ctx.createMediaElementSource(sampleEl);
        sampleSourceNodeRef.current = mediaNode;
        mediaNode.connect(chain.inputNode);
        await sampleEl.play();
      }

      setIsRunning(true);
      drawVisualizer();
    } catch (err) {
      stopEngine();
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to start Web Audio live DSP engine.'
      );
    }
  };

  const stopEngine = () => {
    setIsRecordingOutput(false);
    cleanupAudioNodes();
    setIsRunning(false);
    setPeakDb(-60);
  };

  const startRecordingOutput = () => {
    if (!chainRef.current) return;
    const stream = chainRef.current.mediaDest.stream;
    const recorder = new MediaRecorder(stream);
    recordedChunksRef.current = [];

    recorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) recordedChunksRef.current.push(ev.data);
    };

    recorder.onstop = async () => {
      const blob = new Blob(recordedChunksRef.current, {
        type: recorder.mimeType || 'audio/webm',
      });
      await convertRecordedStream(blob);
    };

    recorderRef.current = recorder;
    recorder.start();
    setIsRecordingOutput(true);
  };

  const stopRecordingOutput = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    setIsRecordingOutput(false);
  };

  const convertRecordedStream = async (blob: Blob) => {
    setIsConvertingCapture(true);
    setError(null);
    try {
      const file = new File([blob], `live-dsp-capture.webm`, {
        type: blob.type || 'audio/webm',
      });
      const form = new FormData();
      form.append('audio', file);
      form.append('format', outputFormat);
      form.append('filename', `live-stream-${activePresetId}`);
      form.append('normalize', 'true');

      const res = await fetch('/api/audio/convert', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to encode live capture.');
      }

      const clip: GeneratedClip = {
        id: `live-${Date.now()}`,
        label: `live-stream-${activePresetId}`,
        text: `Live DSP Capture (${activePresetId})`,
        voiceId: activeProfile.id,
        voiceName: 'Live DSP Voice',
        format: outputFormat,
        mimeType: data.mimeType,
        base64Audio: data.base64Audio,
        sizeBytes: data.sizeBytes,
        createdAt: new Date().toISOString(),
      };
      setCapturedClip(clip);
      onAddClip(clip);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save live capture.');
    } finally {
      setIsConvertingCapture(false);
    }
  };

  const applyPreset = (presetId: string) => {
    const preset = DSP_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setActivePresetId(preset.id);
    setSettings({ ...preset.settings });
  };

  const updateField = (key: keyof DspSettings, value: number) => {
    setActivePresetId('custom');
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between border-b border-white/10 pb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Live Stream Voice Conversion
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-slate-400">
            Real-time Web Audio DSP rack for live streaming sessions. Route your microphone or audition presets directly over your voice sample, monitor levels, and capture Discord-ready clips.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!isRunning ? (
            <button
              type="button"
              onClick={startEngine}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 transition-colors whitespace-nowrap min-h-[40px]"
            >
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Start Live DSP</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={stopEngine}
              className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500 transition-colors whitespace-nowrap min-h-[40px]"
            >
              <Square className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Stop Engine</span>
            </button>
          )}
        </div>
      </div>

      {/* Input & Live Waveform Bar */}
      <div className="rounded-xl border border-white/10 bg-[#121722] p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-400 mr-1">Input Source:</span>
            <div className="flex items-center gap-1 p-1 rounded-lg bg-[#0B0E14] border border-white/10">
              <button
                type="button"
                onClick={() => {
                  if (isRunning) stopEngine();
                  setSourceMode('sample');
                }}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  sourceMode === 'sample'
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Radio className="h-3.5 w-3.5" aria-hidden="true" />
                <span>My Voice Loop</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (isRunning) stopEngine();
                  setSourceMode('mic');
                  setMonitorEnabled(false);
                }}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  sourceMode === 'mic'
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Mic className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Live Microphone</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={monitorEnabled}
                onChange={(e) => setMonitorEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-white/20 bg-[#0B0E14] accent-amber-500"
              />
              <Headphones className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              <span>Headphone Monitor</span>
            </label>

            {isRunning && !isRecordingOutput && (
              <button
                type="button"
                onClick={startRecordingOutput}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/25 transition-colors whitespace-nowrap"
              >
                <span>Capture Stream Clip</span>
              </button>
            )}
            {isRecordingOutput && (
              <button
                type="button"
                onClick={stopRecordingOutput}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 transition-colors whitespace-nowrap"
              >
                <span>Stop Capture</span>
              </button>
            )}
          </div>
        </div>

        <div className="relative rounded-lg border border-white/10 bg-[#0B0E14] p-3">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="inline-flex items-center gap-1.5 text-slate-300">
              <Activity className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
              <span>{isRunning ? 'Live DSP Signal Active' : 'DSP Standby — Click Start Live DSP'}</span>
            </span>
            <span className="font-mono tabular-nums text-slate-300">
              Peak: {peakDb} dBFS
            </span>
          </div>
          <canvas
            ref={canvasRef}
            width={960}
            height={140}
            data-testid="live-dsp-canvas"
            className="w-full h-[120px] rounded bg-[#0B0E14]"
          />
        </div>

        {error && (
          <p role="alert" className="text-xs text-rose-400 bg-rose-950/40 border border-rose-500/30 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {isConvertingCapture && (
          <p className="text-xs text-amber-300 inline-flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            <span>Encoding captured live stream audio to .{outputFormat}...</span>
          </p>
        )}

        {capturedClip && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3">
            <div>
              <p className="text-xs font-semibold text-white">
                Captured: {capturedClip.label}.{capturedClip.format}
              </p>
              <p className="text-[11px] text-slate-400 font-mono tabular-nums">
                {formatBytes(capturedClip.sizeBytes)}
              </p>
            </div>
            <audio
              controls
              src={`data:${capturedClip.mimeType};base64,${capturedClip.base64Audio}`}
              className="h-8 max-w-xs"
            />
            <button
              type="button"
              onClick={() =>
                downloadBase64Audio(
                  capturedClip.base64Audio,
                  capturedClip.mimeType,
                  `${capturedClip.label}.${capturedClip.format}`
                )
              }
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 transition-colors whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Download</span>
            </button>
          </div>
        )}
      </div>

      {/* Presets + Parametric Rack */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <section className="lg:col-span-5 rounded-xl border border-white/10 bg-[#121722] p-6 space-y-4">
          <h2 className="font-display text-base font-semibold text-white">
            Stream Voice Presets
          </h2>
          <div className="space-y-2">
            {DSP_PRESETS.map((preset) => {
              const selected = activePresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset.id)}
                  className={`w-full text-left rounded-lg border px-3.5 py-2.5 transition-colors ${
                    selected
                      ? 'border-amber-500/50 bg-amber-500/10'
                      : 'border-white/10 bg-[#0B0E14] hover:border-white/25'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-white">{preset.name}</span>
                    <span className="font-mono text-xs tabular-nums text-amber-400">
                      {preset.settings.pitchSemitones >= 0
                        ? `+${preset.settings.pitchSemitones}`
                        : preset.settings.pitchSemitones}
                      st
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">{preset.summary}</p>
                </button>
              );
            })}
          </div>
        </section>

        <section className="lg:col-span-7 rounded-xl border border-white/10 bg-[#121722] p-6 space-y-5">
          <h2 className="font-display text-base font-semibold text-white">
            Parametric DSP Rack
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <SliderControl
              id="dsp-pitch"
              label="Pitch Shift"
              valueDisplay={`${settings.pitchSemitones >= 0 ? '+' : ''}${settings.pitchSemitones} st`}
              min={-12}
              max={12}
              step={0.5}
              value={settings.pitchSemitones}
              onChange={(v) => updateField('pitchSemitones', v)}
            />
            <SliderControl
              id="dsp-highpass"
              label="High-Pass Rumble Cut"
              valueDisplay={`${settings.highPassHz} Hz`}
              min={20}
              max={240}
              step={5}
              value={settings.highPassHz}
              onChange={(v) => updateField('highPassHz', v)}
            />
            <SliderControl
              id="dsp-low"
              label="Low Warmth (140 Hz)"
              valueDisplay={`${settings.lowGainDb >= 0 ? '+' : ''}${settings.lowGainDb} dB`}
              min={-12}
              max={12}
              step={0.5}
              value={settings.lowGainDb}
              onChange={(v) => updateField('lowGainDb', v)}
            />
            <SliderControl
              id="dsp-mid"
              label="Mid Presence (2.4 kHz)"
              valueDisplay={`${settings.midGainDb >= 0 ? '+' : ''}${settings.midGainDb} dB`}
              min={-12}
              max={12}
              step={0.5}
              value={settings.midGainDb}
              onChange={(v) => updateField('midGainDb', v)}
            />
            <SliderControl
              id="dsp-high"
              label="Air Clarity (8 kHz)"
              valueDisplay={`${settings.highGainDb >= 0 ? '+' : ''}${settings.highGainDb} dB`}
              min={-12}
              max={12}
              step={0.5}
              value={settings.highGainDb}
              onChange={(v) => updateField('highGainDb', v)}
            />
            <SliderControl
              id="dsp-comp"
              label="Broadcast Compression"
              valueDisplay={`${settings.compression}%`}
              min={0}
              max={100}
              step={5}
              value={settings.compression}
              onChange={(v) => updateField('compression', v)}
            />
            <SliderControl
              id="dsp-gain"
              label="Master Output Gain"
              valueDisplay={`${settings.outputGain.toFixed(2)}x`}
              min={0.5}
              max={2.0}
              step={0.05}
              value={settings.outputGain}
              onChange={(v) => updateField('outputGain', v)}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function SliderControl({
  id,
  label,
  valueDisplay,
  min,
  max,
  step,
  value,
  onChange,
}: {
  id: string;
  label: string;
  valueDisplay: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (val: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-2">
        <label htmlFor={id} className="font-medium text-slate-300">
          {label}
        </label>
        <span className="font-mono tabular-nums text-amber-400">{valueDisplay}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full studio-slider"
      />
    </div>
  );
}
