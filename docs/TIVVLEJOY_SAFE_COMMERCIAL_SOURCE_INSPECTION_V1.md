# TIVVLEJOY_SAFE_COMMERCIAL_SOURCE_INSPECTION_V1

Read-only inspection of licensed scenery sources.

## Materialization

`TIVVLEJOY_SOURCE_MATERIALIZATION_V1` copies bytes into a randomized temporary
workspace, verifies size and SHA-256 independently, then deletes the copy on
success, failure, or timeout. R2 is never written, deleted, renamed, or
overwritten.

States: `SOURCE_READY`, `SOURCE_NOT_AVAILABLE`, `SOURCE_SIZE_MISMATCH`,
`SOURCE_HASH_MISSING`, `SOURCE_HASH_MISMATCH`, `SOURCE_RECEIPT_MISSING`,
`SOURCE_MATERIALIZATION_FAILED`.

## Archives

`TIVVLEJOY_SAFE_ARCHIVE_INSPECTION_V1` inventories ZIP-like containers without
executing contents. It refuses `../`, absolute paths, drive letters, symlink
escape, bomb ratios, excessive entries, and nested recursion explosions.

Python and executables are reported, never run.

## Static formats

GLB, GLTF, FBX, and Blend headers are parsed conservatively. External HTTP
buffer or image URIs become `BLOCKED_EXTERNAL_NETWORK_DEPENDENCY` and are not
fetched. Blend header detection is not deep scene inspection.

## Isolated Blender

If Blender is already installed, inspection may use factory startup, background
mode, auto-execution disabled, and a temporary copy. If Blender is absent, the
state is `DEEP_BLENDER_INSPECTION_PENDING`.
