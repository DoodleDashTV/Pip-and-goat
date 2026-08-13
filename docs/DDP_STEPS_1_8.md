# DDP Steps 1–8 — TivvleJoy Studios direction layer

Reference for the eight production systems added in the Steps 1–8 tranche. The
architecture rationale, audit result and risk register live in
[`DDP_STEPS_1_8_ARCHITECTURE.md`](DDP_STEPS_1_8_ARCHITECTURE.md); this document is the
working guide — what each system does, how to extend it, and what the rules are.

> This tranche is **capability, not content**. It plans episodes; it does not produce
> Season 1. The closed FINAL_1080P acceptance is historical evidence and nothing here
> re-derives, replaces or invalidates it.

---

## 1. Data flow

```
approved ScenePlan (ddp-scene-plan-v1)
        │
        ▼
   direct()  ─── Step 1 Director AI ──────────────────────────────┐
        │                                                         │
        │  per shot, in this order:                               │
        │    Step 3 emotion  →  Step 2 acting                     │
        │                    →  Step 4 face                       │
        │    Step 5 camera   →  Step 6 lighting                   │
        │    Step 7 vfx      →  Step 8 sound                      │
        ▼                                                         │
ProductionBlueprint (ddp-production-blueprint-v1) ◄───────────────┘
        │
        ├── projectShotForRender()  → shot_meta → assemble_scene.py (Blender/EEVEE)
        ├── projectManifestState()  → CloudJobManifest state bags → buildCloudCacheKey()
        ├── buildFfmpegMixCommand() → FFmpeg audio assembly
        ├── DirectionService        → Postgres (production_blueprints, director_overrides)
        └── /api/direction + /direction → control surface
```

Emotion runs before acting and face because both are expressions *of* an emotion, and
camera runs before lighting because a lighting recipe has to know the framing it is
lighting. Everything else is order-independent and seeded per shot, so no system can
perturb another's choices.

## 2. The eight systems

Each lives in `packages/direction/src/<system>/index.ts`, exports a `plan*()` function
plus its schema, thresholds and vocabulary, and returns `{ plan, issues, decisions }`.
Issues carry a severity; any `ERROR` fails the blueprint. Decisions are the explainable
trace — every choice records what it chose, why, and what it rejected.

### Step 1 — Director AI (`director/`)

`direct(scenePlan, config)` is the only entry point most callers need. It validates the
plan, refuses an unapproved story, composes the other seven systems per beat, applies
human overrides, validates the episode as a whole (duration, hook and payoff placement,
continuity references, vertical-video constraints) and returns a versioned blueprint
with a content hash, cache key, cost estimate and decision trace.

Refuses rather than degrades: `STORY_NOT_APPROVED`, `DIRECTOR_NO_HOOK`,
`DIRECTOR_DANGLING_CONTINUITY_REF`, `EMOTION_GATED_UNAPPROVED` and the rest are errors,
not warnings. There is no fallback to generic direction.

### Step 2 — Animation and acting (`acting/`)

`planActing()` emits pose-to-pose keys across the four phases
(`ANTICIPATION`/`ACTION`/`REACTION`/`SETTLE`), gestures drawn from a per-character
vocabulary, eye-lead offsets, weight shifts, follow-through, locomotion (stride-snapped,
so a walk covers a whole number of strides), and screen-direction continuity.

`measureMotion()` returns machine-readable QC with a repair recommendation per failing
check: foot slide, ground penetration, floating, limb pop, excessive acceleration,
frozen character, mechanical symmetry, impossible pose, collision, prop intersection,
out-of-frame performance. Tolerances are in `MOTION_TOLERANCES`.

Character profiles are in `ACTING_PROFILES` — Pip is quicker and lighter, Goat is
heavier with a longer settle. Neither profile touches a rig or an asset.

### Step 3 — Emotion engine (`emotion/`)

`planEmotion()` turns story context into bounded body, face and voice parameters with
transition timing, cause, confidence, continuity from the previous beat, and settle
behaviour. `EMOTION_VOCABULARY` is the accepted set; `CHILD_SAFE_POLICY` caps intensity
and gates the emotions that need explicit story approval, so a frightening or
aggressive performance cannot be planned by accident.

