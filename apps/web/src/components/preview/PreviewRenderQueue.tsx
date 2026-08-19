'use client';

import { usePreviewWorkspace } from '@/lib/preview-workspace/use-preview-workspace';
import { PreviewBanner, PreviewMessage } from './PreviewBanner';
import { PreviewEmptyState, PreviewPageIntro } from './PreviewEmptyState';

function ReadinessCard({
  request,
}: {
  request: {
    label: string;
    status: string;
    contactedProvider: boolean;
    readinessCard?: {
      episodeLabel: string;
      shotLabel: string;
      status: string;
      backendProven: boolean;
      hashesVerified: boolean;
      assetsApprovedLabel: string;
      shotApprovalLabel: string;
      cacheLabel: string;
      estimatedRuntimeLabel: string;
      gpuLabel: string;
      hourlyQuoteLabel: string;
      estimatedComputeLabel: string;
      maximumCostLabel: string;
      gpuLaunched: boolean;
      paidAuthorization: string;
      blockingReason: string | null;
    };
  };
}) {
  const card = request.readinessCard;
  if (!card) {
    return (
      <li className="rounded-2xl border border-[var(--color-border)] p-4">
        <p className="font-semibold">{request.label}</p>
        <p className="break-words text-sm text-[var(--color-text-muted)]">
          {request.status} · provider contacted: {String(request.contactedProvider)} · output: none ·
          progress: none
        </p>
        <p className="mt-2 text-sm">STATUS BLOCKED — admission records are missing</p>
      </li>
    );
  }

  return (
    <li className="rounded-2xl border border-[var(--color-border)] p-4">
      <p className="font-semibold">
        {card.episodeLabel} / {card.shotLabel}
      </p>
      <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[var(--color-text-muted)]">Backend</dt>
          <dd>{card.backendProven ? 'Proven' : 'Not proven'}</dd>
        </div>
        <div>
          <dt className="text-[var(--color-text-muted)]">Hashes</dt>
          <dd>{card.hashesVerified ? 'Verified' : 'Unverified'}</dd>
        </div>
        <div>
          <dt className="text-[var(--color-text-muted)]">Assets</dt>
          <dd>{card.assetsApprovedLabel}</dd>
        </div>
        <div>
          <dt className="text-[var(--color-text-muted)]">Shot</dt>
          <dd>{card.shotApprovalLabel}</dd>
        </div>
        <div>
          <dt className="text-[var(--color-text-muted)]">Cache</dt>
          <dd>{card.cacheLabel}</dd>
        </div>
        <div>
          <dt className="text-[var(--color-text-muted)]">Estimated runtime</dt>
          <dd>{card.estimatedRuntimeLabel}</dd>
        </div>
        <div>
          <dt className="text-[var(--color-text-muted)]">GPU</dt>
          <dd>{card.gpuLabel}</dd>
        </div>
        <div>
          <dt className="text-[var(--color-text-muted)]">Hourly quote</dt>
          <dd>{card.hourlyQuoteLabel}</dd>
        </div>
        <div>
          <dt className="text-[var(--color-text-muted)]">Estimated compute</dt>
          <dd>{card.estimatedComputeLabel}</dd>
        </div>
        <div>
          <dt className="text-[var(--color-text-muted)]">Maximum</dt>
          <dd>{card.maximumCostLabel}</dd>
        </div>
        <div>
          <dt className="text-[var(--color-text-muted)]">GPU launched</dt>
          <dd>{card.gpuLaunched ? 'YES' : 'NO'}</dd>
        </div>
        <div>
          <dt className="text-[var(--color-text-muted)]">Paid authorization</dt>
          <dd>{card.paidAuthorization}</dd>
        </div>
      </dl>
      {card.blockingReason ? (
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">Blocking reason: {card.blockingReason}</p>
      ) : null}
      <p className="mt-3 font-semibold">STATUS {card.status}</p>
      <p className="mt-1 break-words text-sm text-[var(--color-text-muted)]">
        {request.status} · provider contacted: {String(request.contactedProvider)} · output: none ·
        progress: none
      </p>
    </li>
  );
}

export function PreviewRenderQueue() {
  const {
    workspace,
    message,
    busy,
    requestRender,
    requestFixtureAdmission,
    reset,
    exportBackup,
    importBackup,
  } = usePreviewWorkspace();
  const episode = workspace.episodes[0] ?? null;
  const pathReady =
    workspace.settingsSaved &&
    Boolean(episode) &&
    workspace.assets.length > 0 &&
    workspace.voices.length > 0;

  return (
    <div className="space-y-5 overflow-x-hidden">
      <PreviewPageIntro
        kicker="Render Queue"
        title="Zero-GPU admission"
        instruction="Preview can admit a structured render request without launching a GPU. A later paid authorization is still required. Nothing is rendered here."
      />
      <PreviewBanner
        busy={busy}
        onReset={() => reset()}
        onExport={() => exportBackup()}
        onImport={(text, byteLength, confirm) => importBackup(text, byteLength, confirm)}
      />
      <PreviewMessage message={message} />
      {!episode ? (
        <PreviewEmptyState
          title="Create an episode first"
          body="This is step 7 of 7. Admission needs an episode. Paid GPU and a real render stay blocked."
          href="/new-episode"
          actionLabel="Go to New Episode"
        />
      ) : !pathReady ? (
        <PreviewEmptyState
          title="Earlier steps are still open"
          body="Add an asset note and a voice note, then return here. You can still save a draft request, but the guided path marks this step blocked until those notes exist."
          href="/readiness"
          actionLabel="Review Readiness"
        />
      ) : workspace.renderRequests.length === 0 ? (
        <PreviewEmptyState
          title="No admission records yet"
          body="Save a draft request from this browser workspace, or evaluate the synthetic fixture admission. Neither contacts a GPU provider."
        />
      ) : null}
      <section className="studio-card space-y-3 p-4 sm:p-6">
        <p className="text-sm text-[var(--color-text-muted)]">
          Successful FINAL admission is BACKEND_READY_PAID_AUTH_REQUIRED. Missing hashes, assets, or
          shot approval stay BLOCKED. Paid GPU remains off.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            className="btn-primary w-full px-5 text-sm sm:w-auto"
            disabled={busy || !episode}
            onClick={() => episode && requestRender(episode.id)}
          >
            Create draft request — not rendered
          </button>
          <button
            type="button"
            className="btn-secondary w-full px-5 text-sm sm:w-auto"
            disabled={busy || !episode}
            onClick={() => episode && requestFixtureAdmission(episode.id)}
          >
            Evaluate fixture admission — zero GPU
          </button>
        </div>
      </section>
      <section className="studio-card p-4 sm:p-6">
        <h2 className="font-display text-2xl font-semibold">Requests</h2>
        {workspace.renderRequests.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--color-text-muted)]">No draft requests yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {workspace.renderRequests.map((request) => (
              <ReadinessCard key={request.id} request={request} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
