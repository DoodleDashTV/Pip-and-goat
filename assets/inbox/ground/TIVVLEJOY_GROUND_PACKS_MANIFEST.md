# TivvleJoy Ground Pack Intake Manifest

Status: all three source ZIPs were re-materialized from ChatGPT Library into the current Codex runtime and re-verified byte-for-byte against this manifest. The local resume gate for `TIVVLEJOY_DIRT_PACK_INTEGRATION_V1` is satisfied. The ZIP binaries are still not committed to this public GitHub repository; environments without the materialized copies must obtain them through Git LFS or private asset storage.

The repository is public. These three ground packs were provided by Justin as free packs, but they are still large binary source assets. Keep the binaries out of normal Git history; use Git LFS or private asset storage for durable remote placement.

## Required ZIPs

| File | Size | SHA256 | Contents |
| --- | ---: | --- | --- |
| `dirt_4k.blend.zip` | 75,853,439 bytes | `126184ec4cb24629b970c81053630ca4ff7be65e07d5af604c3495b5dd27f855` | `dirt_4k.blend`, `textures/dirt_diff_4k.jpg`, `textures/dirt_disp_4k.png`, `textures/dirt_rough_4k.exr`, `textures/dirt_nor_gl_4k.exr` |
| `sparse_grass_4k.blend.zip` | 107,103,973 bytes | `a7c199590a03f45bb8c00c44fb6b77096b107fc2cd075019b30ea590bbf64327` | `sparse_grass_4k.blend`, `textures/sparse_grass_diff_4k.jpg`, `textures/sparse_grass_disp_4k.png`, `textures/sparse_grass_mask_4k.png`, `textures/sparse_grass_rough_4k.exr`, `textures/sparse_grass_nor_gl_4k.exr` |
| `grass_path_2_4k.blend.zip` | 57,949,131 bytes | `73658d129d9572d058aa0525e9bcbecc3e39a7d172025396674570e951ba9d9c` | `grass_path_2_4k.blend`, `textures/grass_path_2_diff_4k.jpg`, `textures/grass_path_2_disp_4k.png`, `textures/grass_path_2_rough_4k.jpg`, `textures/grass_path_2_nor_gl_4k.exr` |

## Registry IDs

| File | Registry ID |
| --- | --- |
| `dirt_4k.blend.zip` | `TJ_GROUND_DIRT_4K_001` |
| `sparse_grass_4k.blend.zip` | `TJ_GROUND_SPARSE_GRASS_4K_001` |
| `grass_path_2_4k.blend.zip` | `TJ_GROUND_GRASS_PATH_2_4K_001` |

Machine-readable registry: `assets/inbox/ground/ground_pack_registry.json`.

Verifier: `scripts/verify_tivvlejoy_ground_packs.py`.

The verifier is fail-closed and checks exact byte size, SHA-256, ZIP CRC, required members, and the expected `.blend` member without extracting or mutating the source archives.

## Saved Copies

Canonical clean copies currently retained in ChatGPT Library:

| File | Library file ID |
| --- | --- |
| `dirt_4k.blend.zip` | `file_00000000da6081f493bf021121e28850` |
| `sparse_grass_4k.blend.zip` | `file_00000000c72c820a8161fe10f148d0a9` |
| `grass_path_2_4k.blend.zip` | `file_0000000086408246a0b5045f7bba0ac7` |

## Current Verification Receipt

`TIVVLEJOY_GROUND_PACK_VERIFY_V1` = **PASS** in the current runtime against the canonical ZIPs.

- Pack count: 3
- Exact sizes: PASS
- SHA-256: PASS
- ZIP CRC/member checks: PASS
- Source archives mutated: NO
- Paid render started: NO

## Resume Gate

`TIVVLEJOY_DIRT_PACK_INTEGRATION_V1` may continue in this runtime because all three canonical ZIPs are materialized and verified. Preserve camera, terrain, water, sky card, and approved Botaniq hero trees. Do not start paid renders. Any later environment that does not have the three ZIPs must restore them through Git LFS checkout, local file placement, ChatGPT Library materialization in Codex, or private asset storage before running the ground-pack integration.
