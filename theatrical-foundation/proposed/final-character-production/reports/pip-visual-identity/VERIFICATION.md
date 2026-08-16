# Pip official visual identity — verification

STOP FOR JUSTIN. Draft PR #24 stays draft. `production-library/` was not replaced.
Theatrical binding was not declared. The fused mesh is **not** production-ready.

## Official source

- Package: `20260816T025617Z_pip_backpack_replacement.glb_dca239475c78`
- SHA-256: `dca239475c78c9158ac87c36d674ceb23ef334358ee4394607758fc8f6728696`
- Size: `62876180` bytes
- Working copy: `theatrical-foundation/proposed/final-character-production/working/pip_backpack_canonical_working.blend`
- Native high-res source is the immutable inbox split parts / approved hash.
  The working blend is a single object-level-scaled copy, not a remesh.
- Source split parts remain in the intake inbox and are indexed in
  `archive/pip-visual-identity/FINGERPRINT.json`

## Bound design

Face, eyes, cheerful expression, bright-yellow CGI finish, three coral crest
feathers, long layered yellow wings, teal scarf, orange beak and feet,
centered backpack, two symmetrical shoulder straps. No satchel, no
cross-body strap, no hip bag.

## Normalize (non-destructive)

- Object scale `2.0935` on the working object only
- Mesh datablock not applied
- Feet placed on ground
- Facing left `+X`; no auto-rotate
- Height after normalize: `2.05`

## Intersection probe

- Method: spatial region KD-tree
- Mesh edited: no
- Destructive cleanup: no
- Close backpack/body pairs under ~4 mm scaled: 17
- Minimum observed gap: `0.0011` (working units)
- Later work must separate or weight backpack, straps, and scarf. Do not
  remesh or primitive-rebuild this likeness.

## Texture hashes (extracted, not committed)

- Color 8192×8192 — `c6dcdd394f4bc594892723444c3f74db036f0e4aab47b4ec8b028458cd3cb61f`
- Normal 4096×4096 — `41e2f91006bef8cb82eeae2a8383057189ffe775906611b10646caff11c53815`
- ORM 4096×4096 — `585ba31bd09f330b37a0478ab6d8fb42d4f50d55c2aa72c641db4fed5e583bec`

## Verification views

1. front
2. back
3. left
4. right
5. three-quarter

Phone: `artifacts/theatrical-v2/final-character-production/pip-visual-identity/phone/`

## Still closed

- production-library replace
- theatrical bind
- Draft PR merge
- destructive mesh cleanup
- paid resources
- Goat
