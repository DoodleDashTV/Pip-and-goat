'use client';

import { useState, useTransition } from 'react';

export function SettingsForm({
  initialStrictCharacterLock,
}: {
  initialStrictCharacterLock: boolean;
}) {
  const [strict, setStrict] = useState(initialStrictCharacterLock);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6">
      <h2 className="font-display text-2xl font-semibold">Character Lock</h2>
      <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
        When enabled, native 3D renders require an approved PRODUCTION_READY character model, rig,
        and facial rig. Missing assets block final render.
      </p>

      <label className="mt-6 flex items-center gap-3 text-sm font-semibold">
        <input
          type="checkbox"
          checked={strict}
          disabled={pending}
          onChange={(event) => {
            const next = event.target.checked;
            setStrict(next);
            startTransition(async () => {
              const response = await fetch('/api/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ STRICT_CHARACTER_LOCK: next }),
              });
              if (!response.ok) {
                setMessage('Failed to update setting');
                setStrict(!next);
                return;
              }
              const payload = (await response.json()) as {
                settings: { STRICT_CHARACTER_LOCK: boolean };
              };
              setStrict(payload.settings.STRICT_CHARACTER_LOCK);
              setMessage('Saved');
            });
          }}
          className="h-4 w-4 accent-[#6fbf88]"
        />
        STRICT_CHARACTER_LOCK
      </label>
      {message ? <p className="mt-3 text-sm text-leaf-300">{message}</p> : null}
    </section>
  );
}
