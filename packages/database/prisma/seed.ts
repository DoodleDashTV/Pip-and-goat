import { PrismaClient, AssetType, CanonLevel, CanonSubjectType, CharacterModelStatus } from '@prisma/client';

const prisma = new PrismaClient();

const UNIVERSE_ID = '11111111-1111-4111-8111-111111111111';
const PIP_ID = '22222222-2222-4222-8222-222222222222';
const GOAT_ID = '33333333-3333-4333-8333-333333333333';
const PIP_VERSION_ID = '44444444-4444-4444-8444-444444444444';
const GOAT_VERSION_ID = '55555555-5555-4555-8555-555555555555';

async function seed() {
  const universe = await prisma.universe.upsert({
    where: { id: UNIVERSE_ID },
    update: {},
    create: {
      id: UNIVERSE_ID,
      name: 'Doodle Dash Universe',
      brandName: 'Doodle Dash TV',
      description:
        'Persistent kids adventure universe for connected Doodle Dash TV seasons and episodes.',
      targetAudience: 'Kids and families',
      worldDescription:
        'A colorful adventure world where curiosity, friendship, and gentle comedy drive short-form stories.',
      defaultOutputFormat: '1080x1920',
      status: 'ACTIVE',
    },
  });

  const pip = await prisma.character.upsert({
    where: { internalCode: 'CHAR_PIP_001' },
    update: {
      foundingCharacter: true,
      name: 'Pip',
    },
    create: {
      id: PIP_ID,
      universeId: universe.id,
      internalCode: 'CHAR_PIP_001',
      name: 'Pip',
      nickname: 'Pip',
      species: 'Pending reference approval',
      role: 'Founding protagonist',
      ageRange: 'Child',
      biography: 'Founding Doodle Dash character. Visual identity pending approved references.',
      personality: 'Curious, friendly, and eager to explore.',
      foundingCharacter: true,
      status: 'ACTIVE',
      currentVersionId: PIP_VERSION_ID,
    },
  });

  const goat = await prisma.character.upsert({
    where: { internalCode: 'CHAR_GOAT_001' },
    update: {
      foundingCharacter: true,
      name: 'Goat',
    },
    create: {
      id: GOAT_ID,
      universeId: universe.id,
      internalCode: 'CHAR_GOAT_001',
      name: 'Goat',
      nickname: 'Goat',
      species: 'Goat',
      role: 'Founding companion',
      ageRange: 'Child',
      biography: 'Founding Doodle Dash character. Visual identity pending approved references.',
      personality: 'Loyal, playful, and steady.',
      foundingCharacter: true,
      status: 'ACTIVE',
      currentVersionId: GOAT_VERSION_ID,
    },
  });

  await prisma.characterVersion.upsert({
    where: {
      characterId_versionNumber: { characterId: pip.id, versionNumber: 1 },
    },
    update: {},
    create: {
      id: PIP_VERSION_ID,
      characterId: pip.id,
      versionNumber: 1,
      versionName: 'Pip v1',
      changeSummary: 'Initial registry version. No production 3D model yet.',
      approved: false,
    },
  });

  await prisma.characterVersion.upsert({
    where: {
      characterId_versionNumber: { characterId: goat.id, versionNumber: 1 },
    },
    update: {},
    create: {
      id: GOAT_VERSION_ID,
      characterId: goat.id,
      versionNumber: 1,
      versionName: 'Goat v1',
      changeSummary: 'Initial registry version. No production 3D model yet.',
      approved: false,
    },
  });

  await prisma.character.update({
    where: { id: pip.id },
    data: { currentVersionId: PIP_VERSION_ID },
  });
  await prisma.character.update({
    where: { id: goat.id },
    data: { currentVersionId: GOAT_VERSION_ID },
  });

  // Personality defaults are editable baselines — not locked story inventions.
  await prisma.characterPersonalityDna.upsert({
    where: { characterId: pip.id },
    update: {},
    create: {
      characterId: pip.id,
      friendliness: 80,
      confidence: 55,
      bravery: 60,
      curiosity: 90,
      patience: 45,
      energy: 75,
      empathy: 70,
      leadership: 50,
      independence: 55,
      impulsiveness: 60,
      humor: 65,
      temperament: 'Bright and exploratory',
      notes: 'Default editable baseline pending story bible approval.',
    },
  });

  await prisma.characterPersonalityDna.upsert({
    where: { characterId: goat.id },
    update: {},
    create: {
      characterId: goat.id,
      friendliness: 75,
      confidence: 60,
      bravery: 55,
      curiosity: 65,
      patience: 70,
      energy: 60,
      empathy: 75,
      leadership: 45,
      independence: 50,
      impulsiveness: 40,
      humor: 60,
      temperament: 'Warm and steady',
      notes: 'Default editable baseline pending story bible approval.',
    },
  });

  await prisma.characterVisualDna.upsert({
    where: { characterId: pip.id },
    update: {},
    create: {
      characterId: pip.id,
      visualRestrictions: 'Do not invent final silhouette, palette, or costume until references are approved.',
      pendingReview: true,
    },
  });

  await prisma.characterVisualDna.upsert({
    where: { characterId: goat.id },
    update: {},
    create: {
      characterId: goat.id,
      visualRestrictions: 'Do not invent final silhouette, palette, or costume until references are approved.',
      pendingReview: true,
    },
  });

  await prisma.characterMotionDna.upsert({
    where: { characterId: pip.id },
    update: {},
    create: { characterId: pip.id, pendingReview: true },
  });
  await prisma.characterMotionDna.upsert({
    where: { characterId: goat.id },
    update: {},
    create: { characterId: goat.id, pendingReview: true },
  });

  await prisma.characterVoiceDna.upsert({
    where: { characterId: pip.id },
    update: {},
    create: {
      characterId: pip.id,
      voiceProfile: 'Pip permanent voice slot (provider ID pending approval)',
      providerType: null,
      providerVoiceId: null,
      pendingReview: true,
    },
  });
  await prisma.characterVoiceDna.upsert({
    where: { characterId: goat.id },
    update: {},
    create: {
      characterId: goat.id,
      voiceProfile: 'Goat permanent voice slot (provider ID pending approval)',
      providerType: null,
      providerVoiceId: null,
      pendingReview: true,
    },
  });

  await prisma.characterStoryDna.upsert({
    where: { characterId: pip.id },
    update: {},
    create: {
      characterId: pip.id,
      coreDesire: 'Discover and share adventures',
      mainFear: 'Being left out',
      longTermGoal: 'Grow into a brave friend',
      growthDirection: 'Courage through curiosity',
      weakness: 'Impulsiveness',
      importantRelationships: 'Goat (founding companion)',
      pendingReview: true,
    },
  });
  await prisma.characterStoryDna.upsert({
    where: { characterId: goat.id },
    update: {},
    create: {
      characterId: goat.id,
      coreDesire: 'Protect friendship and have fun',
      mainFear: 'Letting friends down',
      longTermGoal: 'Be a dependable companion',
      growthDirection: 'Confidence through loyalty',
      weakness: 'Caution that can slow adventure',
      importantRelationships: 'Pip (founding companion)',
      pendingReview: true,
    },
  });

  const existingPipModel = await prisma.character3dModel.findFirst({
    where: { characterId: pip.id, modelName: 'Pip Production Master' },
  });
  if (!existingPipModel) {
    await prisma.character3dModel.create({
      data: {
        characterId: pip.id,
        characterVersionId: PIP_VERSION_ID,
        modelName: 'Pip Production Master',
        status: CharacterModelStatus.MISSING,
        approved: false,
        productionReady: false,
      },
    });
  }

  const existingGoatModel = await prisma.character3dModel.findFirst({
    where: { characterId: goat.id, modelName: 'Goat Production Master' },
  });
  if (!existingGoatModel) {
    await prisma.character3dModel.create({
      data: {
        characterId: goat.id,
        characterVersionId: GOAT_VERSION_ID,
        modelName: 'Goat Production Master',
        status: CharacterModelStatus.MISSING,
        approved: false,
        productionReady: false,
      },
    });
  }

  await prisma.asset.deleteMany({
    where: {
      universeId: universe.id,
      entityId: { in: [pip.id, goat.id] },
      type: AssetType.CHARACTER_MODEL,
    },
  });

  await prisma.asset.createMany({
    data: [
      {
        universeId: universe.id,
        type: AssetType.CHARACTER_MODEL,
        entityType: 'character',
        entityId: pip.id,
        name: 'Pip master .blend',
        version: 1,
        missing: true,
        approved: false,
        notes: 'MISSING — no real Blender asset uploaded yet.',
      },
      {
        universeId: universe.id,
        type: AssetType.CHARACTER_MODEL,
        entityType: 'character',
        entityId: goat.id,
        name: 'Goat master .blend',
        version: 1,
        missing: true,
        approved: false,
        notes: 'MISSING — no real Blender asset uploaded yet.',
      },
    ],
  });

  const foundingCanon = [
    {
      subjectType: CanonSubjectType.UNIVERSE,
      subjectId: universe.id,
      category: 'brand',
      statement: 'The show brand is Doodle Dash TV.',
      canonLevel: CanonLevel.IMMUTABLE,
      importance: 100,
      locked: true,
    },
    {
      subjectType: CanonSubjectType.CHARACTER,
      subjectId: pip.id,
      category: 'founding',
      statement: 'Pip is a founding character of the Doodle Dash Universe (CHAR_PIP_001).',
      canonLevel: CanonLevel.IMMUTABLE,
      importance: 100,
      locked: true,
    },
    {
      subjectType: CanonSubjectType.CHARACTER,
      subjectId: goat.id,
      category: 'founding',
      statement: 'Goat is a founding character of the Doodle Dash Universe (CHAR_GOAT_001).',
      canonLevel: CanonLevel.IMMUTABLE,
      importance: 100,
      locked: true,
    },
    {
      subjectType: CanonSubjectType.GENERAL,
      subjectId: null,
      category: 'production',
      statement:
        'Native 3D production uses permanent reusable assets. Generative video providers are optional supplemental tools only.',
      canonLevel: CanonLevel.CURRENT,
      importance: 90,
      locked: true,
    },
  ];

  for (const fact of foundingCanon) {
    const existing = await prisma.canonFact.findFirst({
      where: {
        universeId: universe.id,
        statement: fact.statement,
      },
    });
    if (!existing) {
      await prisma.canonFact.create({
        data: {
          universeId: universe.id,
          ...fact,
        },
      });
    }
  }

  await prisma.studioSetting.upsert({
    where: { key: 'STRICT_CHARACTER_LOCK' },
    update: { value: true },
    create: { key: 'STRICT_CHARACTER_LOCK', value: true },
  });

  async function ensureRig(params: {
    characterId: string;
    versionId: string;
    name: string;
    supportsEars?: boolean;
    supportsTail?: boolean;
  }) {
    const existing = await prisma.characterRig.findFirst({
      where: { characterId: params.characterId, rigVersion: 'v1' },
    });
    if (existing) return existing;
    return prisma.characterRig.create({
      data: {
        characterId: params.characterId,
        characterVersionId: params.versionId,
        rigVersion: 'v1',
        skeletonType: 'biped_cartoon',
        boneMap: {
          feet: true,
          hands: true,
          head: true,
          eyes: true,
          spine: true,
          ears: Boolean(params.supportsEars),
          tail: Boolean(params.supportsTail),
        },
        ikConfiguration: { feet: true, hands: true },
        controlRig: { status: 'MISSING' },
        supportsEars: Boolean(params.supportsEars),
        supportsTail: Boolean(params.supportsTail),
        status: 'MISSING',
        approved: false,
      },
    });
  }

  async function ensureFacialRig(params: {
    characterId: string;
    versionId: string;
  }) {
    const existing = await prisma.characterFacialRig.findFirst({
      where: { characterId: params.characterId, rigVersion: 'v1' },
    });
    if (existing) return existing;
    return prisma.characterFacialRig.create({
      data: {
        characterId: params.characterId,
        characterVersionId: params.versionId,
        rigVersion: 'v1',
        shapeKeys: [],
        facialBones: [],
        visemes: ['A', 'E', 'I', 'O', 'U', 'M_B_P', 'F_V', 'L', 'TH', 'REST'],
        supportedExpressions: [
          'neutral',
          'happy',
          'sad',
          'surprised',
          'afraid',
          'confused',
          'curious',
          'determined',
          'angry',
          'laughing',
          'worried',
        ],
        status: 'MISSING',
        approved: false,
      },
    });
  }

  const pipRig = await ensureRig({
    characterId: pip.id,
    versionId: PIP_VERSION_ID,
    name: 'Pip',
  });
  const goatRig = await ensureRig({
    characterId: goat.id,
    versionId: GOAT_VERSION_ID,
    name: 'Goat',
    supportsEars: true,
    supportsTail: true,
  });
  const pipFacial = await ensureFacialRig({
    characterId: pip.id,
    versionId: PIP_VERSION_ID,
  });
  const goatFacial = await ensureFacialRig({
    characterId: goat.id,
    versionId: GOAT_VERSION_ID,
  });

  await prisma.character3dModel.updateMany({
    where: { characterId: pip.id, modelName: 'Pip Production Master' },
    data: {
      rigId: pipRig.id,
      facialRigId: pipFacial.id,
      status: CharacterModelStatus.MISSING,
      approved: false,
      productionReady: false,
      notes: 'No real .blend/.fbx/.glb uploaded. Status remains MISSING.',
    },
  });
  await prisma.character3dModel.updateMany({
    where: { characterId: goat.id, modelName: 'Goat Production Master' },
    data: {
      rigId: goatRig.id,
      facialRigId: goatFacial.id,
      status: CharacterModelStatus.MISSING,
      approved: false,
      productionReady: false,
      notes: 'No real .blend/.fbx/.glb uploaded. Status remains MISSING.',
    },
  });

  // Reference registry placeholders — PENDING_REVIEW, no invented approved looks.
  for (const character of [pip, goat]) {
    const existingRef = await prisma.characterReferenceImage.findFirst({
      where: {
        characterId: character.id,
        title: `${character.name} primary reference slot`,
      },
    });
    if (!existingRef) {
      await prisma.characterReferenceImage.create({
        data: {
          universeId: universe.id,
          characterId: character.id,
          characterVersionId:
            character.id === pip.id ? PIP_VERSION_ID : GOAT_VERSION_ID,
          title: `${character.name} primary reference slot`,
          viewType: 'turnaround',
          reviewStatus: 'PENDING_REVIEW',
          isPrimary: true,
          notes:
            'Slot reserved. Upload approved reference images before locking visual DNA.',
        },
      });
    }
  }

  const animations: Array<{
    code: string;
    name: string;
    category:
      | 'LOCOMOTION'
      | 'DIALOGUE'
      | 'REACTION'
      | 'INTERACTION'
      | 'EMOTIONAL'
      | 'IDLE';
    loopable?: boolean;
    emotion?: string;
  }> = [
    { code: 'walk', name: 'Walk', category: 'LOCOMOTION', loopable: true },
    { code: 'run', name: 'Run', category: 'LOCOMOTION', loopable: true },
    { code: 'jump', name: 'Jump', category: 'LOCOMOTION' },
    { code: 'land', name: 'Land', category: 'LOCOMOTION' },
    { code: 'turn', name: 'Turn', category: 'LOCOMOTION' },
    { code: 'sit', name: 'Sit', category: 'IDLE' },
    { code: 'stand', name: 'Stand', category: 'IDLE', loopable: true },
    { code: 'point', name: 'Point', category: 'INTERACTION' },
    { code: 'wave', name: 'Wave', category: 'INTERACTION' },
    { code: 'pick_up', name: 'Pick Up', category: 'INTERACTION' },
    { code: 'put_down', name: 'Put Down', category: 'INTERACTION' },
    { code: 'laugh', name: 'Laugh', category: 'EMOTIONAL', emotion: 'happy' },
    { code: 'celebrate', name: 'Celebrate', category: 'EMOTIONAL', emotion: 'excited' },
    { code: 'talk_calm', name: 'Talk Calm', category: 'DIALOGUE', loopable: true },
    {
      code: 'talk_excited',
      name: 'Talk Excited',
      category: 'DIALOGUE',
      loopable: true,
      emotion: 'excited',
    },
    { code: 'listen', name: 'Listen', category: 'DIALOGUE', loopable: true },
    { code: 'nod', name: 'Nod', category: 'REACTION' },
    {
      code: 'scared_idle',
      name: 'Scared Idle',
      category: 'IDLE',
      loopable: true,
      emotion: 'afraid',
    },
    {
      code: 'happy_idle',
      name: 'Happy Idle',
      category: 'IDLE',
      loopable: true,
      emotion: 'happy',
    },
  ];

  for (const animation of animations) {
    await prisma.animationDefinition.upsert({
      where: {
        universeId_code: { universeId: universe.id, code: animation.code },
      },
      update: {},
      create: {
        universeId: universe.id,
        code: animation.code,
        name: animation.name,
        category: animation.category,
        loopable: animation.loopable ?? false,
        emotion: animation.emotion,
        status: 'MISSING',
        approved: false,
        notes: 'Definition only — animation file not uploaded.',
      },
    });
  }

  const poses = [
    'standing_neutral',
    'standing_confident',
    'standing_nervous',
    'pointing',
    'waving',
    'sitting',
    'thinking',
    'surprised',
    'celebrating',
    'scared',
  ];
  for (const code of poses) {
    await prisma.poseDefinition.upsert({
      where: { universeId_code: { universeId: universe.id, code } },
      update: {},
      create: {
        universeId: universe.id,
        code,
        name: code
          .split('_')
          .map((part) => part[0]!.toUpperCase() + part.slice(1))
          .join(' '),
        status: 'MISSING',
        approved: false,
        notes: 'Pose definition only — no pose asset file yet.',
      },
    });
  }

  const expressions = [
    'neutral',
    'happy',
    'very_happy',
    'sad',
    'surprised',
    'afraid',
    'confused',
    'curious',
    'determined',
    'angry',
    'laughing',
    'worried',
  ];
  for (const code of expressions) {
    await prisma.expressionDefinition.upsert({
      where: { universeId_code: { universeId: universe.id, code } },
      update: {},
      create: {
        universeId: universe.id,
        code,
        name: code
          .split('_')
          .map((part) => part[0]!.toUpperCase() + part.slice(1))
          .join(' '),
        status: 'MISSING',
        approved: false,
        notes: 'Expression definition only — facial asset pending.',
      },
    });
  }

  const visemes = [
    ['A', 'Viseme A'],
    ['E', 'Viseme E'],
    ['I', 'Viseme I'],
    ['O', 'Viseme O'],
    ['U', 'Viseme U'],
    ['M_B_P', 'Viseme M/B/P'],
    ['F_V', 'Viseme F/V'],
    ['L', 'Viseme L'],
    ['TH', 'Viseme TH'],
    ['REST', 'Viseme Rest'],
  ] as const;
  for (const [code, name] of visemes) {
    await prisma.visemeDefinition.upsert({
      where: { code },
      update: {},
      create: { code, name, notes: 'Standard lip-sync viseme target.' },
    });
  }

  // Milestone 3-5: development baselines + Pip↔Goat relationship (neutral defaults).
  await prisma.characterDevelopment.upsert({
    where: { characterId: pip.id },
    update: {},
    create: {
      characterId: pip.id,
      confidence: 55,
      courage: 60,
      patience: 45,
      empathy: 70,
      leadership: 50,
      independence: 55,
      curiosity: 90,
      responsibility: 50,
      notes: 'Founding baseline. Editable via story-referenced development events only.',
    },
  });
  await prisma.characterDevelopment.upsert({
    where: { characterId: goat.id },
    update: {},
    create: {
      characterId: goat.id,
      confidence: 60,
      courage: 55,
      patience: 70,
      empathy: 75,
      leadership: 45,
      independence: 50,
      curiosity: 65,
      responsibility: 65,
      notes: 'Founding baseline. Editable via story-referenced development events only.',
    },
  });

  const pipBaselineEvent = await prisma.characterDevelopmentEvent.findFirst({
    where: { characterId: pip.id, storyEventRef: 'SEED_FOUNDING_BASELINE' },
  });
  if (!pipBaselineEvent) {
    await prisma.characterDevelopmentEvent.create({
      data: {
        characterId: pip.id,
        attribute: 'curiosity',
        previousValue: 50,
        newValue: 90,
        delta: 40,
        storyEventRef: 'SEED_FOUNDING_BASELINE',
        summary: 'Initial registry baseline for Pip. Not an episode plot event.',
        approved: true,
      },
    });
  }

  const goatBaselineEvent = await prisma.characterDevelopmentEvent.findFirst({
    where: { characterId: goat.id, storyEventRef: 'SEED_FOUNDING_BASELINE' },
  });
  if (!goatBaselineEvent) {
    await prisma.characterDevelopmentEvent.create({
      data: {
        characterId: goat.id,
        attribute: 'empathy',
        previousValue: 50,
        newValue: 75,
        delta: 25,
        storyEventRef: 'SEED_FOUNDING_BASELINE',
        summary: 'Initial registry baseline for Goat. Not an episode plot event.',
        approved: true,
      },
    });
  }

  async function ensureRelationship(fromId: string, toId: string, label: string) {
    return prisma.characterRelationship.upsert({
      where: {
        fromCharacterId_toCharacterId: {
          fromCharacterId: fromId,
          toCharacterId: toId,
        },
      },
      update: {},
      create: {
        universeId: universe.id,
        fromCharacterId: fromId,
        toCharacterId: toId,
        trust: 70,
        friendship: 75,
        respect: 65,
        dependence: 55,
        tension: 15,
        rivalry: 5,
        familiarity: 80,
        label,
        notes: 'Neutral founding companion defaults. Adjust only via story-referenced events.',
      },
    });
  }

  const pipToGoat = await ensureRelationship(pip.id, goat.id, 'Pip → Goat');
  const goatToPip = await ensureRelationship(goat.id, pip.id, 'Goat → Pip');

  const existingRelEvent = await prisma.relationshipEvent.findFirst({
    where: {
      relationshipId: pipToGoat.id,
      storyEventRef: 'SEED_FOUNDING_RELATIONSHIP',
    },
  });
  if (!existingRelEvent) {
    await prisma.relationshipEvent.create({
      data: {
        relationshipId: pipToGoat.id,
        attribute: 'friendship',
        previousValue: 50,
        newValue: 75,
        delta: 25,
        storyEventRef: 'SEED_FOUNDING_RELATIONSHIP',
        summary: 'Founding companion relationship baseline.',
        approved: true,
      },
    });
  }

  console.log('Seed complete:', {
    universe: universe.name,
    pip: pip.internalCode,
    goat: goat.internalCode,
    animations: animations.length,
    poses: poses.length,
    expressions: expressions.length,
    relationships: [pipToGoat.label, goatToPip.label],
  });
}

seed()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
