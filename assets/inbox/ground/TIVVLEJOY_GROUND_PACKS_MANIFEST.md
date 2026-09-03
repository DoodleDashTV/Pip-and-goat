# TivvleJoy Ground Pack Intake Manifest

Status: source ZIPs verified in ChatGPT/Codex scratch and saved in ChatGPT Library. ZIP binaries are not yet pushed to GitHub because this runtime lacks normal `git push` authentication for Git LFS.

The repository is public. These three ground packs were provided by Justin as free packs, but they are still large binary source assets. Commit them only through Git LFS or place them in private asset storage before resuming integration.

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

## Saved Copies

Clean copies were saved in ChatGPT Library after upload:

| File | Library file ID |
| --- | --- |
| `dirt_4k.blend.zip` | `libfile_8d0fb7b9668c8191badaf5b89537a699` |
| `sparse_grass_4k.blend.zip` | `libfile_c145793538608191a906c25f81e572a4` |
| `grass_path_2_4k.blend.zip` | `libfile_09c98cfcd9008191b096889e88c001e1` |

## Resume Gate

Resume `TIVVLEJOY_DIRT_PACK_INTEGRATION_V1` only after all three ZIPs are present at `assets/inbox/ground/` through Git LFS checkout, local file placement, ChatGPT Library materialization in Codex, or private asset storage. Preserve camera, terrain, water, sky card, and approved Botaniq hero trees. Do not start paid renders.
