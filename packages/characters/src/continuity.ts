import { prisma } from '@doodle-dash/database';
import { AppError } from '@doodle-dash/shared';
import { z } from 'zod';

const ScoreSchema = z.number().int().min(0).max(100);

export const DevelopmentAttributes = [
  'confidence',
  'courage',
  'patience',
  'empathy',
  'leadership',
  'independence',
  'curiosity',
  'responsibility',
] as const;

export type DevelopmentAttribute = (typeof DevelopmentAttributes)[number];

export const RelationshipAttributes = [
  'trust',
  'friendship',
  'respect',
  'dependence',
  'tension',
  'rivalry',
  'familiarity',
] as const;

export type RelationshipAttribute = (typeof RelationshipAttributes)[number];

const ApplyDevelopmentEventSchema = z.object({
  characterId: z.string().uuid(),
  attribute: z.enum(DevelopmentAttributes),
  newValue: ScoreSchema,
  storyEventRef: z.string().trim().min(1),
  episodeId: z.string().uuid().nullable().optional(),
  summary: z.string().nullable().optional(),
  approved: z.boolean().default(false),
});

const ApplyRelationshipEventSchema = z.object({
  relationshipId: z.string().uuid(),
  attribute: z.enum(RelationshipAttributes),
  newValue: ScoreSchema,
  storyEventRef: z.string().trim().min(1),
  episodeId: z.string().uuid().nullable().optional(),
  summary: z.string().nullable().optional(),
  approved: z.boolean().default(false),
});

