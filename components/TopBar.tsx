'use client';

import { Download } from 'lucide-react';
import type { StudioTab } from '@/lib/types';

interface TopBarProps {
  activeTab: StudioTab;
  onSelectTab: (tab: StudioTab) => void;
  clipCount: number;
  onExportPack: () => void;
}

const NAV_ITEMS: Array<{ id: StudioTab; label: string }> = [
  { id: 'my-voice', label: 'My Voice' },
  { id: 'quick-tts', label: 'Quick TTS' },
  { id: 'batch', label: 'Batch Studio' },
  { id: 'live-dsp', label: 'Live DSP' },
  { id: 'api-docs', label: 'API Docs' },
];

export default function TopBar({
  activeTab,
  onSelectTab,
  clipCount,
  onExportPack,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0B0E14]/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 sm:gap-8 px-4 py-2.5 sm:py-3.5 sm:px-6">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            onSelectTab('my-voice');
          }}
          className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          VoxForge
        </a>

        <nav
          aria-label="Studio workspace navigation"
          className="hidden md:flex items-center gap-6 text-sm font-medium"
        >
          {NAV_ITEMS.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`relative py-1.5 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-sm ${
                  active
                    ? 'text-amber-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {item.label}
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-[15px] h-0.5 bg-amber-400"
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onExportPack}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3.5 sm:px-4 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 whitespace-nowrap shrink-0 min-h-[38px] sm:min-h-[40px]"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{clipCount > 0 ? `Export Pack (${clipCount})` : 'Batch Export'}</span>
          </button>
        </div>
      </div>

      <nav
        aria-label="Mobile workspace navigation"
        className="flex md:hidden items-center justify-between gap-1 border-t border-white/10 px-2 py-1.5"
      >
        {NAV_ITEMS.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`rounded-md px-2 py-1.5 text-[11px] font-medium whitespace-nowrap shrink-0 min-h-[34px] transition-colors ${
                active
                  ? 'bg-amber-500/15 text-amber-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
