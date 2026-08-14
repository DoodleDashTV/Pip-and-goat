'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { STUDIO_SHORT_NAME } from '@doodle-dash/domain';

const NAV = [
  { href: '/', label: 'Dashboard' },
  { href: '/production-setup', label: 'Production Setup' },
  { href: '/new-episode', label: 'New Episode' },
  { href: '/production', label: 'Continue Episode' },
  { href: '/asset-intake', label: 'Assets' },
  { href: '/animations', label: 'Animations' },
  { href: '/render-queue', label: 'Render Queue' },
  { href: '/readiness', label: 'Readiness' },
  { href: '/costs', label: 'Costs' },
  { href: '/production-settings', label: 'Production Settings' },
  { href: '/universe', label: 'Universe' },
  { href: '/characters', label: 'Characters' },
  { href: '/canon', label: 'Canon' },
  { href: '/world', label: 'World' },
  { href: '/locations', label: 'Locations' },
  { href: '/props', label: 'Props' },
  { href: '/seasons', label: 'Seasons' },
  { href: '/episodes', label: 'Episodes' },
  { href: '/storyboards', label: 'Storyboards' },
  { href: '/episodes/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/readiness', label: 'Meadow Mystery' },
  { href: '/vertical-slice', label: 'Vertical Slice' },
  { href: '/voices', label: 'Voices' },
  { href: '/blender-worker', label: 'Blender Worker' },
  { href: '/audio', label: 'Audio' },
  { href: '/poses', label: 'Poses' },
  { href: '/expressions', label: 'Expressions' },
  { href: '/rigs', label: 'Rigs' },
  { href: '/references', label: 'References' },
  { href: '/relationships', label: 'Relationships' },
  { href: '/continuity', label: 'Continuity' },
  { href: '/publishing', label: 'Publishing' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/search', label: 'Search' },
  { href: '/debug', label: 'Debug' },
  { href: '/settings', label: 'Settings' },
];

export function StudioShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen bg-studio-glow text-mist-100">
      <div className="pointer-events-none fixed inset-0 opacity-40 [background-image:radial-gradient(rgba(159,214,176,0.08)_1px,transparent_1px)] [background-size:22px_22px]" />
      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-4 pb-10 pt-5 md:px-6 lg:flex-row lg:gap-8 lg:px-8">
        <aside className="mb-6 w-full shrink-0 lg:mb-0 lg:w-60">
          <div className="rounded-3xl border border-[var(--line)] bg-[var(--panel)] p-5 shadow-studio backdrop-blur-md">
            <p className="font-display text-2xl font-bold tracking-tight text-leaf-300">{STUDIO_SHORT_NAME}</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.22em] text-sun-400">Studios</p>
            <p className="mt-3 text-sm text-[var(--muted)]">Create once. Validate. Version. Lock. Reuse. Assemble. Render.</p>
            <nav className="mt-6 grid max-h-[70vh] grid-cols-2 gap-2 overflow-y-auto lg:grid-cols-1">
              {NAV.map((item) => {
                const active = item.href === '/' ? pathname === '/' : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return <Link key={item.href} href={item.href} className={['rounded-2xl px-3 py-2 text-sm font-semibold transition', active ? 'bg-leaf-500/20 text-leaf-300' : 'text-mist-200/80 hover:bg-white/5 hover:text-mist-100'].join(' ')}>{item.label}</Link>;
              })}
            </nav>
          </div>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
