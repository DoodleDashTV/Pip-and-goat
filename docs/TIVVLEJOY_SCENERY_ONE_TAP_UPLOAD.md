# TivvleJoy scenery one-tap upload

Checkpoint: `TIVVLEJOY_SCENERY_ONE_TAP_UPLOAD_V1`

Stacked on Draft PR #45 (`cursor/tivvlejoy-scenery-intake-preview-73f1`). Keep #44 and #45 draft and unmerged.

This pass adds a mobile-friendly one-tap workflow on Preview `/scenery` so an authorized TivvleJoy studio session can select all 27 purchased source files in one file-picker action. Collection cards are not required.

It does **not** inspect, extract, convert, normalize, or approve assets. Production is not retargeted. Existing Preview R2 settings are reused.

## One-tap workflow

1. Enter the Preview intake token. It stays in local component state only.
2. Tap **Select and upload all 27 purchased files**.
3. Choose every purchased file in one picker.
4. Review matched, missing, unexpected, duplicate, and incorrect filenames, plus individual sizes and collection totals.
5. Unexpected, incorrect, and duplicate files are refused individually. Valid matches stay eligible.
6. Tap **Upload or retry all eligible files**.
7. Watch overall and per-file hash, multipart progress, stored size, duplicate, quarantine, and inspection-readiness.
8. Resume, pause, and cancel remain available on eligible rows.

Upload does not mean asset approval.

## Matching rules

Exact inventory filenames are matched across Village, Sky/HDRI, Stylized Forest, and Procedural Nature.

- Alias-only names are **incorrect** and are not uploaded.
- Unknown names are **unexpected** and are not uploaded.
- A second copy of the same exact filename is a **duplicate** and is not uploaded.
- Missing inventory names stay listed until selected.

Large files travel browser → signed R2 multipart URLs. They do not pass through a Vercel request body. Signed URLs must not target Vercel.

## Purchased-file rule

If the 27 purchased files are present in the agent environment, upload them only through this authorized Preview intake path. Never commit them to Git.

If they are not present, do not invent them. Synthetic Preview tests may use only newly generated `tivvlejoy-preview-synthetic-` fixtures under `tivvlejoy-assets/quarantine/preview-tests/`. Never use a purchased inventory filename and never write fixtures under `tivvlejoy-assets/source/`.

## Not done in this pass

- No purchased files were present in the agent environment
- No purchased files were uploaded
- No assets were inspected, extracted, converted, normalized, or approved
- Draft PR #44 and Draft PR #45 stay open, draft, and unmerged
