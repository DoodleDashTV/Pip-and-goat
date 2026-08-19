# TIVVLEJOY_IPHONE_LARGE_PURCHASED_ASSETS_UPLOAD_V1

Preview-only, iPhone-first direct-to-private-R2 intake for purchased Blender libraries and tools.

## Purpose

The main Botaniq Full 7.2.0 package is approximately 5.15 GB and cannot be routed through ChatGPT, GitHub, or Vercel request bodies. This flow sends file chunks directly from Safari to signed private R2 URLs.

## Approved files

- `botaniq_full-7.2.0.paq` — Botaniq Full 7.2.0, store-only source library, dedicated 8 GiB cap.
- `Gaffer 3.2.10 (for b3.4+) - latest.zip` — selected Gaffer candidate, install later.
- `physical_starlight_atmosphere-1.9.4.zip` — selected Physical Starlight and Atmosphere candidate, install later.
- `botaniq_full_geoscatter_biomes-7.1.1.scatpack.zip` — optional companion; Geo-Scatter remains not integrated.

Unexpected or renamed filenames fail closed.

## Mobile resilience

- 32 MiB multipart chunks.
- Each successful R2 part ETag is immediately persisted server-side in private R2 session state.
- Recovery metadata stores only the opaque session id plus local file identity in Safari localStorage.
- A 72-hour session window permits re-selecting the exact same iPhone file and resuming after Safari/iOS interruption.
- Signed URLs are generated one part at a time and are not persisted in browser recovery state.
- The uploader requests a screen wake lock where Safari supports it, but the user should still keep Safari foregrounded.

## Verification

Multipart completion is accepted only when every persisted part has an ETag and R2 reports the expected total byte size. After storage completion, Safari computes a chunked SHA-256 over the selected local file and records the client checksum in a private source receipt. This is explicitly `CLIENT_SHA256_RECORDED`, not an independent server-side hash of the R2 object.

## Storage namespaces

Purchased binaries:

`tivvlejoy-assets/source/purchased-blender-tools/<SOURCE_ID>/<original filename>`

Private resumable-session state:

`tivvlejoy-assets/catalogs/purchased-tool-upload-sessions/<session id>.json`

Private source receipts:

`tivvlejoy-assets/catalogs/purchased-tool-receipts/<SOURCE_ID>.json`

## Safety

- Preview mutations require the existing TivvleJoy scenery intake studio token.
- Production intake remains refused by the shared authorization boundary.
- No purchased/licensed binary is committed to Git.
- Upload does not mean approval.
- Botaniq raw source remains immutable and is not redistributed.
- Gaffer/PSA are not installed by this milestone.
- Geo-Scatter is not activated.
- No paid GPU or RunPod operation is used.

## User path

Open `/purchased-assets` on the branch Preview, paste the existing Preview studio upload token, select one original file from the iPhone Files app, and start or resume the private upload. For Botaniq, keep Safari foregrounded. If interrupted, reopen the same Preview, re-select the exact same file, and tap Resume upload.
