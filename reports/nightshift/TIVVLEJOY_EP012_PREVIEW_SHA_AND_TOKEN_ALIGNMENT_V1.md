# EP012 Preview SHA and token alignment V1

Align the storage-probe POST to the required SHA and the Vercel Preview token. No audio. No ElevenLabs. No generate. No scenery. No token values, token hashes, prefixes, suffixes, or lengths printed.

## Result: PASS

Exactly one storage-probe POST after SHA and token alignment. HTTP 200, `VERIFIED`, marker written, read-back hash verified. Provider not contacted.

## Branch / PR #93

| Fact | Value |
|---|---|
| This agent branch (start) | `cursor/tivvlejoy-ep012-test-token-blocker-diagnosis-eed2` @ `18a12736` |
| EP012 remote tip | `cursor/tivvlejoy-ep012-paid-voice-execution-73f1` @ `c814fdaa1882955fc12b58c062e25fde7e75c106` |
| PR #93 head | **`c814fdaa`**, not the required SHA |
| Required SHA | `acfeead3e853bacc307c387fbc9ba6f23359a547` (ancestor of PR #93 head) |

PR #93 head is no longer pinned to the required SHA. Later commits on that branch do not change probe token compare.

## Preview used

Found three READY unique Vercel deployments whose `githubCommitSha` is exactly the required SHA. Did not use the truncated git-branch alias.

Tested URL (unique required-SHA host, team slug omitted):

`https://pip-and-goat-q7chkqj30-[redacted].vercel.app`

Reconfirmed via Vercel API immediately before POST: `readyState=READY`, commit SHA equals required. `previewAtRequiredSha=true`.

No new deploy was required. Existing Aug 21 unique host is still READY.

## Token source

`TIVVLEJOY_VOICE_TEST_TOKEN` is present on Preview (`voiceTestTokenConfigured=true`).

Vercel has two Preview rows for that name. The row used is the **encrypted, branch-scoped** value for `cursor/tivvlejoy-ep012-paid-voice-execution-73f1`. Fetched by env id from the Vercel API, never printed. That value equals this run’s Cursor store (boolean only). The other Preview row is `sensitive` with no decryptable value and no git branch; it was not used.

Header sent: `x-tivvlejoy-voice-test-token` with that Vercel Preview value. Body exactly `{ "confirmed": true }`. Token file shredded after the single POST.

## Probe

| Field | Value |
|---|---|
| `storageProbePostCount` | 1 |
| HTTP | 200 |
| `storageProbeStatus` | `VERIFIED` |
| `markerKey` | `audio/EP012/control/storage-probe.marker.json` |
| `markerWritten` | true |
| `writeReadBackHashVerified` | true |
| `byteCount` | 233 |
| `providerContacted` | false |
| `providerRequestsMade` | 0 |
| `sceneryAccessed` | false |
| `productionEnabled` | false |
| `blockers` | [] |

## Ledger (preflight GET, not a generate)

Same before and after. EP012 generation budget was already exhausted; this probe does not consume it.

| | Before | After |
|---|---|---|
| completedRequests | 11 | 11 |
| remainingRequests | 0 | 0 |
| remainingCharacters | 0 | 0 |
| globalPaidRequests | 15 | 15 |
| globalPaidCharactersUsed | 695 | 695 |

Preflight `providerRequestsMade=11` is prior authorized EP012 generation, not this probe.

## Safe next action

Do not generate. Do not contact ElevenLabs. Remaining authorized EP012 requests/characters are 0. Keep using the unique required-SHA host for any later read-only checks. Do not POST generate.
