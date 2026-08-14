import { describe, expect, it } from 'vitest';
import {
  CHANNEL_DISPLAY_NAME,
  INTERNAL_BRAND_ABBREVIATION,
  INTERNAL_BRAND_NAME,
  LEGACY_BRAND_ALIASES,
  PRODUCT_DISPLAY_NAME,
  STUDIO_DISPLAY_NAME,
  STUDIO_SHORT_NAME,
  UNIVERSE_CANON_NAME,
  isKnownBrandName,
  resolveStudioDisplayName,
} from '@doodle-dash/domain';

describe('TrivvleJoy presentation compatibility', () => {
  it('changes only the human-facing studio identity', () => {
    expect(STUDIO_DISPLAY_NAME).toBe('TivvleJoy Studios');
    expect(STUDIO_SHORT_NAME).toBe('TivvleJoy');
    expect(INTERNAL_BRAND_NAME).toBe('Doodle Dash Production');
    expect(INTERNAL_BRAND_ABBREVIATION).toBe('DDP');
    expect(PRODUCT_DISPLAY_NAME).toBe(INTERNAL_BRAND_NAME);
    expect(CHANNEL_DISPLAY_NAME).toBe('Doodle Dash TV');
    expect(UNIVERSE_CANON_NAME).toBe('Doodle Dash Universe');
  });

  it('resolves all legacy persisted brand aliases without migration', () => {
    for (const alias of LEGACY_BRAND_ALIASES) {
      expect(isKnownBrandName(alias)).toBe(true);
      expect(resolveStudioDisplayName(alias)).toBe(STUDIO_DISPLAY_NAME);
    }
    expect(resolveStudioDisplayName('  doodle dash production  ')).toBe(STUDIO_DISPLAY_NAME);
    expect(resolveStudioDisplayName(null)).toBe(STUDIO_DISPLAY_NAME);
    expect(resolveStudioDisplayName('')).toBe(STUDIO_DISPLAY_NAME);
  });

  it('preserves intentionally custom universe branding', () => {
    expect(resolveStudioDisplayName('Someone Else Studios')).toBe('Someone Else Studios');
    expect(isKnownBrandName('Someone Else Studios')).toBe(false);
  });
});
