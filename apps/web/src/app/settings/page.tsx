import { studioSettingsService } from '@doodle-dash/characters';
import { SettingsForm } from '@/components/SettingsForm';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const strictCharacterLock = await studioSettingsService.isStrictCharacterLockEnabled();

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--color-primary)]">Studio</p>
        <h1 className="mt-2 font-display text-4xl font-bold">Settings</h1>
        <p className="mt-3 max-w-2xl text-[var(--color-text-muted)]">
          Production locks and studio-wide configuration. Appearance uses the Joyful Adventure
          tokens already loaded in the theme system.
        </p>
      </header>

      <SettingsForm initialStrictCharacterLock={strictCharacterLock} />

      <section aria-labelledby="theme-tokens-heading" className="studio-card space-y-4 p-6">
        <h2 id="theme-tokens-heading" className="font-display text-2xl font-semibold">
          Joyful Adventure theme
        </h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          Light theme is the default. A compatible <code className="font-mono text-xs">.dark</code>{' '}
          token set is preserved for appearance settings. Status always includes an icon plus text.
        </p>
        <ul className="grid gap-3 sm:grid-cols-3">
          <li className="status-success flex min-h-touch items-center gap-2 rounded-2xl px-3 py-2 text-sm font-bold">
            <span aria-hidden="true">✓</span>
            <span>Success — explorer green</span>
          </li>
          <li className="status-warning flex min-h-touch items-center gap-2 rounded-2xl px-3 py-2 text-sm font-bold">
            <span aria-hidden="true">!</span>
            <span>Warning — amber</span>
          </li>
          <li className="status-error flex min-h-touch items-center gap-2 rounded-2xl px-3 py-2 text-sm font-bold">
            <span aria-hidden="true">×</span>
            <span>Error — soft red</span>
          </li>
        </ul>
      </section>
    </div>
  );
}
