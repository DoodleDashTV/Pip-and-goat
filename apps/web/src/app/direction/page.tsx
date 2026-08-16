/**
 * Direction — the Steps 1-8 control surface.
 *
 * Built into the existing studio shell rather than as a standalone demo, and laid
 * out for a phone first: single column, stacked cards, no horizontal scrolling. It
 * shows what the Director AI decided, what QC measured, what a render would cost,
 * and whether a paid GPU could run at all.
 */
import { directionService, readProviderStatus } from '@doodle-dash/production';
import { STUDIO_DISPLAY_NAME } from '@doodle-dash/domain';
import {
  CHILD_SAFE_POLICY,
  FINAL_1080P_TECHNICAL_BASELINE,
  GOAT_LOCK,
  PIP_LOCK,
  ROADMAP,
  VALIDATION_SCENE_PLAN,
  VFX_REGISTRY,
  direct,
  evaluateTheatricalGate,
} from '@doodle-dash/direction';

export const dynamic = 'force-dynamic';

const VALIDATION_EPISODE_ID = VALIDATION_SCENE_PLAN.episodeId;

export default async function DirectionPage() {
  const provider = readProviderStatus();

  // Plan the bundled validation fixture in-process. It is pure and offline, so the
  // page is useful before anything has been stored, and it needs no provider.
  const planned = direct(VALIDATION_SCENE_PLAN);
  const stored = await directionService
    .latestForEpisode(VALIDATION_EPISODE_ID)
    .catch(() => null);

  const content = planned.blueprint.content;
  const errors = content.issues.filter((issue) => issue.severity === 'ERROR');
  const warnings = content.issues.filter((issue) => issue.severity === 'WARNING');
  const gate = evaluateTheatricalGate();

  return (
    <div className="space-y-6 overflow-x-hidden">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-primary)]">
          {STUDIO_DISPLAY_NAME} · Direction
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold text-[var(--color-text)] sm:text-4xl">
          Production Blueprint
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
          Steps 1–8 plan every shot deterministically before anything renders: direction, acting,
          emotion, face, camera, lighting, VFX and sound. Same inputs, same blueprint, every time.
        </p>
      </header>

      <section className="rounded-[1.5rem] border border-sun-400/40 bg-sun-500/10 p-5 text-sm text-mist-100">
        <h2 className="font-semibold">Prototype assets — not the final visual standard</h2>
        <p className="mt-2 text-[var(--muted)]">
          Pip, Goat, the meadow and the props are functional baseline assets kept unchanged for
          regression testing, rollback and provenance. The accepted{' '}
          <span className="font-mono text-xs">{FINAL_1080P_TECHNICAL_BASELINE.id}</span> render
          proves the pipeline executes end to end; it establishes no visual standard. TivvleJoy
          Studios&apos; visual standard is set by an approved theatrical golden scene, which does not
          exist yet.
        </p>
      </section>

      <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--panel)] p-5 text-sm">
        <h2 className="font-display text-xl font-semibold text-mist-100">
          Technical result is not artistic approval
        </h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase text-leaf-300">Technical</dt>
            <dd className={content.acceptance.technical === 'PASS' ? 'text-leaf-300' : 'text-sun-300'}>
              {content.acceptance.technical}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-leaf-300">Artistic</dt>
            <dd className="text-sun-300">{content.acceptance.artistic.replace(/_/g, ' ')}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-leaf-300">Overall</dt>
            <dd className="text-sun-300">{content.acceptance.overall.replace(/_/g, ' ')}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-leaf-300">Asset quality</dt>
            <dd>{content.qualityContext.assetQuality}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-leaf-300">Render tier</dt>
            <dd>{content.qualityContext.renderTier}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-leaf-300">May be called a master</dt>
            <dd>{content.qualityContext.isMasterCandidate ? 'yes' : 'no'}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs uppercase tracking-wider text-leaf-300">Blocked by</p>
        <ul className="mt-1 space-y-1 text-[var(--muted)]">
          {content.acceptance.blockedBy.map((blocker, index) => (
            <li key={`blocker-${index}`}>{blocker}</li>
          ))}
        </ul>
      </section>

      <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--panel)] p-5 text-sm">
        <h2 className="font-display text-xl font-semibold text-mist-100">Roadmap</h2>
        <ol className="mt-3 space-y-1">
          {ROADMAP.map((stage) => (
            <li
              key={stage.id}
              className={
                stage.status === 'COMPLETE'
                  ? 'text-leaf-300'
                  : stage.status === 'CURRENT'
                    ? 'text-mist-100'
                    : 'text-[var(--muted)]'
              }
            >
              {stage.order}. {stage.name} — {stage.status}
              {stage.requiresHumanApproval ? ' · needs human approval' : ''}
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs uppercase tracking-wider text-leaf-300">
          DDP Steps 9–16 gate: {gate.allowed ? 'OPEN' : 'BLOCKED'}
        </p>
        <ul className="mt-1 space-y-1 text-[var(--muted)]">
          {gate.blockers.map((blocker, index) => (
            <li key={`gate-${index}`}>{blocker}</li>
          ))}
        </ul>
      </section>

      <section
        className={`rounded-[1.5rem] border p-5 text-sm ${
          provider.requiresAuthorization
            ? 'border-sun-400/40 bg-sun-500/10 text-mist-100'
            : 'border-leaf-400/40 bg-leaf-500/10 text-mist-100'
        }`}
      >
        <h2 className="font-semibold">
          {provider.requiresAuthorization ? 'Paid GPU requires authorization' : 'Cloud rendering authorized'}
        </h2>
        <p className="mt-2 text-[var(--muted)]">{provider.explanation}</p>
        <dl className="mt-3 grid gap-2 sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase text-leaf-300">Local Blender/EEVEE</dt>
            <dd>AVAILABLE</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-leaf-300">CLOUD_RENDER_ENABLED</dt>
            <dd>{provider.cloudRenderEnabled ? 'true' : 'false / unset'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-leaf-300">ALLOW_PAID_GPU_LAUNCH</dt>
            <dd>{provider.paidGpuLaunchAllowed ? 'true' : 'false / unset'}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--panel)] p-5">
        <h2 className="font-display text-xl font-semibold text-mist-100">
          {content.episodeTitle}
        </h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs uppercase text-leaf-300">Validation</dt>
            <dd className={content.validation.status === 'PASS' ? 'text-leaf-300' : 'text-sun-300'}>
              {content.validation.status} · {content.validation.errorCount} error(s),{' '}
              {content.validation.warningCount} warning(s)
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-leaf-300">Shots · duration</dt>
            <dd>
              {content.totals.shotCount} · {content.totals.durationSeconds}s ·{' '}
              {content.totals.frameCount} frames
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-leaf-300">Cost estimate (advisory)</dt>
            <dd>
              ${content.totals.estimatedCloudCostUsd.toFixed(4)} cloud ·{' '}
              {content.totals.estimatedLocalMinutes.toFixed(1)} local min
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-leaf-300">Content hash</dt>
            <dd className="break-all font-mono text-xs">{content.contentHash.slice(0, 24)}…</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-leaf-300">Delivery</dt>
            <dd>
              {content.delivery.resolution} @ {content.delivery.fps} FPS · {content.delivery.aspect}{' '}
              (draft fixture)
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-leaf-300">Cache hit fraction</dt>
            <dd>{Math.round(content.totals.cacheHitFraction * 100)}%</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-leaf-300">Stored blueprint</dt>
            <dd>{stored ? `${stored.contentHash.slice(0, 12)}… (${stored.status})` : 'none yet'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-leaf-300">Decision trace</dt>
            <dd>{content.decisionTrace.length} recorded decisions</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--panel)] p-5">
        <h2 className="font-display text-xl font-semibold text-mist-100">Per-shot validation</h2>
        <div className="mt-4 space-y-3">
          {content.shots.map((shot) => {
            const failed = [...shot.qc.motion, ...shot.qc.facial, ...shot.qc.sound].filter(
              (measurement) => measurement.status === 'FAIL',
            );
            return (
              <article
                key={shot.shotId}
                className="rounded-[1.25rem] border border-[var(--line)] bg-black/20 p-4 text-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-semibold text-mist-100">
                    {shot.index + 1}. {shot.beatPurpose}
                    {shot.hookRole !== 'NONE' ? ` · ${shot.hookRole}` : ''}
                  </h3>
                  <span
                    className={`text-xs font-bold uppercase tracking-wider ${
                      shot.qc.status === 'PASS' ? 'text-leaf-300' : 'text-sun-300'
                    }`}
                  >
                    {shot.qc.status}
                  </span>
                </div>
                <p className="mt-1 text-[var(--muted)]">{shot.purpose}</p>
                <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs uppercase text-leaf-300">Camera</dt>
                    <dd>
                      {shot.camera.composition} · {shot.camera.move} · {shot.camera.lensMm}mm · score{' '}
                      {shot.camera.score}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-leaf-300">Lighting</dt>
                    <dd>
                      {shot.lighting.recipe} ({shot.lighting.state}) ·{' '}
                      {shot.lighting.colorManagement.viewTransform}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-leaf-300">Emotion</dt>
                    <dd>
                      {shot.emotion
                        .map((emotion) => `${emotion.characterCode === PIP_LOCK.characterCode ? 'Pip' : 'Goat'} ${emotion.primary} @ ${emotion.intensity}`)
                        .join(' · ')}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-leaf-300">Acting</dt>
                    <dd>
                      {shot.acting
                        .map((plan) => `${plan.gesture} / ${plan.locomotion.mode} ${plan.locomotion.steps} steps`)
                        .join(' · ')}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-leaf-300">VFX</dt>
                    <dd>
                      {shot.vfx.instances.length === 0
                        ? 'none'
                        : shot.vfx.instances.map((instance) => instance.presetId).join(', ')}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-leaf-300">Audio</dt>
                    <dd>
                      {shot.audio.tracks.length} tracks · {shot.audio.dialogueTiming.length} line(s) ·{' '}
                      {shot.audio.mixBusTrimDb}dB bus trim
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-leaf-300">Render</dt>
                    <dd>
                      {shot.render.tier} · {shot.render.engine} · {shot.render.samples} samples ·{' '}
                      {shot.render.passes.length} pass(es) ·{' '}
                      {shot.render.compositing.enabled ? 'comp' : 'no comp'} ·{' '}
                      {shot.render.colorGrade.enabled ? 'graded' : 'ungraded'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-leaf-300">Assets bound</dt>
                    <dd>
                      {shot.assetBindings.length === 0
                        ? 'none pinned'
                        : shot.assetBindings
                            .map(
                              (binding) =>
                                `${binding.logicalId}@${binding.assetVersion} (mesh ${binding.components.meshVersion}${
                                  binding.components.rigVersion ? `, rig ${binding.components.rigVersion}` : ''
                                }${binding.components.groomVersion ? `, groom ${binding.components.groomVersion}` : ''}, ${binding.lod})`,
                            )
                            .join(' · ')}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-leaf-300">Groom / simulation</dt>
                    <dd>
                      {shot.simulation.groom.every((groom) => groom.mode === 'NONE')
                        ? 'no groom on prototype assets'
                        : shot.simulation.groom.map((groom) => `${groom.characterCode} ${groom.mode}`).join(' · ')}
                      {shot.simulation.requiredCaches.length > 0
                        ? ` · ${shot.simulation.requiredCaches.length} cache(s) to bake`
                        : ''}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-leaf-300">Acceptance</dt>
                    <dd>
                      technical {shot.acceptance.technical} · artistic{' '}
                      {shot.acceptance.artistic.replace(/_/g, ' ')}
                    </dd>
                  </div>
                </dl>
                {failed.length > 0 ? (
                  <ul className="mt-3 space-y-1 text-xs text-sun-300">
                    {failed.map((measurement, index) => (
                      <li key={`${shot.shotId}-${measurement.check}-${index}`}>
                        {measurement.check}: {measurement.measured}
                        {measurement.unit} vs {measurement.tolerance}
                        {measurement.unit}
                        {measurement.repair ? ` — ${measurement.repair}` : ''}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className="mt-3 text-xs text-[var(--muted)]">
                  Cache key {shot.cacheKey.slice(0, 16)}… ·{' '}
                  {shot.cost.cacheHit ? 'cached — regenerate not required' : 'not cached'} · $
                  {shot.cost.estimatedCloudCostUsd.toFixed(5)} cloud estimate
                </p>
              </article>
            );
          })}
        </div>
      </section>

      {errors.length + warnings.length > 0 ? (
        <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--panel)] p-5 text-sm">
          <h2 className="font-display text-xl font-semibold text-mist-100">
            Issues and explanations
          </h2>
          <ul className="mt-3 space-y-2">
            {[...errors, ...warnings].map((issue, index) => (
              <li key={`${issue.code}-${index}`} className="text-[var(--muted)]">
                <span className={issue.severity === 'ERROR' ? 'text-sun-300' : 'text-leaf-300'}>
                  [{issue.severity}]
                </span>{' '}
                <span className="font-mono text-xs">{issue.system}</span> {issue.code} — {issue.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--panel)] p-5 text-sm">
        <h2 className="font-display text-xl font-semibold text-mist-100">
          Locks and safe bounds
        </h2>
        <p className="mt-2 text-[var(--muted)]">
          These are enforced in the planners and again at composition. A violation fails closed
          rather than rendering.
        </p>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase text-leaf-300">Pip</dt>
            <dd>
              {PIP_LOCK.characterCode} · voice {PIP_LOCK.voice.voiceId} · pitch{' '}
              {PIP_LOCK.voice.pitchRange.minSemitones} to {PIP_LOCK.voice.pitchRange.maxSemitones} st
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-leaf-300">Goat</dt>
            <dd>
              {GOAT_LOCK.characterCode} · voice {GOAT_LOCK.voice.voiceId} · pitch{' '}
              {GOAT_LOCK.voice.pitchRange.minSemitones} to {GOAT_LOCK.voice.pitchRange.maxSemitones} st
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-leaf-300">Emotion intensity ceiling</dt>
            <dd>
              {CHILD_SAFE_POLICY.maxIntensity} · gated emotions require explicit story approval
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-leaf-300">VFX presets available</dt>
            <dd>{VFX_REGISTRY.length} reusable, versioned presets</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--panel)] p-5 text-sm">
        <h2 className="font-display text-xl font-semibold text-mist-100">Controls</h2>
        <p className="mt-2 text-[var(--muted)]">
          The API accepts <code className="font-mono text-xs">plan</code>,{' '}
          <code className="font-mono text-xs">override</code>,{' '}
          <code className="font-mono text-xs">preview-invalidation</code> and{' '}
          <code className="font-mono text-xs">record-review</code> at{' '}
          <code className="font-mono text-xs">/api/direction</code>. Overrides are bounded: a change
          that would breach a character or voice lock is refused and the refusal is recorded with its
          reason. <code className="font-mono text-xs">preview-invalidation</code> answers which shots
          a change would re-render before anything is spent.{' '}
          <code className="font-mono text-xs">record-review</code> records one human artistic
          judgement against a named reviewer; it refuses to attach an approval to draft frames, and
          nothing else in the system can set an artistic status to approved.
        </p>
      </section>
    </div>
  );
}
