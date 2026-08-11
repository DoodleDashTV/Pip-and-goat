import { productionDirectorService } from '@doodle-dash/production';
import { DEFAULT_PRODUCTION_MODE } from '@doodle-dash/domain';

export const dynamic = 'force-dynamic';

export default async function ProductionPage() {
  const plan = productionDirectorService.planEpisode(
    [
      {
        shotId: 'demo-1',
        description: 'Pip and Goat meet in the meadow establishing shot',
        durationSeconds: 5,
        characterIds: ['pip', 'goat'],
        isHeroMoment: false,
        isDialogueHeavy: true,
        storyImportance: 55,
      },
      {
        shotId: 'demo-2',
        description: 'Close-up reaction when they find the map',
        durationSeconds: 3,
        characterIds: ['pip'],
        isHeroMoment: true,
        isDialogueHeavy: false,
        storyImportance: 85,
      },
    ],
    DEFAULT_PRODUCTION_MODE,
  );

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-sun-400">Production</p>
        <h1 className="mt-2 font-display text-4xl font-bold">Production Director</h1>
        <p className="mt-3 text-[var(--muted)]">Default mode: {DEFAULT_PRODUCTION_MODE}</p>
      </header>
      <div className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6">
        <p className="text-sm text-[var(--muted)]">
          Estimated cost units: {plan.totals.estimatedCostUnits} · minutes:{' '}
          {plan.totals.estimatedMinutes}
        </p>
        <ul className="mt-4 space-y-3">
          {plan.shotPlans.map((shot) => (
            <li key={String(shot.shotId)} className="rounded-2xl bg-ink-950/40 px-4 py-3 text-sm">
              <span className="font-semibold text-leaf-300">{shot.renderMode}</span> · importance{' '}
              {shot.cinematicImportance}
              <p className="mt-1 text-[var(--muted)]">{shot.rationale.join(' ')}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
