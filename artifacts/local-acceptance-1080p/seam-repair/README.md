# Pip's chest seam — cause and repair

The faint vertical line on Pip's chest below the beak was a cast shadow, not a
defect in the surface it fell on. Everything here is measured at 1080x1920 on the
CPU. No GPU pod was created and nothing was billed to produce any of it.

## Cause

Two separate parts of Pip's beak were throwing it, and each needed its own fix.

| | What threw it | Measured | Fixed in |
| --- | --- | --- | --- |
| 1 | The whole beak, after a flat 22 mm caster shrink turned every part thinner than 44 mm inside out. The beak tip is 15 mm across. | Caster island 68.6x73.1x73.0 mm against a 45x99x37 mm beak | `c546666` — each part shrinks by half its own measured thickness |
| 2 | The beak proper, whose shadow the near-tangent sun drew 250 mm down the chest — three and a third times the beak's own width. | `selfShadowShare` 0.97, `selfShadowReachOverWidth` 3.31 | `c7f5ed3` — a part that is not a mass and whose shadow lands on the character further away than the part is wide stops casting |
| 3 | `Pip_BeakTip`, a second sphere authored inside the beak. It is sealed in there — 0.73 mm clear of the beak's surface at its closest point — so the camera never sees it, but it was its own mesh island and therefore its own caster. | 82 of the 11,078 chest pixels were blocked by it and by nothing else | `4c1f418` — a part sealed inside another part stops casting |

`Pip_BeakTip` is the answer to "what is the exact cause of the seam that was still
there". It is dead geometry: `polish_character_v1_1.py` adds it to make the beak
"slightly pointed", and it never reaches the silhouette, so it contributes nothing
to the picture and only ever contributed a shadow. Both characters' pupils sit
inside their irises the same way and were doing the same thing on a smaller scale.

## What it was not

The mesh under the mark is clean. Read straight off the approved asset
(`mesh_topology_pip.json`), `Pip_Character` has 3800 vertices in 29 islands and
**0** duplicate vertex groups, **0** loose vertices, **0** non-manifold edges,
**0** wire edges, **0** sharp edges, **0** flat-shaded faces and no custom split
normals. There is no mirror seam, because there is no mirror: the islands are 29
separate primitives, and 38 pairs of them interpenetrate by design.

`chest_surface_inspection.png` shows the same surface with the world normal
written to emission, with one flat colour per material slot, and under one matte
white material with a raking light. The only feature anywhere on the chest is the
horizontal line where the head sphere enters the body sphere. Nothing vertical
appears in the normals, the materials or the shading — and the mark was vertical.

`causation_pip_stops_casting.png` closes it: stop Pip casting a shadow and the
mark goes, on unchanged geometry under unchanged light. Remove the shadow proxy
instead and the self-shadow acne the proxy exists to prevent comes straight back,
which is why the answer had to be a better caster rather than no caster.

## What is left casting on the chest

`chest_blockers_four_states.json` traces every one of the 11,078 chest pixels the
camera sees onto Pip, in one identical window, in all four states of the planner.
The blocker is whichever island of the caster mesh stands between that surface and
the sun.

| Chest window | Shadowed | Largest blockers |
| --- | --- | --- |
| `a440d88` as shipped | 2770 (25.0%) | beak 1287, catchlights 521, body 456, eye whites 203, brow 118, pupils 76, feet 71, iris 19, beak tip 19 |
| `c546666` per-part shrink | 1864 (16.8%) | beak 999, eye whites 380, body 335, irises 99, catchlights 27, pupils 21, brow 2, beak tip 1 |
| `c7f5ed3` reach rule | 570 (5.1%) | body 486, **beak tip 82**, brow 2 |
| this branch | **488 (4.4%)** | body 486, brow 2 |

The 486 that remain are the body shadowing the part of itself that faces away
from the sun. That is the character's own form shadow and it is what makes Pip
read as round; nothing else on the chest is in shadow at all. No pixel is blocked
by the beak, the beak tip, a pupil, an iris, a catchlight or a foot.

