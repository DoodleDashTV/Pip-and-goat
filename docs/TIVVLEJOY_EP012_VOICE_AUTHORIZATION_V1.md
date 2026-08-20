# TIVVLEJOY_EP012_VOICE_AUTHORIZATION_V1

## Purpose

This authorization is intentionally narrow. It authorizes future Preview voice generation for exactly the 11 already-verified Pip/Goat utterance subsegments in EP012, **The Bakery Map**, and nothing else.

It does not itself call ElevenLabs or any other provider.

## Immutable dialogue binding

The authorization is pinned to the canonical EP012 dialogue aggregate SHA-256:

`f0b85a04a301359750d59da9699b2d7c26f0acee6d517b83e80fd9420aeb1ac4`

If the canonical dialogue lock, line text, speaker, text hash, segment hash, aggregate hash, or deterministic request binding changes, authorization fails closed.

The canonical dialogue lock remains unchanged.

## Authorized scope

Exactly 11 requests are authorized, one request for one speaker utterance:

1. `DL_HOOK_01__PIP`
2. `DL_HOOK_01__GOAT`
3. `DL_DISCOVERY_01__PIP`
4. `DL_DECISION_01__GOAT`
5. `DL_ACTION_01__PIP`
6. `DL_ACTION_01__GOAT`
7. `DL_COMPLICATION_01__GOAT`
8. `DL_COMPLICATION_01__PIP`
9. `DL_PAYOFF_01__PIP`
10. `DL_BUTTON_01__GOAT`
11. `DL_BUTTON_01__PIP`

Each request is bound to:

- EP012
- the parent dialogue line ID
- the utterance segment ID
- the exact speaker
- the exact canonical spoken text
- the canonical text SHA-256
- the canonical segment SHA-256
- the aggregate EP012 dialogue SHA-256
- one deterministic request ID

No batch script or arbitrary text is authorized.

## Cost and retry safety

- `maxProviderRequests = 11`
- one request per speaker utterance
- automatic retries are forbidden
- durable paid-usage ledger remains required
- existing Preview server gates remain required
- this authorization does not bypass idempotency, provider confirmation, approved voice identity, model/settings lock, or durable usage reconciliation

The current durable-ledger blocker must still be resolved before paid provider calls can occur.

## Explicitly not authorized

- any episode other than EP012
- any text other than the 11 locked utterance subsegments
- any speaker substitution
- any dialogue-lock mutation
- Production voice generation
- automatic retry or duplicate billing
- scenery listing/download/materialization
- R2 GETs
- Blender
- RunPod or GPU compute
- publishing

## Current execution state

At creation of this authorization:

- voice generation performed: **false**
- scenery access allowed: **false**
- commercial scenery bytes downloaded: **0**
- Production enabled: **false**

The authorization is a narrow permission boundary for a later real generation step; it is not evidence that generation has already occurred.
