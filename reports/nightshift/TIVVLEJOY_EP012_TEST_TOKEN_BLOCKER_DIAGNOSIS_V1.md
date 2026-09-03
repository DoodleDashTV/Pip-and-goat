# EP012 test-token blocker diagnosis V1

Storage-probe POST returned `EP012_TEST_TOKEN_INVALID`. This pass diagnoses the mismatch only.

No audio. No ElevenLabs contact. No production. No scenery. No POST retry. No secret, token, hash, prefix, suffix, or length printed.

## Result: PASS (diagnosed)

The preview route is not missing `TIVVLEJOY_VOICE_TEST_TOKEN`. Preflight only checks that the env var is present. The storage-probe POST compares a request header to that env var. `EP012_TEST_TOKEN_INVALID` means the env value is nonempty and the header value did not match, including when the header is missing or comes from a different secret store.

## Expected names

| Side | Name |
|---|---|
| Env var the route reads | `TIVVLEJOY_VOICE_TEST_TOKEN` |
| Request header the route reads | `x-tivvlejoy-voice-test-token` |

Local probe route, probe runner, and `tokensMatch` at required SHA `acfeead3e853bacc307c387fbc9ba6f23359a547` are identical to the current EP012 branch copies. Compare is SHA-256 + `timingSafeEqual` after trim. Empty env → `EP012_TEST_TOKEN_NOT_CONFIGURED`. Nonempty env + failed compare → `EP012_TEST_TOKEN_INVALID`.

`next.config.js` does not inline this env var. Server code reads `process.env` at request time.

## Why preflight stayed clean

`GET /api/voice-production/ep012/preflight` does not read the test-token header. It only calls `testTokenConfigured()`, which is true when the Preview env var is nonempty.

Live Preview `serverGates.voiceTestTokenConfigured=true` on both:

- git-branch alias `pip-and-goat-git-cursor-tivvlejoy-b4d641-…`
- unique required-SHA deploy `pip-and-goat-q7chkqj30-…`

That is why preflight can be READY/COMPLETE with `blockers=[]` while storage-probe returns HTTP 400 `EP012_TEST_TOKEN_INVALID`.

Docs on this branch list the probe body `{ "confirmed": true }` only. They do not name the header. A caller that follows the docs and omits `x-tivvlejoy-voice-test-token` hits the invalid-token branch, not the not-configured branch.

`Authorization` / body `testToken` are not accepted. There is no middleware rewrite of this header.

## Preview SHA

Required SHA exists and has a successful Preview deploy (2026-08-21) at a unique Vercel host, not the truncated git-branch alias.

EP012 branch HEAD is later (`c814fdaa`). No later commit changes probe token compare. The cited alias `cursor-tivvlejoy-b4d641` is a length-truncated `cursor/tivvlejoy-*` slug and is not a pin to `acfeead3`. Use the unique required-SHA host, or redeploy that SHA, when a later POST must hit that commit.

`previewAtRequiredSha=false` for the cited alias. Token logic still matches the required SHA.

## Token source

| Store | Present / configured |
|---|---|
| Cursor cloud environment | `TIVVLEJOY_VOICE_TEST_TOKEN` present and nonempty in this run |
| Vercel Preview | configured (`voiceTestTokenConfigured=true`) |
| Local shell | not this run’s `VERCEL_ENV` |

These stores are independent. The route compares the header to the **Vercel Preview** env value. A Cursor or local value that is not that Preview value fails the same way as a missing header. This diagnosis does not compare store values.

Vercel documents a redeploy after env edits. Because this var is runtime `process.env` and is already configured on the live Preview functions, a missing-env rebuild is not the current blocker. Redeploy the required SHA only after changing the Preview value so the next POST compares against the intended store.

## Safe fix plan

1. Do not POST again until the header name and Preview store are aligned.
2. Send `x-tivvlejoy-voice-test-token` with the Vercel Preview `TIVVLEJOY_VOICE_TEST_TOKEN` value. Do not use `Authorization`, a query param, or a body field.
3. Keep the body exactly `{ "confirmed": true }`.
4. Target the unique required-SHA Preview host, or redeploy `acfeead3` and use that deployment URL.
5. If the Preview env value was edited, redeploy that SHA, then POST once.
6. Do not contact ElevenLabs. Do not run generate. Do not access scenery.

## Locks held

`postRetried=false`. `providerContacted=false`. `providerRequestsMade=0`. `productionEnabled=false`. `secretsExposed=false`.
