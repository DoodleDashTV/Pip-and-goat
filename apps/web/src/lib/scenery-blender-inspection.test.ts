import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
const root = path.resolve(__dirname, '../../../..');
const runner = readFileSync(path.join(root, 'scripts/blender/run_scenery_inspection.sh'), 'utf8');
const inspector = readFileSync(path.join(root, 'scripts/blender/scenery_inspect.py'), 'utf8');
describe('isolated Blender scenery inspection', () => {
  it('requires a read-only copy, disabled autoexec, network isolation, and timeout', () => {
    for (const value of [
      'mktemp -d',
      'chmod 0400',
      'timeout --signal=KILL',
      'unshare --net',
      '--factory-startup',
      '--disable-autoexec',
    ])
      expect(runner).toContain(value);
  });
  it('records metadata without saving or approving the source', () => {
    expect(inspector).toContain('use_scripts=False');
    expect(inspector).not.toContain('save_as_mainfile');
    expect(inspector).toContain('"automaticallyApproved": False');
    expect(inspector).toContain('missingExternalFiles');
    expect(inspector).toContain('triangleCounts');
  });
});
