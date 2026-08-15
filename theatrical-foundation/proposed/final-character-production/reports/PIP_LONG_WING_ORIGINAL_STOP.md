# Pip long-wing original — STOP

**Inspection stopped.** The required SHA-256 could not be verified
because piece 01 is not on the branch.

Expected pieces:

- `theatrical-foundation/proposed/final-character-production/pip_long_wing_original.part01.bin` — **MISSING**
- `.../pip_long_wing_original.part02.bin` — present, 22,000,000 bytes, SHA-256 `cd0442eb751d7d5f4d2f534b4b12dc91799641e2f208cc35c17d06adcda065f7`
- `.../pip_long_wing_original.part03.bin` — present, 19,616,868 bytes, SHA-256 `88c5cfe59016a84496f499801a99b3840f35d92ecbd5c01c6eb82d81aad2078d`

Remote commits pulled: `9380aae` (part02), `06486a3` (part03).
No commit on `cursor/theatrical-final-character-production-1ebc` contains
`pip_long_wing_original.part01.bin`.

## What was not done

- No concatenation
- No `/tmp/pip_long_wing_candidate_original.glb`
- No SHA-256 check against `9158dea0e23e5ebb086a574badb0b5a62982d0b90e1d8b118f54cfac0549c4f2`
- No Blender import
- No new recommendation (A / B / C)
- Current Pip not overwritten
- `production-library/` not touched
- No merge, canon, retopo, rig, or paid resources

Part02 does not begin with the glTF magic header. It is a middle chunk.
Reconstructing from part02 + part03 alone would be an incomplete file.

## Needed to continue

Re-upload `pip_long_wing_original.part01.bin` to the same folder on this
branch. After it lands, concatenate 01+02+03 in that order and verify
SHA-256 `9158dea0e23e5ebb086a574badb0b5a62982d0b90e1d8b118f54cfac0549c4f2`
before any Blender import.

Keep part02 and part03 until that inspection completes.
