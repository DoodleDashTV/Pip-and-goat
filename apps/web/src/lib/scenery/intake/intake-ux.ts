import type { RecoveredUploadState } from './recovery';

export const PIPELINE_HARDENING_CHECKPOINT = 'TIVVLEJOY_SCENERY_PIPELINE_HARDENING_V1';

export const INTAKE_LAYOUT = {
  section: 'studio-card space-y-4 p-4 sm:p-5',
  primaryControl: 'btn-primary block w-full cursor-pointer px-4 text-center text-sm min-h-11',
  actions: 'mt-2 flex flex-wrap gap-2',
  fileRow: 'rounded-2xl border border-[var(--color-border)] px-3 py-3 text-sm w-full',
  progress: 'h-2 w-full rounded-full bg-[var(--color-surface-subtle)]',
} as const;

export function announceIntakeState(input: {
  filename?: string;
  state: string;
  progress?: number;
}): string {
  const name = input.filename ? `${input.filename}: ` : '';
  const progress = input.progress === undefined ? '' : ` ${input.progress} percent.`;
  return `${name}${input.state.replace(/_/g, ' ')}.${progress} Upload does not mean asset approval.`;
}

export function recoveredStateLabel(state: RecoveredUploadState): string {
  switch (state) {
    case 'paused':
      return 'Paused';
    case 'retryable':
      return 'Retryable';
    case 'failed':
      return 'Failed';
    case 'cancelled':
      return 'Cancelled';
    case 'stored':
      return 'Stored';
    case 'quarantined':
      return 'Quarantined';
    case 'duplicate':
      return 'Duplicate';
    case 'inspection_ready':
      return 'Inspection-ready';
    case 'expired':
      return 'Expired';
    case 'stale':
      return 'Stale';
    default:
      return 'Unknown';
  }
}

export function mobileLayoutHints(): string[] {
  return ['w-full', 'sm:p-5', 'sm:grid-cols-2', 'min-h-11', 'flex-wrap'];
}
