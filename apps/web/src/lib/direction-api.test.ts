/**
 * The direction API, exercised through the actual route handlers.
 *
 * The reason to test the route rather than the service it calls is that the route is
 * where a client's mistakes arrive: a missing episode id, a malformed body, an
 * override aimed at a locked path. Each of those has a correct answer, and none of
 * them is a 500.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { GET, POST } from '../app/api/direction/route';
import { VALIDATION_SCENE_PLAN } from '@doodle-dash/direction';
import { STUDIO_DISPLAY_NAME } from '@doodle-dash/domain';

const databaseDir = path.resolve(__dirname, '../../../../packages/database');
const EPISODE = VALIDATION_SCENE_PLAN.episodeId;

function get(query: string): Request {
  return new Request(`http://localhost/api/direction${query}`);
}

function post(body: unknown): Request {
  return new Request('http://localhost/api/direction', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('direction API', () => {
  beforeAll(() => {
    const rawUrl = process.env.DATABASE_URL;
    if (!rawUrl) throw new Error('DATABASE_URL is required for tests');
    const psqlUrl = rawUrl.replace(/\?schema=public$/, '');
    execSync(
      `psql "${psqlUrl}" -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"`,
      { env: process.env, stdio: 'inherit' },
    );
    execSync('pnpm exec prisma migrate deploy', { cwd: databaseDir, env: process.env, stdio: 'inherit' });
    execSync('pnpm exec tsx prisma/seed.ts', { cwd: databaseDir, env: process.env, stdio: 'inherit' });
  }, 180_000);

  it('plans the bundled validation scene with no request body at all', async () => {
    const response = await POST(post({ action: 'plan' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.episodeId).toBe(EPISODE);
    expect(body.validationStatus).toBe('PASS');
    expect(body.errorCount).toBe(0);
    expect(body.shotCount).toBe(VALIDATION_SCENE_PLAN.beats.length);
    expect(body.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  // Every response that could lead someone toward spending money has to carry the
  // authorization state, so a client cannot render a "Render" button without it.
  it('reports the paid-GPU authorization state on plan and on inspection', async () => {
    const planned = await (await POST(post({ action: 'plan' }))).json();
    expect(planned.provider.requiresAuthorization).toBe(true);
    expect(planned.provider.paidGpuLaunchAllowed).toBe(false);

    const inspected = await (await GET(get(`?episodeId=${EPISODE}`))).json();
    expect(inspected.paidGpuRequiresAuthorization).toBe(true);
    expect(inspected.provider.localAvailable).toBe(true);
  });

  it('returns the control surface for a planned episode', async () => {
    await POST(post({ action: 'plan' }));
    const response = await GET(get(`?episodeId=${EPISODE}`));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.studioName).toBe(STUDIO_DISPLAY_NAME);
    expect(body.shots.length).toBe(VALIDATION_SCENE_PLAN.beats.length);
    expect(body.blueprint.estimatedCloudCostUsd).toBeGreaterThan(0);
    for (const shot of body.shots) {
      expect(shot.qcStatus).toBe('PASS');
    }
  });

  it('answers 400 rather than guessing when episodeId is missing', async () => {
    const response = await GET(get(''));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('episodeId');
    // Even the error path carries the authorization state.
    expect(body.provider.requiresAuthorization).toBe(true);
  });

  it('returns an empty surface for an episode that was never planned', async () => {
    const body = await (await GET(get('?episodeId=NOT_PLANNED'))).json();
    expect(body.blueprint).toBeNull();
    expect(body.shots).toEqual([]);
  });

  it('rejects an unrecognised action with 400 and the validation issues', async () => {
    const response = await POST(post({ action: 'launch-a-gpu' }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid request');
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it('applies an override through the API and reports it as accepted', async () => {
    const planned = await (await POST(post({ action: 'plan' }))).json();
    const surface = await (await GET(get(`?episodeId=${EPISODE}`))).json();
    const shotId = surface.shots[0].shotId;

    const response = await POST(
      post({
        action: 'override',
        episodeId: EPISODE,
        override: {
          path: 'camera.composition',
          shotId,
          value: 'CLOSE_UP',
          by: 'director@tivvlejoy.test',
          reason: 'hold on Pip’s reaction',
        },
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.accepted).toBe(true);
    expect(body.refusedBecause).toBeNull();
    // An override changes the plan, so it must change the content hash.
    expect(body.contentHash).not.toBe(planned.contentHash);
  });

  // A refusal is a well-formed answer of "no", not a server error. The client needs
  // the reason to show the director why their edit did not take.
  it('answers 200 with accepted:false for an override of a locked path', async () => {
    await POST(post({ action: 'plan' }));
    const surface = await (await GET(get(`?episodeId=${EPISODE}`))).json();
    const response = await POST(
      post({
        action: 'override',
        episodeId: EPISODE,
        override: {
          path: 'audio.voiceRequests',
          shotId: surface.shots[0].shotId,
          value: 'another_voice_v1',
          by: 'director@tivvlejoy.test',
          reason: 'wanted a different voice',
        },
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.accepted).toBe(false);
    expect(typeof body.refusedBecause).toBe('string');
    expect(body.refusedBecause.length).toBeGreaterThan(10);
  });

  it('previews what a replan would invalidate without storing anything', async () => {
    await POST(post({ action: 'plan' }));
    const before = await (await GET(get(`?episodeId=${EPISODE}`))).json();

    const response = await POST(post({ action: 'preview-invalidation', episodeId: EPISODE }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.hasStored).toBe(true);
    expect(body.invalidatedShotIds).toEqual([]);
    expect(body.reusableShotIds.length).toBe(VALIDATION_SCENE_PLAN.beats.length);

    const after = await (await GET(get(`?episodeId=${EPISODE}`))).json();
    expect(after.blueprint.contentHash).toBe(before.blueprint.contentHash);
  });

  it('turns a bad scene plan into a 400 with the refusal, not a 500', async () => {
    const response = await POST(
      post({ action: 'plan', scenePlan: { planVersion: 'nope', beats: [] } }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(typeof body.error).toBe('string');
  });

  it('treats an unparseable body as a plan of the bundled validation scene', async () => {
    const request = new Request('http://localhost/api/direction', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json at all',
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.episodeId).toBe(EPISODE);
  });
});
