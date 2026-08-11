import { searchService } from '@doodle-dash/production';
import { prisma } from '@doodle-dash/database';

export const dynamic = 'force-dynamic';

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const universe = await prisma.universe.findFirst({ where: { status: 'ACTIVE' } });
  const results =
    q && universe
      ? await searchService.search({ universeId: universe.id, query: q })
      : { characters: [], canon: [], assets: [], episodes: [] };

  const flat = [
    ...results.characters.map((item) => ({
      type: 'character',
      title: item.name,
      detail: item.internalCode,
    })),
    ...results.canon.map((item) => ({
      type: 'canon',
      title: item.category,
      detail: item.statement,
    })),
    ...results.assets.map((item) => ({
      type: 'asset',
      title: item.name,
      detail: item.type,
    })),
    ...results.episodes.map((item) => ({
      type: 'episode',
      title: (item as { title?: string }).title ?? 'Episode',
      detail: (item as { logline?: string }).logline ?? '',
    })),
  ];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-sun-400">Search</p>
        <h1 className="mt-2 font-display text-4xl font-bold">Global Search</h1>
      </header>
      <form className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--panel)] p-4">
        <input
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search characters, canon, episodes, assets..."
          className="w-full rounded-xl bg-ink-950/60 px-4 py-3 text-sm outline-none ring-leaf-400 focus:ring"
        />
      </form>
      <div className="space-y-3">
        {flat.map((result, index) => (
          <article
            key={`${result.type}-${index}`}
            className="rounded-[1.25rem] border border-[var(--line)] bg-[var(--panel)] p-4"
          >
            <p className="text-xs uppercase tracking-wider text-sun-300">{result.type}</p>
            <p className="mt-1 font-semibold">{result.title}</p>
            <p className="mt-1 text-sm text-[var(--muted)]">{result.detail}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
