export type GoatSessionOpenFailure = {
  phase: 'Failed';
  code: string;
  error: string;
  nextUserAction: string;
  stoppedAfterHash: boolean;
  resumable: boolean;
};

export function describeGoatSessionOpenFailure(input: {
  httpStatus?: number;
  code?: string;
  error?: string;
  tokenPresented: boolean;
  resumable?: boolean;
}): GoatSessionOpenFailure {
  const code = input.code || (input.httpStatus === 401 ? 'INTAKE_UNAUTHORIZED' : 'SESSION_OPEN_FAILED');
  if (code === 'INTAKE_UNAUTHORIZED') {
    return {
      phase: 'Failed',
      code,
      error: input.tokenPresented
        ? 'Studio session token did not authorize this Preview. Code: INTAKE_UNAUTHORIZED.'
        : 'Studio session token was not sent with the upload session request. Code: INTAKE_UNAUTHORIZED.',
      nextUserAction: input.tokenPresented
        ? 'Re-enter the Studio session token, then tap Upload Goat Source again. Keep the same Goat_FINN.zip.'
        : 'Enter the Studio session token, then tap Upload Goat Source. Keep the same Goat_FINN.zip.',
      stoppedAfterHash: true,
      resumable: Boolean(input.resumable),
    };
  }
  if (code === 'PRODUCTION_INTAKE_REFUSED') {
    return {
      phase: 'Failed',
      code,
      error: 'Goat source intake is refused on Production. Code: PRODUCTION_INTAKE_REFUSED.',
      nextUserAction: 'Use the Preview /character-rigging page. Production stays closed.',
      stoppedAfterHash: true,
      resumable: false,
    };
  }
  return {
    phase: 'Failed',
    code,
    error: `${input.error ?? 'Goat upload session could not be opened.'} Code: ${code}.`,
    nextUserAction: input.resumable
      ? 'Tap Upload Goat Source again to resume the same Goat_FINN.zip. Do not pick a different file.'
      : 'Fix the reported error, then tap Upload Goat Source again. Keep the same Goat_FINN.zip.',
    stoppedAfterHash: true,
    resumable: Boolean(input.resumable),
  };
}
