import { prisma } from '@doodle-dash/database';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function WorldMapPage() {
  const locations = await prisma.location.findMany({
    include: { connectionsFrom: true, connectionsTo: true },
    orderBy: { name: 'asc' },
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-sun-400">World</p>
        <h1 className="mt-2 font-display text-4xl font-bold">World Map</h1>
        <p className="mt-3 max-w-2xl text-[var(--muted)]">
          Location nodes and travel connections. Click a location to open its registry entry.
        </p>
      </header>

      <div className="relative min-h-[420px] overflow-hidden rounded-[2rem] border border-[var(--line)] bg-ink-900/80 p-6">
        <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(rgba(111,191,136,0.25)_1px,transparent_1px)] [background-size:18px_18px]" />
        {locations.map((location) => (
          <Link
            key={location.id}
            href="/locations"
            className="absolute rounded-2xl border border-leaf-400/40 bg-[var(--panel)] px-4 py-3 shadow-studio backdrop-blur transition hover:border-leaf-300"
            style={{
              left: `${location.mapX ?? 30}%`,
              top: `${location.mapY ?? 30}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sun-400">
              {location.internalCode}
            </p>
            <p className="font-display text-lg font-semibold">{location.name}</p>
            <p className="text-xs text-[var(--muted)]">
              links {location.connectionsFrom.length + location.connectionsTo.length}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
