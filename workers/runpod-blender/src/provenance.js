/**
 * Build provenance for the Runpod GPU worker image.
 *
 * The render code (Blender scene assembly + worker sources) is BAKED INTO the
 * image — the worker never downloads it at run time. A digest-pinned image can
 * therefore be perfectly pullable and still run render code that predates the
 * repository, which is exactly how a FINAL_1080P acceptance render once shipped
 * stale 8-light scene assembly while every gate passed.
 *
 * This module makes the baked code identifiable:
 *   - `renderCodeFingerprint` is a content hash over every baked render file, so
 *     two images with the same fingerprint contain byte-identical render code.
 *   - The image build runs this file with `--expect <sha>` and FAILS if the
 *     fingerprint baked in disagrees with the value the builder declared in the
 *     `ddp.render.code.sha256` label. A published label can therefore be trusted
 *     from the registry alone, without pulling or running the image.
 *   - The worker reports the fingerprint, source commit and build time in its
 *     startup diagnostics so every render records what code produced it.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

/** Files that never affect a render and must not perturb the fingerprint. */
const IGNORED = new Set(['__pycache__', '.pytest_cache', '.DS_Store']);

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function walk(dir, prefix, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (IGNORED.has(entry.name) || entry.name.endsWith('.pyc')) continue;
    const abs = path.join(dir, entry.name);
    const rel = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) walk(abs, rel, out);
    else if (entry.isFile()) out.push({ path: rel, sha256: sha256File(abs) });
  }
  return out;
}

/**
 * Resolve the two render-code roots for whichever layout we are running in:
 * the image (/opt/ddp-worker/{src,blender}) or the repository
 * (workers/runpod-blender/src + scripts/blender).
 */
function defaultRoots(baseDir = __dirname) {
  const imageBlender = path.resolve(baseDir, '../blender');
  const repoBlender = path.resolve(baseDir, '../../../scripts/blender');
  return [
    { prefix: 'src', dir: baseDir },
    { prefix: 'blender', dir: fs.existsSync(imageBlender) ? imageBlender : repoBlender },
  ];
}

/**
 * Content hash over all baked render code. Identical fingerprints mean
 * identical render behaviour; any edit to a Blender script or worker source
 * changes it.
 *
 * @param {Array<{prefix: string, dir: string}>} [roots]
 * @returns {{ fingerprint: string, files: Array<{path: string, sha256: string}> }}
 */
function computeRenderCodeFingerprint(roots = defaultRoots()) {
  const files = [];
  for (const root of roots) {
    if (!fs.existsSync(root.dir)) continue;
    walk(root.dir, root.prefix, files);
  }
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const hash = crypto.createHash('sha256');
  for (const f of files) hash.update(`${f.path}\u0000${f.sha256}\n`);
  return { fingerprint: hash.digest('hex'), files };
}

function workerVersion() {
  try {
    return require('../package.json').version || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Non-secret provenance facts for startup diagnostics and render metadata.
 * `renderCodeMatch` is false when the image's declared label disagrees with the
 * code actually present — a tampered or mis-tagged image.
 */
function collectProvenance(env = process.env, roots = defaultRoots()) {
  const { fingerprint, files } = computeRenderCodeFingerprint(roots);
  const declared = String(env.DDP_RENDER_CODE_SHA256 || '') || null;
  const image = String(env.DDP_IMAGE_DIGEST || env.RUNPOD_WORKER_IMAGE || '');
  const digestMatch = image.match(/@(sha256:[0-9a-f]{64})/);
  const assemble = files.find((f) => f.path === 'blender/assemble_scene.py');
  return {
    sourceCommit: String(env.DDP_SOURCE_COMMIT || '') || null,
    workerBuildTime: String(env.DDP_WORKER_BUILD_TIME || '') || null,
    imageDigest: digestMatch ? digestMatch[1] : null,
    renderCodeSha256: fingerprint,
    renderCodeSha256Declared: declared,
    renderCodeMatch: declared ? declared === fingerprint : null,
    assembleScriptSha256: assemble ? assemble.sha256 : null,
    renderCodeFileCount: files.length,
    workerVersion: workerVersion(),
  };
}

function parseArgs(argv) {
  const args = { write: null, expect: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--write') args.write = argv[i + 1];
    else if (argv[i] === '--expect') args.expect = argv[i + 1];
    else if (argv[i] === '--json') args.json = true;
  }
  return args;
}

/**
 * Build-time / diagnostic entrypoint. With `--expect`, exits non-zero when the
 * declared fingerprint does not match the baked code, which fails the image
 * build rather than publishing an image whose label lies about its contents.
 */
function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);
  const provenance = collectProvenance(env);
  if (args.write) {
    fs.mkdirSync(path.dirname(args.write), { recursive: true });
    fs.writeFileSync(args.write, `${JSON.stringify(provenance, null, 2)}\n`);
  }
  console.log(JSON.stringify(args.json ? provenance : { ...provenance, renderCodeFiles: undefined }, null, 2));
  if (args.expect && args.expect !== 'unknown') {
    if (args.expect !== provenance.renderCodeSha256) {
      console.error(
        `RENDER_CODE_FINGERPRINT_MISMATCH: declared ${args.expect} but baked code hashes to ${provenance.renderCodeSha256}`,
      );
      return 1;
    }
    console.log(`RENDER_CODE_FINGERPRINT_OK ${provenance.renderCodeSha256}`);
  }
  return 0;
}

module.exports = {
  IGNORED,
  computeRenderCodeFingerprint,
  collectProvenance,
  defaultRoots,
  main,
};

if (require.main === module) process.exit(main());