The same emotion produces different performances for Pip and Goat, by temperament in
the profile rather than by randomness — asserted by test.

### Step 4 — Facial performance (`face/`)

`planFace()` plans blinks, eye darts, gaze targets with eye-head coordination, brow
intent, mouth and beak shapes, coarticulated visemes, expression holds and bounded
asymmetry, and always plans a rest-pose recovery. Dialogue-free reaction acting is
supported: no dialogue simply means no visemes, not an empty face.

Bounded by `FACIAL_TOLERANCES` and the per-character lock. Mouth-group channels are
normalised as a group (`isMouthGroupChannel`) so a smile plus an open mouth cannot sum
past what the rig can hold, which is the clipping failure mode. Nothing here writes
shape keys or touches the shadow-caster path — the chest-seam repair is out of reach by
construction.

### Step 5 — Camera intelligence (`camera/`)

`planCamera()` scores every candidate composition (`COMPOSITIONS`) and move
(`CAMERA_MOVES`) against `CAMERA_RULES` for 1080×1920 vertical delivery: headroom, foot
room, mobile readability, subject priority, gaze and movement lead room, depth layering,
parallax comfort, caption-safe regions, cut rhythm. The chosen framing records its score
and the alternatives it beat.

Refuses cropped crests, horns, feet or required props; hidden reactions; excessive
motion; horizon instability; geometry collision; focal-plane error at either end of a
move (dolly moves carry `endFocusDistanceMeters` so the subject stays sharp through a
push-in); abrupt lens changes; unreadable wides.

The accepted Meadow Map Mystery framing is a **regression fixture**, not a mandatory
composition — the planner is free to choose differently for a different beat.

### Step 6 — Lighting Director (`lighting/`)

`planLighting()` selects from four accepted recipes — `MEADOW_DAY_KEY`,
`MEADOW_DAY_SOFT`, `DISCOVERY_GOLDEN`, `GENTLE_OVERCAST` — each specifying key, fill,
rim and motivated practicals, palette, shadow softness, catchlight geometry and
render-efficient EEVEE settings. `validateLighting()` fails closed on clipped
highlights, crushed shadows, out-of-range luma or saturation, missing catchlights,
inadequate subject separation, missing contact shadows, shadow acne, flicker, or an
unapproved colour-management transform.

Colour management is pinned: `APPROVED_VIEW_TRANSFORM = 'Khronos PBR Neutral'` with
look `None`, matching the corrected pipeline. `REJECTED_LIGHTING_FIXTURES` holds
`BLOWN_NOON`, `CRUSHED_DUSK` and `AGX_REGRESSION` — deliberately failing fixtures that
justify each threshold, so no threshold rests on an accepted example alone.

### Step 7 — VFX registry (`vfx/`)

`VFX_REGISTRY` holds ten versioned, parameterised EEVEE presets covering the requested
categories: `vfx_magic_sparkles_v1`, `vfx_glow_trail_v1`, `vfx_dust_puff_v1`,
`vfx_leaves_wind_v1`, `vfx_map_glow_v1`, `vfx_soft_mist_v1`, `vfx_water_splash_v1`,
`vfx_discovery_burst_v1`, `vfx_environment_particles_v1`, `vfx_transition_accent_v1`.
Each carries bounds, lifetime, palette, particle ceiling, cost weight, licence and
provenance.

`planVfx()` honours story requests explicitly or refuses them by name — never silently
drops one — adds purpose-appropriate defaults, and enforces `VFX_BUDGET` for particles
and cost weight, occlusion limits for faces and required props, and mobile readability
by on-screen extent. Every instance is independently cache-keyed, which is what makes
"change one effect, re-render one shot" true.

### Step 8 — Sound system (`sound/`)

`planSound()` builds a timeline of dialogue, narration, ambience, music, foley,
footsteps and hoofsteps, prop sounds, VFX sounds and transitions, with per-track gain,
fades, offsets, duck priority, licence and provenance. It derives dialogue and viseme
timing metadata, ducking regions, and a deterministic `mixConfigKey`.

