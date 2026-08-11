import { prisma } from '@doodle-dash/database';
import { FOUNDING_CODES } from '@doodle-dash/domain';
import { AppError } from '@doodle-dash/shared';
import { spawnSync } from 'node:child_process';
import {
  GOAT_CANONICAL_DNA,
  PIP_CANONICAL_DNA,
  REQUIRED_SEMANTIC_FACIAL,
  MINIMUM_VISEMES,
  SHARED_VISUAL_STYLE_LOCK,
  EXTENDED_CHARACTER_TEST_POSES,
  canonicalCharacterService,
} from './canonical-characters';
import {
  VERTICAL_SLICE_EPISODE_ID,
  MEADOW_CODE,
  MAP_PROP_CODE,
  blenderWorkerHealthService,
  durableStorageOpsService,
  episodeReadinessAggregator,
  productionStorageService,
  propOnboardingService,
  REQUIRED_SEMANTIC_FACIAL_CORE,
  REQUIRED_VISEMES,
  CHARACTER_TEST_POSES,
} from './launch-prep';
import { studioSettingsService } from '@doodle-dash/characters';

export type SetupState = 'READY' | 'ACTION_REQUIRED' | 'BLOCKED' | 'WARNING';

export type SetupStep = {
  id: string;
  order: number;
  title: string;
  state: SetupState;
  summary: string;
  actionLabel: string;
  href: string;
  details?: string[];
};

function detectFfmpeg(): { available: boolean; bin: string; version: string | null } {
  const bin = process.env.FFMPEG_BIN || 'ffmpeg';
  const probed = spawnSync(bin, ['-version'], { encoding: 'utf8' });
  if (probed.status !== 0) {
    return { available: false, bin, version: null };
  }
  const line = (probed.stdout || '').split('\n')[0] ?? 'ffmpeg';
  return { available: true, bin, version: line };
}

export class ProductionSetupService {
  async blenderPanel() {
    const status = await blenderWorkerHealthService.status();
    const storage = await durableStorageOpsService.health();
    const ffmpeg = detectFfmpeg();
    const lastSelfTest = await prisma.blenderWorkerSelfTest.findFirst({
      orderBy: { createdAt: 'desc' },
    });
    const eeveeAvailable = (status.blender.engines ?? []).includes('EEVEE');
    const selfTestOk = lastSelfTest?.status === 'SUCCEEDED';
    return {
      blenderInstalled: Boolean(status.blender.available),
      version: status.blender.version,
      eeveeAvailable,
      ffmpegAvailable: ffmpeg.available,
      ffmpegVersion: ffmpeg.version,
      workerConnected: Boolean(status.workerOnline || status.blender.available),
      renderWritable: Boolean(storage.configured),
      storageConnected: Boolean(storage.configured),
      storageDurable: storage.durable,
      selfTestOk,
      lastSelfTestStatus: lastSelfTest?.status ?? null,
      raw: status,
    };
  }

