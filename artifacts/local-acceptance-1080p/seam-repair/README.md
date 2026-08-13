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

The mesh under the mark is clean. It has no duplicate or loose vertices, no
non-manifold edges, no flipped normals, no mirror seam, no material boundary and
no smoothing or triangulation artifact along the line; the line tracked the beak
rather than the geometry it fell on, and it moved with the sun.

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

## Evidence

| File | What it holds |
| --- | --- |
| `chest_mark_three_states.png` | The chest at 12x, in three states of the caster planner: the 22 mm band, the residual sealed-part mark, and clean. |
| `chest_before_after_daykey.png` | Head and chest at 3x under DAY_KEY, as shipped at `a440d88` and as this branch renders it. |
| `chest_before_after_revealing.png` | The same two, relit with a single hard point sun eight degrees off the chest, which is the harshest thing that can be pointed at a shadow. |
| `chest_blockers_four_states.json` | The table above, with every blocker named, sized and counted. |
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