## The same question asked of the delivered pixels

The table above is the planner's own view of the scene, traced by ray. Asking the
rendered frame instead, in `chest_shadow_on_pixels.json`: on frame 45 at
1080x1920 — the frame and angle the mark was visible on — Pip's chest is 7438
plumage pixels, and

| | Shadowed | Deepest shadow |
| --- | --- | --- |
| `a440d88` as shipped | 3020 (40.6%) | 72.7% below the lit level |
| this branch | 2029 (27.3%) | 52.2% below the lit level |

991 pixels of shadow gone, and what is left is 20 points shallower: the hard dark
edge of the mark has become the soft roll-off of the body's own form shadow.

One mask, taken from the repaired frame, is measured on both plates. A colour test
for plumage is also a brightness test, so run separately on each plate it drops
the very pixels in question — the shipped frame's deepest seam pixels fell outside
it, and its chest came out 1199 pixels smaller than the repaired one, which
flattered the shipped frame. Pip's geometry and the camera are identical between
the two, so his silhouette is too, and one mask is the correct treatment.

Two simpler measurements were tried first and are recorded here as discarded,
because a chest that curves away from the sun is legitimately dark at one end and
both of them scored that rather than the mark: how far the darkest column of the
chest sits below the chest's general level (30.8 luma before, 30.4 after — no
signal, because in the repaired frame the darkest column is the body's own edge),
and the same figure high-passed along x (still dominated by the silhouette until
background grass was excluded, after which only 53 columns survived, too few to
high-pass against).

## What else moved

`assemble_scene.py` installs a shadow proxy only where it imported an armature, so
the change cannot reach the AdventureMap, which has none. That is an argument, so
`regression_by_subject.json` measures it: frame 45 either side of the repair, each
subject inside its own coverage mask, masks rendered at this branch and applied to
both plates.

| Subject | Own pixels | Changed >8 | Largest change | Mean luma shift |
| --- | --- | --- | --- | --- |
| AdventureMap | 158,347 | **0** | 1 | 0.00 |
| Goat | 66,110 | 3,276 (4.96%) | 144 | +0.94 |
| Pip | 24,913 | 3,023 (12.1%) | 172 | +7.06 |

The map is untouched: not one of its pixels moved, and its largest disagreement of
1 is PNG rounding. 8,079 pixels of 2,073,600 changed in the whole frame, 0.39%.

The Goat moved because his caster was wrong in the same two ways Pip's was — 23 of
his 50 islands were being turned inside out by the flat shrink, and his pupils sit
sealed inside his irises exactly as Pip's beak tip sits inside his beak.
`goat_closecrop_frame45_1080p.png` is what that looks like: the smudges on his
muzzle, cheeks and under the collar are gone. His mean luma moves less than one
level, so nothing about how he reads has changed — the artefacts left and the
character did not.

`production-library/` is byte-identical to `a440d88`. No approved asset was edited
to fix this; the whole repair is in `scripts/blender/assemble_scene.py`, which is
why the render *code* fingerprint moved and the render *asset* fingerprint did not.

## One thing a viewer will ask about: the purple backpack

An independent review of the 1080x1920 clip reported every part of Pip's approved
identity except the purple backpack, which it could not see. It is there and it is
correct; the camera is in front of him and the backpack is on his back.

`backpack_present_but_occluded.png`, and the isolation renders behind it, settle
it. `Pip_Backpack`, `Pip_Backpack_Pouch` and `Pip_StarCharm` are all in the
assembled scene with `hide_render=False` and their approved materials
(`PipBackpack` purple `0.48, 0.28, 0.78`, `PipStrap`, `PipStar`). Rendered alone
from the production camera at frame 45 they cover 3599 pixels, 3542 of them purple.
Rendered as part of the whole character, Pip covers 24,913 pixels and **not one**
is purple: his body is between the backpack and the lens.

