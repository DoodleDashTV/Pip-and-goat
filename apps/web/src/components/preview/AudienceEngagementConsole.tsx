'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  OBSERVATION_WINDOWS,
  acceptPilotAnalyticsSnapshot,
  comparePilotAnalytics,
  recordHumanEngagementApproval,
  selectPilotWinner,
  type AudienceEngagementConsoleModel,
  type ObservationWindow,
  type PilotAnalyticsSnapshot,
  type PilotComparisonReport,
} from '@/lib/tivvlejoy-kids-engagement';
import { PreviewPageIntro } from './PreviewEmptyState';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-[var(--color-background)]/60 p-3">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
    </div>
  );
}

const emptyForm = {
  pilotId: 'PILOT_1' as PilotAnalyticsSnapshot['pilotId'],
  observationWindow: '24h' as ObservationWindow,
  views: '',
  engagedViews: '',
  averageViewDurationSec: '',
  averagePercentageViewed: '',
  likes: '',
  shares: '',
  uniqueViewers: '',
  productionTimeMinutes: '',
  renderCostUsd: '',
  humanComprehensionNotes: '',
  humanEnjoymentNotes: '',
  humanReplayInterestNotes: '',
};

function toNullableNumber(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function AudienceEngagementConsole({ model }: { model: AudienceEngagementConsoleModel }) {
  const [report, setReport] = useState(model.episode.report);
  const [form, setForm] = useState(emptyForm);
  const [manualSnapshots, setManualSnapshots] = useState<PilotAnalyticsSnapshot[]>([]);
  const [formMessage, setFormMessage] = useState('Synthetic Preview data only. Fields may stay empty.');
  const [winnerId, setWinnerId] = useState<PilotAnalyticsSnapshot['pilotId'] | ''>('');
  const [authorizeNext, setAuthorizeNext] = useState(false);
  const [comparisonOverride, setComparisonOverride] = useState<PilotComparisonReport | null>(null);

  const comparison = useMemo(
    () => comparisonOverride ?? (manualSnapshots.length > 0 ? comparePilotAnalytics(manualSnapshots) : model.comparison),
    [comparisonOverride, manualSnapshots, model.comparison],
  );

  const approvalEnabled = report.readiness === 'READY_FOR_HUMAN_REVIEW';

  return (
    <div className="space-y-4 overflow-x-hidden">
      <PreviewPageIntro
        kicker="Audience Engagement Blueprint"
        title="Research-informed kids engagement"
        instruction="Planning and Preview only. This is Research-Informed Guidance for Story Clarity, Replay Design, and Engagement Readiness. It is not a guarantee of virality."
      />

      <section className="studio-card space-y-2 border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-4 sm:p-5">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-warning-foreground)]">
          Not a guarantee of virality
        </p>
        <p className="text-sm leading-6 text-[var(--color-warning-foreground)]">{model.notice}</p>
        <p className="text-xs text-[var(--color-warning-foreground)]">
          All numbers on this page are synthetic or manually entered aggregates. No Production connection. No
          external analytics. No paid voice. No GPU. No storage write.
        </p>
      </section>

      <section className="studio-card space-y-2 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Studio pipeline</h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          Audience Engagement sits between episode concept and existing render readiness. It does not replace
          Episode Planner, Shot Assembly, voice authorization, or QC.
        </p>
        <ol className="grid gap-2 text-sm sm:grid-cols-2">
          {model.pipeline.map((stage, index) => (
            <li key={stage}>
              <span className="font-bold">{index + 1}.</span> {stage.replaceAll('_', ' ')}
            </li>
          ))}
        </ol>
        <p className="text-sm">
          <Link href="/episode-planner" className="font-bold underline">
            Episode Planner
          </Link>
          {' · '}
          <Link href="/episode-preflight" className="font-bold underline">
            Episode Preflight
          </Link>
        </p>
      </section>

      <section className="studio-card space-y-3 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Audience Engagement</h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          {model.episode.episodeId} · {model.episode.title}. Dialogue refs only. Approved spoken lines are unchanged.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="Engagement Readiness" value={report.readiness} />
          <Stat label="Numerical score" value="none" />
          <Stat label="Dialogue refs" value={model.episode.dialogueRefs.length} />
        </div>
        <p className="text-xs text-[var(--color-text-muted)]">Refs: {model.episode.dialogueRefs.join(', ')}</p>
      </section>

      <section className="studio-card space-y-3 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Research-informed checklist</h2>
        <ul className="space-y-2 text-sm">
          {report.checks.map((item) => (
            <li key={item.code} className="rounded-2xl border border-[var(--color-border)] px-3 py-3">
              <p className="font-bold">
                {item.label} · {item.state}
              </p>
              <p className="text-[var(--color-text-muted)]">{item.detail}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="studio-card space-y-3 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Age-band layers</h2>
        {model.episode.ageBands.map((layer) => (
          <div key={layer.ageBand}>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
              {layer.ageBand === 'AGES_5_7' ? 'Ages 5–7' : 'Ages 8–10'}
            </p>
            <p className="mt-1 text-sm leading-6">{layer.summary}</p>
          </div>
        ))}
      </section>

      <section className="studio-card space-y-3 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Pilot Lab</h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          Three approved planning-only concepts. Not approved final scripts or production assets. Do not begin
          producing these pilots from this page.
        </p>
        <ul className="space-y-3 text-sm">
          {model.pilots.map((pilot) => (
            <li key={pilot.pilotId} className="rounded-2xl border border-[var(--color-border)] px-3 py-3">
              <p className="font-bold">
                {pilot.pilotId} · {pilot.title}
              </p>
              <p className="text-[var(--color-text-muted)]">Primary variable: {pilot.primaryVariable}</p>
              {pilot.homeBaseOpportunity ? <p>Home-base opportunity: {pilot.homeBaseOpportunity}</p> : null}
              <p>Concept readiness: {pilot.readiness}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="studio-card space-y-3 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Manual aggregate analytics</h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          Nullable aggregate fields only. No comments, usernames, child-level data, or external analytics
          connection. Current rows are synthetic Preview fixtures unless you add a local row.
        </p>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const accepted = acceptPilotAnalyticsSnapshot({
              pilotId: form.pilotId,
              observationWindow: form.observationWindow,
              views: toNullableNumber(form.views),
              engagedViews: toNullableNumber(form.engagedViews),
              averageViewDurationSec: toNullableNumber(form.averageViewDurationSec),
              averagePercentageViewed: toNullableNumber(form.averagePercentageViewed),
              likes: toNullableNumber(form.likes),
              shares: toNullableNumber(form.shares),
              uniqueViewers: toNullableNumber(form.uniqueViewers),
              productionTimeMinutes: toNullableNumber(form.productionTimeMinutes),
              renderCostUsd: toNullableNumber(form.renderCostUsd),
              humanComprehensionNotes: form.humanComprehensionNotes || null,
              humanEnjoymentNotes: form.humanEnjoymentNotes || null,
              humanReplayInterestNotes: form.humanReplayInterestNotes || null,
              source: 'SYNTHETIC_PREVIEW',
            });
            if (!accepted.ok) {
              setFormMessage(accepted.reason);
              return;
            }
            setManualSnapshots((current) => [...current, accepted.snapshot]);
            setComparisonOverride(null);
            setFormMessage('Local Preview snapshot stored in this browser session only.');
          }}
        >
          <label className="text-sm">
            Pilot
            <select
              className="field-input mt-1 w-full"
              value={form.pilotId}
              onChange={(event) => setForm((current) => ({ ...current, pilotId: event.target.value as typeof form.pilotId }))}
            >
              <option value="PILOT_1">PILOT 1</option>
              <option value="PILOT_2">PILOT 2</option>
              <option value="PILOT_3">PILOT 3</option>
            </select>
          </label>
          <label className="text-sm">
            Observation window
            <select
              className="field-input mt-1 w-full"
              value={form.observationWindow}
              onChange={(event) =>
                setForm((current) => ({ ...current, observationWindow: event.target.value as ObservationWindow }))
              }
            >
              {OBSERVATION_WINDOWS.map((window) => (
                <option key={window} value={window}>
                  {window}
                </option>
              ))}
            </select>
          </label>
          {(
            [
              ['views', 'Views'],
              ['engagedViews', 'Engaged views'],
              ['averageViewDurationSec', 'Average view duration'],
              ['averagePercentageViewed', 'Average percentage viewed'],
              ['likes', 'Likes'],
              ['shares', 'Shares'],
              ['uniqueViewers', 'Unique viewers (count only)'],
              ['productionTimeMinutes', 'Production time (minutes)'],
              ['renderCostUsd', 'Render cost'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="text-sm">
              {label}
              <input
                className="field-input mt-1 w-full"
                inputMode="decimal"
                value={form[key]}
                onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
              />
            </label>
          ))}
          <label className="text-sm sm:col-span-2">
            Human comprehension notes
            <textarea
              className="field-input mt-1 w-full"
              rows={2}
              value={form.humanComprehensionNotes}
              onChange={(event) => setForm((current) => ({ ...current, humanComprehensionNotes: event.target.value }))}
            />
          </label>
          <label className="text-sm sm:col-span-2">
            Human enjoyment notes
            <textarea
              className="field-input mt-1 w-full"
              rows={2}
              value={form.humanEnjoymentNotes}
              onChange={(event) => setForm((current) => ({ ...current, humanEnjoymentNotes: event.target.value }))}
            />
          </label>
          <label className="text-sm sm:col-span-2">
            Human replay-interest notes
            <textarea
              className="field-input mt-1 w-full"
              rows={2}
              value={form.humanReplayInterestNotes}
              onChange={(event) => setForm((current) => ({ ...current, humanReplayInterestNotes: event.target.value }))}
            />
          </label>
          <button type="submit" className="btn-primary sm:col-span-2">
            Store local Preview snapshot
          </button>
        </form>
        <p className="text-sm text-[var(--color-text-muted)]">{formMessage}</p>
      </section>

      <section className="studio-card space-y-3 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Comparison report</h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          Raw views alone cannot select a winner. A human must choose the format and authorize any next batch.
          Automatic spend stays closed.
        </p>
        <ul className="space-y-2 text-sm">
          {comparison.findings.map((finding) => (
            <li key={finding.dimension}>
              <span className="font-bold">{finding.dimension}</span> · {finding.availability} · {finding.note}
            </li>
          ))}
        </ul>
        <p className="text-sm">
          Selected winner: {comparison.selectedWinnerPilotId ?? 'none'} · Winner selected by:{' '}
          {comparison.winnerSelectedBy ?? 'not yet'}
        </p>
        <div className="flex flex-wrap gap-2">
          <select
            className="field-input"
            value={winnerId}
            onChange={(event) => setWinnerId(event.target.value as typeof winnerId)}
          >
            <option value="">Choose a format</option>
            <option value="PILOT_1">PILOT 1</option>
            <option value="PILOT_2">PILOT 2</option>
            <option value="PILOT_3">PILOT 3</option>
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={authorizeNext} onChange={(event) => setAuthorizeNext(event.target.checked)} />
            Human authorizes a future batch later
          </label>
          <button
            type="button"
            className="btn-primary"
            disabled={!winnerId}
            onClick={() => {
              if (!winnerId) return;
              setComparisonOverride(
                selectPilotWinner(comparison, {
                  actor: 'HUMAN',
                  winningPilotId: winnerId,
                  authorizeNextBatch: authorizeNext,
                }),
              );
            }}
          >
            Human select winner
          </button>
        </div>
      </section>

      <section className="studio-card space-y-3 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Human approval</h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          Only a human may set HUMAN_APPROVED. The control stays disabled unless Engagement Readiness is
          READY_FOR_HUMAN_REVIEW. This Preview action stays local and does not publish, render, or spend.
        </p>
        <button
          type="button"
          className="btn-primary"
          disabled={!approvalEnabled}
          onClick={() => {
            setReport(
              recordHumanEngagementApproval(report, {
                actor: 'HUMAN',
                decision: 'APPROVE',
                notes: 'Preview-only local human mark. Not a production approval.',
              }),
            );
          }}
        >
          Mark HUMAN_APPROVED
        </button>
        <p className="text-sm">Current state: {report.readiness}</p>
      </section>

      <section className="studio-card space-y-2 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Research-informed guidance</h2>
        <ul className="space-y-2 text-sm">
          {model.citations.map((citation) => (
            <li key={citation.id}>
              {citation.authors} ({citation.year}). {citation.title}. {citation.container}
              {citation.doi ? ` DOI ${citation.doi}` : ''}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
