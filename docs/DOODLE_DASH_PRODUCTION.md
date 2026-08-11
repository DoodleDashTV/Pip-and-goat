# Doodle Dash Production

User-facing product identity for the Studio: **Doodle Dash Production**.

## Permanent defaults

| Setting | Value |
|---------|-------|
| Final resolution | 1080 × 1920 |
| Aspect | 9:16 |
| FPS | 30 |
| Final engine | EEVEE |
| Draft | DRAFT_FAST (540×960 EEVEE) then DRAFT_HD |
| Routing | Local Blender → remote worker → cloud render → paid AI (explicit only) |
| AI video | OFF |
| Render cache | ON |
| Voice cache | ON |
| Animation reuse | ON |

## Philosophy

CREATE ONCE → VALIDATE → VERSION → LOCK → REUSE → ASSEMBLE → RENDER

Optimize for **best quality per dollar**, not cheapest possible output. Do not silently downgrade resolution, FPS, textures, or switch to paid AI.

## Related systems (preserved)

Production readiness, asset locking, story/continuity, shot planning, Blender worker, render queue, audio, QC, Doodle Guardian, publishing, observability, vertical slice (Meadow Map Mystery).
