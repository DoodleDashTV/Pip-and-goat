/**
 * Episode shot render queue — wires production assets → Blender worker jobs.
 * Used by the normal Draft → Final workflow (not diagnostic).
 */
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prisma } from '@doodle-dash/database';
import { FOUNDING_CODES } from '@doodle-dash/domain';
import { AppError, sha256Hex } from '@doodle-dash/shared';
import { characterService } from '@doodle-dash/characters';
import { EEVEE_QUALITY_PRESETS, shotRenderCacheService, voiceGenerationCacheService } from './cost-optimized-production';
import { ProductionStorageService } from './launch-prep';
import {
  assertFinalQualityNotDegraded,
  dirtyShotPlanner,
  globalPerformanceProfiler,
  profileResolution,
  resolvePerformanceConfig,
} from './performance';
import { shotPackageService } from './readiness';

const PIP_ID = '22222222-2222-4222-8222-222222222222';
const GOAT_ID = '33333333-3333-4333-8333-333333333333';

type ProfileCode = 'AUDIT_FAST' | 'DRAFT_FAST' | 'DRAFT_HD' | 'FINAL_1080P';
type BlendKind =
  | 'CHARACTER_BLEND'
  | 'CHARACTER_GLB'
  | 'LOCATION_BLEND'
  | 'PROP_BLEND'
  | 'PROP_GLB';

const PROFILE_RESOLUTION: Record<ProfileCode, '270x480' | '540x960' | '720x1280' | '1080x1920'> = {
  AUDIT_FAST: '270x480',
  DRAFT_FAST: '540x960',
  DRAFT_HD: '720x1280',
  FINAL_1080P: '1080x1920',
};

const CAMERA_MAP: Record<string, string> = {
  storyWide: 'WIDE',
  storyMedium: 'TWO_SHOT',
  storyTracking: 'PUSH_IN',
  storyClose: 'CLOSE_UP',
};

function textToVisemeCues(text: string, startMs: number, endMs: number) {
  const vowels: Record<string, string> = {
    a: 'A',
    e: 'E',
    i: 'I',
    o: 'O',
    u: 'U',
    y: 'I',
  };
  const closed = new Set(['m', 'b', 'p']);
  const fv = new Set(['f', 'v']);
  const letters = text.toLowerCase().replace(/[^a-z\s]/g, '');
  const tokens = letters.split(/\s+/).filter(Boolean);
  const span = Math.max(200, endMs - startMs);
  const cues: Array<{ viseme: string; startMs: number; endMs: number; weight: number }> = [
    { viseme: 'REST', startMs, endMs: startMs + 40, weight: 1 },
  ];
  if (!tokens.length) {
    cues.push({ viseme: 'REST', startMs: endMs - 40, endMs, weight: 1 });
    return cues;
  }
  const step = span / tokens.length;
  tokens.forEach((token, i) => {
    const t0 = Math.round(startMs + i * step);
    const t1 = Math.round(startMs + (i + 1) * step);
    const mid = token[Math.floor(token.length / 2)] || 'a';
    let viseme = 'REST';
    if (closed.has(token[0]!)) viseme = 'M_B_P';
    else if (fv.has(token[0]!)) viseme = 'F_V';
    else if (vowels[mid]) viseme = vowels[mid]!;
    else if (token.includes('th')) viseme = 'TH';
    else if (token.includes('l')) viseme = 'L';
    else viseme = 'A';
    cues.push({ viseme, startMs: t0, endMs: Math.max(t0 + 60, t1 - 20), weight: 1 });
  });
  cues.push({ viseme: 'REST', startMs: endMs - 40, endMs, weight: 1 });
  return cues;
}

async function latestBlendUri(
  entityType: 'character' | 'location' | 'prop',
  entityId: string,
  kinds: BlendKind[],
) {
  const intake = await prisma.productionAssetIntake.findFirst({
    where: {
      entityType,
      entityId,
      kind: { in: kinds },
      storageLocation: { not: null },
      approvalStatus: { not: 'MISSING' },
    },
    orderBy: [{ productionReady: 'desc' }, { version: 'desc' }],
  });
  if (!intake?.storageLocation) {
    throw new AppError(
      `PRODUCTION ASSET REQUIRED — missing blend for ${entityType} ${entityId}`,
      'PRODUCTION_ASSET_REQUIRED',
      409,
    );
  }
  return { uri: intake.storageLocation, checksum: intake.checksum ?? undefined, intakeId: intake.id };
}

