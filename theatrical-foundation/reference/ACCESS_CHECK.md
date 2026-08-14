# 22-image reference access check

**Verdict:** 0 of 22 source images are on disk. Reconstruction is stopped.
**Assets modified:** none.
**Canonical assets replaced:** no.
**THEATRICAL binding created:** no.

## Required images

| Set | Required labels | On-disk source files |
| --- | --- | --- |
| Reference Set 1 (vertical) | VIDEO1_FRAME_01 through VIDEO1_FRAME_12 | **0 / 12** |
| Reference Set 2 (landscape) | VIDEO2_FRAME_01 through VIDEO2_FRAME_10 | **0 / 10** |
| **Total** | 22 | **0 / 22** |

Searched: workspace tree, `theatrical-foundation/reference/`, `/tmp`, `/home/ubuntu`, `/opt/cursor` attachment paths, git LFS, and ignored media. No file named or hashed as a VIDEO1 or VIDEO2 source frame exists.

The 22 pictures arrived earlier as chat attachments. Those bytes were never written to this workspace. Text catalogs and chat descriptions are not pixel sources. They cannot support measurements, silhouette overlays, or matched Blender comparisons.

## What is accessible

| Item | Path / location | Use now |
| --- | --- | --- |
| VIDEO1 labels and catalog | `theatrical-foundation/reference/video1/` | Label authority only |
| VIDEO2 labels and catalog | `theatrical-foundation/reference/video2/` | Label authority only |
| Catalog-inferred classification | `FRAME_CLASSIFICATION.md` | Provisional until pixels exist |
| Feature authority table | `FEATURE_AUTHORITY.md` | Planning only |
| Environment requirement notes | `ENV_REQUIREMENTS.md` | Deferred env pass |
| Theatrical v1.1 proposed assets | `theatrical-foundation/proposed/v1.1/` at `4bd1c66` | Technical start later, not visual authority |
| v1.1 approval stills | `artifacts/theatrical-v1.1/previews/` | Prior proposal evidence, not the 22 refs |
| Canonical Pip / Goat | `production-library/` | Final identity when refs conflict |
| Approved fingerprint | `7876ac737de602578b67a8a20d85ea8a917c7ac4dac5e668f8bae37343e8f4b7` | Unchanged |

## What is not accessible

- VIDEO1_FRAME_01.png (or any equivalent source file)
- VIDEO1_FRAME_02
- VIDEO1_FRAME_03
- VIDEO1_FRAME_04
- VIDEO1_FRAME_05
- VIDEO1_FRAME_06
- VIDEO1_FRAME_07
- VIDEO1_FRAME_08
- VIDEO1_FRAME_09
- VIDEO1_FRAME_10
- VIDEO1_FRAME_11
- VIDEO1_FRAME_12
- VIDEO2_FRAME_01
- VIDEO2_FRAME_02
- VIDEO2_FRAME_03
- VIDEO2_FRAME_04
- VIDEO2_FRAME_05
- VIDEO2_FRAME_06
- VIDEO2_FRAME_07
- VIDEO2_FRAME_08
- VIDEO2_FRAME_09
- VIDEO2_FRAME_10
- SHA-256 hashes of those 22 files
- Pixel measurements
- Reference crops for matched comparisons

## Drop path (private, untracked)

Place the 22 source files here. Do not commit them.

```
theatrical-foundation/reference/private/video1/VIDEO1_FRAME_01.png
theatrical-foundation/reference/private/video1/VIDEO1_FRAME_02.png
… through VIDEO1_FRAME_12.png

theatrical-foundation/reference/private/video2/VIDEO2_FRAME_01.png
theatrical-foundation/reference/private/video2/VIDEO2_FRAME_02.png
… through VIDEO2_FRAME_10.png
```

`.jpg`, `.jpeg`, or `.webp` is acceptable if the filename stem matches. The private tree is gitignored except `private/README.md`.

After the 22 files are on disk, the next reconstruction turn can hash them, classify from pixels, measure, and remodel. Until then, no Pip or Goat asset changes.
