'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { STUDIO_SHORT_NAME } from '@doodle-dash/domain';
import { FOUNDATION_STAGE_LABEL, PREVIEW_PUBLIC_BANNER } from '@/lib/preview-workspace/types';

const PRIMARY_NAV = [
  { href: '/', label: 'Dashboard' },
  { href: '/production-setup', label: 'Production Setup' },
  { href: '/new-episode', label: 'New Episode' },
  { href: '/asset-intake', label: 'Assets' },
  { href: '/voices', label: 'Voices' },
  { href: '/voice-production', label: 'Voice Production' },
  { href: '/scenery', label: 'Scenery' },
  { href: '/episode-planner', label: 'Episode Planner' },
  { href: '/episode-one', label: 'Episode 1 Review' },
  { href: '/shot-assembly', label: 'Shot Assembly' },
  { href: '/blender-assembly', label: 'Blender Assembly' },
  { href: '/blender-readiness', label: 'Blender Readiness' },
  { href: '/world-builder', label: 'World Builder' },
  { href: '/world-builder/assets', label: 'Approved Assets' },
  { href: '/world-builder/longevity', label: 'Scenery Longevity' },
  { href: '/production-control', label: 'Production Control' },
  { href: '/episode-preflight', label: 'Episode Preflight' },
  { href: '/rig-arrival', label: 'Rig Arrival' },
  { href: '/animation-control', label: 'Animation Control' },
  { href: '/character-rigging', label: 'Character Rigging' },
  { href: '/workflow', label: 'Episode Workflow' },
  { href: '/readiness', label: 'Readiness' },
  { href: '/render-queue', label: 'Render Queue' },
];

const ADVANCED_NAV = [
  { href: '/production', label: 'Continue Episode' },
  { href: '/direction', label: 'Direction' },
  { href: '/preproduction', label: 'Pre-Production' },
  { href: '/animations', label: 'Animations' },
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

function navActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

export function StudioShell({
  children,
  isPreview = false,
}: {
  children: React.ReactNode;
  isPreview?: boolean;
}) {
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
    <div className="min-h-screen overflow-x-hidden bg-[var(--color-background)] text-[var(--color-text)]">
      <a
        href="#studio-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[80] focus:rounded-xl focus:bg-[var(--color-highlight)] focus:px-4 focus:py-3 focus:font-bold"
      >
        Skip to main content
      </a>
      {isPreview ? (
        <p
          role="status"
          className="sticky top-0 z-[70] break-words bg-[var(--color-highlight)] px-4 py-3 text-center text-sm font-bold leading-5 text-[var(--color-highlight-foreground)]"
        >
          {PREVIEW_PUBLIC_BANNER}
        </p>
      ) : null}
      {navOpen ? (
        <button
          type="button"
          aria-label="Close navigation overlay"
          className="fixed inset-0 z-40 bg-[var(--color-overlay)] lg:hidden"
          onClick={() => setNavOpen(false)}
        />
      ) : null}
      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col overflow-x-hidden px-4 pb-10 pt-5 md:px-6 lg:flex-row lg:gap-8 lg:px-8">
        <header className="mb-4 flex items-center justify-between gap-3 lg:hidden">
          <div className="min-w-0">
            <p className="font-display text-xl font-bold text-[var(--color-navigation)]">
              {STUDIO_SHORT_NAME}
            </p>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
              {FOUNDATION_STAGE_LABEL} · Gate closed
            </p>
          </div>
          <button
            type="button"
            className="inline-flex min-h-touch min-w-touch shrink-0 items-center justify-center rounded-2xl bg-[var(--color-navigation)] px-3 text-sm font-bold text-[var(--color-navigation-text)]"
            aria-expanded={navOpen}
            aria-controls="studio-navigation"
            onClick={() => setNavOpen((open) => !open)}
          >
            {navOpen ? 'Close menu' : 'Menu'}
          </button>
        </header>
        <aside
          id="studio-navigation"
          className={[
            'z-[60] w-full shrink-0 lg:relative lg:mb-0 lg:block lg:w-64',
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
              {FOUNDATION_STAGE_LABEL} · Gate closed
            </p>
            <button
              type="button"
              className="mt-4 inline-flex min-h-touch w-full items-center justify-center rounded-2xl bg-[var(--color-highlight)] px-3 text-sm font-bold text-[var(--color-highlight-foreground)] lg:hidden"
              onClick={() => setNavOpen(false)}
            >
              Close menu
            </button>
            <nav aria-label="Studio" className="mt-6 grid flex-1 grid-cols-1 gap-2 overflow-y-auto pb-2">
              {PRIMARY_NAV.map((item) => {
                const active = navActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={[
                      'inline-flex min-h-touch items-center rounded-2xl px-3 py-2 text-sm font-semibold transition-colors duration-150',
                      active
                        ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)] ring-2 ring-[var(--color-highlight)]'
                        : 'text-[var(--color-navigation-text)] hover:bg-[var(--color-navigation-hover)]',
                    ].join(' ')}
                  >
                    {item.label}
                    {active ? <span className="sr-only"> (current)</span> : null}
                  </Link>
                );
              })}
              <details className="mt-2 rounded-2xl bg-[var(--color-navigation-hover)]/40 p-2">
                <summary className="flex min-h-touch cursor-pointer list-none items-center px-2 text-sm font-bold text-[var(--color-highlight)]">
                  Advanced / debug
                </summary>
                <p className="px-2 pb-2 text-xs leading-5 text-[var(--color-navigation-text)]/70">
                  Technical tools, not the normal Preview workflow. Use the seven primary pages
                  above. These pages need a local studio database.
                </p>
                <p className="break-all px-2 pb-2 font-mono text-[11px] text-[var(--color-navigation-text)]/60">
                  Technical stage: DDP_STEPS_1_8
                </p>
                <div className="grid gap-2">
                  {ADVANCED_NAV.map((item) => {
                    const active = navActive(pathname, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={[
                          'inline-flex min-h-touch items-center rounded-2xl px-3 py-2 text-sm font-semibold',
                          active
                            ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                            : 'text-[var(--color-navigation-text)] hover:bg-[var(--color-navigation-hover)]',
                        ].join(' ')}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </details>
            </nav>
          </div>
        </aside>
        <main id="studio-main" className="min-w-0 flex-1 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
