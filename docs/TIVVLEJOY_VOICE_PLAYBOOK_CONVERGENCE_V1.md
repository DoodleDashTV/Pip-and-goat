# TIVVLEJOY_VOICE_PLAYBOOK_CONVERGENCE_V1

Nightshift editorial uses existing confirmed voice receipt interfaces.

Flow:

1. approved voice identity (unchanged)
2. confirmed script line
3. voice receipt
4. timing receipt (`LINE_LEVEL` → `WORD_LEVEL` → `PHONEME_LEVEL` / `EXACT`)
5. dialogue edit (start/end, pre/post reaction, pause, interruption,
   breath, comedy beat)
6. viseme plan (confidence follows timing class)
7. animation
8. caption
9. QC

Do not synthesize voices. Do not change voice IDs. Exact timing confidence
must remain explicit. Upgrading timing must not invalidate unrelated
scenery source hashes.
