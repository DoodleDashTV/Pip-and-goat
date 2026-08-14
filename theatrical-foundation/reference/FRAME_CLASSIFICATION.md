# Frame classification (catalog-inferred, not pixel-verified)

**Status:** provisional. Built from intake catalogs, not from source pixels.
**Do not use this table as a measurement source.**
**Re-classify from pixels after the 22 files are dropped into `private/`.**

Classes used: facial, three-quarter, full-body, rear/accessory, motion, environment, lighting, too blurred for precise measurement, too occluded for precise measurement, inconsistent/non-authoritative.

A frame may hold more than one class.

## Reference Set 1 — VIDEO1_FRAME_01 through VIDEO1_FRAME_12

| Label | Provisional classes | Notes |
| --- | --- | --- |
| VIDEO1_FRAME_01 | facial, environment, lighting | Goat profile. Primary Goat face/eye/nose/horn/fur in profile. Prints and cave are context. |
| VIDEO1_FRAME_02 | facial, lighting, too occluded (Goat) | Pip close-up. Primary Pip face/eyes/beak/crest/down. Goat is a partial crop only. |
| VIDEO1_FRAME_03 | facial, three-quarter, lighting | Both heads. Shared eye language. Pip alarm, Goat support. |
| VIDEO1_FRAME_04 | facial, three-quarter, lighting | Pip worry, Goat encouragement, arm around Pip. |
| VIDEO1_FRAME_05 | facial, three-quarter, lighting | Goat hoof on Pip shoulder. Rim-lit groom. |
| VIDEO1_FRAME_06 | full-body, facial, environment, lighting | Two-shot at prints. Faces plus backpacks and prints as context. |
| VIDEO1_FRAME_07 | rear/accessory, environment, lighting | Rear two-shot down the path. Catalog notes a soft foreground. Re-check blur from pixels. |
| VIDEO1_FRAME_08 | facial, motion, lighting, too blurred (candidate) | Pip reaction, Goat gasp. Catalog notes motion blur. Measure only if pixels are sharp. |
| VIDEO1_FRAME_09 | rear/accessory, motion, environment, lighting | Rear run toward purple portal. Body scale defers to VIDEO2 + canonical. |
| VIDEO1_FRAME_10 | rear/accessory, motion, environment, lighting | Rear walk toward crystal cave. |
| VIDEO1_FRAME_11 | facial, environment, lighting | Cave interior faces. Crystal-lit materials. Gold star on Pip pack. |
| VIDEO1_FRAME_12 | rear/accessory, environment, lighting | Rear cave-mouth. Sign lettering is non-authoritative. |

## Reference Set 2 — VIDEO2_FRAME_01 through VIDEO2_FRAME_10

Most VIDEO2 images are two-panel composites. Classify both panels. Do not copy Kling watermarks or generated sign lettering.

| Label | Provisional classes | Notes |
| --- | --- | --- |
| VIDEO2_FRAME_01 | full-body, rear/accessory, motion, environment, lighting, inconsistent (scale/prints) | Front run + rear at Whispering Woods. Scale and toe-count vary vs later frames. |
| VIDEO2_FRAME_02 | full-body, rear/accessory, motion, environment, lighting | Front jog + rear stop at the sign. |
| VIDEO2_FRAME_03 | full-body, rear/accessory, motion, environment, lighting | Walk + rear pointing. Collar/tag visibility. |
| VIDEO2_FRAME_04 | full-body, rear/accessory, motion, environment, lighting, too blurred (candidate) | Low-angle run with motion blur + static rear. |
| VIDEO2_FRAME_05 | rear/accessory, motion, environment, lighting, inconsistent (scale) | Rear run. Pip/Goat size reads closer than FRAME_01. |
| VIDEO2_FRAME_06 | rear/accessory, motion, environment, lighting, too blurred (candidate) | Rear run with foot-splash blur. |
| VIDEO2_FRAME_07 | full-body, motion, environment, lighting | Toward-camera run, prints, lantern, watching eyes. Eyes/monster are not character assets. |
| VIDEO2_FRAME_08 | full-body, motion, environment, lighting, inconsistent/non-authoritative (monster) | Chase. Monster silhouette is video context only. |
| VIDEO2_FRAME_09 | full-body, motion, environment, lighting, inconsistent/non-authoritative (monster) | Chase, monster clearer. Fear acting only. Do not rebuild a frightening creature in this pass. |
| VIDEO2_FRAME_10 | full-body, motion, environment, lighting | Walk with lantern, then fear run. Lantern is prop context, not a locked Pip identity. |

## Non-authoritative marks (all frames)

Do not copy into the reconstruction:

- KlingAI 1.0 / 3.0 watermarks
- Generated sign lettering (WHISPERING WOODS, SOMETHING AMAZING AWAITS)
- Silver star necklace (canonical lock is purple backpack + gold star)
- Tag text other than GOAT (canonical lock is blue collar + GOAT tag)
- Humanoid five-toed prints as Pip or Goat feet
- Monster / watching-eye designs as production characters
- Inconsistent Pip-to-Goat scale (record range; canonical + sharpest agreed VIDEO2 stills decide later)
