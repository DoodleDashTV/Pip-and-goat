import { describeSceneryStorageConfiguration } from '@/lib/scenery/intake/config';

export type PrivateSourceAccess = {
  configured: boolean;
  durable: boolean;
  realPrivateSourceAccessAvailable: false | true;
  blocker: string | null;
  credentialsPrinted: false;
  r2Mutated: false;
};

export function describePrivateSourceAccess(
  env: Record<string, string | undefined> = process.env,
): PrivateSourceAccess {
  const config = describeSceneryStorageConfiguration(env);
  if (!config.configured) {
    return {
      configured: false,
      durable: false,
      realPrivateSourceAccessAvailable: false,
      blocker: 'PRIVATE_SOURCE_CREDENTIALS_OR_REACHABILITY_UNPROVEN',
      credentialsPrinted: false,
      r2Mutated: false,
    };
  }
  return {
    configured: true,
    durable: config.durable,
    realPrivateSourceAccessAvailable: false,
    blocker: 'PRIVATE_SOURCE_LISTING_NOT_EXECUTED_IN_DEFAULT_PATH: reachability is unproven and commercial bytes stay unread until an explicit read-only materializer call succeeds.',
    credentialsPrinted: false,
    r2Mutated: false,
  };
}