Gain staging is explicit: `mixBusTrimDb` is a uniform trim computed so the *summed*
peak clears the true-peak ceiling. Uniform is deliberate — it buys headroom without
disturbing the dialogue-over-music margin.

Voice identities are permanent and locked (`pip_default_v1`, `goat_default_v1`) and
cannot be overridden. Every `VoiceRequest` carries `requiresPaidProvider: false`: the
planner asks whether a cache key exists, never for generation. Local and mock providers
need no credentials.

`buildFfmpegMixCommand()` (in `ffmpeg.ts`) compiles a plan into FFmpeg argv, and
`buildFfmpegAnalysisCommand()` emits the measurement pass. Real assembly fails closed
on any track without a resolved artifact — that is the missing-audio detection.

## 3. Versioned schemas

| Schema | Version | Where |
| --- | --- | --- |
| Scene plan (input) | `ddp-scene-plan-v1` | `schema/scene-plan.ts` |
| Production blueprint (output) | `ddp-production-blueprint-v1` | `schema/blueprint.ts` |
| Cloud job manifest (existing) | `ddp-cloud-job-manifest-v1` | unchanged |

`SUBSYSTEM_VERSIONS` in `versions.ts` carries one version per system. It is folded into
the cache key, so bumping a system's version invalidates the work it produced and
nothing else.

**Migrations.** `schema/migrations.ts` holds an ordered registry and
`upgradeBlueprint()`. It is currently empty because there is one version. To add
`…-v2`: append the new version to `BLUEPRINT_SCHEMA_HISTORY`, add a migration function
from v1 to v2, and bump `BLUEPRINT_SCHEMA_VERSION`. Stored rows migrate on read.
A stored version that is not in the history is **refused**, not guessed at.

## 4. Extension points

**A new lighting recipe.** Add to `RECIPES` in `lighting/index.ts` with its predicted
measurements. If it needs a threshold change, add a deliberately-rejected fixture to
`REJECTED_LIGHTING_FIXTURES` justifying it. Never loosen a threshold to make a scene
pass.

**A new VFX preset.** Append to `VFX_REGISTRY` with a fresh `id` ending `_vN`, bounds,
lifetime, particle ceiling, cost weight, palette, licence and provenance. Editing an
existing preset in place is wrong — bump the version instead, so cached renders keyed to
the old behaviour stay valid.

**A new gesture.** Add to the character's vocabulary in `ACTING_PROFILES` and, if it
should be selected by objective text, to `OBJECTIVE_GESTURES`. The gesture must already
exist as an approved rig action; the acting layer never invents animation data.

**A new emotion.** Add to `EMOTION_PROFILES`. If it is not obviously child-safe, gate
it in `CHILD_SAFE_POLICY` so it needs explicit story approval.

**A new overridable field.** Add to `OVERRIDE_BOUNDS` with its bounds. Anything not
listed is not overridable, and `PROTECTED_OVERRIDE_PATHS` can never be.

**A new Blender-side consumer.** Follow `apply_direction_camera()` in
`assemble_scene.py`: read from the `direction` block, return immediately when it is
absent. Additive and opt-in means a `shot_meta` without the block renders exactly as it
did before. Note that any change under `scripts/blender/` or `workers/runpod-blender/src/`
moves the render-code fingerprint and therefore requires a worker image rebuild before
the next paid launch (see §8).

## 5. Determinism

Identical input plus identical configuration gives byte-identical output. The rules:

- all randomness comes from `createRng(deriveSeed(rootSeed, shotId, system))`;
- no `Date.now()`, `Math.random()`, locale formatting or map-iteration order reaches a
  hashed field;
- timestamps and author names live in a `meta` envelope excluded from the content hash;
- floats are quantised at the boundary, so no accumulated drift changes a hash;
- collections are sorted before hashing.

The seed is load-bearing, not decorative: a different seed produces a different plan.
Both properties are asserted by the harness and by tests.

