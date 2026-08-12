/**
 * Secret safety helpers — never log or embed API keys / secrets in manifests or errors.
 */
const SECRET_ENV_NAMES = [
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'RUNPOD_API_KEY',
  'OBJECT_STORAGE_ACCESS_KEY_ID',
  'OBJECT_STORAGE_SECRET_ACCESS_KEY',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
] as const;

export function secretPresenceReport(
  env: Record<string, string | undefined> = process.env,
): Record<(typeof SECRET_ENV_NAMES)[number] | 'R2_BUCKET' | 'R2_ENDPOINT', 'YES' | 'NO'> {
  const present = (name: string) =>
    Boolean(env[name] && String(env[name]).trim().length > 0) ? ('YES' as const) : ('NO' as const);
  return {
    R2_BUCKET: present('R2_BUCKET') || present('OBJECT_STORAGE_BUCKET'),
    R2_ENDPOINT: present('R2_ENDPOINT') || present('OBJECT_STORAGE_ENDPOINT'),
    R2_ACCESS_KEY_ID: present('R2_ACCESS_KEY_ID') || present('OBJECT_STORAGE_ACCESS_KEY_ID'),
    R2_SECRET_ACCESS_KEY: present('R2_SECRET_ACCESS_KEY') || present('OBJECT_STORAGE_SECRET_ACCESS_KEY'),
    RUNPOD_API_KEY: present('RUNPOD_API_KEY'),
    OBJECT_STORAGE_ACCESS_KEY_ID: present('OBJECT_STORAGE_ACCESS_KEY_ID'),
    OBJECT_STORAGE_SECRET_ACCESS_KEY: present('OBJECT_STORAGE_SECRET_ACCESS_KEY'),
    AWS_ACCESS_KEY_ID: present('AWS_ACCESS_KEY_ID'),
    AWS_SECRET_ACCESS_KEY: present('AWS_SECRET_ACCESS_KEY'),
  };
}

/** Redact known secret values and common key patterns from strings. */
export function redactSecrets(
  text: string,
  env: Record<string, string | undefined> = process.env,
): string {
  let out = String(text ?? '');
  for (const name of SECRET_ENV_NAMES) {
    const value = env[name];
    if (value && value.trim().length >= 8) {
      out = out.split(value).join('[REDACTED]');
      out = out.split(value.trim()).join('[REDACTED]');
    }
  }
  // Runpod API key shape (do not capture full value into logs)
  out = out.replace(/\brpa_[A-Za-z0-9]+/g, 'rpa_[REDACTED]');
  out = out.replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [REDACTED]');
  return out;
}

export function assertNoSecretsInManifest(manifest: unknown): void {
  const json = JSON.stringify(manifest);
  const redacted = redactSecrets(json);
  if (redacted !== json) {
    throw new Error('Cloud job manifest contained secret material — refused.');
  }
  if (/"RUNPOD_API_KEY"|\"R2_SECRET|\"secretAccessKey\"/i.test(json)) {
    throw new Error('Cloud job manifest referenced secret field names with values — refused.');
  }
}

export function stripTrailingSecretNoise(value: string | undefined | null): string {
  return String(value ?? '')
    .replace(/[\r\n]+/g, '')
    .trim();
}
