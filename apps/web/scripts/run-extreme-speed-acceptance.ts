/**
 * Extreme-speed acceptance — staged A→H.
 * Default / --audit-only: run ONLY AUDIT_FAST (Stages A–D). Never queue full AUDIT shot renders.
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { runAuditFast } from '@doodle-dash/production';

const ROOT = path.resolve(__dirname, '../../..');
const OUT = path.join(ROOT, 'artifacts/performance');
const EPISODE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

async function main() {
  mkdirSync(OUT, { recursive: true });
  const auditOnly = process.argv.includes('--audit-only') || !process.argv.includes('--full');

  console.log('=== EXTREME SPEED ACCEPTANCE — AUDIT_FAST ONLY ===');
  console.log('Order: A static → B daemon → C assets → D micro-render');
  console.log('Refusing full shot-render AUDIT jobs.\n');

  const report = await runAuditFast({
    episodeId: existsSync(path.join(ROOT, 'production-library')) ? EPISODE_ID : undefined,
    repoRoot: ROOT,
  });

  writeFileSync(path.join(OUT, 'audit-fast-latest.json'), JSON.stringify(report, null, 2));

  console.log('\n=== AUDIT_FAST SUMMARY ===');
  console.log(`AUDIT_FAST runtime: ${report.totalSec.toFixed(2)} sec`);
  console.log(`Blender startups: ${report.blenderStartups}`);
  console.log(`Pip load time: ${report.pipLoadMs ?? 'n/a'} ms`);
  console.log(`Goat load time: ${report.goatLoadMs ?? 'n/a'} ms`);
  console.log(`Micro-render time: ${report.microRenderMs} ms`);
  console.log(`Cache validation time: ${report.cacheValidationMs} ms`);
  console.log(
    `Slowest operation: ${report.slowestOperation?.stage} (${report.slowestOperation?.sec.toFixed(2)} sec)`,
  );
  console.log(`PASS/FAIL against 3-minute maximum: ${report.AUDIT_FAST}`);

  if (auditOnly) {
    console.log('\nDRAFT_FAST / FINAL_1080P not started (await AUDIT_FAST pass under 3 min).');
    console.log('Re-run with --full only after AUDIT_FAST is acceptable.');
  }

  if (report.AUDIT_FAST !== 'PASS') process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
