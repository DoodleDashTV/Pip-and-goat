# TivvleJoy Scenery Fail-Fast Standard V1

This standard exists to stop cheap, simple upstream problems from consuming hours of downstream lookdev or paid-render time.

## Non-negotiable rule

Never silently skip, downgrade, proxy, substitute, or fall back from an intended hero source. If the intended source cannot be used, stop and report the exact blocker.

A catalog entry is not proof of usability. A source must progress through:

`PURCHASED -> LOCATED -> MATERIALIZED -> OPENED_IN_BLENDER -> MATERIALS_RESOLVED -> TEXTURES_RESOLVED -> PRODUCTION_USABLE`

## Before scene assembly

Every scenery job must complete these checks before full environment assembly:

1. **Source provenance** — prove the exact original source will be used.
2. **Hidden-limit audit** — compare actual source/job requirements to file-size, extraction, memory, disk, timeout, payload, frame, GPU/VRAM, and worker caps.
3. **Dependency audit** — Blender version, Geometry Nodes, textures, external links, color management, required modifiers/add-ons, and render engine.
4. **Asset distance quality** — classify each asset `HERO`, `MIDGROUND`, `BACKGROUND`, or `REJECT` based on rendered evidence at the intended distance.
5. **Component proofs** — vegetation, meadow/ground, water/bank, building, and mountain/background must each pass a representative crop before full assembly.

## No silent fallbacks

Hero fallbacks are prohibited. Background fallbacks are allowed only when declared, justified, distance-approved, and explicitly recorded. Every build report must contain a `DEGRADATIONS / FALLBACKS / SKIPPED SOURCES` section. The expected production state is `NONE`.

## Distance quality

Asset quality is camera-distance specific. A background card tree is not a hero tree. A low-LOD cabin can be valid in the background and invalid in the midground. Use rendered evidence, including phone-size review, to assign the class.

## Root-cause escalation

A problem may receive at most two failed incremental repair attempts. After the second failure, further small tweaks are prohibited until a root-cause audit is performed. The next attempt must investigate architecture, source fidelity, topology, dependency/limit issues, or other upstream causes.

## Production stages are separate

Do not collapse these stages into one ready flag:

1. `TECHNICALLY_VALID`
2. `VISUALLY_VALIDATED`
3. `TEMPORALLY_VALIDATED`
4. `WORKER_PARITY_VALIDATED`
5. `PRODUCTION_READY`

A technically valid render is not visually approved. A beautiful still is not temporally approved. A local proof is not worker parity.

## Worker parity

Before paid final rendering, local/approved and worker paths must match on:

- source identity
- Blender version
- render engine
- shader identity
- texture identity
- color management
- render profile
- output profile

Any mismatch blocks paid final rendering.

## Paid final gate

Paid final rendering requires all of the following:

- all required sources are `PRODUCTION_USABLE`
- zero undeclared fallbacks
- zero hidden-limit blockers
- dependency audit pass
- distance-quality pass
- all component proofs pass
- user visual approval of the full-resolution hero look
- motion/temporal approval
- worker parity pass
- `PRODUCTION_READY` receipt
- explicit paid authorization

The cloud preflight consumes `artifacts/tivvlejoy-scenery-showcase-30s/PRODUCTION_READINESS_V1.json` and fails closed if it is absent or invalid.

## What would have caught the 180 MiB problem

A hidden-limit audit comparing the real `Flora_Mat&GN&Models.blend` requirement (~670 MiB) to the old production `.blend` extract cap (180 MiB) would have returned `LIMIT_TOO_LOW` before scenery assembly. The correct behavior is to stop or use a verified high-size intake path — never silently substitute a smaller fallback.

## Optimization order

Establish approved quality first. Then optimize samples, LOD, source materialization, caches, render settings, and worker cost while preserving the approved visual and temporal result.
