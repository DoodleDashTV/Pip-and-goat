/**
 * Technical acceptance and artistic approval, kept apart on purpose.
 *
 * The old shape had one field: `qc.status: 'PASS' | 'FAIL'`. It answers a real
 * question — did the measurements come in within tolerance — but it is the wrong
 * field to gate a release on, because it is the field that says PASS for a shot
 * that is correctly lit, correctly timed, technically flawless and visually
 * mediocre. Every automated check in this package can pass on a prototype asset
 * that no one would put in a cinema.
 *
 * So there are two states, and they cannot substitute for each other:
 *
 *   - **Technical**: derived, deterministic, computed by this package. PASS means
 *     every measurement is in tolerance and no validator raised an error.
 *   - **Artistic**: recorded, never derived. `NOT_REVIEWED` until a human looks at
 *     rendered frames and says otherwise. No code path sets this to `APPROVED`.
 *
 * `overall` is the conjunction, and it is the only field allowed to carry the
 * words "accepted", "final" or "production ready". A blueprint whose technical
 * status is PASS and whose artistic status is `NOT_REVIEWED` is exactly what it
 * sounds like: work that is ready to be looked at.
 */
import { z } from 'zod';
import { NonEmptyStringSchema } from './schema/common';

/** Computed from measurements. Deterministic; this package owns it. */
export const TECHNICAL_STATUSES = ['PASS', 'FAIL'] as const;
export const TechnicalStatusSchema = z.enum(TECHNICAL_STATUSES);
export type TechnicalStatus = z.infer<typeof TechnicalStatusSchema>;

/**
 * Recorded by a human. Never computed.
 *
 * `NOT_RENDERED` exists because most artistic reviews are impossible rather than
 * pending: you cannot approve the look of a shot nobody has rendered, and
 * conflating "not yet rendered" with "not yet reviewed" hides which one is
 * blocking.
 */
export const ARTISTIC_STATUSES = ['NOT_RENDERED', 'NOT_REVIEWED', 'CHANGES_REQUESTED', 'APPROVED'] as const;
export const ArtisticStatusSchema = z.enum(ARTISTIC_STATUSES);
export type ArtisticStatus = z.infer<typeof ArtisticStatusSchema>;

/**
 * The combined state.
 *
 * `TECHNICAL_PASS_PENDING_ARTISTIC_REVIEW` is deliberately long. It is the state
 * almost everything will be in, and a short name for it would get abbreviated to
 * "passing" in conversation, which is the misunderstanding this whole file exists
 * to prevent.
 */
export const OVERALL_ACCEPTANCE_STATES = [
  'TECHNICAL_FAIL',
  'TECHNICAL_PASS_NOT_RENDERED',
  'TECHNICAL_PASS_PENDING_ARTISTIC_REVIEW',
  'ARTISTIC_CHANGES_REQUESTED',
  'ACCEPTED',
] as const;
export const OverallAcceptanceSchema = z.enum(OVERALL_ACCEPTANCE_STATES);
export type OverallAcceptance = z.infer<typeof OverallAcceptanceSchema>;

/**
 * The artistic review checklist.
 *
 * Every item is a human judgement about rendered frames. They are enumerated so a
 * review is a checklist with named gaps rather than a thumbs up, and so the
 * blueprint can say precisely which of them nobody has looked at yet.
 */
export const ARTISTIC_REVIEW_ITEMS = [
  'CHARACTER_IDENTITY',
  'DEFORMATION',
  'GROOM_INTEGRITY',
  'MATERIAL_INTEGRITY',
  'FACIAL_PERFORMANCE',
  'EYE_PERFORMANCE',
  'BODY_MECHANICS',
  'CONTACT_AND_COLLISION',
  'CAMERA',
  'LIGHTING_AND_EXPOSURE',
  'VFX_INTEGRATION',
  'SIMULATION_STABILITY',
  'TEMPORAL_STABILITY',
  'LIP_SYNC',
  'AUDIO_AND_MIX',
  'CONTINUITY',
  'CHILD_CONTENT_SAFETY',
  'GOLDEN_REFERENCE_COMPARISON',
] as const;
export const ArtisticReviewItemSchema = z.enum(ARTISTIC_REVIEW_ITEMS);
export type ArtisticReviewItem = z.infer<typeof ArtisticReviewItemSchema>;

