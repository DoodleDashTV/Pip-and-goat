# Feature authority table

Planning table only. Pixel measurements are blocked until the 22 source files are on disk.

When a reference conflicts with a locked TrivvleJoy record, the lock wins.

| Feature | Primary pictures | Secondary pictures | Canonical lock if conflict | Do not copy from refs |
| --- | --- | --- | --- | --- |
| Pip face, appeal | VIDEO1_02, 03, 04, 05, 08, 11 | VIDEO1_06 | Youthful girl-character appeal | Older / uncanny reads |
| Pip eyes (size, shape, place) | VIDEO1_02, 03, 04, 05, 08 | VIDEO1_11 | Large expressive eyes | Shrink-to-dots |
| Pip beak | VIDEO1_02, 03, 04, 05, 08, 11 | — | Orange, smooth, appealing | Nub beak, silver jewelry as beak stand-in |
| Pip red crest | VIDEO1_02, 03, 04, 05, 11 | VIDEO1_07, 09, 10, 12 (rear silhouette) | Red crest | Extra lobes or color shifts from lighting |
| Pip yellow body / down | VIDEO1_02–06, 11 | VIDEO1_07, 09, 10, 12; VIDEO2 body stills | Yellow body | Exposure-blown yellow as albedo |
| Pip wings | VIDEO1_03, 06, 11 | VIDEO2 walk/run | Relaxed expressive wings | T-pose wings, rectangular cards |
| Pip feet | VIDEO1_06, 09, 10 | VIDEO2 full-body | Orange three-toed feet | Five-toed glowing prints as Pip feet |
| Pip backpack + gold star | VIDEO1_06, 07, 09–12 | VIDEO2 rear panels | Purple backpack, gold star | Silver necklace star, missing pack |
| Goat face, appeal | VIDEO1_01, 03, 04, 05, 11 | VIDEO1_06, 08 | Youthful boy-character appeal | Older / realistic muzzle |
| Goat eyes | VIDEO1_01, 03, 04, 05, 11 | VIDEO1_08 | Large glossy friendly eyes; do not go below v1.1 eye size | Dot eyes |
| Goat muzzle and pink nose | VIDEO1_01, 03, 04, 05, 11 | — | Pink nose, soft muzzle | Grey / brown nose from shadow |
| Goat horns | VIDEO1_01, 03, 04, 05, 11 | VIDEO1_07, 09, 10, 12; VIDEO2 rear | Child-friendly ridged horns | Adult horns, floating horns |
| Goat cream fur | VIDEO1_01, 03–06, 11 | Rear VIDEO1 / VIDEO2 | Cream body | Blue print bounce as cream albedo |
| Goat collar + GOAT tag | VIDEO2_01–04, 09, 10; VIDEO1 if visible | — | Blue collar, GOAT tag | DOTT / blank / mirrored / missing tag |
| Goat backpack | VIDEO1_06, 07, 09–12 | VIDEO2 rear | Blue pack as video gear; do not drop collar/tag | Pack that hides the tag |
| Head-to-body ratio | Sharpest VIDEO2 full-body | VIDEO1_06, 09, 10 | Recognizable silhouette | Composite scale fights |
| Character-to-character scale | VIDEO2_01–04, 10 (front panels first) | VIDEO2 rear; VIDEO1_06, 09, 10 | Recognizable pair; do not pick from one outlier | Peer-sized rear pairs that fight FRAME_01 |
| Walk / run / stop | VIDEO2_01–07, 10 | VIDEO1_09, 10 | Existing action compatibility | T-pose as acting proof |
| Rear views / backpacks | VIDEO2_01–06 rear panels | VIDEO1_07, 09, 10, 12 | Packs stay on; gold star stays Pip | Watermarks |
| Forest / trail / prints / atmosphere | VIDEO2 all | VIDEO1_01, 06, 07, 09–12 | Child-safe presentation; env rebuild is a later pass | Monster design, generated signs, Kling marks |
| Locked character IDs | — | — | Locked IDs | Any renamed identity |
| Approved fingerprint | — | — | `7876ac737de602578b67a8a20d85ea8a917c7ac4dac5e668f8bae37343e8f4b7` | Editing `production-library/` |
| Chest-seam protection | — | — | Existing chest-seam / shadow-proxy rules | Center-line language, remesh seams |

## Color vs lighting

Separate albedo from exposure before any material lock:

- Pip yellow, crest red, beak/feet orange, pack purple, star gold
- Goat cream, nose pink, horns tan/brown, collar blue, tag gold
- Blue prints, purple crystals, lantern orange, and firefly yellow are lights, not character paint
- Night teal and crystal magenta are environment bounce, not body color
