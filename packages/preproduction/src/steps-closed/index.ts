/**
 * Character-independent Steps 9–16 infrastructure behind the closed theatrical gate.
 *
 * This is not an operational unlock of DDP Steps 9–16. `currentStage()` stays
 * `DDP_STEPS_1_8`. `evaluateTheatricalGate().allowed` stays false.
 */
export * from './story-brain';
export * from './continuity-db';
export * from './retention';
export * from './storyboard-compiler';
export * from './animatic-compiler';
export * from './visual-qc';
export * from './motion-audio-qc';
export * from './auto-repair';
export * from './acceptance';