/**
 * Checks this package can actually make.
 *
 * Enumerated next to the artistic list so the asymmetry is visible: automated
 * coverage is measurements and fingerprints, and everything about how a shot
 * *looks* is on the other list.
 */
export const TECHNICAL_CHECK_ITEMS = [
  'AUTOMATED_TESTS',
  'ASSET_FINGERPRINTS',
  'CHARACTER_LOCK',
  'RIG_INTEGRITY',
  'MOTION_MEASUREMENTS',
  'FACIAL_MEASUREMENTS',
  'SOUND_MEASUREMENTS',
  'LIGHTING_THRESHOLDS',
  'VFX_BUDGET',
  'SCHEMA_VALIDATION',
] as const;
export const TechnicalCheckItemSchema = z.enum(TECHNICAL_CHECK_ITEMS);
export type TechnicalCheckItem = z.infer<typeof TechnicalCheckItemSchema>;

export const ArtisticReviewRecordSchema = z.object({
  item: ArtisticReviewItemSchema,
  status: ArtisticStatusSchema,
  /** Who looked. Absent while unreviewed; required to record an approval. */
  reviewer: z.string().optional(),
  reviewedAt: z.string().optional(),
  notes: z.string().optional(),
});
export type ArtisticReviewRecord = z.infer<typeof ArtisticReviewRecordSchema>;

export const AcceptanceSchema = z.object({
  technical: TechnicalStatusSchema,
  /** Which technical checks ran, and which could not. */
  technicalChecks: z.array(
    z.object({
      item: TechnicalCheckItemSchema,
      status: z.enum(['PASS', 'FAIL', 'NOT_APPLICABLE', 'NOT_RUN']),
      detail: z.string().optional(),
    }),
  ),
  artistic: ArtisticStatusSchema,
  artisticReviews: z.array(ArtisticReviewRecordSchema).default([]),
  overall: OverallAcceptanceSchema,
  /**
   * The golden reference this was compared against.
   *
   * Absent until the golden scene exists, which is the honest state today and the
   * reason `GOLDEN_REFERENCE_COMPARISON` cannot be reviewed yet.
   */
  goldenReferenceId: z.string().optional(),
  /** Render tier the artistic review looked at, if any. A DRAFT is not a look. */
  reviewedRenderTier: z.enum(['DRAFT', 'REVIEW', 'FINAL']).optional(),
  /**
   * Why this may not be called final, in plain words.
   *
   * Always populated when `overall` is not `ACCEPTED`, so a UI never has to
   * invent an explanation and a reader never has to infer one.
   */
  blockedBy: z.array(NonEmptyStringSchema).default([]),
});
export type Acceptance = z.infer<typeof AcceptanceSchema>;

/**
 * Derive the combined state.
 *
 * Ordered so the most fundamental blocker wins: a technical failure is reported as
 * a technical failure even if a reviewer had previously approved the look, because
 * the thing they approved is no longer what the plan produces.
 */
export function deriveOverall(technical: TechnicalStatus, artistic: ArtisticStatus): OverallAcceptance {
  if (technical === 'FAIL') return 'TECHNICAL_FAIL';
  if (artistic === 'APPROVED') return 'ACCEPTED';
  if (artistic === 'CHANGES_REQUESTED') return 'ARTISTIC_CHANGES_REQUESTED';
  if (artistic === 'NOT_RENDERED') return 'TECHNICAL_PASS_NOT_RENDERED';
  return 'TECHNICAL_PASS_PENDING_ARTISTIC_REVIEW';
}

/**
 * Build the acceptance record for a freshly planned blueprint.
 *
 * Artistic status is always `NOT_RENDERED` here, and there is no parameter to make
 * it anything else. Planning cannot approve a look; only a human reviewing frames
 * can, and that happens through `recordArtisticReview()` against a stored
 * blueprint with a render behind it.
 */
export function planningAcceptance(input: {
  readonly technical: TechnicalStatus;
  readonly technicalChecks: Acceptance['technicalChecks'];
  readonly goldenReferenceId?: string;
}): Acceptance {
  const artistic: ArtisticStatus = 'NOT_RENDERED';
  const blockedBy = [
    ...(input.technical === 'FAIL' ? ['Technical checks failed; see the blueprint issues.'] : []),
    'No render has been produced, so nothing has been visually reviewed.',
    ...(input.goldenReferenceId
      ? []
      : ['No golden reference exists yet; comparison against the theatrical standard is not possible.']),
  ];
  return AcceptanceSchema.parse({
    technical: input.technical,
    technicalChecks: input.technicalChecks,
    artistic,
    artisticReviews: ARTISTIC_REVIEW_ITEMS.map((item) => ({ item, status: 'NOT_RENDERED' })),
    overall: deriveOverall(input.technical, artistic),
    goldenReferenceId: input.goldenReferenceId,
    blockedBy,
  });
}

