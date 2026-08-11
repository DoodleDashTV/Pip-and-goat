export class AppError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}

const UNSAFE_SHELL_CHARS = /[\0\r\n]/;
const SAFE_PATH_SEGMENT = /^[A-Za-z0-9._/@:+,=\- ]+$/;

export type SafePathOptions = {
  allowRelative?: boolean;
  allowDashPrefix?: boolean;
};

export function assertSafePath(path: string, options: SafePathOptions = {}): string {
  if (typeof path !== 'string' || path.trim().length === 0) {
    throw new AppError('Path must be a non-empty string.', 'UNSAFE_PATH', 400);
  }
  if (UNSAFE_SHELL_CHARS.test(path) || !SAFE_PATH_SEGMENT.test(path)) {
    throw new AppError('Path contains unsafe characters.', 'UNSAFE_PATH', 400);
  }
  if (!options.allowDashPrefix && path.startsWith('-')) {
    throw new AppError('Path must not start with a dash.', 'UNSAFE_PATH', 400);
  }
  if (!options.allowRelative && !path.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(path)) {
    throw new AppError('Path must be absolute.', 'UNSAFE_PATH', 400);
  }

  const normalized = path.replace(/\\/g, '/');
  if (normalized.split('/').some((segment) => segment === '..')) {
    throw new AppError('Path traversal is not allowed.', 'UNSAFE_PATH', 400);
  }

  return path;
}

export function safeShellArg(value: string): string {
  if (UNSAFE_SHELL_CHARS.test(value)) {
    throw new AppError('Shell argument contains unsafe control characters.', 'UNSAFE_SHELL_ARG', 400);
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