  async buildChecklist(): Promise<{
    steps: SetupStep[];
    primaryAction: { label: string; href: string; reason: string };
    episodeId: string;
    draftEnabled: boolean;
    philosophy: string;
  }> {
    await canonicalCharacterService.bootstrapFoundingCharacters();
    const storage = await durableStorageOpsService.health();
    const selfTestPassed = Boolean(
      await studioSettingsService.getJson<string | null>('STORAGE_SELF_TEST_OK', null),
    );
    const [pipReady, goatReady] = await Promise.all([
      canonicalCharacterService.readinessMatrix(FOUNDING_CODES.PIP),
      canonicalCharacterService.readinessMatrix(FOUNDING_CODES.GOAT),
    ]);
    const blender = await this.blenderPanel();
    const meadow = await prisma.location.findFirst({ where: { internalCode: MEADOW_CODE } });
    const propBundle = await propOnboardingService.ensureMapPropProfile();
    const meadowBlend = meadow
      ? await prisma.productionAssetIntake.findFirst({
          where: {
            entityType: 'location',
            entityId: meadow.id,
            kind: 'LOCATION_BLEND',
            storageLocation: { not: null },
          },
        })
      : null;
    const pip = await prisma.character.findUniqueOrThrow({
      where: { internalCode: FOUNDING_CODES.PIP },
    });
    const goat = await prisma.character.findUniqueOrThrow({
      where: { internalCode: FOUNDING_CODES.GOAT },
    });
    const [pipVoice, goatVoice, pipFacial, goatFacial] = await Promise.all([
      prisma.voiceProductionConfig.findUnique({ where: { characterId: pip.id } }),
      prisma.voiceProductionConfig.findUnique({ where: { characterId: goat.id } }),
      prisma.characterFacialControlMap.findFirst({
        where: { characterId: pip.id },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.characterFacialControlMap.findFirst({
        where: { characterId: goat.id },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const checklist = await episodeReadinessAggregator.buildChecklist(VERTICAL_SLICE_EPISODE_ID);
    const draftReview = await prisma.draftReview.findFirst({
      where: { episodeId: VERTICAL_SLICE_EPISODE_ID },
      orderBy: { createdAt: 'desc' },
    });

    const storageState: SetupState =
      storage.durable && selfTestPassed
        ? 'READY'
        : storage.configured && !storage.durable
          ? 'WARNING'
          : 'ACTION_REQUIRED';

    const refState = (ready: string): SetupState =>
      String(ready).startsWith('READY') ? 'READY' : 'ACTION_REQUIRED';

    const modelState = (ready: string): SetupState => {
      if (String(ready).startsWith('READY')) return 'READY';
      if (String(ready).includes('CANDIDATE')) return 'WARNING';
      return 'ACTION_REQUIRED';
    };

    const facialState = (map: { approved: boolean; requiredComplete: boolean } | null): SetupState => {
      if (!map) return 'BLOCKED';
      if (map.approved && map.requiredComplete) return 'READY';
      if (map) return 'ACTION_REQUIRED';
      return 'BLOCKED';
    };

    const voiceState = (v: { approved: boolean; voiceId: string | null } | null): SetupState => {
      if (v?.approved) return 'READY';
      if (v?.voiceId) return 'WARNING';
      return 'ACTION_REQUIRED';
    };

    const blenderState: SetupState = blender.blenderInstalled
      ? blender.selfTestOk && blender.eeveeAvailable
        ? 'READY'
        : 'WARNING'
      : 'ACTION_REQUIRED';

    const meadowState: SetupState = meadowBlend
      ? 'WARNING'
      : 'ACTION_REQUIRED';

    const propsState: SetupState = propBundle?.profile.productionReady
      ? 'READY'
      : propBundle?.profile
        ? 'ACTION_REQUIRED'
        : 'BLOCKED';

    const draftState: SetupState = checklist.draftEnabled
      ? draftReview?.status === 'APPROVED'
        ? 'READY'
        : draftReview
          ? 'WARNING'
          : 'ACTION_REQUIRED'
      : 'BLOCKED';

    const productionReadyState: SetupState =
      checklist.canGenerateFinal && draftReview?.status === 'APPROVED' ? 'READY' : 'BLOCKED';

    const missingStorage = storage.requiredConfig;

    const steps: SetupStep[] = [
      {
        id: 'durable-storage',
        order: 1,
        title: 'DURABLE STORAGE',
        state: storageState,
        summary:
          storageState === 'READY'
            ? 'S3-compatible storage configured and self-tested.'
            : storage.durable
              ? 'Storage configured — run TEST STORAGE to verify write/read/hash/delete.'
              : 'Local/ephemeral storage is not production-safe. Configure S3-compatible secrets.',
        actionLabel: storageState === 'READY' ? 'VIEW STORAGE' : 'TEST STORAGE',
        href: '/production-setup#storage',
        details: storage.durable ? undefined : missingStorage,
      },
      {
        id: 'pip-reference',
        order: 2,
        title: 'PIP REFERENCE',
        state: refState(pipReady.primaryReference),
        summary: String(pipReady.primaryReference),
        actionLabel:
          refState(pipReady.primaryReference) === 'READY'
            ? 'VIEW PIP REFERENCE'
            : 'UPLOAD PIP REFERENCE',
        href: '/asset-intake#pip',
      },
      {
        id: 'goat-reference',
        order: 3,
        title: 'GOAT REFERENCE',
        state: refState(goatReady.primaryReference),
        summary: String(goatReady.primaryReference),
        actionLabel:
          refState(goatReady.primaryReference) === 'READY'
            ? 'VIEW GOAT REFERENCE'
            : 'UPLOAD GOAT REFERENCE',
        href: '/asset-intake#goat',
      },
      {
        id: 'pip-model',
        order: 4,
        title: 'PIP 3D MODEL',
        state: modelState(pipReady.productionModel),
        summary: String(pipReady.productionModel),
        actionLabel: 'ADD PIP MODEL',
        href: '/asset-intake#pip',
      },
      {
        id: 'goat-model',
        order: 5,
        title: 'GOAT 3D MODEL',
        state: modelState(goatReady.productionModel),
        summary: String(goatReady.productionModel),
        actionLabel: 'ADD GOAT MODEL',
        href: '/asset-intake#goat',
      },
      {
        id: 'pip-rig-facial',
        order: 6,
        title: 'PIP RIG/FACIAL',
        state:
          pipReady.rig === 'READY' && pipReady.facialRig === 'READY' && pipReady.lipSync === 'READY'
            ? 'READY'
            : facialState(pipFacial),
        summary: `Rig ${pipReady.rig} · Facial ${pipReady.facialRig} · Lip sync ${pipReady.lipSync}`,
        actionLabel: 'OPEN PIP FACIAL MAPPING',
        href: `/facial-mapping/${FOUNDING_CODES.PIP}`,
      },
      {
        id: 'goat-rig-facial',
        order: 7,
        title: 'GOAT RIG/FACIAL',
        state:
          goatReady.rig === 'READY' &&
          goatReady.facialRig === 'READY' &&
          goatReady.lipSync === 'READY'
            ? 'READY'
            : facialState(goatFacial),
        summary: `Rig ${goatReady.rig} · Facial ${goatReady.facialRig} · Lip sync ${goatReady.lipSync}`,
        actionLabel: 'OPEN GOAT FACIAL MAPPING',
        href: `/facial-mapping/${FOUNDING_CODES.GOAT}`,
      },
      {
        id: 'pip-voice',
        order: 8,
        title: 'PIP VOICE',
        state: voiceState(pipVoice),
        summary: pipVoice?.approved
          ? 'Approved voice locked'
          : pipVoice?.voiceId
            ? 'Voice configured — approve after audition'
            : 'Configure and approve Pip voice',
        actionLabel: 'CONFIGURE PIP VOICE',
        href: '/voices',
      },
      {
        id: 'goat-voice',
        order: 9,
        title: 'GOAT VOICE',
        state: voiceState(goatVoice),
        summary: goatVoice?.approved
          ? 'Approved voice locked'
          : goatVoice?.voiceId
            ? 'Voice configured — approve after audition'
            : 'Configure and approve Goat voice',
        actionLabel: 'CONFIGURE GOAT VOICE',
        href: '/voices',
      },
      {
        id: 'blender-worker',
        order: 10,
        title: 'BLENDER WORKER',
        state: blenderState,
        summary: blender.blenderInstalled
          ? `Blender ${blender.version ?? ''} · EEVEE ${blender.eeveeAvailable ? 'YES' : 'NO'} · FFmpeg ${blender.ffmpegAvailable ? 'YES' : 'NO'} · self-test ${blender.selfTestOk ? 'OK' : 'NEEDED'}`
          : 'Blender not installed or not detected',
        actionLabel: 'CONNECT BLENDER',
        href: '/production-setup#blender',
      },
      {
        id: 'meadow',
        order: 11,
        title: 'MEADOW ENVIRONMENT',
        state: meadowState,
        summary: meadowBlend
          ? 'Meadow blend uploaded — validate EEVEE / 1080×1920 before lock'
          : 'Upload real Meadow .blend + lighting/textures',
        actionLabel: 'ADD MEADOW',
        href: '/asset-intake#meadow',
      },
      {
        id: 'props',
        order: 12,
        title: 'FIRST-EPISODE PROPS',
        state: propsState,
        summary: propBundle?.profile.productionReady
          ? 'Adventure Map prop READY'
          : propBundle?.profile.blockedReason ?? `Upload ${MAP_PROP_CODE}`,
        actionLabel: 'ADD PROPS',
        href: '/asset-intake#props',
      },
      {
        id: 'draft-render',
        order: 13,
        title: 'DRAFT RENDER TEST',
        state: draftState,
        summary: checklist.draftEnabled
          ? draftReview
            ? `Draft review ${draftReview.status}`
            : 'Assets ready — generate cheapest draft first (not FINAL_1080P)'
          : 'Blocked until storage, characters, voices, Blender, Meadow, props are ready',
        actionLabel: checklist.draftEnabled ? 'GENERATE FIRST DRAFT' : 'OPEN EPISODE READINESS',
        href: `/episodes/${VERTICAL_SLICE_EPISODE_ID}/readiness`,
      },
      {
        id: 'production-ready',
        order: 14,
        title: 'PRODUCTION READY',
        state: productionReadyState,
        summary: checklist.canGenerateFinal
          ? 'Draft approved — render only approved shots at FINAL_1080P / 1080×1920 / 30 FPS / EEVEE'
          : 'Final locked until draft approval + all STRICT gates',
        actionLabel: 'REVIEW DRAFT / FINAL',
        href: `/episodes/${VERTICAL_SLICE_EPISODE_ID}/draft-review`,
      },
    ];

    const primary =
      steps.find((s) => s.state === 'ACTION_REQUIRED' || s.state === 'BLOCKED' || s.state === 'WARNING') ??
      steps[steps.length - 1]!;

    const primaryLabelMap: Record<string, string> = {
      'durable-storage': storage.durable ? 'TEST STORAGE' : 'CONFIGURE STORAGE',
      'pip-reference': 'UPLOAD PIP REFERENCE',
      'goat-reference': 'UPLOAD GOAT REFERENCE',
      'pip-model': 'ADD PIP MODEL',
      'goat-model': 'ADD GOAT MODEL',
      'pip-rig-facial': 'OPEN PIP FACIAL MAPPING',
      'goat-rig-facial': 'OPEN GOAT FACIAL MAPPING',
      'pip-voice': 'CONFIGURE VOICES',
      'goat-voice': 'CONFIGURE VOICES',
      'blender-worker': 'CONNECT BLENDER',
      meadow: 'ADD MEADOW',
      props: 'ADD PROPS',
      'draft-render': checklist.draftEnabled ? 'GENERATE FIRST DRAFT' : 'OPEN EPISODE READINESS',
      'production-ready': 'RENDER FINAL',
    };

    return {
      steps,
      primaryAction: {
        label: primaryLabelMap[primary.id] ?? primary.actionLabel,
        href: primary.href,
        reason: primary.summary,
      },
      episodeId: VERTICAL_SLICE_EPISODE_ID,
      draftEnabled: checklist.draftEnabled,
      philosophy:
        'Extremely high quality · 1080×1920 · 30 FPS · Blender-first · EEVEE-first · reuse locked assets · paid AI video OFF',
    };
  }

  buildModelingPackage(characterCode: string) {
    const dna =
      characterCode === FOUNDING_CODES.PIP
        ? PIP_CANONICAL_DNA
        : characterCode === FOUNDING_CODES.GOAT
          ? GOAT_CANONICAL_DNA
          : null;
    if (!dna) {
      throw new AppError('Unknown founding character', 'UNKNOWN_CHARACTER', 404);
    }
    const name = characterCode === FOUNDING_CODES.PIP ? 'Pip' : 'Goat';
    return {
      packageType: 'MODELING_SPECIFICATION',
      notABlendFile: true,
      disclaimer:
        'This package is a modeling specification for a Blender artist / 3D service. It is NOT a .blend model and must never be treated as a production character asset.',
      character: { name, code: characterCode },
      costPhilosophy: {
        optimizeFor: 'HIGH UPFRONT CHARACTER QUALITY · VERY LOW PER-EPISODE COST',
        note: 'Do not sacrifice character quality to save a few dollars during model creation. Once approved, reuse the same canonical models across episodes.',
      },
      styleLock: SHARED_VISUAL_STYLE_LOCK,
      modelingBrief: {
        species: dna.species,
        personalityVisual: dna.body.personalityVisual,
        delivery: SHARED_VISUAL_STYLE_LOCK.finalDelivery,
      },
      proportionGuide: dna.body.proportions,
      materialGuide: {
        primaryColor: dna.body.primaryColor,
        surface: dna.body.surface,
        head: dna.head,
        appendages: dna.appendages,
      },
      textureRequirements: [
        'High-quality tactile materials suitable for EEVEE',
        'Soft short fur/feather look — not plastic',
        'Readable on mobile 1080×1920 screens',
        'Consistent albedo / roughness / normal as needed',
      ],
      topologyRequirements: [
        'Clean deformation-friendly topology',
        'Stable silhouette from FRONT / THREE_QUARTER / SIDE / BACK',
        'Facial area dense enough for expressions + visemes',
        'Avoid photoreal / low-poly / uncanny drift',
      ],
      rigRequirements: dna.rigControls,
      facialRequirements: [...REQUIRED_SEMANTIC_FACIAL_CORE],
      visemeRequirements: [...REQUIRED_VISEMES],
      accessoryRequirements: dna.accessories,
      eeveeRequirements: [
        'EEVEE-compatible materials and lighting response',
        'Soft shadows / cinematic but friendly look',
        'Stable at 1080×1920 @ 30 FPS',
      ],
      testPoseRequirements: [...CHARACTER_TEST_POSES, ...EXTENDED_CHARACTER_TEST_POSES.filter((p) => !(CHARACTER_TEST_POSES as readonly string[]).includes(p))],
      canonicalLockedTraits: dna,
      forbiddenDrift: dna.forbiddenDrift,
      acceptanceChecklist: [
        'Matches approved PRIMARY_CANONICAL_REFERENCE silhouette',
        'Proportions match DNA',
        'Eyes / comb or horns / beak or nose correct',
        'Materials and surface match tactile style lock',
        'Accessories present and independently controllable where required',
        'Armature + facial + visemes mapped',
        'Blender EEVEE test renders pass side-by-side comparison',
        'Manual approval recorded — never auto PRODUCTION_READY',
      ],
      semanticFacialAlias: REQUIRED_SEMANTIC_FACIAL,
      minimumVisemesAlias: MINIMUM_VISEMES,
      generatedAt: new Date().toISOString(),
    };
  }

  async exportModelingPackage(characterCode: string) {
    const pack = this.buildModelingPackage(characterCode);
    const bytes = new TextEncoder().encode(JSON.stringify(pack, null, 2));
    const stored = await productionStorageService.storeUpload({
      category: 'reports',
      parts: ['modeling-packages', characterCode, Date.now(), `${characterCode}-modeling-package.json`],
      bytes,
      contentType: 'application/json',
      originalName: `${characterCode}-modeling-package.json`,
      metadata: { kind: 'MODELING_SPECIFICATION', notABlendFile: true },
    });
    const md = this.modelingPackageMarkdown(pack);
    const mdBytes = new TextEncoder().encode(md);
    const mdStored = await productionStorageService.storeUpload({
      category: 'reports',
      parts: ['modeling-packages', characterCode, Date.now(), `${characterCode}-modeling-package.md`],
      bytes: mdBytes,
      contentType: 'text/markdown',
      originalName: `${characterCode}-modeling-package.md`,
      metadata: { kind: 'MODELING_SPECIFICATION_MARKDOWN', notABlendFile: true },
    });
    return { package: pack, json: stored, markdown: mdStored };
  }

  modelingPackageMarkdown(pack: ReturnType<ProductionSetupService['buildModelingPackage']>) {
    return [
      `# ${pack.character.name} Modeling Package`,
      '',
      `> ${pack.disclaimer}`,
      '',
      `Code: ${pack.character.code}`,
      '',
      '## Cost philosophy',
      pack.costPhilosophy.optimizeFor,
      pack.costPhilosophy.note,
      '',
      '## Modeling brief',
      `- Species: ${pack.modelingBrief.species}`,
      `- Delivery: ${JSON.stringify(pack.modelingBrief.delivery)}`,
      '',
      '## Proportion guide',
      pack.proportionGuide,
      '',
      '## Material guide',
      '```json',
      JSON.stringify(pack.materialGuide, null, 2),
      '```',
      '',
      '## Texture requirements',
      ...pack.textureRequirements.map((x) => `- ${x}`),
      '',
      '## Topology requirements',
      ...pack.topologyRequirements.map((x) => `- ${x}`),
      '',
      '## Rig requirements',
      ...pack.rigRequirements.map((x) => `- ${x}`),
      '',
      '## Facial requirements',
      ...pack.facialRequirements.map((x) => `- ${x}`),
      '',
      '## Viseme requirements',
      ...pack.visemeRequirements.map((x) => `- ${x}`),
      '',
      '## Accessory requirements',
      '```json',
      JSON.stringify(pack.accessoryRequirements, null, 2),
      '```',
      '',
      '## EEVEE requirements',
      ...pack.eeveeRequirements.map((x) => `- ${x}`),
      '',
      '## Test poses',
      ...pack.testPoseRequirements.map((x) => `- ${x}`),
      '',
      '## Forbidden drift',
      ...pack.forbiddenDrift.map((x) => `- ${x}`),
      '',
      '## Acceptance checklist',
      ...pack.acceptanceChecklist.map((x) => `- [ ] ${x}`),
      '',
    ].join('\n');
  }
}

export const productionSetupService = new ProductionSetupService();
