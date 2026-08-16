/**
 * TivvleJoy welcoming UI — theme tokens, truthful closed-gate display,
 * and protected-surface checks. UI-only; does not open stages or spend.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { currentStage, evaluateTheatricalGate } from '@doodle-dash/direction';
import {
  evaluatePaidResourcePolicy,
  listDraftReferenceProvenance,
  planSteps9To16Infrastructure,
  planStudioCompletion25To32Infrastructure,
} from '@doodle-dash/preproduction';
import { readStudioDashboardStatus } from './studio-status';
import { isPublicWebsitePreview } from './public-preview';

const repoRoot = path.resolve(__dirname, '../../../..');

function readRepo(relative: string): string {
  return readFileSync(path.join(repoRoot, relative), 'utf8');
}

function sha256(relative: string): string {
  return createHash('sha256').update(readFileSync(path.join(repoRoot, relative))).digest('hex');
}

const REQUIRED_TOKENS: Record<string, string> = {
  '--color-background': '#FFF8E8',
  '--color-surface': '#FFFFFF',
  '--color-primary': '#168C8C',
  '--color-primary-hover': '#117474',
  '--color-primary-foreground': '#FFFFFF',
  '--color-highlight': '#F5C84C',
  '--color-highlight-hover': '#E6B638',
  '--color-coral': '#F27D68',
  '--color-explorer-green': '#73B88A',
  '--color-navigation': '#173F4A',
  '--color-navigation-hover': '#215463',
  '--color-navigation-text': '#FFFFFF',
  '--color-text': '#263238',
  '--color-text-muted': '#66777C',
  '--color-border': '#D5E8E4',
  '--color-success': '#3E9B68',
  '--color-warning': '#E79A32',
  '--color-error': '#D95C5C',
  '--color-focus': '#168C8C',
};

const PROTECTED_HASHES: Record<string, string> = {
  'production-library/characters/pip_production.blend':
    'e15e6736f9111309d78dd8783cec1286eafdeffdf8481f964f22d7d5037dfca0',
  'production-library/characters/goat_production.blend':
    'e40b341ca0ed62eb5bc476cd761d6d94d72f8e7481957e505662466c84a420d8',
  'production-library/environments/meadow_production.blend':
    'bdfd0656ff719fb3df4d6b84313f807ee6b93a70e17784cc2aac9e4ee24aa015',
  'production-library/props/adventure_map.blend':
    'c42f8300580e0fb3dc89b1ece177dbce6d3f91dbe764411c8ddaa9c6dd7b0aea',
  'production-library/library_manifest.json':
    '10d5290585e10338bbd5852f9c412fc6feb1ea5deccb58184d879c6bf9ca49f4',
};

describe('Joyful Adventure theme tokens', () => {
  it('loads the required light-theme tokens in the existing CSS variable system', () => {
    const css = readRepo('apps/web/src/app/globals.css');
    for (const [name, value] of Object.entries(REQUIRED_TOKENS)) {
      expect(css.toLowerCase()).toContain(`${name.toLowerCase()}: ${value.toLowerCase()}`);
    }
    for (const extra of [
      '--color-disabled',
      '--color-hover-overlay',
      '--color-selected',
      '--color-input',
      '--color-surface-subtle',
      '--color-overlay',
      '--shadow-studio',
      '--focus-ring',
    ]) {
      expect(css).toContain(`${extra}:`);
    }
    expect(css).toContain('--bg: var(--color-background)');
    expect(css).toContain('--panel: var(--color-surface)');
    expect(css).toContain('.dark');
  });

  it('keeps success, warning, and error tokens distinct', () => {
    expect(REQUIRED_TOKENS['--color-success']).not.toBe(REQUIRED_TOKENS['--color-warning']);
    expect(REQUIRED_TOKENS['--color-warning']).not.toBe(REQUIRED_TOKENS['--color-error']);
    expect(REQUIRED_TOKENS['--color-error']).not.toBe(REQUIRED_TOKENS['--color-success']);
    const css = readRepo('apps/web/src/app/globals.css');
    expect(css).toContain('.status-success');
    expect(css).toContain('.status-warning');
    expect(css).toContain('.status-error');
  });

  it('defines a visible keyboard focus ring and reduced-motion preference', () => {
    const css = readRepo('apps/web/src/app/globals.css');
    expect(css).toContain(':focus-visible');
    expect(css).toContain('outline: 3px solid var(--color-focus)');
    expect(css).toContain('prefers-reduced-motion');
  });

  it('maps Tailwind semantic colors onto CSS variables instead of a second design system', () => {
    const tailwind = readRepo('apps/web/tailwind.config.js');
    expect(tailwind).toContain('var(--color-primary)');
    expect(tailwind).toContain('var(--color-background)');
    expect(tailwind).toContain('var(--color-text)');
    expect(tailwind).not.toContain('#0c1210');
  });
});

describe('primary components use semantic tokens', () => {
  it('styles the shell navigation with Deep Teal tokens and collapsible mobile nav', () => {
    const shell = readRepo('apps/web/src/components/StudioShell.tsx');
    expect(shell).toContain('var(--color-navigation)');
    expect(shell).toContain('var(--color-primary)');
    expect(shell).toContain('aria-expanded');
    expect(shell).toContain('aria-controls');
    expect(shell).toContain('lg:hidden');
    expect(shell).toContain('min-h-touch');
    expect(shell).toContain('Skip to main content');
    expect(shell).toContain('id="studio-main"');
  });

  it('uses semantic button and field classes on shared forms', () => {
    const form = readRepo('apps/web/src/components/StudioActionForm.tsx');
    expect(form).toContain('btn-primary');
    expect(form).toContain('field-input');
    expect(form).toContain('status-warning');
    const settings = readRepo('apps/web/src/components/SettingsForm.tsx');
    expect(settings).toContain('var(--color-primary)');
    expect(settings).toContain('status-success');
    expect(settings).toContain('status-error');
  });
});

describe('closed stages remain truthfully displayed', () => {
  it('reads dashboard status from existing gate interfaces without opening them', () => {
    const status = readStudioDashboardStatus();
    expect(status.stageId).toBe('DDP_STEPS_1_8');
    expect(status.theatricalAllowed).toBe(false);
    expect(status.theatricalGateLabel).toBe('Closed');
    expect(status.steps9to16Opened).toBe(false);
    expect(status.steps9to16Label).toBe('Closed');
    expect(status.steps25to32Opened).toBe(false);
    expect(status.steps25to32Label).toBe('Closed');
    expect(status.episode1Canonical).toBe(false);
    expect(status.episode1ProductionReady).toBe(false);
    expect(status.paidResourcesAuthorized).toBe(false);
    expect(status.paidResourcesLabel).toBe('Not authorized');
    expect(status.theatricalBindingCompleted).toBe(false);
    expect(status.theatricalBindingLabel).toBe('Not completed');
  });

  it('keeps production stage and theatrical decisions unchanged', () => {
    expect(currentStage().id).toBe('DDP_STEPS_1_8');
    expect(evaluateTheatricalGate().allowed).toBe(false);
    expect(planSteps9To16Infrastructure().opened).toBe(false);
    expect(planStudioCompletion25To32Infrastructure().opened).toBe(false);
  });

  it('renders closed-gate copy on the dashboard and workflow pages', () => {
    const home = readRepo('apps/web/src/app/page.tsx');
    const workflow = readRepo('apps/web/src/app/workflow/page.tsx');
    const panel = readRepo('apps/web/src/components/StudioStatusPanel.tsx');
    expect(home).toContain('StudioStatusPanel');
    expect(workflow).toContain('StudioStatusPanel');
    expect(workflow).toContain('planStudioCompletion25To32Infrastructure');
    expect(panel).toContain('Steps 9–16');
    expect(panel).toContain('Steps 25–32');
    expect(panel).toContain('Not canonical or production-ready');
    expect(panel).toContain('Not authorized');
    expect(panel).toContain('Not completed');
    expect(panel).not.toContain('Launch paid');
  });
});

describe('protected production state is unchanged', () => {
  it('does not rewrite production-library assets', () => {
    for (const [relative, expected] of Object.entries(PROTECTED_HASHES)) {
      expect(sha256(relative)).toBe(expected);
    }
    expect(listDraftReferenceProvenance().some((entry) => entry.productionLibraryPath)).toBe(false);
  });

  it('refuses paid-resource execution', () => {
    const paid = evaluatePaidResourcePolicy({ allowPaidGpu: true, estimateUsd: 1 });
    expect(paid.allowed).toBe(false);
  });

  it('keeps public preview from bundling secrets or protected assets', () => {
    const ignore = readRepo('.vercelignore');
    const vercel = readRepo('vercel.json');
    expect(ignore).toContain('production-library');
    expect(ignore).toContain('**/*.blend');
    expect(ignore).toContain('.env');
    expect(ignore).toContain('artifacts');
    expect(ignore).toContain('workers/runpod-blender');
    expect(vercel).toContain('"framework": "nextjs"');
    expect(vercel).toContain('pnpm --filter @doodle-dash/web build');
    expect(vercel).not.toContain('rootDirectory');
    expect(vercel).not.toContain('DATABASE_URL');
    expect(isPublicWebsitePreview({ DATABASE_URL: 'postgresql://local' })).toBe(false);
    expect(isPublicWebsitePreview({})).toBe(true);
    const home = readRepo('apps/web/src/app/page.tsx');
    expect(home).toContain('isPublicWebsitePreview');
    expect(home).toContain('Not available yet');
    expect(home).toContain('StudioStatusPanel');
  });

  it('keeps required lineage strings in the progress file', () => {
    const progress = readRepo('TRIVVLEJOY_PROGRESS.md');
    expect(progress).toContain('cursor/trivvlejoy-milestone-3-1ebc');
    expect(progress).toContain('character-independent');
    expect(progress).toContain('Do not continue the paused Pip conversion');
    expect(progress).toContain('Milestone 5');
    expect(progress).toContain('Draft PR #26');
    expect(progress).toContain('Draft PR #27');
    expect(progress).toContain('Draft PR #28');
    expect(progress).toContain('Draft PR #29');
    expect(progress).toContain('Draft PR #30');
    expect(progress).toContain('Draft PR #31');
    expect(progress).toContain('e3d69e22521a62693345c565289ddd03e37a5e08');
    expect(progress).toContain('b4e311ac3b72d004923506b104a27cd9ccec0480');
    expect(progress).toContain('82f26c81fc3564321289831a95ae93468b2f1369');
    expect(progress).toContain('d857a033ed8869200ec22f88cb4b8e657b7c93a6');
  });
});
