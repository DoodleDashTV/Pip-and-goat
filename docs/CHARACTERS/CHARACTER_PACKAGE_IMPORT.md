# Character Package Import

## Preferred Studio path

1. `/asset-intake` → open **PIP** / **GOAT** cards → tap **UPLOAD PRIMARY REFERENCE** (iPhone Photos/Files picker; drag-drop optional on desktop)  
2. `/references/approve/CHAR_PIP_001` and `/references/approve/CHAR_GOAT_001` → **APPROVE & LOCK** (or REJECT / REPLACE CANDIDATE)  
3. Later: upload real `.blend`, complete rig/facial maps, queue `/character-test/[code]`, complete model-to-reference review  
4. Only then pursue `PRODUCTION_READY`

## API

- `POST /api/production/onboarding/upload` with `kind=PRIMARY_CANONICAL_REFERENCE`
- `POST /api/production/canonical-characters` multipart (`file`, `characterCode`, optional `autoApprove`)
- `POST /api/production/canonical-characters` JSON `{ action: "bootstrap" | "lock-dna" | "approve-primary" | "readiness" }`

## Optional filesystem drop

`packages/characters/canonical-refs/pip-primary-canonical.jpg`  
`packages/characters/canonical-refs/goat-primary-canonical.jpg`

## Invariants

- No duplicate CHAR_PIP_001 / CHAR_GOAT_001 records  
- STRICT_CHARACTER_LOCK stays on  
- Reference import never falsifies production-ready  
- Blender-first / EEVEE-first / AI video OFF defaults unchanged  
