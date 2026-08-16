import Link from 'next/link';

export function PreviewEmptyState({
  title,
  body,
  href,
  actionLabel,
}: {
  title: string;
  body: string;
  href?: string;
  actionLabel?: string;
}) {
  return (
    <section className="studio-card space-y-3 p-4 sm:p-5">
      <h2 className="font-display text-xl font-semibold text-[var(--color-text)]">{title}</h2>
      <p className="text-sm leading-6 text-[var(--color-text-muted)]">{body}</p>
      {href && actionLabel ? (
        <Link href={href} className="btn-primary w-full px-4 text-sm sm:w-auto">
          {actionLabel}
        </Link>
      ) : null}
    </section>
  );
}

export function PreviewPageIntro({
  kicker,
  title,
  instruction,
}: {
  kicker: string;
  title: string;
  instruction: string;
}) {
  return (
    <header className="min-w-0">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-primary)]">{kicker}</p>
      <h1 className="mt-2 break-words font-display text-3xl font-bold text-[var(--color-text)] sm:text-4xl">
        {title}
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--color-text-muted)]">{instruction}</p>
    </header>
  );
}