## 6. Cache and invalidation rules

Two levels: `shotCacheKey` per shot over everything that can change that shot's pixels
or audio (including the subsystem versions that produced it), and `blueprintCacheKey`
over the episode delivery contract plus the ordered shot keys.

`diffBlueprints(before, after)` reports which shots a replan invalidates, which are
reusable, and which systems changed. Because the bridge writes into the manifest bags
`buildCloudCacheKey()` already hashes, targeted invalidation works through the existing
cloud cache with no change to it.

What propagates and what does not:

| Change | Invalidates |
| --- | --- |
| Lighting recipe on shot 2 | shot 2 only |
| Camera on shot 1 | shots 1 and 2 — camera continuity couples the next shot's screen direction |
| One VFX instance | its own shot |
| One audio track | its own shot; other tracks keep their artifacts |
| A subsystem version bump | every shot that system touched |
| Delivery resolution or fps | the whole episode |

## 7. Local validation workflow

```bash
pnpm validate:steps1-8            # plan, QC, determinism, invalidation, audio mix
pnpm validate:steps1-8 --render    # also render one draft still, if Blender is present
```

Free and offline: pure planners, lavfi-generated audio sources, no provider, no GPU.
Evidence lands in `artifacts/steps-1-8-validation/` — blueprint, per-shot `shot_meta`
and manifest state, QC measurements, determinism proof, invalidation proof, and the
assembled mixes with their EBU R128 measurements.

The fixture is 12 seconds, four beats, Pip and Goat, at 360×640 draft resolution. It is
**not** an acceptance render and its own `summary.json` says so. When Blender is absent
the render stage records `SKIPPED` rather than passing vacuously.

Other useful checks, all inexpensive:

```bash
pnpm test                 # full vitest suite
pnpm typecheck            # every package
pnpm lint
pnpm cloud:fingerprints   # render code + approved asset fingerprints
pnpm cloud:verify-image   # anonymous registry check of the pinned worker image
```

## 8. Paid-provider authorization boundary

Nothing in this tranche can spend money.

- The direction package is pure — no network, so no provider call is even possible.
- `readProviderStatus()` *reports* authorization and cannot grant it. It requires both
  `CLOUD_RENDER_ENABLED === 'true'` and `ALLOW_PAID_GPU_LAUNCH === 'true'`; any other
  value, including `1`, `yes` or `TRUE`, means not authorized.
- Blueprint cost figures are advisory. The spend gate is still `CloudCostGuardrails`
  plus the launch script's own checks, untouched by this tranche.
- Voice requests are declarations that an artifact is needed, with
  `requiresPaidProvider: false`. No paid voice or AI request is made.
- `projectBlueprintForRender()` refuses a blueprint that failed QC, so a known-bad plan
  cannot reach a renderer.

**One consequence to know about.** `assemble_scene.py` gained the opt-in
`apply_direction_camera()` hook, so this checkout's render-code fingerprint moved from
`a4018c0e…` to `d3820820…` and no longer matches the published worker image. Preflight
therefore fails closed with `RENDER_CODE_MISMATCH`. That is intended and tested: the
pin was deliberately **not** updated, because re-pinning would claim the image contains
code it does not. Before the next authorized paid render, run
`pnpm cloud:build-worker-image` and re-pin all four constants in
`scripts/cloud/acceptance-1080p/common.ts` together. The accepted FINAL_1080P artifact
is unaffected — it is historical evidence, and the approved asset fingerprint
`7876ac73…` is unchanged.

## 9. Character and voice lock enforcement

`locks.ts` holds `CHAR_PIP_001` and `CHAR_GOAT_001` as data: anatomy, colours,
accessories, personality, age presentation, protected features, deformation tolerances,
and the permanent voice ids `pip_default_v1` and `goat_default_v1`.

Enforcement is fail-closed. `checkCharacterLock()` runs against every subsystem output
before the blueprint is returned, and a violation is always an `ERROR`. A voice id, a
species, a colour, an accessory, a personality or an age presentation cannot be
overridden — those paths are in `PROTECTED_OVERRIDE_PATHS`, and an attempt is refused
*and recorded*, because someone trying to loosen a lock is exactly what a reviewer needs
to see.

