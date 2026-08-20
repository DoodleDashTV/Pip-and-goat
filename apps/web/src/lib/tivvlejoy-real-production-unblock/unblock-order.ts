import { UNBLOCK_ORDER_SCHEMA, type UnblockOrder } from './types';

export function compileFirstEpisodeUnblockOrder(): UnblockOrder {
  return {
    schemaVersion: UNBLOCK_ORDER_SCHEMA,
    buckets: {
      DO_NOW: [
        'Send the rigger the exact Pip/Goat receive list. Rigs have the longest lead time.',
        'Write or confirm the seven EP012 spoken lines. Character counts stay unknown until that text exists.',
        'Do not download commercial scenery. Cost is unknown.',
        'Do not synthesize voices and do not contact RunPod.',
      ],
      DO_WHILE_WAITING: [
        'Keep the first-read scenery queue ready. Inspect only after Justin approves the unknown-cost GET.',
        'Pin the official Blender 4.2.2 SHA-256 when Justin supplies it.',
        'Rehearse the printable rig-arrival checklist on /rig-arrival. Nothing auto-completes.',
        'Prepare voice timing → viseme → animation → editorial → captions so real audio can land without relabeling synthetic timing.',
      ],
      DO_AFTER_RIGS: [
        'Hash and preserve the immutable Pip and Goat sources.',
        'Inspect armature, required controls, beak/jaw, eyes, eyelids, Pip wings, feet, hallux, accessories, Goat collar/tag, and prop attachments.',
        'Review test poses. Issue human approval only after that review. Never auto-approve.',
      ],
      DO_BEFORE_FIRST_RENDER: [
        'Bind real voice receipts with at least line timing.',
        'Approve the minimum EP012 scenery roles from inspected originals.',
        'Lock the episode only after approved rigs, real voices, and approved scenery exist.',
      ],
      DO_ONLY_AFTER_PAID_AUTHORIZATION: [
        'Launch any GPU or RunPod worker.',
        'Download large commercial scenery packages beyond the first-read set.',
        'Generate billed voices.',
      ],
    },
  };
}