function synthesizeEspeak(text: string, voiceId: string, pitch: number, speed: number, outPath: string) {
  const pitchArg = String(Math.round(40 + pitch * 20));
  const speedArg = String(Math.round(140 * speed));
  const result = spawnSync(
    'espeak-ng',
    ['-v', voiceId, '-p', pitchArg, '-s', speedArg, '-w', outPath, text],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new AppError(
      `espeak-local failed: ${result.stderr || result.error || 'unknown'}`,
      'VOICE_SYNTH_FAILED',
      500,
    );
  }
}

/** Seed dialogue speaker assignment for Meadow Map Mystery lines when speakerId is null. */
function inferSpeaker(lineIndex: number, text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('hmm') || lower.startsWith('it is')) return GOAT_ID;
  if (lineIndex === 1) return GOAT_ID;
  return PIP_ID;
}

export class EpisodeShotRenderService {
  constructor(private readonly storage = new ProductionStorageService()) {}

  async generateDialogueAudio(episodeId: string) {
    const dialogues = await prisma.dialogueLine.findMany({
      where: { episodeId },
      orderBy: { startMs: 'asc' },
    });
    const results = [];
    for (let i = 0; i < dialogues.length; i++) {
      const line = dialogues[i]!;
      const characterId = line.speakerId || inferSpeaker(i, line.text);
      const voice = await prisma.voiceProductionConfig.findUnique({ where: { characterId } });
      if (!voice?.approved || !voice.voiceId) {
        throw new AppError(`Voice not approved for ${characterId}`, 'VOICE_NOT_APPROVED', 409);
      }
      const provider = voice.provider || 'espeak-local';
      const settings = {
        voiceId: voice.voiceId,
        pitch: voice.pitch ?? 1,
        speed: voice.speed ?? 1,
      };
      const cache = await voiceGenerationCacheService.getOrCreateSlot({
        characterId,
        text: line.text,
        provider,
        settings,
      });
      let audioUri = cache.entry?.audioUri ?? null;
      if (!cache.cacheHit || !audioUri) {
        const wavPath = path.join(os.tmpdir(), `ddp-line-${line.id}.wav`);
        synthesizeEspeak(line.text, voice.voiceId, voice.pitch ?? 1, voice.speed ?? 1, wavPath);
        const bytes = new Uint8Array(await fs.readFile(wavPath));
        const stored = await this.storage.storeUpload({
          category: 'voices',
          parts: [characterId, 'lines', line.id, 'line.wav'],
          bytes,
          contentType: 'audio/wav',
          originalName: 'line.wav',
          metadata: { episodeId, dialogueLineId: line.id, freeLocal: true },
        });
        audioUri = stored.uri;
        await prisma.voiceGenerationCacheEntry.update({
          where: { fingerprint: cache.fingerprint },
          data: { audioUri },
        });
      }

      const startMs = line.startMs ?? 0;
      const endMs = line.endMs ?? startMs + Math.max(1200, line.text.split(/\s+/).length * 280);
      const cues = textToVisemeCues(line.text, 0, endMs - startMs);
      await prisma.lipSyncTrack.upsert({
        where: { dialogueLineId: line.id },
        update: {
          visemeTimeline: cues,
          audioHash: sha256Hex(new TextEncoder().encode(`${audioUri}|${line.text}`)),
        },
        create: {
          dialogueLineId: line.id,
          visemeTimeline: cues,
          audioHash: sha256Hex(new TextEncoder().encode(`${audioUri}|${line.text}`)),
        },
      });
      if (!line.speakerId || !line.endMs) {
        await prisma.dialogueLine.update({
          where: { id: line.id },
          data: { speakerId: characterId, endMs },
        });
      }
      results.push({
        dialogueLineId: line.id,
        characterId,
        audioUri,
        cues,
        startMs,
        endMs,
        cacheHit: cache.cacheHit,
        text: line.text,
      });
    }
    return results;
  }

