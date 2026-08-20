import type { EntityType, JournalEventType } from './types';

export function eventTypeFor(entityType: EntityType): JournalEventType {
  switch (entityType) {
    case 'EPISODE':
      return 'EPISODE_CREATED';
    case 'SCRIPT_VERSION':
      return 'SCRIPT_VERSION_BOUND';
    case 'VOICE_RECEIPT':
      return 'VOICE_RECEIPT_BOUND';
    case 'APPROVED_ASSET_REFERENCE':
    case 'LOCATION_INSTANCE':
      return 'ASSET_RESOLUTION_BOUND';
    case 'CONTINUITY_FACT':
      return 'CONTINUITY_FACT_ADDED';
    case 'SHOT':
      return 'SHOT_DEPENDENCY_CHANGED';
    case 'PRODUCTION_PACKET':
      return 'PRODUCTION_PACKET_COMPILED';
    case 'VISUAL_APPROVAL_REFERENCE':
      return 'VISUAL_APPROVAL_RECORDED';
    case 'PRODUCTION_JOB':
    case 'RECOVERY_CHECKPOINT':
      return 'JOB_CHECKPOINT_WRITTEN';
    case 'QC_RECEIPT':
      return 'QC_RECEIPT_RECORDED';
    case 'DELIVERY_PACKAGE':
      return 'DELIVERY_PACKAGE_COMPILED';
    case 'PRODUCTION_STATE_NODE':
    case 'PRODUCTION_STATE_EDGE':
      return 'STATE_GRAPH_SNAPSHOTTED';
    case 'BATCH_PLAN':
      return 'BATCH_PLAN_WRITTEN';
    default:
      return 'WORKSPACE_SAVED';
  }
}
