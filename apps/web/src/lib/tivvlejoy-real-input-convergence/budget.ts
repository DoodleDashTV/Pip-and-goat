import { DEFAULT_READ_BUDGET, PRIORITY_QUEUE_ORDER, type PriorityQueueItem, type PrivateObjectInventory, type ReadBudget } from './types';

function queueLabelFor(object: PrivateObjectInventory['objects'][number]): (typeof PRIORITY_QUEUE_ORDER)[number] {
  const role = object.knownPackageRole;
  const ext = object.extension;
  if (role === 'DIRECT_GLB' || (ext === '.glb' && /mountain/i.test(object.operatorLabel))) return 'direct_mountain_glb';
  if (role === 'MOUNTAIN_PACKAGE' && ext === '.zip' && object.size < 64 * 1024 * 1024) return 'smaller_mountain_zip';
  if (role === 'DIRECT_FBX' || role === 'TAVERN_PACKAGE' && ext === '.fbx') return 'tavern_fbx';
  if (role === 'TEXTURE_PACKAGE' || /tavern/i.test(object.operatorLabel) && /texture/i.test(object.operatorLabel)) {
    return 'tavern_textures';
  }
  if (role === 'BLEND_SOURCE') return 'tavern_blend_header';
  if (role === 'VILLAGE_PACKAGE') return 'village_evidence';
  if (role === 'FOREST_PACKAGE') return 'forest';
  if (role === 'SKY_HDRI_PACKAGE') return 'sky_hdri';
  return 'large_historical_optional_addon';
}

function holdReason(object: PrivateObjectInventory['objects'][number], budget: ReadBudget): string | null {
  if (budget.botaniqHold && object.knownPackageRole === 'BOTANIQ_ARCHIVE') {
    return 'BOTANIQ_HOLD_NOT_ACTIVATED';
  }
  if (budget.addonHold && object.knownPackageRole === 'OPTIONAL_ADDON') {
    return 'ADDON_HOLD_NOT_ACTIVATED';
  }
  if (object.knownPackageRole === 'HISTORICAL_DUPLICATE' || object.knownPackageRole === 'WRAPPER') {
    return 'DEPRIORITIZED_HISTORICAL_OR_WRAPPER';
  }
  if (object.size > budget.maxSingleObjectBytes && object.extension !== '.blend') {
    return 'EXCEEDS_SINGLE_OBJECT_BUDGET';
  }
  if (budget.billingUncertainty && object.size > 256 * 1024 && object.knownPackageRole !== 'RECEIPT_METADATA' && object.extension !== '.json') {
    return 'BILLING_UNCERTAINTY_CONSERVATIVE_READ_SCOPE';
  }
  return null;
}

export function buildMaterializationQueue(
  inventory: PrivateObjectInventory,
  budget: ReadBudget = DEFAULT_READ_BUDGET,
): PriorityQueueItem[] {
  const ranked = inventory.objects
    .map((object) => {
      const label = queueLabelFor(object);
      const heldReason = holdReason(object, budget);
      return {
        objectIdentity: object.objectIdentity,
        operatorLabel: object.operatorLabel,
        priority: PRIORITY_QUEUE_ORDER.indexOf(label),
        queueLabel: label,
        size: object.size,
        extension: object.extension,
        held: Boolean(heldReason),
        holdReason: heldReason,
        selected: false,
      } satisfies PriorityQueueItem;
    })
    .sort((a, b) => a.priority - b.priority || a.size - b.size);

  let used = 0;
  let selected = 0;
  return ranked.map((item) => {
    if (item.held) return item;
    if (selected >= 12) return item;
    if (used + item.size > budget.maxTotalMaterializedBytes) {
      return { ...item, held: true, holdReason: 'EXCEEDS_TOTAL_MATERIALIZATION_BUDGET' };
    }
    used += item.size;
    selected += 1;
    return { ...item, selected: true };
  });
}

export function mergeBudget(overrides?: Partial<ReadBudget>): ReadBudget {
  return { ...DEFAULT_READ_BUDGET, ...overrides, schemaVersion: DEFAULT_READ_BUDGET.schemaVersion };
}
