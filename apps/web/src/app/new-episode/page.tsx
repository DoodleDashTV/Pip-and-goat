import Link from 'next/link';
import { prisma } from '@doodle-dash/database';
import { STUDIO_DISPLAY_NAME } from '@doodle-dash/domain';
import { StudioActionForm } from '../../components/StudioActionForm';
import { PreviewNewEpisode } from '@/components/preview/PreviewNewEpisode';
import { isPublicWebsitePreview } from '@/lib/public-preview';

export const dynamic = 'force-dynamic';

const DURATIONS = [15, 30, 45, 60] as const;

export default async function NewEpisodePage() {
  if (isPublicWebsitePreview()) {
    return <PreviewNewEpisode />;
  }

  const universe = await prisma.universe.findFirst({ orderBy: { createdAt: 'asc' } });
  const recent = universe
    ? await prisma.episode.findMany({
        where: { universeId: universe.id },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: { id: true, title: true, status: true },
      })
    : [];

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-sun-400">Normal workflow</p>
        <h1 className="mt-2 font-display text-4xl font-bold text-mist-100">New Episode</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
          {STUDIO_DISPLAY_NAME} path: idea → duration → story → storyboard → BUILD EPISODE → cheap EEVEE
          draft → review → changed-shot rerender → approve → 1080×1920 EEVEE final → YouTube package. Paid
          AI video is never required.
        </p>
      </div>

      <ol className="grid gap-2 text-xs text-[var(--muted)] md:grid-cols-4">
        {[
          '1. Enter idea',
          '2. Choose 15 / 30 / 45 / 60s',
          '3. Generate & approve story',
          '4. Shots → BUILD → draft → final 1080p',
        ].map((step) => (
          <li key={step} className="rounded-xl border border-[var(--line)] bg-ink-800/60 px-3 py-2">
            {step}
          </li>
        ))}
      </ol>

      <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6">
        <h2 className="font-display text-2xl font-semibold text-mist-100">Episode idea</h2>
        <StudioActionForm
          actionPath="/api/studio/create-episode"
          fields={[
            { name: 'title', label: 'Working title', placeholder: 'Meadow Map Mystery' },
            {
              name: 'premise',
              label: 'Episode idea / premise',
              type: 'textarea',
              placeholder: 'Pip and Goat find a torn meadow map…',
            },
            {
              name: 'targetDurationSec',
              label: 'Duration (seconds)',
              type: 'select',
              options: DURATIONS.map((d) => ({ value: String(d), label: `${d} seconds` })),
            },
          ]}
          submitLabel="Create episode & open story"
        />
      </section>

      <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6">
        <h2 className="font-display text-2xl font-semibold text-mist-100">Continue recent</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {recent.map((ep) => (
            <li
              key={ep.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] py-2"
            >
              <span>
                {ep.title} <span className="text-xs text-[var(--muted)]">({ep.status})</span>
              </span>
              <span className="flex gap-2 text-xs">
                <Link className="text-leaf-300 underline" href={`/episodes/${ep.id}`}>
                  Open
                </Link>
                <Link className="text-leaf-300 underline" href={`/episodes/${ep.id}/readiness`}>
                  Readiness
                </Link>
                <Link className="text-leaf-300 underline" href={`/episodes/${ep.id}/draft-review`}>
                  Draft review
                </Link>
              </span>
            </li>
          ))}
          {recent.length === 0 ? <li className="text-[var(--muted)]">No episodes yet.</li> : null}
        </ul>
      </section>
    </div>
  );
}
