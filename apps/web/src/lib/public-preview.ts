/**
 * Public website preview detection.
 *
 * A public host must not receive DATABASE_URL, cloud credentials, or
 * production-library paths. When those are absent, render a truthful
 * studio shell and label database-backed controls "Not available yet."
 *
 * This does not change stage values or theatrical-gate decisions.
 */
export function isPublicWebsitePreview(env?: Partial<Record<string, string | undefined>>): boolean {
  const databaseUrl = env ? env.DATABASE_URL : process.env.DATABASE_URL;
  return !databaseUrl;
}
