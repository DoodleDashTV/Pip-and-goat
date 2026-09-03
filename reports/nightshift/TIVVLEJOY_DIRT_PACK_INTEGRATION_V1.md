# TivvleJoy dirt pack integration V1

`paidCreateCount=0`. `paidSpendUsd=0`. No final video. No EP012.

Locked visual baseline (unchanged):

`artifacts/tivvlejoy-stagegraph-v1/FOREST_HERO_TREE_REPLACEMENT_PROOF_V1.png`  
SHA256 `ac00a3aa6cc897b98a59307e2b9c13309bc02781d5fb32b0692d698b3e8cad56`

## Result: INTAKE PASS / BLENDER QC PENDING

All three canonical ground-pack ZIPs are now present in local owned recovery and pass source identity, ZIP CRC, safe-member, nested-compression, Blender-header, and DNA1/ENDB structure checks. The previous missing-source gate is cleared.

| Pack | Source identity | Nested `.blend` wrapper | Normalized Blender | Textures |
|---|---|---|---|---:|
| `dirt_4k.blend.zip` | PASS | zstd | 4.02 | 4 |
| `sparse_grass_4k.blend.zip` | PASS | zstd | 4.02 | 5 |
| `grass_path_2_4k.blend.zip` | PASS | gzip | 2.93 | 4 |

Canonical source ZIPs remain outside Git at:

```
/tmp/tivvlejoy-owned-recovery/ground-packs/dirt_4k.blend.zip
/tmp/tivvlejoy-owned-recovery/ground-packs/sparse_grass_4k.blend.zip
/tmp/tivvlejoy-owned-recovery/ground-packs/grass_path_2_4k.blend.zip
```

Normalized private lookdev payloads are emitted under `/tmp/tivvlejoy-conditioned/ground-packs/` by `scripts/blender/scenery/ground_pack_intake.py`.

## Existing purchased-tools pipeline integration

The existing purchased-source conditioner now registers these sources instead of treating them as an unrelated one-off:

- `SRC_TIVVLEJOY_DIRT_4K` → `ground_dirt`
- `SRC_TIVVLEJOY_SPARSE_GRASS_4K` → `ground_sparse_grass`
- `SRC_TIVVLEJOY_GRASS_PATH_2_4K` → `ground_grass_path`

`condition_purchased_source.py` delegates those three roles to `ground_pack_intake.py`, which verifies the canonical ZIP SHA256/size, rejects unsafe archive members, unwraps gzip/zstd `.blend` payloads, copies the exact source textures into private lookdev storage, and emits sanitized receipts. The locked official 14-file scenery inventory is not changed.

Sanitized proof: `reports/nightshift/TIVVLEJOY_GROUND_PACK_INTAKE_V1.json`.

## Source identities

| Pack | Bytes | SHA256 |
|---|---:|---|
| `dirt_4k.blend.zip` | 75,853,439 | `126184ec4cb24629b970c81053630ca4ff7be65e07d5af604c3495b5dd27f855` |
| `sparse_grass_4k.blend.zip` | 107,103,973 | `a7c199590a03f45bb8c00c44fb6b77096b107fc2cd075019b30ea590bbf64327` |
| `grass_path_2_4k.blend.zip` | 57,949,131 | `73658d129d9572d058aa0525e9bcbecc3e39a7d172025396674570e951ba9d9c` |

## Normalized `.blend` payloads

| Registry ID | Version | Bytes | SHA256 |
|---|---:|---:|---|
| `TJ_GROUND_DIRT_4K_001` | 4.02 | 1,293,768 | `918b884cc3c3023591aea212c9ed95b0279b12101650d78b740269c964691979` |
| `TJ_GROUND_SPARSE_GRASS_4K_001` | 4.02 | 1,302,332 | `c846dce23bfd624ea652c8471fde7293e50a6d0d1e942603e6ef9a4cdf996f46` |
| `TJ_GROUND_GRASS_PATH_2_4K_001` | 2.93 | 1,402,856 | `d0820554d8aa1306273ae6b1a1aa8247c9225949d4d58cc183e051f60eb193da` |

## Safety / production locks

- Source ZIP binaries were not committed to Git.
- Purchased/add-on scripts were not auto-executed.
- No RunPod pod was created; spend remains $0.
- Camera, terrain geometry, water, sky card, OWL hub layout, and approved Botaniq hero trees were not modified.
- No final-video or paid-render authorization was consumed.

## Remaining gate

This runtime does not have Blender/bpy installed, so the normalized payloads have not yet received a real Blender open/save/material-node validation or an unpaid visual ground proof. The next zero-cost-capable environment that has Blender and access to the private source bytes should:

1. Open each normalized `.blend` without auto-running scripts.
2. Verify material/image links and relink only to the extracted pack textures if needed.
3. Register the three ground candidates as selectable purchased lookdev sources.
4. Apply them only to the existing ground surface/dressing while preserving all production locks.
5. Render an unpaid proof before any production adoption.

Do not start final video. Do not use paid work.
