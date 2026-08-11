import type { Metadata } from 'next';
import './globals.css';
import { StudioShell } from '@/components/StudioShell';

export const metadata: Metadata = {
  title: 'Doodle Dash TV Studio',
  description: 'Persistent 3D animation production platform for Doodle Dash TV',
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
