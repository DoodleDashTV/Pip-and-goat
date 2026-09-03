# Forest night-shift baseline V1

Zero-paid snapshot before further production changes.

## Session git

| Field | Value |
|---|---|
| startingBranch | `cursor/tivvlejoy-botaniq-forest-production-recovery-eed2` |
| startingHead | `70a13a1d33b445ad104b37c14901d80d333dc489` |
| dirtyFiles | none |
| draftPR | 175 (stacked draft onto the Botaniq recovery parent branch) |
| parentReceipt | `TIVVLEJOY_BOTANIQ_FOREST_PRODUCTION_RECOVERY_V1` FAIL at `37e678d877f27af5ab9c943ceba72d6b0d5a0f89` |
| paidCreateCount | 0 |

## Entry points

| Role | Path |
|---|---|
| Production scene builder | `scripts/blender/stagegraph/vendor_reference_render_v1.py` (`build_scene`) |
| Botaniq recovery | `scripts/blender/forest_botaniq_production_recovery_v1.py` |
| Isolated + camera proof | `scripts/blender/stagegraph/forest_botaniq_production_recovery_proof_v1.py` |
| EcoKit source blend | `/tmp/tivvlejoy-ecokit/Stylised EcoKit/Flora_Mat&GN&Models.blend` |
| Owned Botaniq cache | `/tmp/tivvlejoy-owned-recovery/botaniq/` |
| Owned HDRI | `/tmp/tivvlejoy-owned-light/tj_hdri_diag_8k.jpg` |
| Local Blender | `/tmp/blender/blender` 4.3.2 CPU |

## Locks

| Lock | Value | File |
|---|---|---|
| Camera name | `TJ_VendorReference_Camera` | `vendor_reference_lookdev_v1.py` |
| Camera location | `(0.0, -12.5, 2.15)` | same |
| Camera look | `(0.0, 9.5, 2.6)` | same |
| Camera lens | `42.0 mm` | same |
| Water | not present in this vendor-reference forest scene | — |
| Terrain | generated `TJ_VendorGround` plane `(-16,-5)–(16,32)` | `vendor_reference_render_v1.py` |
| Lighting | `LOOKDEV_EXPOSURE_REPAIR_V2` (sun 5.4, HDRI 0.58, bounce on) | `vendor_reference_lookdev_v1.py` |
| Seed | `7301` | same |

## Latest proofs

| Proof | Path | Classification |
|---|---|---|
| Isolated bark | `artifacts/tivvlejoy-stagegraph-v1/LOOKDEV_BARK_PRODUCTION_V2.png` | PASS |
| Isolated ground | `artifacts/tivvlejoy-stagegraph-v1/LOOKDEV_GROUND_PRODUCTION_V2.png` | PASS |
| Isolated bush | `artifacts/tivvlejoy-stagegraph-v1/LOOKDEV_BUSH_PRODUCTION_V2.png` | PASS |
| Isolated leaf | `artifacts/tivvlejoy-stagegraph-v1/LOOKDEV_LEAF_PRODUCTION_V2.png` | PASS |
| Isolated grass/fern | `artifacts/tivvlejoy-stagegraph-v1/LOOKDEV_GRASS_FERN_PRODUCTION_V2.png` | PASS |
| Camera distance | `artifacts/tivvlejoy-stagegraph-v1/FOREST_MATERIAL_RECOVERY_CAMERA_PROOF_V1.png` | FAIL — solid vendor groundColor |

## Active vegetation

- Foreground/midground (`y < 18`): Botaniq Corylus shrub, Carex grass, Dryopteris fern, Corylus leaf cards, autumn litter decals.
- Background (`y >= 18`): EcoKit cards preserved.
- Trunks: cylindrical Tilia unwrap on `Tree_*` meshes.
- Camera-visible floor: still vendor `TJ_VendorGround_Mat` solid color after three bind strategies.

## Provenance / manifests already in repo

- `artifacts/tivvlejoy-scenery-showcase-30s/PURCHASED_SCENERY_USAGE_MANIFEST_V1.json`
- `artifacts/tivvlejoy-stagegraph-v1/FOREST_OWNED_RESOURCE_RECOVERY_RECEIPT.json`
- `artifacts/tivvlejoy-stagegraph-v1/FOREST_BOTANIQ_PRODUCTION_RECOVERY_RECEIPT.json`

## R2 / local access

R2 credentials present. EcoKit zip, Botaniq member extract, and owned HDRI are already materialized locally. No paid activity.
