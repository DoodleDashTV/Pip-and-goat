# Low-Cost High-Quality Strategy

## Goal

Extremely high-quality children’s animated episodes at the lowest **practical** variable cost.

## Levers

1. **Blender-first / EEVEE-first** — no paid generative video on the default path
2. **Cheap drafts** — DRAFT_FAST / DRAFT_HD before FINAL_1080P
3. **Reusable locked assets** — characters, rigs, environments, props, materials
4. **Reusable animations** — library + motion composer with procedural variation
5. **Shot-level render caching** — fingerprint; unchanged shots reuse approved renders
6. **Voice caching** — identical TTS fingerprints reuse audio
7. **Audio library** — prefer approved SFX/music before paid generation
8. **Cost Guardian** — explicit approval before paid external spend

## Non-negotiables

- Final default stays 1080×1920 @ 30 FPS
- No silent AI fallback when Blender fails (BLOCK + explain)
- STRICT_CHARACTER_LOCK remains; Pip/Goat never from text alone
- Do not reuse broken or emotionally inappropriate performance just to save compute