This is a property of the shot's framing, not of the repair or the asset —
`production-library/` is byte-identical to `a440d88` — and it is unchanged from
what the shot has always delivered. Recorded rather than fixed, because reframing
the shot to show the backpack is a design change and out of scope here.

## Evidence

| File | What it holds |
| --- | --- |
| `chest_mark_three_states.png` | The chest at 12x, in three states of the caster planner: the 22 mm band, the residual sealed-part mark, and clean. |
| `chest_before_after_daykey.png` | Head and chest at 3x under DAY_KEY, as shipped at `a440d88` and as this branch renders it. |
| `chest_before_after_revealing.png` | The same two, relit with a single hard point sun eight degrees off the chest, which is the harshest thing that can be pointed at a shadow. |
| `chest_closecrop_frame45_1080p.png` | Frame 45 of the acceptance shot itself at 1080x1920, cropped to Pip at 6x, shipped against this branch. Not a test render: these are the delivered pixels. |
| `chest_shadow_on_pixels.json` | The shadowed fraction of the chest measured on those pixels, both plates through one mask. |
| `regression_by_subject.json` | Frame 45 either side of the repair, per subject, inside each subject's own coverage mask. |
| `goat_closecrop_frame45_1080p.png` | The Goat at 3x on the same frame, shipped against this branch. |
| `backpack_present_but_occluded.png` | The backpack rendered alone against Pip rendered whole, same camera, same frame. |
| `chest_blockers_four_states.json` | The table above, with every blocker named, sized and counted. |
| `chest_surface_inspection.png` | The chest surface under normals-as-colour, one colour per material slot, and matte white under a raking light. |
| `causation_pip_stops_casting.png` | Shipped, Pip casting no shadow, no shadow proxy at all, and this branch — the same frame four ways. |
| `mesh_topology_pip.json` | Every topology count for `Pip_Character`, with the asset's sha256. |
| `fault_injection.txt` | A stale image, a byte appended to Pip's model, a line added to the baked scene assembly, and the launch-time pin check — each refusing. Re-run with `pnpm cloud:faults`. |
| `caster_geometry_before_after.json` | Signed volume and containment per island. Before: 15 of Pip's 34 islands and 23 of the Goat's 50 were inside out, and 16 and 20 protruded, the worst by the full 22 mm. After: none inverted, none protruding, on either character. |
| `sealed_parts_cross_check.json` | The planner's sealed-part answer against an independent six-ray containment test, mesh by mesh. |
| `frame45_change_from_sealed_rule.json` | What the sealed-part rule alone changed in the whole 1080x1920 frame: 254 pixels of 2,073,600. |
| `frame45_change_total.json` | The same for the three fixes together, with the identity hue inventory either side. |
| `charlock_pip.json`, `charlock_goat.json` | Every visible mesh hashed before and after the caster is installed — positions, normals, materials, vertex groups, shape keys — with the approved palette read off the materials. |
| `../shadow_caster_report.json` | Every part of both characters with all three measurements that decide whether it casts, and the sealed test re-run on all 87 shape keys. |

Regenerate the report with `pnpm qc:caster`.

The one place the cross-check disagrees is the Goat's tag lettering, where the
six-ray test calls two ink islands buried and the planner does not. Neither of
them casts either way — the letters are flat and have no inside to hide a caster
in, so the thickness rule had already collapsed both — so the disagreement
changes no shadow. It is recorded rather than tuned away.

## The one thing the sealed test cannot promise

The caster is planned once, on the rest mesh. Pip's `blink_left`, `blink_right`
and `eye_look_down` keys move beak vertices as well as eyelids, and under them up
to 2.55 mm of the sealed beak tip comes out of the beak. A part judged sealed at
rest therefore stays out of the caster while blinking. That direction is the safe
one — a 2.5 mm protrusion casts nothing rather than a shadow appearing from
nowhere — and it is why the answer is taken at rest rather than per frame.
