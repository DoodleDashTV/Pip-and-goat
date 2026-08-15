# TivvleJoy Pip / Goat v2 — overnight sculpt refinement

**Status:** proposed, unapproved. Stopped for Justin’s visual review.  
**Canonical mutated:** no  
**THEATRICAL bound:** no  
**GLBs used:** no  
**Retopo / groom / rig:** no  
**Paid GPU / RunPod / cloud render:** no  

Starting commit: `a1a7d195c329f97622ed9264c4825a10a34f7797`  
Working branch: `cursor/theatrical-v2-sculpt-revision-1ebc`

Binding authority: the ten five-view JPEGs in `artifacts/theatrical-v2/source-package-validation/refs/`, plus the bright Pip target for color family, warmth, and wing size.

| File | Role |
| --- | --- |
| `pip_v2_revised.blend` | Revised Pip primary (fused high-detail sculpt) |
| `goat_v2_revised.blend` | Revised Goat primary, height 1.5× Pip |

Measured pair scale: Pip **2.051**, Goat **3.077**, ratio **1.500**.

A later Justin pass lifted Pip further toward the attached Image 1 yellow-chartreuse (less golden mustard, brighter body/wings) and broadened isolated wings (`|y|` 0.66 → 0.74). Crest, hallux, and satchel laterality were left alone. Goat was not edited in that pass.

Justin then marked that lift **too bright**. A color-only pullback dropped the shader value 1.16 → 1.02 and compressed blown highlights. Wings were not moved again.

Both blends reopen in Blender 4.2.3 LTS. Packed 8K `texture_0.png` resolves. No libraries / GLBs linked.

## What changed

- Pip albedo graded from muddy mustard/olive toward bright yellow-chartreuse. Soft cream-yellow cheeks/lower face lifted. Gentle HSV value lift only; roughness left at 0.5 so feather recesses stay readable without dark pigment.
- A first hard wing stretch shredded layered feathers. That attempt was rejected and archived under `artifacts/theatrical-v2/sculpt-revision/failed-stretch/`. The last usable Pip sculpt was restored, then wings were isolated as a connected component and enlarged with capped deltas plus light smoothing.
- Pass 2/3 lengthened outer tips and unfurled the wing mass slightly backward so the back view could read the new length.
- Pip three-feather coral crest, rear hallux, teal scarf, teal satchel, copper spiral, and satchel laterality (right-shoulder strap, left-hip bag) were preserved. No second hard satchel translate.
- Goat was rebuilt from the primary source (not a GLB), scaled to 1.5× Pip, and given a mesh-space cinnamon teardrop on the upper back below the scarf. A later paint that reached the skull was discarded; the kept paint stays in a hard world band just below the neck wrap.

## Honest remaining gaps

- Pip’s back wings are larger than the last usable sculpt and now reach the lower torso in the back still, but they are still less broad and graceful than `Pip_back.jpeg`.
- Pip’s profile crest can still collapse toward two readable blades.
- Goat’s teardrop is visible from the back and sits below the scarf, but it is still narrower and more triangular than the binding sheet. The source head-back dark trapezoid was left alone.
- These remain generated fused sculpts (Pip 78,687 verts / 157k tris, Goat 79,743 verts / 159k tris) with a small number of non-manifold/boundary edges. Not production topology.

## Recommendation

**Pip: REVISE remaining.**  
**Goat: REVISE remaining.**  
Do not approve as a lock. Do not retopo, groom, rig, or replace canonical assets.

Fingerprint unchanged: `7876ac737de602578b67a8a20d85ea8a917c7ac4dac5e668f8bae37343e8f4b7`
