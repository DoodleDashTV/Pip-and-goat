'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { STUDIO_SHORT_NAME } from '@doodle-dash/domain';

const NAV = [
  { href: '/', label: 'Dashboard' },
  { href: '/production-setup', label: 'Production Setup' },
  { href: '/new-episode', label: 'New Episode' },
  { href: '/production', label: 'Continue Episode' },
  { href: '/direction', label: 'Direction' },
  { href: '/preproduction', label: 'Pre-Production' },
  { href: '/workflow', label: 'Episode Workflow' },
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
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = navOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [navOpen]);

  return (
    <div className="min-h-screen bg-[var(--color-background)] text-[var(--color-text)]">
      <a
        href="#studio-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[80] focus:rounded-xl focus:bg-[var(--color-highlight)] focus:px-4 focus:py-3 focus:font-bold"
      >
        Skip to main content
      </a>
      {navOpen ? (
        <button
          type="button"
          aria-label="Close navigation overlay"
          className="fixed inset-0 z-40 bg-[var(--color-overlay)] lg:hidden"
          onClick={() => setNavOpen(false)}
        />
      ) : null}
      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-4 pb-10 pt-5 md:px-6 lg:flex-row lg:gap-8 lg:px-8">
        <header className="mb-4 flex items-center justify-between gap-3 lg:hidden">
          <div>
            <p className="font-display text-xl font-bold text-[var(--color-navigation)]">
              {STUDIO_SHORT_NAME}
            </p>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
              Stage DDP_STEPS_1_8 · Gate closed
            </p>
          </div>
          <button
            type="button"
            className="inline-flex min-h-touch min-w-touch items-center justify-center rounded-2xl bg-[var(--color-navigation)] px-3 text-sm font-bold text-[var(--color-navigation-text)]"
            aria-expanded={navOpen}
            aria-controls="studio-navigation"
            onClick={() => setNavOpen((open) => !open)}
          >
            {navOpen ? 'Close' : 'Menu'}
          </button>
        </header>
        <aside
          id="studio-navigation"
          className={[
            'z-50 w-full shrink-0 lg:relative lg:mb-0 lg:block lg:w-64',
            navOpen ? 'fixed inset-y-0 left-0 block max-w-[20rem] p-4' : 'hidden lg:block',
          ].join(' ')}
        >
          <div className="flex h-full max-h-[100dvh] flex-col overflow-hidden rounded-3xl bg-[var(--color-navigation)] p-5 text-[var(--color-navigation-text)] shadow-studio">
            <p className="font-display text-2xl font-bold tracking-tight text-[var(--color-navigation-text)]">
              {STUDIO_SHORT_NAME}
            </p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-highlight)]">
              Studios
            </p>
            <p className="mt-3 text-sm text-[var(--color-navigation-text)]/80">
              Create once. Validate. Version. Lock. Reuse. Assemble. Render.
            </p>
            <nav aria-label="Studio" className="mt-6 grid flex-1 grid-cols-1 gap-2 overflow-y-auto pb-2">
              {NAV.map((item) => {
                const active =
                  item.href === '/'
                    ? pathname === '/'
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={[
                      'inline-flex min-h-touch items-center rounded-2xl px-3 py-2 text-sm font-semibold transition-colors duration-150',
                      active
                        ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                        : 'text-[var(--color-navigation-text)] hover:bg-[var(--color-navigation-hover)]',
                    ].join(' ')}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </aside>
        <main id="studio-main" className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
