import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('EP001 connected voice preflight route', () => {
  it('is GET-only zero-contact configuration inspection', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src/app/api/voice-production/ep001/preflight/route.ts'), 'utf8');
    expect(source).toContain("VERCEL_ENV === 'preview'");
    expect(source).toContain('ELEVENLABS_API_KEY');
    expect(source).toContain('ep012AudioStorageConfigured');
    expect(source).toContain("lockedVoiceIdFor('CHAR_PIP_001')");
    expect(source).toContain("lockedVoiceIdFor('CHAR_GOAT_001')");
    expect(source).toContain('providerContacted: false');
    expect(source).toContain('providerRequestsMade: 0');
    expect(source).toContain('storageMutations: 0');
    expect(source).toContain('productionMutations: 0');
    expect(source).not.toContain('createEp012ElevenLabsTransport');
    expect(source).not.toContain('PutObjectCommand');
  });
});
