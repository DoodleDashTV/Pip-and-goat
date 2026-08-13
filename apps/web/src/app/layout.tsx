import type { Metadata } from 'next';
import { STUDIO_DISPLAY_NAME } from '@doodle-dash/domain';
import './globals.css';
import { StudioShell } from '@/components/StudioShell';

export const metadata: Metadata = {
  title: STUDIO_DISPLAY_NAME,
  description:
    'Blender-first, EEVEE-first production platform for extremely high-quality children’s animated YouTube Shorts at the best quality per dollar.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <StudioShell>{children}</StudioShell>
      </body>
    </html>
  );
}