/**
 * Record one human review.
 *
 * Requires a named reviewer for anything other than a reset to `NOT_REVIEWED`: an
 * anonymous approval is not an approval, and the whole value of this state is that
 * it is attributable.
 *
 * The blueprint's aggregate artistic status is the *weakest* of its items, so a
 * single unreviewed item keeps the whole thing out of `ACCEPTED`. That is
 * intentional and will be inconvenient, which is the correct trade for a gate that
 * exists to stop "it rendered, ship it".
 */
export function recordArtisticReview(
  acceptance: Acceptance,
  review: {
    readonly item: ArtisticReviewItem;
    readonly status: ArtisticStatus;
    readonly reviewer: string;
    readonly reviewedAt: string;
    readonly renderTier: 'DRAFT' | 'REVIEW' | 'FINAL';
    readonly notes?: string;
  },
): Acceptance {
  if (review.status === 'APPROVED' && review.reviewer.trim().length === 0) {
    throw new Error('An artistic approval requires a named reviewer.');
  }
  if (review.status === 'APPROVED' && review.renderTier === 'DRAFT') {
    throw new Error(
      'A DRAFT render cannot carry an artistic approval; approve against REVIEW or FINAL frames.',
    );
  }
  const artisticReviews = acceptance.artisticReviews.map((record) =>
    record.item === review.item
      ? {
          item: record.item,
          status: review.status,
          reviewer: review.reviewer,
          reviewedAt: review.reviewedAt,
          notes: review.notes,
        }
      : record,
  );
  const artistic = weakestArtisticStatus(artisticReviews);
  return AcceptanceSchema.parse({
    ...acceptance,
    artisticReviews,
    artistic,
    reviewedRenderTier: review.renderTier,
    overall: deriveOverall(acceptance.technical, artistic),
    blockedBy: describeBlockers(acceptance.technical, artisticReviews, acceptance.goldenReferenceId),
  });
}

/** The weakest item status, because a blueprint is only as approved as its gaps. */
export function weakestArtisticStatus(reviews: readonly ArtisticReviewRecord[]): ArtisticStatus {
  const order: ArtisticStatus[] = ['NOT_RENDERED', 'NOT_REVIEWED', 'CHANGES_REQUESTED', 'APPROVED'];
  if (reviews.length === 0) return 'NOT_RENDERED';
  // CHANGES_REQUESTED outranks the not-yet states as a blocker: it is a decision,
  // not an absence, and reporting it is more useful than reporting a gap.
  if (reviews.some((review) => review.status === 'CHANGES_REQUESTED')) return 'CHANGES_REQUESTED';
  return reviews.reduce<ArtisticStatus>(
    (weakest, review) => (order.indexOf(review.status) < order.indexOf(weakest) ? review.status : weakest),
    'APPROVED',
  );
}

function describeBlockers(
  technical: TechnicalStatus,
  reviews: readonly ArtisticReviewRecord[],
  goldenReferenceId: string | undefined,
): string[] {
  const blockers: string[] = [];
  if (technical === 'FAIL') blockers.push('Technical checks failed; see the blueprint issues.');
  const outstanding = reviews.filter((review) => review.status !== 'APPROVED');
  for (const review of outstanding) {
    blockers.push(`${review.item}: ${review.status.toLowerCase().replace(/_/g, ' ')}`);
  }
  if (!goldenReferenceId) {
    blockers.push('No golden reference exists yet; comparison against the theatrical standard is not possible.');
  }
  return blockers;
}

/**
 * The words that may not be applied to a plan whose `overall` is not `ACCEPTED`.
 *
 * Enumerated so a test can assert no serialised blueprint claims any of them
 * prematurely. Cheap to check, and the failure it prevents — a technically green
 * dashboard reading as a creative sign-off — is the failure the directive is
 * most concerned with.
 */
export const RESERVED_ACCEPTANCE_CLAIMS = ['movie quality', 'final', 'production ready', 'theatrical quality'] as const;

export function mayClaimFinal(acceptance: Acceptance): boolean {
  return acceptance.overall === 'ACCEPTED';
}
