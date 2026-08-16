/**
 * `@doodle-dash/preproduction` — TivvleJoy Studios character-independent
 * pre-production track (Studio Milestone 4).
 *
 * Parallel to the theatrical character stack. Does not open Steps 9–16. Does
 * not resume Pip conversion. Does not write production-library. Does not
 * declare theatrical binding.
 *
 *   story          deterministic child-safe episode drafts
 *   continuity     planted / paid / dangling ledger
 *   storyboard     9:16 panels
 *   animatic       30 fps draft timing
 *   shotplan       9:16 camera / shot planning
 *   library        reusable env / prop / lighting / VFX planning
 *   audio          dialogue / music / sound without voice cloning
 *   orchestration  local cache, retry, recovery, spend refuse
 *   qc             visual / motion / audio checks on drafts
 *   gates          fail-closed proxy → final production blockers
 *   workflow       episode-production stages and terminals
 *   assembly       pure FFmpeg argv for local draft animatics / mixes
 *   launchSafety   create-episode / generate-final / paid-resource refuse
 */
export * from './versions';
export * from './schema';
export * from './proxy';
export * from './story';
export * from './continuity';
export * from './storyboard';
export * from './animatic';
export * from './shotplan';
export * from './library';
export * from './audio';
export * from './orchestration';
export * from './qc';
export * from './gates';
export * from './pipeline';
export * from './fixtures';
export * from './workflow';
export * from './assembly';
export * from './launch-safety';
export * from './closed-stages';
export * from './episode1';
export * from './canon';
export * from './cache';
export * from './recovery';
export * from './audio-timing';
export * from './versioning';
export * from './dependencies';
export * from './profile';
export * from './provenance';
export * from './analytics';
export * from './steps-closed';
