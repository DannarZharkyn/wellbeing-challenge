import type { Metadata } from 'next';
import './globals.css';
import './admin-parity.css';
import './ux-cleanup.css';

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  ),
  title: 'Wellbeing Challenge',
  description: 'Small steps toward better wellbeing, together.',
  openGraph: {
    title: 'Wellbeing Challenge',
    description: 'Small steps. Stronger together.',
    images: ['/og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Wellbeing Challenge',
    description: 'Small steps. Stronger together.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preload" as="image" href="/terrier-mascot-v2.png" fetchPriority="high" />
      </head>
      <body>{children}</body>
    </html>
  );
}
