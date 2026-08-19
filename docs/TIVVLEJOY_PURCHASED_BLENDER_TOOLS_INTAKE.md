# TIVVLEJOY_PURCHASED_BLENDER_TOOLS_UPLOAD_INSPECTION_V1

This checkpoint records a metadata-only inspection of user-supplied purchased Blender packages.

## Safety boundary

- No purchased/licensed package bytes are committed to Git.
- Archives were inspected as ZIP containers only; no add-on code was executed.
- No package was installed into Blender.
- No Production deployment or database mutation was performed.
- No RunPod/GPU work was performed.
- No source asset was modified.

## Active package selection

### Gaffer

Use `Gaffer 3.2.10 (for b3.4+) - latest.zip`.

The package declares Gaffer version `3.2.10` and Blender minimum `3.4.0`.
Older uploaded Gaffer versions are retained only as historical downloads and should not be selected for the TivvleJoy Blender 4.2+ path.

### Physical Starlight and Atmosphere

Use `physical_starlight_atmosphere-1.9.4.zip`.

Its Blender extension manifest declares version `1.9.4` and Blender minimum `4.2.0`.
The older uploaded versions are historical only. The two uploaded `1.8.3` files are byte-identical duplicates.

### Botaniq Full

The uploaded `botaniq_full-7.2.0.paq.zip` is **not a usable asset package**.
It is a 135-byte XML error response with `InvalidRange`, so the main Botaniq Full 7.2.0 package must be downloaded again before Botaniq asset intake can complete.

### Botaniq Geo-Scatter biomes

`botaniq_full_geoscatter_biomes-7.1.1.scatpack.zip` is the newest uploaded Geo-Scatter biome package.
It is valid as an archive, but it is an optional Geo-Scatter companion, not the main Botaniq asset library.
It remains `OPTIONAL_NOT_INTEGRATED` because the current TivvleJoy storybook environment system intentionally uses the native Blender scatter path unless Geo-Scatter is explicitly integrated later.

## Next intake gate

Before enabling these commercial packages in the Preview asset uploader:

1. Obtain a valid main Botaniq Full 7.2.0 `.paq` download.
2. Store all purchased binaries only in private object storage, never Git.
3. Add exact version/hash receipts to the private intake session.
4. Install/test only the selected current Gaffer and PSA versions in a controlled Blender 4.2+ worker.
5. Keep older versions quarantined as historical downloads rather than active runtime dependencies.
6. Do not activate the Geo-Scatter biome pack until a separate Geo-Scatter integration decision is made.

The full metadata receipt is in
`artifacts/tivvlejoy-purchased-blender-tools-intake/upload-inspection-2026-08-19.json`.
