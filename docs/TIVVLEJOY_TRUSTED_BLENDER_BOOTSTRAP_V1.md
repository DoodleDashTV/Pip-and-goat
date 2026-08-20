# TIVVLEJOY_TRUSTED_BLENDER_BOOTSTRAP_V1

Target version: **4.2.2** (project pin used by scenery intake, assembly, and storybook environment).

Trusted source: official Blender Foundation `https://download.blender.org/release/Blender4.2/`

Do not use random third-party binaries, unofficial AppImages, or paid GPU hosts to fetch Blender.

## Why this marathon does not install

- The repository does not contain an official SHA-256 pin for `blender-4.2.2-linux-x64.tar.xz`.
- Older cloud-acceptance notes mention 4.2.3. That version ambiguity is unresolved.
- A blender binary on PATH is detection, not a trusted install.

Installation itself does not cost money. It is still refused until the official digest is pinned.

## Later authorization playbook

1. Confirm the pin remains 4.2.2.
2. Justin pastes the official SHA-256 from download.blender.org.
3. Download only that official linux-x64 tarball into an isolated user-space cache.
4. `sha256sum -c` against the pinned digest. Mismatch means delete and stop.
5. Extract as the current user. Root is not required if the cache is writable.
6. Do not install addons. Do not open Pip, Goat, or purchased files.
7. Run only the synthetic factory-startup acceptance command.

## Synthetic acceptance

When a trusted pin exists, validate version, background launch, factory startup, autoexec disabled, Python API, EEVEE, Cycles metadata only, network isolation, temporary output, and clean shutdown.

Do not load purchased assets. Do not load Pip or Goat.