  async queueEpisode(params: {
    episodeId: string;
    profileCode: ProfileCode;
    priority?: number;
  }) {
    const profile = await prisma.productionRenderProfile.findUnique({
      where: { code: params.profileCode },
    });
    // AUDIT_FAST may not be seeded — allow ephemeral audit without DB profile row.
    if (!profile && params.profileCode !== 'AUDIT_FAST') {
      throw new AppError(`Unknown render profile ${params.profileCode}`, 'PROFILE_MISSING', 404);
    }
    const resolution = PROFILE_RESOLUTION[params.profileCode];
    const perf = resolvePerformanceConfig({
      mode:
        params.profileCode === 'FINAL_1080P'
          ? 'FINAL_1080P'
          : params.profileCode === 'AUDIT_FAST'
            ? 'AUDIT_FAST'
            : params.profileCode,
    });
    const resProfile = profileResolution(perf.mode);
    const samples =
      params.profileCode === 'FINAL_1080P'
        ? resProfile.samples
        : params.profileCode === 'AUDIT_FAST'
          ? 4
          : params.profileCode === 'DRAFT_FAST'
            ? Math.min(resProfile.samples, perf.draftFastSamples)
            : resProfile.samples;
    if (params.profileCode === 'FINAL_1080P') {
      assertFinalQualityNotDegraded(samples);
    }

    const dirty = perf.enableShotCache
      ? await dirtyShotPlanner.planEpisode({
          episodeId: params.episodeId,
          profileCode: params.profileCode,
          buildFingerprint: (shotId, profileCode) =>
            shotRenderCacheService.buildFingerprint(shotId, profileCode),
        })
      : null;
    const force = new Set((params as { forceRerenderShotIds?: string[] }).forceRerenderShotIds || []);
    const reused: Array<{ shotId: string; shotNumber: number; outputUri: string | null; fingerprint: string }> =
      [];

    const episode = await prisma.episode.findUniqueOrThrow({
      where: { id: params.episodeId },
      include: {
        scenes: { include: { shots: true, location: true }, orderBy: { sceneNumber: 'asc' } },
      },
    });

    const [pip, goat] = await Promise.all([
      characterService.getByCode(FOUNDING_CODES.PIP),
      characterService.getByCode(FOUNDING_CODES.GOAT),
    ]);
    const meadow = await prisma.location.findFirstOrThrow({ where: { internalCode: 'LOC_MEADOW_001' } });
    const map = await prisma.prop.findFirstOrThrow({ where: { internalCode: 'PROP_MAP_001' } });

    const pipBlend = await latestBlendUri('character', pip.id, ['CHARACTER_BLEND', 'CHARACTER_GLB']);
    const goatBlend = await latestBlendUri('character', goat.id, ['CHARACTER_BLEND', 'CHARACTER_GLB']);
    const meadowBlend = await latestBlendUri('location', meadow.id, ['LOCATION_BLEND']);
    const mapBlend = await latestBlendUri('prop', map.id, ['PROP_BLEND', 'PROP_GLB']);

    const dialogueAudio = await this.generateDialogueAudio(params.episodeId);
    const jobs = [];
    let cursorSec = 0;

    for (const scene of episode.scenes) {
      for (const shot of scene.shots.sort((a, b) => a.shotNumber - b.shotNumber)) {
        const dirtyItem = dirty?.plan.find((p) => p.shotId === shot.id);
        if (
          perf.enableShotCache &&
          dirtyItem?.action === 'REUSE' &&
          dirtyItem.outputUri &&
          !force.has(shot.id)
        ) {
          reused.push({
            shotId: shot.id,
            shotNumber: shot.shotNumber,
            outputUri: dirtyItem.outputUri,
            fingerprint: dirtyItem.fingerprint,
          });
          globalPerformanceProfiler.addShots(0, 1);
          globalPerformanceProfiler.addCache(true);
          cursorSec += shot.durationSeconds || 4;
          continue;
        }

        const pkg = await shotPackageService.buildForShot(shot.id);
        if (pkg.status === 'BLOCKED') {
          throw new AppError(
            `Shot ${shot.shotNumber} package blocked: ${((pkg.blockedReasons as string[]) || []).join('; ')}`,
            'SHOT_PACKAGE_BLOCKED',
            409,
          );
        }

        const durationSec = shot.durationSeconds || 4;
        const fps = 30;
        const endFrame = Math.max(1, Math.round(durationSec * fps));
        const shotStartMs = Math.round(cursorSec * 1000);
        const shotEndMs = Math.round((cursorSec + durationSec) * 1000);

        const shotLines = dialogueAudio.filter((d) => d.startMs < shotEndMs && d.endMs > shotStartMs);
        const lipSync: Record<string, unknown[]> = { pip: [], goat: [] };
        for (const line of shotLines) {
          const role = line.characterId === GOAT_ID ? 'goat' : 'pip';
          const offset = shotStartMs;
          lipSync[role] = (
            line.cues as Array<{ startMs: number; endMs: number; viseme: string; weight: number }>
          ).map((c) => ({
            ...c,
            startMs: Math.max(0, c.startMs + (line.startMs - offset)),
            endMs: Math.max(0, c.endMs + (line.startMs - offset)),
          }));
        }

        const actionFor = (role: 'pip' | 'goat', shotNumber: number) => {
          const prefix = role === 'pip' ? 'PIP' : 'GOAT';
          let notes: { actions?: { pip?: string; goat?: string } } = {};
          try {
            if (shot.productionNotes) {
              notes = JSON.parse(shot.productionNotes) as {
                actions?: { pip?: string; goat?: string };
              };
            }
          } catch {
            notes = {};
          }
          const override = role === 'pip' ? notes.actions?.pip : notes.actions?.goat;
          if (override) return override;
          if (shotNumber === 1) return `${prefix}_LOOK`;
          if (shotNumber === 2) return `${prefix}_TALK`;
          if (shotNumber === 3) return `${prefix}_WALK`;
          if (shotNumber === 4) return `${prefix}_POINT`;
          if (shotNumber === 5) return `${prefix}_SURPRISED`;
          return `${prefix}_IDLE`;
        };

        const cameraPreset = CAMERA_MAP[shot.cameraPreset || ''] || 'TWO_SHOT';
        const actions = {
          pip: actionFor('pip', shot.shotNumber),
          goat: actionFor('goat', shot.shotNumber),
        };
        // Persist actions into productionNotes so fingerprints track animation changes (Test C).
        const notesPayload = (() => {
          try {
            return shot.productionNotes ? JSON.parse(shot.productionNotes) : {};
          } catch {
            return {};
          }
        })() as Record<string, unknown>;
        if (JSON.stringify(notesPayload.actions) !== JSON.stringify(actions)) {
          await prisma.shot.update({
            where: { id: shot.id },
            data: {
              productionNotes: JSON.stringify({ ...notesPayload, actions }),
            },
          });
        }

        const cacheSlot = await shotRenderCacheService.lookupOrMark({
          shotId: shot.id,
          profileCode: params.profileCode,
          engine: 'EEVEE',
        });

        const job = await prisma.renderJob.create({
          data: {
            episodeId: params.episodeId,
            shotId: shot.id,
            priority: params.priority ?? (params.profileCode === 'FINAL_1080P' ? 80 : 60),
            resolution,
            fps: 30,
            engine: 'EEVEE',
            status: 'QUEUED',
            progress: 0,
            renderMode: 'NATIVE_3D',
            payload: {
              episodeId: params.episodeId,
              sceneId: scene.id,
              shotId: shot.id,
              assets: [
                { id: 'pip', role: 'character', uri: pipBlend.uri, checksum: pipBlend.checksum },
                { id: 'goat', role: 'character', uri: goatBlend.uri, checksum: goatBlend.checksum },
                { id: 'meadow', role: 'location', uri: meadowBlend.uri, checksum: meadowBlend.checksum },
                { id: 'map', role: 'prop', uri: mapBlend.uri, checksum: mapBlend.checksum },
              ],
              metadata: {
                profileCode: params.profileCode,
                durationSec,
                startFrame: 1,
                endFrame,
                samples,
                cameraPreset,
                packageId: pkg.id,
                cacheFingerprint: cacheSlot.fingerprint,
                shotMeta: {
                  shotNumber: shot.shotNumber,
                  description: shot.description,
                  placements: {
                    pip: { location: [-0.7, 0, 0], action: actions.pip },
                    goat: { location: [0.9, 0, 0], action: actions.goat },
                    meadow: { location: [0, 0, 0] },
                    map: { location: [0, 0.35, 0.05] },
                  },
                  actions,
                  lipSync,
                  dialogue: shotLines,
                },
              },
            } as object,
          },
        });

        jobs.push({ jobId: job.id, shotId: shot.id, shotNumber: shot.shotNumber, endFrame, durationSec });
        globalPerformanceProfiler.addShots(1, 0);
        globalPerformanceProfiler.addCache(false);
        cursorSec += durationSec;
      }
    }

    return {
      episodeId: params.episodeId,
      profileCode: params.profileCode,
      resolution,
      fps: 30,
      samples,
      jobCount: jobs.length,
      jobs,
      reused,
      dirtyPlan: dirty,
      dialogueAudio,
      estimatedFrames: jobs.reduce((n, j) => n + j.endFrame, 0),
      blenderDevice: 'CPU',
    };
  }
}

export const episodeShotRenderService = new EpisodeShotRenderService();
