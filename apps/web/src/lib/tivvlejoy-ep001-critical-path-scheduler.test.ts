import { describe, expect, it } from 'vitest';
import { compileEp001CriticalPathScheduler } from '@/lib/tivvlejoy-ep001-critical-path-scheduler';

describe('compileEp001CriticalPathScheduler', () => {
  it('starts with four parallel foundation inputs waiting', () => {
    const scheduler = compileEp001CriticalPathScheduler();
    expect(scheduler.metrics.totalLanes).toBe(6);
    expect(scheduler.metrics.readyLanes).toBe(0);
    expect(scheduler.metrics.phaseZeroWaiting).toBe(4);
    expect(scheduler.state).toBe('WAITING_ON_EXTERNAL_FOUNDATION_INPUTS');
    expect(scheduler.authority.schedulerMayBypassPhase).toBe(false);
  });

  it('allows observed foundation inputs to become safe parallel work only', () => {
    const scheduler = compileEp001CriticalPathScheduler([
      'PIP_RIG_ARRIVES',
      'SCENERY_LICENSE_EVIDENCE_ARRIVES',
    ]);
    expect(scheduler.metrics.readyLanes).toBe(2);
    expect(scheduler.readyLanes.every((lane) => lane.phase === 0)).toBe(true);
    expect(scheduler.readyLanes.every((lane) => lane.safeActions.length > 0)).toBe(true);
    expect(scheduler.authority.admissionGranted).toBe(false);
  });

  it('keeps final render authorization in the last phase', () => {
    const scheduler = compileEp001CriticalPathScheduler(['FINAL_RENDER_AUTHORIZATION_ARRIVES']);
    expect(scheduler.readyLanes[0]?.phase).toBe(2);
    expect(scheduler.readyLanes[0]?.triggerId).toBe('FINAL_RENDER_AUTHORIZATION_ARRIVES');
    expect(scheduler.authority.paidExecutionAuthorized).toBe(false);
  });

  it('fails closed on unknown trigger IDs', () => {
    expect(() => compileEp001CriticalPathScheduler(['NOPE'])).toThrow('UNKNOWN_EP001_CRITICAL_PATH_TRIGGER:NOPE');
  });
});
