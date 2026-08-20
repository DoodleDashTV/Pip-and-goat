const SECRET_KEY = /database_url|r2[_-]?secret|aws[_-]?(secret|access)|runpod|elevenlabs|authorization|cookie|token|signed[-_]?url|x-api-key/i;
const SECRET_VALUE =
  /postgres(ql)?:\/\/\S+|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9_-]{16,}|Bearer\s+[A-Za-z0-9._-]+|https?:\/\/\S+[?&](X-Amz-Signature|Signature|token)=[^&\s]+/i;

export function containsSecret(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return SECRET_KEY.test(value) || SECRET_VALUE.test(value);
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).some(([key, item]) => {
      if (item === '[REDACTED]') return false;
      return SECRET_KEY.test(key) || containsSecret(item);
    });
  }
  return false;
}

export function sanitizeForPersistence<T>(value: T): T {
  if (value == null) return value;
  if (typeof value === 'string') {
    if (SECRET_VALUE.test(value) || SECRET_KEY.test(value)) return '[REDACTED]' as T;
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeForPersistence(item)) as T;
  if (typeof value === 'object') {
    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      next[key] = SECRET_KEY.test(key) ? '[REDACTED]' : sanitizeForPersistence(item);
    }
    return next as T;
  }
  return value;
}

export function assertNoSecrets(value: unknown, label: string): void {
  if (containsSecret(value)) {
    throw new Error(`${label} rejected: secrets or signed URLs are not persistable.`);
  }
}
