# TIVVLEJOY_EP012_PAID_VOICE_EXECUTION_V1

Preview-only execution for the 11 authorized EP012 Pip and Goat voice segments.

This increment implements the guarded path. It does not generate speech, contact ElevenLabs, or execute the storage probe.

## Locked totals

- Historical imported Preview usage: 4 requests / 235 characters
- Authorized EP012: 11 requests / 460 characters
- Final Preview ceiling: 15 requests / 695 characters
- Legacy three-request voice-preview cap is unchanged

## Routes

- `GET /api/voice-production/ep012/preflight`
- `POST /api/voice-production/ep012/generate` — body `{ "segmentId", "confirmed": true }` only
- `GET /api/voice-production/ep012/audio?segmentId=&kind=mp3|receipt`
- `POST /api/voice-production/ep012/storage-probe` — body `{ "confirmed": true }` only

Local, Development, and Production runtimes fail closed. Preview requires the existing voice test token and same-origin checks.

## Order

1. Validate and reserve in PostgreSQL
2. Mark the provider attempt durably
3. Make exactly one ElevenLabs `with-timestamps` request
4. Validate audio and alignment
5. Write MP3 and receipt under `audio/EP012/`
6. Read both objects back
7. Verify SHA-256 and byte counts
8. Finalize the ledger only after verification

Unfinalized or reserved entries block all later generation. Finalized success may replay with zero provider contact.
