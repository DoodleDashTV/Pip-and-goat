import { buildCharacterRiggingConsoleModel } from '@/lib/tivvlejoy-character-rigging-department/console-model';
import { emptyGoatSourceReceipt } from './receipt';
import { deriveGoatSourceState, operatorChecklist } from './states';
import { GOAT_SOURCE_FILENAME, GOAT_SOURCE_SIZE_BYTES } from './goat-spec';
import { goatSourceObjectKey } from './keys';

export function buildGoatSourceIntakeConsoleModel() {
  const department = buildCharacterRiggingConsoleModel();
  const receipt = emptyGoatSourceReceipt(false);
  const state = deriveGoatSourceState({ receipt, connectionReadyOnly: true });
  return {
    ...department,
    intake: {
      title: 'GOAT SOURCE',
      expectedFilename: GOAT_SOURCE_FILENAME,
      expectedSize: GOAT_SOURCE_SIZE_BYTES,
      objectKey: goatSourceObjectKey(),
      state,
      checklist: operatorChecklist(state),
      nextUserAction: 'Select Goat_FINN.zip and tap Upload Goat Source.',
      goatProductionReady: false,
      authorization: {
        publicPreview: !process.env.DATABASE_URL,
        tokenConfigured: Boolean(String(process.env.TIVVLEJOY_SCENERY_INTAKE_TOKEN ?? '').trim()),
        productionMutationsRefused: String(process.env.VERCEL_ENV ?? '').trim() === 'production',
      },
    },
  };
}
