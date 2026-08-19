import { describe, expect, it } from 'vitest';
import { compileDeliveryPackage } from './tivvlejoy-production-studio/delivery';

function pkg(overrides: Partial<Parameters<typeof compileDeliveryPackage>[0]> = {}) {
  return compileDeliveryPackage({
    episodeId: 'EP012',
    episodeVersion: 'v1',
    episodeNumber: 12,
    seasonNumber: 1,
    title: 'Bakery Map',
    productionPacketSha256: 'aa'.repeat(32),
    qcPassed: false,
    ...overrides,
  });
}

describe('delivery package', () => {
  it('stays QC_BLOCKED when QC has not passed', () => {
    expect(pkg().readiness).toBe('QC_BLOCKED');
    expect(pkg().autoPublished).toBe(false);
  });

  it('stays QC_BLOCKED when QC passed is true but no qc hash exists', () => {
    expect(pkg({ qcPassed: true }).readiness).toBe('QC_BLOCKED');
  });

  it('waits for approval after QC when visual approval is missing', () => {
    expect(pkg({ qcPassed: true, qcSha256: 'bb'.repeat(32), visualApprovalPresent: false }).readiness).toBe(
      'WAITING_FOR_APPROVAL',
    );
  });

  it('is ready for manual release only after QC, approval, render, and audio receipts', () => {
    const compiled = pkg({
      qcPassed: true,
      qcSha256: 'bb'.repeat(32),
      visualApprovalPresent: true,
      renderSha256: 'cc'.repeat(32),
      audioSha256: 'dd'.repeat(32),
    });
    expect(compiled.readiness).toBe('READY_FOR_MANUAL_RELEASE');
    expect(compiled.autoPublished).toBe(false);
  });

  it('never uses AUTO_PUBLISHED', () => {
    expect(JSON.stringify(pkg({ qcPassed: true, qcSha256: 'bb'.repeat(32), visualApprovalPresent: true, renderSha256: 'cc'.repeat(32), audioSha256: 'dd'.repeat(32) }))).not.toContain(
      'AUTO_PUBLISHED',
    );
  });

  it('includes required receipt slots', () => {
    const compiled = pkg({
      renderReceiptRef: 'R1',
      renderSha256: 'cc'.repeat(32),
      audioReceiptRef: 'A1',
      audioSha256: 'dd'.repeat(32),
      captionReceiptRef: 'C1',
      captionSha256: 'ee'.repeat(32),
      qcReceiptRef: 'Q1',
      qcSha256: 'ff'.repeat(32),
    });
    expect(compiled.renderReceiptRef).toBe('R1');
    expect(compiled.audioReceiptRef).toBe('A1');
    expect(compiled.captionReceiptRef).toBe('C1');
    expect(compiled.qcReceiptRef).toBe('Q1');
  });

  it('uses the SHORT_60 profile by default', () => {
    expect(pkg()).toMatchObject({ videoProfile: 'SHORT_60', width: 1080, height: 1920, fps: 30, duration: 60 });
  });

  it('can target SHORT_15 and SHORT_30 via profile configuration', () => {
    expect(pkg({ profileId: 'SHORT_15' }).duration).toBe(15);
    expect(pkg({ profileId: 'SHORT_30' }).width).toBe(1080);
  });

  it('reserves future platform slots without building APIs', () => {
    expect(pkg().futurePlatformSlots).toEqual(['YOUTUBE_SHORTS', 'TIKTOK', 'INSTAGRAM_REELS']);
    expect(JSON.stringify(pkg())).not.toMatch(/uploadTo|oauth|access_token|youtube\.googleapis/);
  });

  it('lists delivery files as references, not encoded media', () => {
    expect(pkg().deliveryFiles).toEqual(['video.mp4', 'audio.wav', 'captions.vtt', 'thumbnail.jpg', 'delivery-manifest.json']);
    expect(JSON.stringify(pkg())).not.toMatch(/base64/);
  });

  it('includes title, description placeholder, and thumbnail requirement', () => {
    expect(pkg().title).toBe('Bakery Map');
    expect(pkg().descriptionPlaceholder).toMatch(/Not published/);
    expect(pkg().thumbnailRequirement).toMatch(/1080x1920/);
  });

  it('binds the production packet hash', () => {
    expect(pkg().productionPacketSha256).toBe('aa'.repeat(32));
  });

  it('is deterministic', () => {
    expect(pkg().deliveryPackageSha256).toBe(pkg().deliveryPackageSha256);
    expect(pkg().deliveryPackageSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('changes hash when episode identity changes', () => {
    expect(pkg().deliveryPackageSha256).not.toBe(pkg({ episodeId: 'EP013' }).deliveryPackageSha256);
  });

  it('keeps season and episode numbers', () => {
    expect(pkg()).toMatchObject({ seasonNumber: 1, episodeNumber: 12 });
  });

  it('stays NOT a social post', () => {
    expect(JSON.stringify(pkg())).not.toMatch(/posted|publishedAt|shareUrl/);
  });

  it('does not become ready for manual release without a render hash', () => {
    expect(
      pkg({
        qcPassed: true,
        qcSha256: 'bb'.repeat(32),
        visualApprovalPresent: true,
        audioSha256: 'dd'.repeat(32),
      }).readiness,
    ).toBe('NOT_READY');
  });
});
