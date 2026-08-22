import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { EP012_CANONICAL_DIALOGUE_SHA256 } from './tivvlejoy-real-production-unblock/ep012-canonical-dialogue';
import { GOAT_VOICE_GUIDE, PIP_VOICE_GUIDE } from './voice-production/guides';

const repoRoot = path.resolve(__dirname, '../../../..');

function readContent(name: string) {
  return readFileSync(path.join(repoRoot, 'docs/content', name), 'utf8');
}

const files = [
  'TIVVLEJOY_CHARACTER_BIBLE_V1.md',
  'TIVVLEJOY_WORLD_BIBLE_V1.md',
  'TIVVLEJOY_VIRAL_HOOK_LIBRARY_V1.md',
  'TIVVLEJOY_PRODUCTION_PLAYBOOK_V1.md',
  'TIVVLEJOY_EPISODE_VAULT_V1.md',
  'TIVVLEJOY_RECURRING_CHARACTERS_V1.md',
] as const;

describe('docs/content TivvleJoy bibles', () => {
  it('registers the six planning bibles without a second software stack', () => {
    const joined = files.map(readContent).join('\n');
    expect(files.map((name) => readContent(name).split('\n')[0])).toEqual([
      '# TIVVLEJOY_CHARACTER_BIBLE_V1',
      '# TIVVLEJOY_WORLD_BIBLE_V1',
      '# TIVVLEJOY_VIRAL_HOOK_LIBRARY_V1',
      '# TIVVLEJOY_PRODUCTION_PLAYBOOK_V1',
      '# TIVVLEJOY_EPISODE_VAULT_V1',
      '# TIVVLEJOY_RECURRING_CHARACTERS_V1',
    ]);
    expect(joined).not.toMatch(/DoodleDash/i);
    expect(joined).not.toContain('Guaranteed Viral');
    expect(joined).not.toContain('Viral Score');
    expect(joined).not.toContain('Algorithm Hack');
    expect(readContent('TIVVLEJOY_VIRAL_HOOK_LIBRARY_V1.md')).toContain('not a guarantee of virality');
    expect(readContent('TIVVLEJOY_PRODUCTION_PLAYBOOK_V1.md')).toContain('does not rebuild');
  });

  it('keeps locked Pip and Goat identities and EP012 dialogue refs only', () => {
    const characters = readContent('TIVVLEJOY_CHARACTER_BIBLE_V1.md');
    const vault = readContent('TIVVLEJOY_EPISODE_VAULT_V1.md');
    expect(characters).toContain('CHAR_PIP_001');
    expect(characters).toContain('CHAR_GOAT_001');
    expect(characters).toContain('curious, cheerful, kind, courageous, energetic');
    expect(characters).toContain('warm, playful, loyal, adventurous');
    expect(PIP_VOICE_GUIDE.personality).toEqual(['curious', 'cheerful', 'kind', 'enthusiastic']);
    expect(GOAT_VOICE_GUIDE.personality).toEqual(['warm', 'playful', 'adventurous', 'loyal']);
    expect(vault).toContain('DL_HOOK_01');
    expect(vault).toContain('Goat, Don’t Press That Button!');
    expect(vault).toContain('Can You Find the Missing Map Piece?');
    expect(vault).toContain('The Cloud That Was Afraid to Thunder');
    expect(vault).not.toContain('Then breakfast just became a clue');
    expect(EP012_CANONICAL_DIALOGUE_SHA256).toBe('f0b85a04a301359750d59da9699b2d7c26f0acee6d517b83e80fd9420aeb1ac4');
  });
});
