import { prisma } from '@doodle-dash/database';

export const dynamic = 'force-dynamic';

export default async function AudioPage() {
  const [voices, sounds, music] = await Promise.all([
    prisma.voiceProfile.findMany({ orderBy: { name: 'asc' } }),
    prisma.soundClip.findMany({ orderBy: { code: 'asc' } }),
    prisma.musicTrack.findMany({ orderBy: { category: 'asc' } }),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-sun-400">Audio</p>
        <h1 className="mt-2 font-display text-4xl font-bold">Voice · SFX · Music</h1>
      </header>
      <section>
        <h2 className="font-display text-2xl">Voice profiles</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {voices.map((voice) => (
            <article key={voice.id} className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--panel)] p-5">
              <h3 className="font-semibold">{voice.name}</h3>
              <p className="mt-2 text-sm text-sun-300">provider ID unset · pendingReview {String(voice.pendingReview)}</p>
            </article>
          ))}
        </div>
      </section>
      <section>
        <h2 className="font-display text-2xl">Sound library</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {sounds.map((sound) => (
            <span key={sound.id} className="rounded-full bg-ink-800 px-3 py-1 text-sm">{sound.code} · {sound.status}</span>
          ))}
        </div>
      </section>
      <section>
        <h2 className="font-display text-2xl">Music library</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {music.map((track) => (
            <span key={track.id} className="rounded-full bg-ink-800 px-3 py-1 text-sm">{track.category} · {track.status}</span>
          ))}
        </div>
      </section>
    </div>
  );
}
