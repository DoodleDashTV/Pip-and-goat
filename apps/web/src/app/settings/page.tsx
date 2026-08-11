import { studioSettingsService } from '@doodle-dash/characters';
import { SettingsForm } from '@/components/SettingsForm';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const strictCharacterLock = await studioSettingsService.isStrictCharacterLockEnabled();

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-sun-400">Studio</p>
        <h1 className="mt-2 font-display text-4xl font-bold">Settings</h1>
        <p className="mt-3 max-w-2xl text-[var(--muted)]">
          Production locks and studio-wide configuration.
        </p>
      </header>

      <SettingsForm initialStrictCharacterLock={strictCharacterLock} />
    </div>
  );
}
