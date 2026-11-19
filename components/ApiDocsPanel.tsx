'use client';

import { useState } from 'react';
import { Check, Copy, Play, Terminal } from 'lucide-react';
import type { AudioFormat, VoiceProfile } from '@/lib/types';

interface ApiDocsPanelProps {
  activeProfile: VoiceProfile;
  outputFormat: AudioFormat;
}

export default function ApiDocsPanel({
  activeProfile,
  outputFormat,
}: ApiDocsPanelProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://your-studio-url.app';

  const curlSnippet = `curl -X POST "${origin}/api/v1/tts" \\
  -H "Content-Type: application/json" \\
  -d '{
    "text": "Yo community, match starts in 5 minutes!",
    "voice": "${activeProfile.baseVoice}",
    "stylePrompt": "${activeProfile.stylePrompt.replace(/'/g, '')}",
    "format": "${outputFormat}",
    "binary": true
  }' \\
  --output message.${outputFormat}`;

  const discordBotSnippet = `// Example Discord.js v14 slash-command handler using VoxForge Studio API
const res = await fetch("${origin}/api/v1/tts", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    text: interaction.options.getString("message", true),
    voice: "${activeProfile.baseVoice}",
    stylePrompt: "${activeProfile.stylePrompt.replace(/"/g, '\\"')}",
    format: "ogg",
    binary: true
  })
});
const audioBuffer = Buffer.from(await res.arrayBuffer());
await interaction.reply({
  files: [{ attachment: audioBuffer, name: "voice-message.ogg" }]
});`;

  const copyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const runLiveHealthTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/v1/voices');
      const json = await res.json();
      setTestResult(JSON.stringify(json, null, 2));
    } catch (err) {
      setTestResult(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between border-b border-white/10 pb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Creator REST API
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-slate-400">
            Connect Discord bots, stream decks, OBS scripts, or automation workflows directly to your studio endpoints.
          </p>
        </div>

        <button
          type="button"
          onClick={runLiveHealthTest}
          disabled={isTesting}
          className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
        >
          <Play className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{isTesting ? 'Querying...' : 'Test GET /api/v1/voices'}</span>
        </button>
      </div>

      {testResult && (
        <div className="rounded-xl border border-emerald-500/30 bg-[#0E131C] p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
            <Terminal className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Live Response: GET /api/v1/voices (200 OK)</span>
          </div>
          <pre className="overflow-x-auto text-xs font-mono text-slate-300 max-h-60 leading-relaxed">
            {testResult}
          </pre>
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-[#121722] overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10">
          <h2 className="font-display text-base font-semibold text-white">
            Available Endpoints
          </h2>
        </div>
        <div className="divide-y divide-white/5 text-sm">
          {[
            {
              method: 'GET',
              path: '/api/v1/voices',
              desc: 'List base timbres, DSP presets, and supported Discord audio formats.',
            },
            {
              method: 'POST',
              path: '/api/v1/tts',
              desc: 'Synthesize single-line TTS to .mp3, .ogg (Opus), or .wav. Pass binary: true for raw file download.',
            },
            {
              method: 'POST',
              path: '/api/v1/batch',
              desc: 'Synthesize up to 25 lines concurrently and receive encoded audio items.',
            },
            {
              method: 'POST',
              path: '/api/audio/convert',
              desc: 'Convert, trim, pitch-shift, and normalize uploaded voice files via ffmpeg.',
            },
            {
              method: 'POST',
              path: '/api/voices/analyze',
              desc: 'Transcribe a voice recording and extract recommended Voice Design parameters.',
            },
          ].map((ep) => (
            <div
              key={ep.path}
              className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 px-6 py-3.5"
            >
              <div className="flex items-center gap-3 min-w-[240px]">
                <span className="font-mono text-xs font-semibold text-amber-400 w-11">
                  {ep.method}
                </span>
                <code className="font-mono text-xs text-white">{ep.path}</code>
              </div>
              <p className="text-xs text-slate-400">{ep.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="rounded-xl border border-white/10 bg-[#121722] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold text-white">
              cURL Binary Export Example
            </h3>
            <button
              type="button"
              onClick={() => copyText('curl', curlSnippet)}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-[#1A2130] px-2.5 py-1.5 text-xs text-slate-200 hover:border-amber-400/50 transition-colors"
            >
              {copiedId === 'curl' ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>{copiedId === 'curl' ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
          <pre className="overflow-x-auto rounded-lg border border-white/10 bg-[#0B0E14] p-4 text-xs font-mono text-slate-300 leading-relaxed">
            {curlSnippet}
          </pre>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#121722] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold text-white">
              Discord.js Bot Integration
            </h3>
            <button
              type="button"
              onClick={() => copyText('discord', discordBotSnippet)}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-[#1A2130] px-2.5 py-1.5 text-xs text-slate-200 hover:border-amber-400/50 transition-colors"
            >
              {copiedId === 'discord' ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>{copiedId === 'discord' ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
          <pre className="overflow-x-auto rounded-lg border border-white/10 bg-[#0B0E14] p-4 text-xs font-mono text-slate-300 leading-relaxed">
            {discordBotSnippet}
          </pre>
        </div>
      </div>
    </div>
  );
}
