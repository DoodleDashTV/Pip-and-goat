import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileEp001ProductionGateway } from '@/lib/tivvlejoy-ep001-production-gateway';

export const CHARACTER_ARTIST_DELIVERY_CHECKPOINT_SCHEMA =
  'TIVVLEJOY_CHARACTER_ARTIST_DELIVERY_CHECKPOINT_V1' as const;

export function compileCharacterArtistDeliveryCheckpoint() {
  const gateway = compileEp001ProductionGateway();

  const deliveries = [
    {
      sequence: 1 as const,
      characterId: 'GOAT' as const,
      displayName: 'Goat',
      workOrderState: 'EXTERNAL_ORDER_PENDING_OR_IN_PROGRESS' as const,
      expectedScope: [
        'Preserve usable completed modeling and retopology.',
        'Repair any remaining topology issues required for animation.',
        'Deliver a true production Blender 4.2 armature and animator controls.',
        'Complete clean skin weighting and deformation fixes.',
        'Provide eye/look-at, blink/facial, jaw/mouth dialogue, body, leg, hoof, and prop attachment controls.',
        'Keep horns, collar, and round tag stable through required motion.',
        'Demonstrate idle, walk, run, turn, jump, dialogue, expression, and deformation tests.',
        'Deliver canonical .blend plus FBX, GLB, textures/materials, and no broken dependencies.',
      ],
      commercialTerms: {
        platformLabel: 'Fiverr' as const,
        quotedUsd: 250 as const,
        orderAccepted: false as const,
        paymentRecordedAsProductionApproval: false as const,
      },
      deliveryReceipt: {
        canonicalBlendSha256: null,
        canonicalBlendByteSize: null,
        receivedAt: null,
        artistVersionNote: null,
        sourcePreserved: false as const,
      },
      inspectionState: 'NOT_RECEIVED_NOT_REVIEWED' as const,
      humanApproved: false as const,
      productionReady: false as const,
    },
    {
      sequence: 2 as const,
      characterId: 'PIP' as const,
      displayName: 'Bird',
      workOrderState: 'WAITING_FOR_GOAT_COMPLETION' as const,
      expectedScope: [
        'Finish remaining animation-ready modeling and retopology preparation.',
        'Preserve approved appearance, UVs, textures, materials, and identity-critical design.',
        'Separate or prepare independently moving parts where required for professional rigging.',
        'Deliver a true production Blender 4.2 armature and animator controls.',
        'Complete clean skin weighting and deformation fixes.',
        'Provide eye/look-at, blink/facial, beak/dialogue, wing, body, leg, foot, toe, hallux, and prop attachment controls.',
        'Keep scarf, backpack, both straps, crest feathers, and accessories stable through required motion.',
        'Demonstrate idle, walk, run, turn, jump, dialogue, expression, wing gesture, map carry, and deformation tests.',
        'Deliver canonical .blend plus FBX, GLB, textures/materials, and no broken dependencies.',
      ],
      commercialTerms: {
        platformLabel: 'Fiverr' as const,
        quotedUsd: null,
        orderAccepted: false as const,
        paymentRecordedAsProductionApproval: false as const,
      },
      deliveryReceipt: {
        canonicalBlendSha256: null,
        canonicalBlendByteSize: null,
        receivedAt: null,
        artistVersionNote: null,
        sourcePreserved: false as const,
      },
      inspectionState: 'NOT_RECEIVED_NOT_REVIEWED' as const,
      humanApproved: false as const,
      productionReady: false as const,
    },
  ];

  const body = {
    schemaVersion: CHARACTER_ARTIST_DELIVERY_CHECKPOINT_SCHEMA,
    episodeGatewaySha256: gateway.gatewaySha256,
    state: 'GOAT_FIRST_BIRD_SECOND_EXTERNAL_HANDOFF' as const,
    deliveries,
    scopeRules: [
      'Commercial order acceptance or payment never counts as rig approval.',
      'A delivered filename never counts as identity; record exact source bytes and SHA-256.',
      'Preserve the artist-delivered original and inspect only a non-destructive working copy.',
      'Every corrected delivery creates a new source identity and requires affected checks to be repeated.',
      'Goat completion does not automatically approve or start Bird work unless the separate Bird order is explicitly accepted.',
      'Production readiness requires TivvleJoy rig inspection plus explicit human visual approval, regardless of seller delivery status.',
    ],
    handoffSequence: [
      'Complete and receive Goat first.',
      'Record Goat exact source identity and preserve original.',
      'Run Goat rig inspection and human visual approval.',
      'Only after Goat is accepted as a character delivery, proceed with the separate Bird work order.',
      'Receive Bird, record exact source identity, and preserve original.',
      'Run Bird rig inspection and human visual approval.',
      'Only after both exact rigs are admitted may the Episode 1 animation release gate be evaluated.',
    ],
    authority: {
      externalOrderMutationAllowed: false as const,
      paymentAllowed: false as const,
      deliveryAcceptanceAllowed: false as const,
      rigAdmissionAllowed: false as const,
      animationExecutionAllowed: false as const,
      productionWritesAllowed: false as const,
      autoApprovalAllowed: false as const,
    },
    safety: {
      sellerMessagesSent: 0 as const,
      ordersPlaced: 0 as const,
      paymentsMade: 0 as const,
      sourceBytesIncluded: false as const,
      networkCalls: 0 as const,
      storageMutations: 0 as const,
      productionMutations: 0 as const,
    },
  };

  return { ...body, checkpointSha256: sha256Canonical(body) };
}

export type CharacterArtistDeliveryCheckpoint = ReturnType<typeof compileCharacterArtistDeliveryCheckpoint>;