export const UpdatePersonalityDnaSchema = z.object({
  friendliness: ScoreSchema.optional(),
  confidence: ScoreSchema.optional(),
  bravery: ScoreSchema.optional(),
  curiosity: ScoreSchema.optional(),
  patience: ScoreSchema.optional(),
  energy: ScoreSchema.optional(),
  empathy: ScoreSchema.optional(),
  leadership: ScoreSchema.optional(),
  independence: ScoreSchema.optional(),
  impulsiveness: ScoreSchema.optional(),
  humor: ScoreSchema.optional(),
  temperament: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const UpdateStoryDnaSchema = z.object({
  coreDesire: z.string().nullable().optional(),
  mainFear: z.string().nullable().optional(),
  longTermGoal: z.string().nullable().optional(),
  growthDirection: z.string().nullable().optional(),
  weakness: z.string().nullable().optional(),
  lesson: z.string().nullable().optional(),
  conflicts: z.string().nullable().optional(),
  importantRelationships: z.string().nullable().optional(),
  pendingReview: z.boolean().optional(),
});

export const UpdateVisualDnaSchema = z.object({
  bodyProportions: z.string().nullable().optional(),
  headRatio: z.string().nullable().optional(),
  faceShape: z.string().nullable().optional(),
  eyeDesign: z.string().nullable().optional(),
  bodyColoration: z.string().nullable().optional(),
  furFeatherDetails: z.string().nullable().optional(),
  clothing: z.string().nullable().optional(),
  accessories: z.string().nullable().optional(),
  silhouette: z.string().nullable().optional(),
  palette: z.string().nullable().optional(),
  materials: z.string().nullable().optional(),
  textures: z.string().nullable().optional(),
  visualRestrictions: z.string().nullable().optional(),
  pendingReview: z.boolean().optional(),
});

export class CharacterDnaService {
  async updatePersonality(characterId: string, input: z.infer<typeof UpdatePersonalityDnaSchema>) {
    const data = UpdatePersonalityDnaSchema.parse(input);
    return prisma.characterPersonalityDna.upsert({
      where: { characterId },
      update: data,
      create: { characterId, ...data },
    });
  }

  async updateStory(characterId: string, input: z.infer<typeof UpdateStoryDnaSchema>) {
    const data = UpdateStoryDnaSchema.parse(input);
    return prisma.characterStoryDna.upsert({
      where: { characterId },
      update: data,
      create: { characterId, ...data },
    });
  }

  async updateVisual(characterId: string, input: z.infer<typeof UpdateVisualDnaSchema>) {
    const data = UpdateVisualDnaSchema.parse(input);
    return prisma.characterVisualDna.upsert({
      where: { characterId },
      update: data,
      create: { characterId, ...data },
    });
  }

  async getBundle(characterId: string) {
    const [visual, personality, motion, voice, story] = await Promise.all([
      prisma.characterVisualDna.findUnique({ where: { characterId } }),
      prisma.characterPersonalityDna.findUnique({ where: { characterId } }),
      prisma.characterMotionDna.findUnique({ where: { characterId } }),
      prisma.characterVoiceDna.findUnique({ where: { characterId } }),
      prisma.characterStoryDna.findUnique({ where: { characterId } }),
    ]);
    return { visual, personality, motion, voice, story };
  }
}

export class CharacterDevelopmentService {
  async get(characterId: string) {
    return prisma.characterDevelopment.findUnique({ where: { characterId } });
  }

  async listEvents(characterId: string) {
    return prisma.characterDevelopmentEvent.findMany({
      where: { characterId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async applyEvent(input: z.infer<typeof ApplyDevelopmentEventSchema>) {
    const data = ApplyDevelopmentEventSchema.parse(input);
    if (!data.storyEventRef.trim()) {
      throw new AppError(
        'Development changes must reference an approved story event.',
        'STORY_EVENT_REQUIRED',
        400,
      );
    }

    const current = await prisma.characterDevelopment.findUnique({
      where: { characterId: data.characterId },
    });
    if (!current) {
      throw new AppError('Character development record missing', 'DEVELOPMENT_NOT_FOUND', 404);
    }

    const previousValue = current[data.attribute];
    const delta = data.newValue - previousValue;

    return prisma.$transaction(async (tx) => {
      const event = await tx.characterDevelopmentEvent.create({
        data: {
          characterId: data.characterId,
          attribute: data.attribute,
          previousValue,
          newValue: data.newValue,
          delta,
          storyEventRef: data.storyEventRef,
          episodeId: data.episodeId ?? null,
          summary: data.summary ?? null,
          approved: data.approved,
        },
      });

      const development = await tx.characterDevelopment.update({
        where: { characterId: data.characterId },
        data: { [data.attribute]: data.newValue },
      });

      return { event, development };
    });
  }
}

export class RelationshipService {
  async listByUniverse(universeId: string) {
    return prisma.characterRelationship.findMany({
      where: { universeId },
      include: {
        fromCharacter: true,
        toCharacter: true,
        events: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async listForCharacter(characterId: string) {
    return prisma.characterRelationship.findMany({
      where: {
        OR: [{ fromCharacterId: characterId }, { toCharacterId: characterId }],
      },
      include: {
        fromCharacter: true,
        toCharacter: true,
        events: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
  }

  async getPair(fromCharacterId: string, toCharacterId: string) {
    return prisma.characterRelationship.findUnique({
      where: {
        fromCharacterId_toCharacterId: { fromCharacterId, toCharacterId },
      },
      include: {
        fromCharacter: true,
        toCharacter: true,
        events: { orderBy: { createdAt: 'desc' } },
      },
    });
  }

  async applyEvent(input: z.infer<typeof ApplyRelationshipEventSchema>) {
    const data = ApplyRelationshipEventSchema.parse(input);
    if (!data.storyEventRef.trim()) {
      throw new AppError(
        'Relationship changes must reference an approved story event.',
        'STORY_EVENT_REQUIRED',
        400,
      );
    }

    const relationship = await prisma.characterRelationship.findUnique({
      where: { id: data.relationshipId },
    });
    if (!relationship) {
      throw new AppError('Relationship not found', 'RELATIONSHIP_NOT_FOUND', 404);
    }

    const previousValue = relationship[data.attribute];
    const delta = data.newValue - previousValue;

    return prisma.$transaction(async (tx) => {
      const event = await tx.relationshipEvent.create({
        data: {
          relationshipId: data.relationshipId,
          attribute: data.attribute,
          previousValue,
          newValue: data.newValue,
          delta,
          storyEventRef: data.storyEventRef,
          episodeId: data.episodeId ?? null,
          summary: data.summary ?? null,
          approved: data.approved,
        },
      });

      const updated = await tx.characterRelationship.update({
        where: { id: data.relationshipId },
        data: { [data.attribute]: data.newValue },
      });

      return { event, relationship: updated };
    });
  }
}

export const characterDnaService = new CharacterDnaService();
export const characterDevelopmentService = new CharacterDevelopmentService();
export const relationshipService = new RelationshipService();
