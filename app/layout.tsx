import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, JetBrains_Mono, Outfit } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/hooks/use-auth';
import { SiteConfigProvider } from '@/hooks/use-site-config';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
});

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-display',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'TypeQuest: Typing Game Adventure',
  description:
    'An addictive typing learning platform with gamified modes like Zombie Attack and Space Shooter. Improve your WPM and accuracy while unlocking achievements and competing on leaderboards.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${plusJakarta.variable} ${jetbrainsMono.variable} ${outfit.variable} dark`}
    >
      <body
        suppressHydrationWarning
        className="bg-slate-950 text-slate-50 font-sans antialiased"
      >
        <AuthProvider>
          <SiteConfigProvider>{children}</SiteConfigProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
