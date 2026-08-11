'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/universe', label: 'Universe' },
  { href: '/characters', label: 'Characters' },
  { href: '/canon', label: 'Canon' },
  { href: '/assets', label: 'Assets' },
  { href: '/animations', label: 'Animations' },
  { href: '/poses', label: 'Poses' },
  { href: '/expressions', label: 'Expressions' },
  { href: '/rigs', label: 'Rigs' },
  { href: '/references', label: 'References' },
  { href: '/seasons', label: 'Seasons', soon: true },
  { href: '/episodes', label: 'Episodes', soon: true },
  { href: '/world', label: 'World', soon: true },
  { href: '/production', label: 'Production', soon: true },
  { href: '/render-queue', label: 'Render Queue', soon: true },
  { href: '/settings', label: 'Settings', soon: true },
];

export function StudioShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-studio-glow text-mist-100">
      <div className="pointer-events-none fixed inset-0 opacity-40 [background-image:radial-gradient(rgba(159,214,176,0.08)_1px,transparent_1px)] [background-size:22px_22px]" />
      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-4 pb-10 pt-5 md:px-6 lg:flex-row lg:gap-8 lg:px-8">
        <aside className="mb-6 w-full shrink-0 lg:mb-0 lg:w-60">
          <div className="rounded-3xl border border-[var(--line)] bg-[var(--panel)] p-5 shadow-studio backdrop-blur-md">
            <p className="font-display text-2xl font-bold tracking-tight text-leaf-300">
              Doodle Dash
            </p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.22em] text-sun-400">
              TV Studio
            </p>
            <p className="mt-3 text-sm text-[var(--muted)]">
              Permanent universe. Reusable characters. Native 3D first.
            </p>
            <nav className="mt-6 grid grid-cols-2 gap-2 lg:grid-cols-1">
              {NAV.map((item) => {
                const active =
                  item.href === '/'
                    ? pathname === '/'
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.soon ? '#' : item.href}
                    aria-disabled={item.soon}
                    className={[
                      'rounded-2xl px-3 py-2 text-sm font-semibold transition',
                      active
                        ? 'bg-leaf-500/20 text-leaf-300'
                        : 'text-mist-200/80 hover:bg-white/5 hover:text-mist-100',
                      item.soon ? 'cursor-not-allowed opacity-45' : '',
                    ].join(' ')}
                    onClick={(event) => {
                      if (item.soon) event.preventDefault();
                    }}
                  >
                    {item.label}
                    {item.soon ? (
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-sun-400">
                        soon
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </nav>
          </div>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
