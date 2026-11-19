import type { Metadata } from 'next';
import { Manrope, DM_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-manrope',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-dm-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'VoxForge Studio — Creator Voice, Discord Audio & Live DSP',
  description:
    'Creator voice studio for custom voice profiles, fast Discord-ready TTS & batch audio exports, real-time streaming DSP conversion, and REST API integration.',
  openGraph: {
    title: 'VoxForge Studio — Creator Voice, Discord Audio & Live DSP',
    description:
      'Creator voice studio for custom voice profiles, fast Discord-ready TTS & batch audio exports, real-time streaming DSP conversion, and REST API integration.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VoxForge Studio — Creator Voice, Discord Audio & Live DSP',
    description:
      'Creator voice studio for custom voice profiles, fast Discord-ready TTS & batch audio exports, real-time streaming DSP conversion, and REST API integration.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`dark ${manrope.variable} ${dmSans.variable} ${jetbrainsMono.variable}`}
    >
      <body
        className="min-h-screen bg-[#0B0E14] text-[#E5E7EB] antialiased selection:bg-amber-500/30 selection:text-amber-100"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
