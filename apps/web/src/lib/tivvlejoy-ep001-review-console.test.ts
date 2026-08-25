import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileEp001ProductionPackage } from './tivvlejoy-ep001-production-package';

const repoRoot = path.resolve(__dirname, '../../../..');

function readRepo(relative: string): string {
  return readFileSync(path.join(repoRoot, relative), 'utf8');
}

describe('TivvleJoy Episode 1 review console', () => {
  it('presents the complete deterministic EP001 review package', () => {
    const episode = compileEp001ProductionPackage();
    expect(episode.workingTitle).toBe('Meadow Map Mystery');
    expect(episode.format.durationSeconds).toBe(60);
    expect(episode.shots).toHaveLength(10);
    expect(episode.dialogue).toHaveLength(8);
    expect(episode.sceneryBindings).toHaveLength(3);
    expect(episode.animation.plans).toHaveLength(20);
  });

  it('exposes one read-only Studio route from navigation and the dashboard', () => {
    const page = readRepo('apps/web/src/app/episode-one/page.tsx');
    const shell = readRepo('apps/web/src/components/StudioShell.tsx');
    const dashboard = readRepo('apps/web/src/components/preview/PreviewDashboard.tsx');

    expect(page).toContain('compileEp001ProductionPackage');
    expect(page).toContain('Episode 1 review');
    expect(page).toContain('Shot timeline');
    expect(page).toContain('Dialogue review');
    expect(page).toContain('Safety remains locked');
    expect(shell).toContain("{ href: '/episode-one', label: 'Episode 1 Review' }");
    expect(dashboard).toContain('href="/episode-one"');
    expect(dashboard).toContain('Open Episode 1 Review');
  });

  it('adds no client mutation or external execution path', () => {
    const page = readRepo('apps/web/src/app/episode-one/page.tsx');
    expect(page).not.toContain("'use client'");
    expect(page).not.toContain("'use server'");
    expect(page).not.toContain('fetch(');
    expect(page).not.toContain('onClick=');
    expect(page).not.toContain('<form');

    const episode = compileEp001ProductionPackage();
    expect(episode.readiness.launchAllowed).toBe(false);
    expect(episode.readiness.paidComputeAllowed).toBe(false);
    expect(episode.readiness.voiceProviderCallsAllowed).toBe(false);
    expect(episode.readiness.productionWritesAllowed).toBe(false);
    expect(episode.safety.externalNetworkCalls).toBe(0);
    expect(episode.safety.finalRenderStarted).toBe(false);
  });
});
