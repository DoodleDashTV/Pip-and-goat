# TivvleJoy dirt pack integration V1

`paidCreateCount=0`. `paidSpendUsd=0`. No final video. No EP012.

Locked visual baseline (unchanged):

`artifacts/tivvlejoy-stagegraph-v1/FOREST_HERO_TREE_REPLACEMENT_PROOF_V1.png`  
SHA256 `ac00a3aa6cc897b98a59307e2b9c13309bc02781d5fb32b0692d698b3e8cad56`

## Result: BLOCKED

The three ground-pack zips are not present locally or in private R2. Integration stopped before registry edits, Blender loading, or a new proof render.

| Pack | Local | R2 purchased-blender-tools | R2 scenery source |
|---|---|---|---|
| `dirt_4k.blend.zip` | missing | missing | missing |
| `sparse_grass_4k.blend.zip` | missing | missing | missing |
| `grass_path_2_4k.blend.zip` | missing | missing | missing |

Searched: workspace, `/tmp`, Cursor stores/artifacts, owned-recovery (`/tmp/tivvlejoy-owned-recovery`), and the private R2 `tivvlejoy-assets/` prefix (255 objects; 0 filename matches for `dirt_4k`, `sparse_grass`, `grass_path`, or `4k.blend`).

Hero-tree PASS baseline was not modified. Camera, terrain, water, sky card, and ground dressing were not touched.

## Existing system (do not invent a one-off)

Purchased extras that are not part of the locked 14-file official scenery inventory are cataloged as R2 purchased-blender-tools, then recovered locally for lookdev:

- Catalog: `scripts/blender/scenery/lookdev_large_source_intake.py` (`R2_LOOKDEV_RECOVER`)
- Conditioning roles: `scripts/blender/scenery/condition_purchased_source.py` (`CONDITION_CATALOG`)
- Official 14-file intake stays frozen at `EXPECTED_SOURCE_COUNT = 14` in `apps/web/src/lib/scenery/intake/inventory.ts`

These three packs belong in that purchased-tools / lookdev catalog, not the locked 14-file village/sky/forest/world-shaders inventory.

## Exact expected upload paths

Put the bytes in **either** local recovery **or** the matching R2 keys. Filenames must stay exact.

### Local owned-recovery drop (preferred for this VM)

```
/tmp/tivvlejoy-owned-recovery/ground-packs/dirt_4k.blend.zip
/tmp/tivvlejoy-owned-recovery/ground-packs/sparse_grass_4k.blend.zip
/tmp/tivvlejoy-owned-recovery/ground-packs/grass_path_2_4k.blend.zip
```

### Workspace attach drop (if uploaded into the checkout)

```
/workspace/uploads/tivvlejoy-ground-packs/dirt_4k.blend.zip
/workspace/uploads/tivvlejoy-ground-packs/sparse_grass_4k.blend.zip
/workspace/uploads/tivvlejoy-ground-packs/grass_path_2_4k.blend.zip
```

### Private R2 purchased-blender-tools keys (same layout as Botaniq / 3DT)

```
tivvlejoy-assets/source/purchased-blender-tools/SRC_TIVVLEJOY_DIRT_4K/dirt_4k.blend.zip
tivvlejoy-assets/source/purchased-blender-tools/SRC_TIVVLEJOY_SPARSE_GRASS_4K/sparse_grass_4k.blend.zip
tivvlejoy-assets/source/purchased-blender-tools/SRC_TIVVLEJOY_GRASS_PATH_2_4K/grass_path_2_4k.blend.zip
```

Do not put these zips into Git.

## Next

1. Upload the three zips to one of the path sets above.
2. Resume `TIVVLEJOY_DIRT_PACK_INTEGRATION_V1` on this scenery branch.
3. Inspect each zip, register selectable packs, apply to the existing ground surface only, then render an unpaid proof on top of the locked hero-tree baseline.

Do not start final video. Do not use paid work.
