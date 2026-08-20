import { StreamingSha256 } from '@/lib/scenery/intake/sha256-stream';
import { BLENDER_SCRIPT_AUDIT_SCHEMA } from './types';

const FORBIDDEN_TOKENS = [
  'subprocess',
  'os.system',
  'os.popen',
  'eval(',
  'exec(',
  'socket',
  'requests',
  'urllib',
  'curl',
  'wget',
  'rm -rf',
  'shutil.rmtree',
  'unlink',
  'delete source',
  'overwrite source',
] as const;

const SECRET_PATTERNS = [
  /sk_live_[A-Za-z0-9]+/,
  /Bearer\s+[A-Za-z0-9._-]+/,
  /aws_secret_access_key/i,
  /X-Amz-Signature/i,
];

const URL_PATTERN = /https?:\/\/[^\s'"]+/gi;
const SIGNED_URL_PATTERN = /X-Amz-|sig=|signature=/i;
const PRODUCTION_HOST = /vercel\.app|runpod\.io|cloudflarestorage\.com|amazonaws\.com/i;

const OVERWRITE_PATTERNS = [
  /save_as_mainfile/i,
  /save_mainfile/i,
  /overwrite source/i,
  /open\s*\([^)]*['"]w/,
  /wb['"]/,
];

const NETWORK_IMPORTS = ['socket', 'requests', 'urllib', 'http.client', 'aiohttp'];
const SHELL_IMPORTS = ['subprocess', 'os', 'shutil', 'pty', 'ctypes'];

export function sha256Text(text: string): string {
  const hash = new StreamingSha256();
  hash.update(new TextEncoder().encode(text));
  return hash.digestHex();
}

function importedModules(source: string): string[] {
  const found: string[] = [];
  const importRe = /^(?:import|from)\s+([A-Za-z0-9_.]+)/gm;
  let match: RegExpExecArray | null;
  while ((match = importRe.exec(source))) {
    found.push(match[1]!);
  }
  return found;
}

function callNames(source: string): string[] {
  const found: string[] = [];
  const callRe = /\b([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = callRe.exec(source))) {
    found.push(match[1]!);
  }
  return found;
}

export function auditBlenderScript(source: string, shotId: string) {
  const lowered = source.toLowerCase();
  const forbiddenTokensFound = FORBIDDEN_TOKENS.filter((token) => lowered.includes(token.toLowerCase()));
  const urls = source.match(URL_PATTERN) ?? [];
  const externalUrlsFound = urls.filter((url) => SIGNED_URL_PATTERN.test(url) || PRODUCTION_HOST.test(url) || /https?:\/\//.test(url));
  const secretPatternsFound = SECRET_PATTERNS.filter((pattern) => pattern.test(source)).map((pattern) => String(pattern));
  const imports = importedModules(source);
  const calls = callNames(source);
  const networkRisk =
    imports.some((item) => NETWORK_IMPORTS.includes(item.split('.')[0]!)) ||
    calls.some((item) => item.startsWith('urllib') || item.startsWith('requests') || item.startsWith('socket')) ||
    externalUrlsFound.length > 0;
  const shellRisk =
    imports.some((item) => SHELL_IMPORTS.includes(item.split('.')[0]!)) ||
    calls.some((item) => item === 'eval' || item === 'exec' || item === 'system' || item.startsWith('os.') || item.startsWith('subprocess'));
  const sourceOverwriteRisk =
    OVERWRITE_PATTERNS.some((pattern) => pattern.test(source)) || forbiddenTokensFound.includes('overwrite source');
  const safe =
    forbiddenTokensFound.length === 0 &&
    externalUrlsFound.length === 0 &&
    secretPatternsFound.length === 0 &&
    !sourceOverwriteRisk &&
    !networkRisk &&
    !shellRisk;

  return {
    schemaVersion: BLENDER_SCRIPT_AUDIT_SCHEMA,
    scriptSha256: sha256Text(source),
    shotId,
    safe,
    forbiddenTokensFound: [...forbiddenTokensFound],
    externalUrlsFound,
    secretPatternsFound,
    sourceOverwriteRisk,
    networkRisk,
    shellRisk,
    executionAuthorized: false as const,
    importedModules: imports,
    callNames: calls,
  };
}

export function unsafeScriptFixture(kind: 'subprocess' | 'os.system' | 'network' | 'overwrite' | 'signed-url' | 'secret') {
  if (kind === 'subprocess') return 'import subprocess\nsubprocess.run(["blender"])\n';
  if (kind === 'os.system') return 'import os\nos.system("blender")\n';
  if (kind === 'network') return 'import requests\nrequests.get("https://example.invalid/network")\n';
  if (kind === 'overwrite') return 'bpy.ops.wm.save_mainfile()\noverwrite source\n';
  if (kind === 'signed-url') return 'url = "https://bucket.amazonaws.com/file?X-Amz-Signature=abc-placeholder"\n';
  return 'token = "sk_live_dummyexampletoken"\n';
}