The locks are assertions about plans, never edits to assets. Nothing in the tranche
writes to `production-library/`.

## 10. Known limitations

- **Blender consumes the camera solve only.** Acting, facial and VFX plans are
  projected into `shot_meta` and the manifest bags, but `assemble_scene.py` currently
  reads only the camera block from `direction`. Wiring the remaining consumers is
  follow-up work and will move the render-code fingerprint again.
- **No Blender in this environment.** The optional draft render stage is untested here.
  Blender-dependent gates (`test:blender`, `gates:scene`, `qc:caster`) are unchanged and
  their prior committed results stand.
- **Voice synthesis is declared, not produced.** Voice requests carry cache keys; a
  local synthesiser or cache-fill implementation is a later tranche.
- **Cost model is coarse.** Per-frame minute estimates, adequate for "is this shot
  expensive" and not for billing.
- **Two-pass loudness needs two FFmpeg invocations.** The measurement cannot be reused
  across shots, since each shot's mix is its own programme.
- **Lighting predictions are analytic.** `validateLighting()` checks predicted
  measurements from the recipe, not pixels from a render. It complements the existing
  Blender-side gates rather than replacing them.

## 11. Rollback

The tranche is additive, and rollback is proportionate to how far you want to go.

1. **Disable the feature, keep the code.** Stop calling `/api/direction` and remove the
   `/direction` nav entry in `StudioShell.tsx`. Nothing else reads the blueprint tables,
   so the studio behaves exactly as it did before.
2. **Revert the code.** `git revert` the tranche commits. The only change outside new
   files is `apply_direction_camera()` in `assemble_scene.py` (opt-in, no-op without a
   `direction` block), the brand display resolution in the UI, and the
   `latestForEpisode` ordering fix. Reverting restores the render-code fingerprint to
   `a4018c0e…`, which re-aligns the published worker image pin.
3. **Drop the schema.** `DROP TABLE director_overrides; DROP TABLE production_blueprints;`
   Nothing references them, no existing table was altered, and no historical row was
   rewritten.
4. **Brand.** Set `STUDIO_DISPLAY_NAME` back to `INTERNAL_BRAND_NAME` in
   `packages/domain/src/brand.ts`. One constant, because the rebrand was never a
   find-and-replace.

The closed FINAL_1080P acceptance is unaffected at every step: no rollback path touches
`production-library/`, the accepted artifact, or its evidence.

## 12. How Steps 9–16 should integrate

The seams are already there. Use them rather than redesigning Steps 1–8.

- **Add a system, do not widen the director.** A new planner is a new module exporting
  `plan*(input) → { plan, issues, decisions }`, a version in `SUBSYSTEM_VERSIONS`, and a
  field on `ShotBlueprintSchema`. `direct()` calls it; nothing else changes.
- **Bump the blueprint version and write a migration.** Adding a required field to
  `ShotBlueprintSchema` means `…-v2` plus a v1→v2 migration. Stored blueprints then
  upgrade on read, and a version not in the history is refused rather than guessed.
- **Stay pure.** Anything needing a database, a clock or a network belongs in
  `packages/production`, not here. Purity is what keeps the suite offline and fast.
- **Extend the bridge, not the manifest.** Project new state into the existing
  `CloudJobManifest` bags. They are already hashed by `buildCloudCacheKey()`, so
  invalidation works for free. A parallel manifest would create a second source of
  truth.
- **New `shot_meta` keys are opt-in.** Blender must render identically when the key is
  absent. Any change to the render path requires a worker rebuild and a re-pin.
- **Keep locks and safety in `locks.ts`.** A new system asserts against the existing
  locks; it does not carry its own copy of what Pip looks like.
- **Never weaken a gate to pass a new scene.** A new threshold ships with an accepted
  fixture and a deliberately-rejected one.
- **Advisory costs stay advisory.** No new system may authorize spend. The paid-launch
  gate has one home and keeps it.
