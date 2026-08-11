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

  console.log('Seed complete:', {
    universe: universe.name,
    pip: pip.internalCode,
    goat: goat.internalCode,
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
