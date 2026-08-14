/**
 * The only source of "randomness" in the direction layer.
 *
 * Everything downstream is a pure function of (scene plan, configuration, seed),
 * so a shot re-planned tomorrow on another machine plans identically. That is not
 * a nicety: the render cache is keyed on planning output, so a planner that
 * wobbles silently invalidates finished shots and bills a GPU to re-render them.
 *
 * Rules enforced here, relied on everywhere else:
 *   - no Math.random, no Date.now, no locale-dependent formatting;
 *   - object key order never reaches a hash (stableStringify sorts);
 *   - a seed is derived from a path, so sibling shots cannot perturb each other.
 */
import { createHash } from 'node:crypto';

/** Deterministic JSON: keys sorted at every depth, `undefined` dropped. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(normalize(value));
}

function normalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error(`Non-finite number cannot be serialized deterministically: ${String(value)}`);
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(normalize);
  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    if (source[key] === undefined) continue;
    out[key] = normalize(source[key]);
  }
  return out;
}

/** SHA-256 over the stable serialization of `value`. */
export function stableHash(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

/** Short, readable form of a hash for ids that humans read in a UI. */
export function shortHash(value: unknown, length = 12): string {
  return stableHash(value).slice(0, length);
}

/**
 * Derive a 32-bit seed from a root seed and a path.
 *
 * The path is what keeps subsystems independent: shot 4's camera seed is
 * `deriveSeed(root, 'shot-4', 'camera')`, so re-timing shot 3 leaves it alone.
 */
export function deriveSeed(rootSeed: string, ...path: Array<string | number>): number {
  const digest = createHash('sha256')
    .update(rootSeed)
    .update('\u0000')
    .update(path.map((p) => String(p)).join('\u0000'))
    .digest();
  return digest.readUInt32BE(0);
}

export type Rng = {
  /** Next float in [0, 1). */
  next(): number;
  /** Integer in [minInclusive, maxInclusive]. */
  int(minInclusive: number, maxInclusive: number): number;
  /** Float in [min, max). */
  float(min: number, max: number): number;
  /** Element of a non-empty array. */
  pick<T>(items: readonly T[]): T;
  /** New array containing the same elements in a deterministic shuffled order. */
  shuffle<T>(items: readonly T[]): T[];
};

/**
 * mulberry32. Small, fast, and — importantly — fully specified, so the sequence
 * is identical on every platform and Node version.
 */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    int(minInclusive, maxInclusive) {
      if (maxInclusive < minInclusive) {
        throw new Error(`Empty integer range: [${minInclusive}, ${maxInclusive}]`);
      }
      return minInclusive + Math.floor(next() * (maxInclusive - minInclusive + 1));
    },
    float(min, max) {
      return min + next() * (max - min);
    },
    pick(items) {
      if (items.length === 0) throw new Error('Cannot pick from an empty list.');
      return items[rng.int(0, items.length - 1)];
    },
    shuffle(items) {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = rng.int(0, i);
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
  return rng;
}

/**
 * Round to a fixed number of decimals.
 *
 * Applied to every float that lands in a blueprint. Without it, an
 * arithmetically identical value can serialize as `0.30000000000000004` on one
 * path and `0.3` on another, and the cache key moves for no reason.
 */
export function quantize(value: number, decimals = 4): number {
  if (!Number.isFinite(value)) {
    throw new Error(`Cannot quantize non-finite value: ${String(value)}`);
  }
  const factor = 10 ** decimals;
  // +0 collapses -0, which JSON.stringify renders as "0" but !== 0 in some paths.
  return Math.round(value * factor) / factor + 0;
}

/** Clamp then quantize, for the bounded 0..1 parameters the subsystems trade in. */
export function boundedUnit(value: number, decimals = 4): number {
  return quantize(Math.min(1, Math.max(0, value)), decimals);
}

/** Clamp to an inclusive range and quantize. */
export function clampQuantize(value: number, min: number, max: number, decimals = 4): number {
  return quantize(Math.min(max, Math.max(min, value)), decimals);
}
