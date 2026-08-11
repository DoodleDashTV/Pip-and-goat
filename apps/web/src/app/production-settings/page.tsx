import {
  DEFAULT_PRODUCTION_SETTINGS,
  costOptimizedWorkflowService,
  productionSettingsService,
} from '@doodle-dash/production';
import { PRODUCT_DISPLAY_NAME } from '@doodle-dash/domain';
import { StudioActionForm } from '../../components/StudioActionForm';

export const dynamic = 'force-dynamic';

export default async function ProductionSettingsPage() {
  await costOptimizedWorkflowService.bootstrap();
  const settings = await productionSettingsService.get();

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-sun-400">Configuration</p>
        <h1 className="mt-2 font-display text-4xl font-bold text-mist-100">Production Settings</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
          Defaults for {PRODUCT_DISPLAY_NAME}: Blender-first, EEVEE final 1080×1920 @ 30 FPS, caches on, AI
          video off.
        </p>
      </div>

      <section className="rounded-[1.75rem] border border-leaf-400/30 bg-leaf-500/10 p-5 text-sm text-mist-100">
        <h2 className="font-semibold">Active defaults</h2>
        <dl className="mt-3 grid gap-2 md:grid-cols-3">
          <div>
            <dt className="text-xs uppercase text-leaf-300">Final</dt>
            <dd>
              {settings.defaultFinalWidth}×{settings.defaultFinalHeight} @ {settings.defaultFps} FPS ·{' '}
              {settings.defaultFinalEngine}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-leaf-300">Draft profile</dt>
            <dd>{settings.defaultDraftProfile}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-leaf-300">Blender first</dt>
            <dd>{settings.preferLocalBlender ? 'ON' : 'OFF'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-leaf-300">AI video</dt>
            <dd>{settings.aiVideoEnabled ? 'ENABLED' : 'OFF (default)'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-leaf-300">Render cache</dt>
            <dd>{settings.renderCacheEnabled ? 'ON' : 'OFF'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-leaf-300">Voice cache</dt>
            <dd>{settings.voiceCacheEnabled ? 'ON' : 'OFF'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-leaf-300">Animation reuse</dt>
            <dd>
              {settings.animationReuseEnabled ? 'ON' : 'OFF'} · aggressiveness{' '}
              {settings.animationReuseAggressiveness}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-leaf-300">Paid approval threshold</dt>
            <dd>${settings.paidGenerationApprovalThresholdUsd.toFixed(2)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-leaf-300">Quality target</dt>
            <dd>{settings.qualityTarget}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6">
        <h2 className="font-display text-2xl font-semibold text-mist-100">Update settings</h2>
        <StudioActionForm
          actionPath="/api/studio/production-settings"
          fields={[
            {
              name: 'defaultDraftProfile',
              label: 'Default draft profile',
              type: 'select',
              options: [
                { value: 'DRAFT_FAST', label: 'DRAFT_FAST (540×960)' },
                { value: 'DRAFT_HD', label: 'DRAFT_HD (720×1280)' },
              ],
            },
            {
              name: 'defaultFinalEngine',
              label: 'Default final engine',
              type: 'select',
              options: [
                { value: 'EEVEE', label: 'EEVEE (default)' },
                { value: 'CYCLES', label: 'Cycles (premium only — not recommended as default)' },
              ],
            },
            {
              name: 'aiVideoEnabled',
              label: 'AI video enabled',
              type: 'select',
              options: [
                { value: 'false', label: 'OFF (default)' },
                { value: 'true', label: 'ON (optional specialty)' },
              ],
            },
            {
              name: 'paidGenerationApprovalThresholdUsd',
              label: 'Paid-generation approval threshold (USD)',
              placeholder: String(DEFAULT_PRODUCTION_SETTINGS.paidGenerationApprovalThresholdUsd),
            },
            {
              name: 'animationReuseAggressiveness',
              label: 'Animation reuse aggressiveness',
              type: 'select',
              options: [
                { value: 'LOW', label: 'LOW' },
                { value: 'MEDIUM', label: 'MEDIUM (default)' },
                { value: 'HIGH', label: 'HIGH' },
              ],
            },
            {
              name: 'qualityTarget',
              label: 'Quality target',
              type: 'select',
              options: [
                { value: 'BEST_QUALITY_PER_DOLLAR', label: 'Best quality per dollar' },
                { value: 'MAXIMUM_QUALITY', label: 'Maximum quality' },
                { value: 'MINIMUM_COST', label: 'Minimum cost (not recommended)' },
              ],
            },
            {
              name: 'localComputeUsdPerMinute',
              label: 'Local compute assumption ($/min GPU)',
              placeholder: String(DEFAULT_PRODUCTION_SETTINGS.localComputeUsdPerMinute),
            },
          ]}
          submitLabel="Save production settings"
        />
      </section>
    </div>
  );
}
