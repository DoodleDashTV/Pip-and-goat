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
| 3 | `Pip_BeakTip`, a second sphere authored inside the beak. It is sealed in there — 0.73 mm clear of the beak's surface at its closest point — so the camera never sees it, but it was its own mesh island and therefore its own caster. | 78 of the 3000 pixels traced in the mark window were blocked by it and by nothing else | this change — a part sealed inside another part stops casting |

`Pip_BeakTip` is the answer to "what is the exact cause of the seam that was still
there". It is dead geometry: `polish_character_v1_1.py` adds it to make the beak
"slightly pointed", and it never reaches the silhouette, so it contributes nothing
to the picture and only ever contributed a shadow. Both characters' pupils sit
inside their irises the same way and were doing the same thing on a smaller scale.

The mesh under the mark is clean. It has no duplicate or loose vertices, no
non-manifold edges, no flipped normals, no mirror seam, no material boundary and
no smoothing or triangulation artifact along the line; the line tracked the beak
rather than the geometry it fell on, and it moved with the sun.

## Evidence

| File | What it holds |
| --- | --- |
| `chest_mark_three_states.png` | The chest at 12x, in the three states of the caster planner: the 22 mm band, the residual sealed-part mark, and clean. |
| `chest_before_after_daykey.png` | Head and chest at 3x under DAY_KEY, as shipped at `a440d88` and as this branch renders it. |
| `chest_before_after_revealing.png` | The same two, relit with a single hard point sun eight degrees off the chest, which is the harshest thing that can be pointed at a shadow. |
| `blockers_before.json`, `blockers_after.json` | Every pixel of a 50x60 window over the mark, traced from the surface the camera sees toward the sun, with the caster island that blocks it named. Before: 78 pixels blocked by the sealed beak tip. After: none. |
| `frame45_change_from_sealed_rule.json` | What the sealed-part rule alone changed in the whole 1080x1920 frame: 254 pixels of 2,073,600. |
| `frame45_change_total.json` | The same for the three fixes together, with the identity hue inventory either side. |
| `charlock_pip.json`, `charlock_goat.json` | Every visible mesh hashed before and after the caster is installed — positions, normals, materials, vertex groups, shape keys — with the approved palette read off the materials. |
| `../shadow_caster_report.json` | Every part of both characters with all three measurements that decide whether it casts, and the sealed test re-run on all 87 shape keys. |

Regenerate the report with `pnpm qc:caster`.

## The one thing the sealed test cannot promise

The caster is planned once, on the rest mesh. Pip's `blink_left`, `blink_right`
and `eye_look_down` keys move beak vertices as well as eyelids, and under them up
to 2.55 mm of the sealed beak tip comes out of the beak. A part judged sealed at
rest therefore stays out of the caster while blinking. That direction is the safe
one — a 2.5 mm protrusion casts nothing rather than a shadow appearing from
nowhere — and it is why the answer is taken at rest rather than per frame.
