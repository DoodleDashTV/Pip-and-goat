import { describe, expect, it } from 'vitest';
import {
  affectedEpisodesForSubject,
  buildContinuityLedger,
  evaluateContinuity,
  hashContinuityFact,
  latestFact,
  type ContinuityFact,
} from './tivvlejoy-production-studio/continuity';
import { ep012ContinuityFacts } from './tivvlejoy-production-studio/fixtures';

function fact(partial: Omit<ContinuityFact, 'dependencySha256'> & { dependencySha256?: string }): ContinuityFact {
  return { ...partial, dependencySha256: partial.dependencySha256 || hashContinuityFact(partial) };
}

describe('continuity ledger', () => {
  it('builds a deterministic ledger independent of input order', () => {
    const facts = ep012ContinuityFacts();
    const a = buildContinuityLedger(facts);
    const b = buildContinuityLedger([...facts].reverse());
    expect(a.ledgerSha256).toBe(b.ledgerSha256);
    expect(a.schemaVersion).toBe('TIVVLEJOY_CONTINUITY_LEDGER_V1');
  });

  it('indexes facts by subject, episode, and topic', () => {
    const ledger = buildContinuityLedger(ep012ContinuityFacts());
    expect(ledger.indexes.byEpisode.EP012?.length).toBeGreaterThan(2);
    expect(ledger.indexes.byTopic.PROP_CARRIER?.length).toBeGreaterThan(0);
    expect(ledger.indexes.bySubject['SIGNAGE::BAKERY_SIGN']?.length).toBe(1);
  });

  it('looks up the latest fact by episode/shot order, not fact id', () => {
    const ledger = buildContinuityLedger([
      fact({
        continuityFactId: 'Z_LATE_ID_EARLY_SHOT',
        continuityVersion: '1',
        topic: 'PROP_CARRIER',
        subjectId: 'STORY_MAP',
        state: 'PIP',
        effectiveEpisode: 'EP012',
        effectiveShot: 'SH003',
        source: 'test',
      }),
      fact({
        continuityFactId: 'A_EARLY_ID_LATE_SHOT',
        continuityVersion: '1',
        topic: 'PROP_CARRIER',
        subjectId: 'STORY_MAP',
        state: 'GOAT',
        effectiveEpisode: 'EP012',
        effectiveShot: 'SH007',
        source: 'test',
      }),
    ]);
    expect(latestFact(ledger, 'PROP_CARRIER', 'STORY_MAP')?.state).toBe('GOAT');
  });

  it('flags a disappearing map as a continuity conflict', () => {
    const ledger = buildContinuityLedger([
      fact({
        continuityFactId: 'MAP5',
        continuityVersion: '1',
        topic: 'PROP_CARRIER',
        subjectId: 'STORY_MAP',
        state: 'PIP',
        effectiveEpisode: 'EP012',
        effectiveShot: 'SH005',
        source: 'planner',
      }),
    ]);
    const report = evaluateContinuity(ledger, [
      { episodeId: 'EP012', shotId: 'SH006', topic: 'PROP_CARRIER', subjectId: 'STORY_MAP', state: 'ABSENT' },
    ]);
    expect(report.status).toBe('CONTINUITY_CONFLICT');
    expect(report.issues[0]?.reason).toMatch(/without explicit transfer/);
  });

  it('allows an explicit map transfer', () => {
    const ledger = buildContinuityLedger([
      fact({
        continuityFactId: 'MAP5',
        continuityVersion: '1',
        topic: 'PROP_CARRIER',
        subjectId: 'STORY_MAP',
        state: 'PIP',
        effectiveEpisode: 'EP012',
        effectiveShot: 'SH005',
        source: 'planner',
      }),
    ]);
    const report = evaluateContinuity(ledger, [
      { episodeId: 'EP012', shotId: 'SH006', topic: 'PROP_CARRIER', subjectId: 'STORY_MAP', state: 'TRANSFER:GOAT' },
    ]);
    expect(report.status).toBe('CONTINUITY_VALID');
  });

  it('allows storing a carried prop', () => {
    const ledger = buildContinuityLedger([
      fact({
        continuityFactId: 'MAP5',
        continuityVersion: '1',
        topic: 'PROP_CARRIER',
        subjectId: 'STORY_MAP',
        state: 'PIP',
        effectiveEpisode: 'EP012',
        effectiveShot: 'SH005',
        source: 'planner',
      }),
    ]);
    expect(
      evaluateContinuity(ledger, [
        { episodeId: 'EP012', shotId: 'SH006', topic: 'PROP_CARRIER', subjectId: 'STORY_MAP', state: 'STORED_BAKERY_SHELF' },
      ]).status,
    ).toBe('CONTINUITY_VALID');
  });

  it('blocks an unjustified screen-direction reverse', () => {
    const ledger = buildContinuityLedger([
      fact({
        continuityFactId: 'DIR',
        continuityVersion: '1',
        topic: 'SCREEN_DIRECTION',
        subjectId: 'GOAT',
        state: 'ENTER_RIGHT',
        effectiveEpisode: 'EP012',
        effectiveShot: 'SH002',
        source: 'planner',
      }),
    ]);
    const report = evaluateContinuity(ledger, [
      { episodeId: 'EP012', shotId: 'SH003', topic: 'SCREEN_DIRECTION', subjectId: 'GOAT', state: 'ENTER_LEFT' },
    ]);
    expect(report.status).toBe('CONTINUITY_CONFLICT');
  });

  it('allows a justified cut that changes screen direction', () => {
    const ledger = buildContinuityLedger([
      fact({
        continuityFactId: 'DIR',
        continuityVersion: '1',
        topic: 'SCREEN_DIRECTION',
        subjectId: 'GOAT',
        state: 'ENTER_RIGHT',
        effectiveEpisode: 'EP012',
        effectiveShot: 'SH002',
        source: 'planner',
      }),
    ]);
    expect(
      evaluateContinuity(ledger, [
        { episodeId: 'EP012', shotId: 'SH003', topic: 'SCREEN_DIRECTION', subjectId: 'GOAT', state: 'TRANSITION:ENTER_LEFT_NEW_SCENE' },
      ]).status,
    ).toBe('CONTINUITY_VALID');
  });

  it('blocks a snowing location becoming summer-clear without a transition', () => {
    const ledger = buildContinuityLedger([
      fact({
        continuityFactId: 'WX',
        continuityVersion: '1',
        topic: 'WEATHER',
        subjectId: 'bakery',
        state: 'SNOW',
        effectiveEpisode: 'EP012',
        effectiveShot: 'SH001',
        source: 'world-builder',
      }),
    ]);
    expect(
      evaluateContinuity(ledger, [
        { episodeId: 'EP012', shotId: 'SH002', topic: 'WEATHER', subjectId: 'bakery', state: 'CLEAR' },
      ]).status,
    ).toBe('CONTINUITY_CONFLICT');
  });

  it('blocks a season jump without a transition', () => {
    const ledger = buildContinuityLedger([
      fact({
        continuityFactId: 'SEASON',
        continuityVersion: '1',
        topic: 'SEASON',
        subjectId: 'bakery',
        state: 'WINTER',
        effectiveEpisode: 'EP012',
        effectiveShot: 'SH001',
        source: 'world-builder',
      }),
    ]);
    expect(
      evaluateContinuity(ledger, [
        { episodeId: 'EP012', shotId: 'SH002', topic: 'SEASON', subjectId: 'bakery', state: 'SUMMER' },
      ]).status,
    ).toBe('CONTINUITY_CONFLICT');
  });

  it('keeps bakery sign identity valid across episodes', () => {
    const ledger = buildContinuityLedger([
      fact({
        continuityFactId: 'SIGN12',
        continuityVersion: '1',
        topic: 'SIGNAGE',
        subjectId: 'BAKERY_SIGN',
        state: 'PIP_AND_GOAT_BAKERY',
        effectiveEpisode: 'EP012',
        effectiveShot: 'SH001',
        source: 'world-builder',
      }),
    ]);
    expect(
      evaluateContinuity(ledger, [
        { episodeId: 'EP013', shotId: 'SH001', topic: 'SIGNAGE', subjectId: 'BAKERY_SIGN', state: 'PIP_AND_GOAT_BAKERY' },
      ]).status,
    ).toBe('CONTINUITY_VALID');
  });

  it('marks a changed bakery sign in a later episode as stale', () => {
    const ledger = buildContinuityLedger([
      fact({
        continuityFactId: 'SIGN12',
        continuityVersion: '1',
        topic: 'SIGNAGE',
        subjectId: 'BAKERY_SIGN',
        state: 'PIP_AND_GOAT_BAKERY',
        effectiveEpisode: 'EP012',
        effectiveShot: 'SH001',
        source: 'world-builder',
      }),
    ]);
    const report = evaluateContinuity(ledger, [
      { episodeId: 'EP013', shotId: 'SH001', topic: 'SIGNAGE', subjectId: 'BAKERY_SIGN', state: 'NEW_SIGN' },
    ]);
    expect(report.status).toBe('CONTINUITY_STALE');
  });

  it('reports missing signage when no prior fact exists', () => {
    const report = evaluateContinuity(buildContinuityLedger([]), [
      { episodeId: 'EP012', shotId: 'SH001', topic: 'SIGNAGE', subjectId: 'BAKERY_SIGN', state: 'PIP_AND_GOAT_BAKERY' },
    ]);
    expect(report.status).toBe('CONTINUITY_MISSING');
  });

  it('reports missing prop carrier when the map was never established', () => {
    expect(
      evaluateContinuity(buildContinuityLedger([]), [
        { episodeId: 'EP012', shotId: 'SH006', topic: 'PROP_CARRIER', subjectId: 'STORY_MAP', state: 'PIP' },
      ]).status,
    ).toBe('CONTINUITY_MISSING');
  });

  it('reports missing prop state without a prior fact', () => {
    expect(
      evaluateContinuity(buildContinuityLedger([]), [
        { episodeId: 'EP012', shotId: 'SH001', topic: 'PROP_STATE', subjectId: 'PIE', state: 'CONSUMED' },
      ]).status,
    ).toBe('CONTINUITY_MISSING');
  });

  it('tracks character identity without mutating character assets', () => {
    const ledger = buildContinuityLedger([
      fact({
        continuityFactId: 'PIP_ID',
        continuityVersion: '1',
        topic: 'CHARACTER_IDENTITY',
        subjectId: 'PIP',
        state: 'PIP_CANON',
        effectiveEpisode: 'EP001',
        effectiveShot: 'SH001',
        source: 'symbolic',
      }),
    ]);
    expect(
      evaluateContinuity(ledger, [
        { episodeId: 'EP002', shotId: 'SH001', topic: 'CHARACTER_IDENTITY', subjectId: 'PIP', state: 'PIP_CANON' },
      ]).status,
    ).toBe('CONTINUITY_VALID');
    expect(JSON.stringify(ledger.facts)).not.toMatch(/production-library\/characters/);
  });

  it('detects a character scale mismatch', () => {
    const ledger = buildContinuityLedger([
      fact({
        continuityFactId: 'SCALE',
        continuityVersion: '1',
        topic: 'CHARACTER_SCALE',
        subjectId: 'GOAT',
        state: '1.0',
        effectiveEpisode: 'EP001',
        effectiveShot: 'SH001',
        source: 'symbolic',
      }),
    ]);
    expect(
      evaluateContinuity(ledger, [
        { episodeId: 'EP001', shotId: 'SH002', topic: 'CHARACTER_SCALE', subjectId: 'GOAT', state: '2.4' },
      ]).status,
    ).toBe('CONTINUITY_CONFLICT');
  });

  it('tracks accessories symbolically', () => {
    const ledger = buildContinuityLedger([
      fact({
        continuityFactId: 'HAT',
        continuityVersion: '1',
        topic: 'CHARACTER_ACCESSORY',
        subjectId: 'PIP_HAT',
        state: 'ON',
        effectiveEpisode: 'EP001',
        effectiveShot: 'SH001',
        source: 'symbolic',
      }),
    ]);
    expect(
      evaluateContinuity(ledger, [
        { episodeId: 'EP001', shotId: 'SH002', topic: 'CHARACTER_ACCESSORY', subjectId: 'PIP_HAT', state: 'OFF' },
      ]).status,
    ).toBe('CONTINUITY_CONFLICT');
  });

  it('tracks prop ownership separately from carrier', () => {
    const ledger = buildContinuityLedger([
      fact({
        continuityFactId: 'OWN',
        continuityVersion: '1',
        topic: 'PROP_OWNERSHIP',
        subjectId: 'STORY_MAP',
        state: 'PIP',
        effectiveEpisode: 'EP001',
        effectiveShot: 'SH001',
        source: 'planner',
      }),
    ]);
    expect(
      evaluateContinuity(ledger, [
        { episodeId: 'EP001', shotId: 'SH002', topic: 'PROP_OWNERSHIP', subjectId: 'STORY_MAP', state: 'GOAT' },
      ]).status,
    ).toBe('CONTINUITY_CONFLICT');
  });

  it('tracks location identity and variant', () => {
    const ledger = buildContinuityLedger([
      fact({
        continuityFactId: 'LOC',
        continuityVersion: '1',
        topic: 'LOCATION_IDENTITY',
        subjectId: 'SHOT_LINK',
        state: 'bakery',
        effectiveEpisode: 'EP001',
        effectiveShot: 'SH001',
        source: 'world-builder',
      }),
      fact({
        continuityFactId: 'VAR',
        continuityVersion: '1',
        topic: 'LOCATION_VARIANT',
        subjectId: 'bakery',
        state: 'morning-open',
        effectiveEpisode: 'EP001',
        effectiveShot: 'SH001',
        source: 'world-builder',
      }),
    ]);
    expect(
      evaluateContinuity(ledger, [
        { episodeId: 'EP001', shotId: 'SH002', topic: 'LOCATION_IDENTITY', subjectId: 'SHOT_LINK', state: 'forest_exit' },
      ]).status,
    ).toBe('CONTINUITY_CONFLICT');
  });

  it('tracks time of day and lighting continuity', () => {
    const ledger = buildContinuityLedger([
      fact({
        continuityFactId: 'TOD',
        continuityVersion: '1',
        topic: 'TIME_OF_DAY',
        subjectId: 'bakery',
        state: 'NIGHT_COZY',
        effectiveEpisode: 'EP001',
        effectiveShot: 'SH001',
        source: 'world-builder',
      }),
      fact({
        continuityFactId: 'LIGHT',
        continuityVersion: '1',
        topic: 'LIGHTING',
        subjectId: 'bakery',
        state: 'NIGHT',
        effectiveEpisode: 'EP001',
        effectiveShot: 'SH001',
        source: 'world-builder',
      }),
    ]);
    expect(
      evaluateContinuity(ledger, [
        { episodeId: 'EP001', shotId: 'SH002', topic: 'TIME_OF_DAY', subjectId: 'bakery', state: 'MORNING_WARM' },
      ]).status,
    ).toBe('CONTINUITY_CONFLICT');
    expect(
      evaluateContinuity(ledger, [
        { episodeId: 'EP001', shotId: 'SH002', topic: 'LIGHTING', subjectId: 'bakery', state: 'DAY' },
      ]).status,
    ).toBe('CONTINUITY_CONFLICT');
  });

  it('tracks camera side and entry/exit direction', () => {
    const ledger = buildContinuityLedger([
      fact({
        continuityFactId: 'CAM',
        continuityVersion: '1',
        topic: 'CAMERA_SIDE',
        subjectId: 'PIP',
        state: 'CAMERA_LEFT',
        effectiveEpisode: 'EP001',
        effectiveShot: 'SH001',
        source: 'planner',
      }),
      fact({
        continuityFactId: 'EXIT',
        continuityVersion: '1',
        topic: 'ENTRY_EXIT',
        subjectId: 'GOAT',
        state: 'EXIT_RIGHT',
        effectiveEpisode: 'EP001',
        effectiveShot: 'SH001',
        source: 'planner',
      }),
    ]);
    expect(
      evaluateContinuity(ledger, [
        { episodeId: 'EP001', shotId: 'SH002', topic: 'CAMERA_SIDE', subjectId: 'PIP', state: 'CAMERA_RIGHT' },
      ]).status,
    ).toBe('CONTINUITY_CONFLICT');
    expect(
      evaluateContinuity(ledger, [
        { episodeId: 'EP001', shotId: 'SH002', topic: 'ENTRY_EXIT', subjectId: 'GOAT', state: 'ENTER_LEFT' },
      ]).status,
    ).toBe('CONTINUITY_CONFLICT');
  });

  it('tracks damage, map, doors, consumed food, and recurring background features', () => {
    const ledger = buildContinuityLedger([
      fact({
        continuityFactId: 'WEAR',
        continuityVersion: '1',
        topic: 'DAMAGE_WEAR',
        subjectId: 'PIP_SATCHEL',
        state: 'CLEAN',
        effectiveEpisode: 'EP001',
        effectiveShot: 'SH001',
        source: 'symbolic',
      }),
      fact({
        continuityFactId: 'MAPSTATE',
        continuityVersion: '1',
        topic: 'MAP_STATE',
        subjectId: 'STORY_MAP',
        state: 'FOLDED',
        effectiveEpisode: 'EP001',
        effectiveShot: 'SH001',
        source: 'planner',
      }),
      fact({
        continuityFactId: 'DOOR',
        continuityVersion: '1',
        topic: 'DOOR_WINDOW',
        subjectId: 'BAKERY_DOOR',
        state: 'OPEN',
        effectiveEpisode: 'EP001',
        effectiveShot: 'SH001',
        source: 'world-builder',
      }),
      fact({
        continuityFactId: 'PIE',
        continuityVersion: '1',
        topic: 'CONSUMED_ITEM',
        subjectId: 'BERRY_PIE',
        state: 'WHOLE',
        effectiveEpisode: 'EP001',
        effectiveShot: 'SH001',
        source: 'planner',
      }),
      fact({
        continuityFactId: 'BG',
        continuityVersion: '1',
        topic: 'RECURRING_BACKGROUND',
        subjectId: 'MOUNTAIN_LINE',
        state: 'THREE_PEAKS',
        effectiveEpisode: 'EP001',
        effectiveShot: 'SH001',
        source: 'world-builder',
      }),
    ]);
    expect(
      evaluateContinuity(ledger, [
        { episodeId: 'EP001', shotId: 'SH002', topic: 'DAMAGE_WEAR', subjectId: 'PIP_SATCHEL', state: 'TORN' },
      ]).status,
    ).toBe('CONTINUITY_CONFLICT');
    expect(
      evaluateContinuity(ledger, [
        { episodeId: 'EP001', shotId: 'SH002', topic: 'DOOR_WINDOW', subjectId: 'BAKERY_DOOR', state: 'CLOSED' },
      ]).status,
    ).toBe('CONTINUITY_CONFLICT');
    expect(
      evaluateContinuity(ledger, [
        { episodeId: 'EP001', shotId: 'SH002', topic: 'CONSUMED_ITEM', subjectId: 'BERRY_PIE', state: 'GONE' },
      ]).status,
    ).toBe('CONTINUITY_CONFLICT');
    expect(
      evaluateContinuity(ledger, [
        { episodeId: 'EP002', shotId: 'SH001', topic: 'RECURRING_BACKGROUND', subjectId: 'MOUNTAIN_LINE', state: 'FLAT' },
      ]).status,
    ).toBe('CONTINUITY_STALE');
  });

  it('limits subject impact to the episodes that recorded that fact', () => {
    const ledger = buildContinuityLedger([
      fact({
        continuityFactId: 'MAP_A',
        continuityVersion: '1',
        topic: 'PROP_CARRIER',
        subjectId: 'STORY_MAP',
        state: 'PIP',
        effectiveEpisode: 'EP001',
        effectiveShot: 'SH003',
        source: 'sim',
      }),
      fact({
        continuityFactId: 'SIGN_B',
        continuityVersion: '1',
        topic: 'SIGNAGE',
        subjectId: 'BAKERY_SIGN',
        state: 'PIP_AND_GOAT_BAKERY',
        effectiveEpisode: 'EP012',
        effectiveShot: 'SH001',
        source: 'sim',
      }),
    ]);
    expect(affectedEpisodesForSubject(ledger, 'PROP_CARRIER', 'STORY_MAP')).toEqual(['EP001']);
    expect(affectedEpisodesForSubject(ledger, 'SIGNAGE', 'BAKERY_SIGN')).toEqual(['EP012']);
  });

  it('does not let a bakery conflict invalidate an unrelated forest observation', () => {
    const ledger = buildContinuityLedger([
      fact({
        continuityFactId: 'WX_B',
        continuityVersion: '1',
        topic: 'WEATHER',
        subjectId: 'bakery',
        state: 'SNOW',
        effectiveEpisode: 'EP001',
        effectiveShot: 'SH001',
        source: 'sim',
      }),
      fact({
        continuityFactId: 'WX_F',
        continuityVersion: '1',
        topic: 'WEATHER',
        subjectId: 'forest_exit',
        state: 'CLEAR',
        effectiveEpisode: 'EP001',
        effectiveShot: 'SH002',
        source: 'sim',
      }),
    ]);
    const report = evaluateContinuity(ledger, [
      { episodeId: 'EP001', shotId: 'SH003', topic: 'WEATHER', subjectId: 'bakery', state: 'CLEAR' },
      { episodeId: 'EP001', shotId: 'SH004', topic: 'WEATHER', subjectId: 'forest_exit', state: 'CLEAR' },
    ]);
    expect(report.issues.every((item) => item.subjectId === 'bakery')).toBe(true);
  });

  it('hashes each fact from identity fields, not display names', () => {
    const a = hashContinuityFact({
      continuityFactId: 'F1',
      continuityVersion: '1',
      topic: 'SIGNAGE',
      subjectId: 'BAKERY_SIGN',
      state: 'PIP_AND_GOAT_BAKERY',
      effectiveEpisode: 'EP012',
      effectiveShot: 'SH001',
      source: 'world-builder',
    });
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('changes the ledger hash when a fact version changes', () => {
    const first = fact({
      continuityFactId: 'F1',
      continuityVersion: '1',
      topic: 'SIGNAGE',
      subjectId: 'BAKERY_SIGN',
      state: 'PIP_AND_GOAT_BAKERY',
      effectiveEpisode: 'EP012',
      effectiveShot: 'SH001',
      source: 'world-builder',
    });
    const second = fact({ ...first, continuityVersion: '2', dependencySha256: '' });
    expect(buildContinuityLedger([first]).ledgerSha256).not.toBe(buildContinuityLedger([second]).ledgerSha256);
  });

  it('returns CONTINUITY_VALID when matching observations are supplied', () => {
    const ledger = buildContinuityLedger(ep012ContinuityFacts());
    const report = evaluateContinuity(
      ledger,
      ledger.facts.map((item) => ({
        episodeId: item.effectiveEpisode,
        shotId: item.effectiveShot ?? 'SH001',
        topic: item.topic,
        subjectId: item.subjectId,
        state: item.state,
      })),
    );
    expect(report.status).toBe('CONTINUITY_VALID');
    expect(report.continuityDependencySha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic for the same observations', () => {
    const ledger = buildContinuityLedger(ep012ContinuityFacts());
    const observations = [
      { episodeId: 'EP012', shotId: 'SH006', topic: 'PROP_CARRIER', subjectId: 'STORY_MAP', state: 'ABSENT' },
    ];
    expect(evaluateContinuity(ledger, observations).continuityDependencySha256).toBe(
      evaluateContinuity(ledger, [...observations].reverse()).continuityDependencySha256,
    );
  });

  it('does not require a prior fact for weather on a brand-new location', () => {
    expect(
      evaluateContinuity(buildContinuityLedger([]), [
        { episodeId: 'EP001', shotId: 'SH001', topic: 'WEATHER', subjectId: 'new_meadow', state: 'CLEAR' },
      ]).status,
    ).toBe('CONTINUITY_VALID');
  });

  it('records symbolic continuity only and never encodes media', () => {
    expect(JSON.stringify(ep012ContinuityFacts())).not.toMatch(/\.blend|\.glb|base64/);
  });

  it('keeps fact ids and versions on every EP012 fixture', () => {
    for (const item of ep012ContinuityFacts()) {
      expect(item.continuityFactId.length).toBeGreaterThan(3);
      expect(item.continuityVersion).toBe('1');
      expect(item.dependencySha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it('can evaluate a later episode against an earlier bakery sign', () => {
    const ledger = buildContinuityLedger(ep012ContinuityFacts());
    expect(latestFact(ledger, 'SIGNAGE', 'BAKERY_SIGN', { episodeId: 'EP040', shotId: 'SH001' })?.state).toBe(
      'PIP_AND_GOAT_BAKERY',
    );
  });

  it('does not treat a later shot as prior when querying an earlier shot', () => {
    const ledger = buildContinuityLedger(ep012ContinuityFacts());
    expect(latestFact(ledger, 'PROP_CARRIER', 'STORY_MAP', { episodeId: 'EP012', shotId: 'SH002' })).toBeNull();
  });

  it('aggregates conflict over missing and stale', () => {
    const ledger = buildContinuityLedger([
      fact({
        continuityFactId: 'MAP',
        continuityVersion: '1',
        topic: 'PROP_CARRIER',
        subjectId: 'STORY_MAP',
        state: 'PIP',
        effectiveEpisode: 'EP001',
        effectiveShot: 'SH001',
        source: 'sim',
      }),
    ]);
    const report = evaluateContinuity(ledger, [
      { episodeId: 'EP001', shotId: 'SH002', topic: 'PROP_CARRIER', subjectId: 'STORY_MAP', state: 'GONE' },
      { episodeId: 'EP002', shotId: 'SH001', topic: 'SIGNAGE', subjectId: 'BAKERY_SIGN', state: 'X' },
    ]);
    expect(report.status).toBe('CONTINUITY_CONFLICT');
  });

  it('prefers missing over stale when no conflict exists', () => {
    const report = evaluateContinuity(buildContinuityLedger([]), [
      { episodeId: 'EP002', shotId: 'SH001', topic: 'SIGNAGE', subjectId: 'BAKERY_SIGN', state: 'X' },
    ]);
    expect(report.status).toBe('CONTINUITY_MISSING');
  });

  it('uses factsById so large ledgers do not scan linearly per lookup', () => {
    const facts = Array.from({ length: 200 }, (_, index) =>
      fact({
        continuityFactId: `F${String(index).padStart(3, '0')}`,
        continuityVersion: '1',
        topic: 'PROP_STATE',
        subjectId: `PROP_${index}`,
        state: 'OK',
        effectiveEpisode: `EP${String((index % 60) + 1).padStart(3, '0')}`,
        effectiveShot: 'SH001',
        source: 'sim',
      }),
    );
    const ledger = buildContinuityLedger(facts);
    expect(ledger.factsById.get('F199')?.subjectId).toBe('PROP_199');
    expect(affectedEpisodesForSubject(ledger, 'PROP_STATE', 'PROP_199')).toEqual(['EP020']);
  });

  it('does not mutate character scale facts into asset files', () => {
    const ledger = buildContinuityLedger([
      fact({
        continuityFactId: 'SCALE',
        continuityVersion: '1',
        topic: 'CHARACTER_SCALE',
        subjectId: 'PIP',
        state: '1.0',
        effectiveEpisode: 'EP001',
        effectiveShot: null,
        source: 'symbolic',
      }),
    ]);
    expect(ledger.facts[0]?.source).toBe('symbolic');
  });

  it('keeps matching map carry valid from shot 3 to shot 7', () => {
    const ledger = buildContinuityLedger(ep012ContinuityFacts());
    expect(
      evaluateContinuity(ledger, [
        { episodeId: 'EP012', shotId: 'SH007', topic: 'PROP_CARRIER', subjectId: 'STORY_MAP', state: 'PIP' },
      ]).status,
    ).toBe('CONTINUITY_VALID');
  });

  it('treats an unexplained map owner swap as a same-episode conflict', () => {
    const ledger = buildContinuityLedger(ep012ContinuityFacts());
    expect(
      evaluateContinuity(ledger, [
        { episodeId: 'EP012', shotId: 'SH008', topic: 'PROP_CARRIER', subjectId: 'STORY_MAP', state: 'GOAT' },
      ]).status,
    ).toBe('CONTINUITY_CONFLICT');
  });
});
