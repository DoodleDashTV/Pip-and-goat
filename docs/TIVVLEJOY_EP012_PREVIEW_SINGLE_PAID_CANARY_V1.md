# TivvleJoy EP012 Preview single paid canary V1

## Scope and authorization

Exactly one Preview Generate invocation was authorized for `DL_HOOK_01__PIP`, with no automatic retry. Production, scenery, the dialogue lock, existing Draft PR state, and unrelated storage were out of scope.

## Result

The one Generate invocation failed closed before reservation with HTTP 400 because EP012 audio storage was not configured in Preview. The effective blocker was `EP012_STORAGE_NOT_CONFIGURED`.

- Segment: `DL_HOOK_01__PIP`
- Character count: `51`
- Generate invocations: `1`
- ElevenLabs requests: `0`
- Reservations: `0`
- Finalizations: `0`
- R2 reads: `0`
- R2 writes: `0`
- Automatic retries: `0`

No paid provider request was made, so this authorization was not reused for another Generate invocation.

## Carrier evidence

The guarded carrier required the exact Preview branch, team, project, clean ledger identity, target segment, and one-attempt authorization marker. It invoked the existing Generate route once, without a loop or retry.

- First armed commit: `0d40e8118208095e450efd87400a128303d68ac3`
- First deployment: `dpl_9CfFodw2Ypfk5wKScqHANaRHQqWf`
- First deployment result: rejected by Vercel configuration validation before build because the build command exceeded the schema length limit
- Executed carrier commit: `5b0f45f262eae6b64e5b6994f0853dce0342e6fb`
- Executed carrier deployment: `dpl_FAKf3o1MeLyCuFNYQHWu4dntMJN1`
- Generate result: HTTP 400 at `2026-08-21T17:03:29Z`

The configuration-rejected deployment had no build events and could not invoke Generate. The executed carrier made the only Generate invocation.

## Read-only root-cause diagnostic

A separate read-only diagnostic reported configuration-presence booleans only. It did not import or invoke Generate, query the ledger, initialize R2, or contact ElevenLabs.

- Diagnostic commit: `6e2cd3e8933bba8f9bddd4fec53c54aad2749027`
- Diagnostic deployment: `dpl_EYDiA1E4Nu3WQpd8VUqB2mG48gwT`
- EP012/R2 bucket configured: `false`
- EP012/R2 endpoint configured: `false`
- EP012/R2 access key configured: `false`
- EP012/R2 secret key configured: `false`
- ElevenLabs API key configured: `true`
- voice test token configured: `true`
- voice ledger database configured: `true`

These booleans match the code's `EP012_STORAGE_NOT_CONFIGURED` pre-reservation branch.

## Durable post-attempt verification

Read-only preflight after the HTTP 400 returned:

- HTTP 200
- `status: READY`
- blockers: none
- execution ledger readable: `true`
- server gates passed: `true`
- global ledger: `4` requests / `235` characters
- EP012 succeeded: `0 / 11` requests and `0 / 460` characters
- `DL_HOOK_01__PIP`: `ABSENT` / `ELIGIBLE`
- failed attempts: `0`
- reserved requests: `0`
- reserved characters: `0`
- unfinalized count: `0`
- recovery required: `0`
- provider requests made: `0`
- storage-verified executions: `0`

This proves the Generate request stopped before reservation, provider contact, storage access, or finalization.

## Cleanup and next gate

The paid carrier, package hook, read-only diagnostic, and both temporary Vercel build hooks were removed. The normal Preview build was restored. There was no retry.

Before requesting a fresh canary authorization, configure all four accepted Preview EP012/R2 storage fields (bucket, endpoint, access key, and secret key), then run the existing no-provider storage probe and require it to pass. Do not reuse this one-attempt authorization.

## Fresh authorized successful canary

After the branch-scoped Preview R2 configuration passed the isolated no-provider marker write/read probe, Justin provided fresh authorization for exactly one paid Preview canary for the same segment, with no retry. The earlier authorization was not reused.

### Precheck

Immediately before arming the carrier, read-only preflight returned:

- HTTP 200 / `status: READY`
- `DL_HOOK_01__PIP`: `ABSENT` / `ELIGIBLE`
- global ledger: `4` requests / `235` characters
- EP012 succeeded: `0` requests / `0` characters
- failed attempts, reservations, unfinalized entries, and recovery-required entries: all `0`
- provider requests made: `0`
- Preview runtime: true
- Production runtime: false

### Executed result

The single-use carrier contained one Generate invocation and no loop or retry.

- Armed commit: `57e7251a3d26b82652a6dc9e9d4cd8a6ad500c03`
- Preview deployment: `dpl_7L8WmoEmCKW4TysfFjdSXwEzK2v5`
- Deployment target: Preview (`target: null`)
- Result: `SUCCEEDED`
- Segment: `DL_HOOK_01__PIP`
- Character count: `51`
- Generate invocations: `1`
- ElevenLabs/provider requests: `1`
- Automatic retries: `0`
- Storage verified: true
- MP3 bytes: `54378`
- MP3 SHA-256: `c99a4022bc0a62445074f7d424dc9607ca5b0e2db2b86aa863264e472aefac0b`
- Receipt contract, MP3 content type, byte count, segment header, and read-back hash: verified
- Scenery access: none
- Production enabled: false

### Durable postcheck

After finalization and again from the clean deployment, read-only preflight returned:

- HTTP 200 / `status: READY`
- `DL_HOOK_01__PIP`: `SUCCEEDED` / `ALREADY_SUCCEEDED`
- global ledger: `5` requests / `286` characters
- EP012 succeeded: `1` request / `51` characters
- EP012 remaining: `10` requests / `409` characters
- provider requests made: `1`
- storage-verified executions: `1`
- failed attempts, reservations, unfinalized entries, and recovery-required entries: all `0`
- Production runtime: false

### Cleanup and next gate

The active build hook was disarmed immediately after the successful result. The temporary command and carrier were then removed.

- Disarm commit: `c175d4a3b3f4ce4c62384cb8c82152942dcad97c`
- Command cleanup commit: `f4ac60f283f4f8babba6821696460bda2257a381`
- Carrier cleanup commit: `20d4bd5c163356600734d5c51c81a2b3b1c0ea43`
- Final cleanup deployment: `dpl_2RFVrRMD9pkkvKXVTEipafsNvo38` / `READY`

No additional EP012 segment may contact the provider without another fresh, explicit authorization.

## Fresh authorized Goat hook canary

After the successful Pip hook canary had been finalized and its carrier removed, Justin provided fresh authorization to continue with exactly one next paid Preview segment: `DL_HOOK_01__GOAT`, with no retry.

### Precheck

Immediately before arming the Goat carrier:

- HTTP 200 / `status: READY`
- `DL_HOOK_01__PIP`: `SUCCEEDED` / `ALREADY_SUCCEEDED`
- `DL_HOOK_01__GOAT`: `ABSENT` / `ELIGIBLE`
- global ledger: `5` requests / `286` characters
- EP012 succeeded: `1` request / `51` characters
- provider requests made: `1`
- storage-verified executions: `1`
- failed attempts, reservations, unfinalized entries, and recovery-required entries: all `0`
- Production runtime: false

### Executed result

- Armed commit: `833a758c3a2027bbd9e381c556da32f58b07a297`
- Preview deployment: `dpl_6BXsLY6h979kBshBtM9WD67oHt5S`
- Deployment target/state: Preview / `READY`
- Result: `SUCCEEDED`
- Segment: `DL_HOOK_01__GOAT`
- Character count: `34`
- Generate invocations: `1`
- ElevenLabs/provider requests for this canary: `1`
- Automatic retries: `0`
- Storage verified: true
- MP3 bytes: `27629`
- MP3 SHA-256: `210c54fb3ef8468d3115943cb0bb7c6c7a510e0e778b59c890bb96ce2c9a6ca8`
- Receipt and MP3 read-back contracts: verified
- Scenery access: none
- Production enabled: false

### Durable postcheck and cleanup

- `DL_HOOK_01__PIP`: `SUCCEEDED` / `ALREADY_SUCCEEDED`
- `DL_HOOK_01__GOAT`: `SUCCEEDED` / `ALREADY_SUCCEEDED`
- global ledger: `6` requests / `320` characters
- EP012 succeeded: `2` requests / `85` characters
- EP012 remaining: `9` requests / `375` characters
- provider requests made: `2`
- storage-verified executions: `2`
- failed attempts, reservations, unfinalized entries, and recovery-required entries: all `0`

The active hook was disarmed and the temporary command and carrier were removed.

- Disarm commit: `c0cbd3e30afdf702c078740c757532a1b5c45afc`
- Command cleanup commit: `f13cde0e8273c71f6a602cc759ab028955890d85`
- Carrier cleanup commit: `4e3d85807bb10c45d56974ecce0dfc2fed08d849`
- Final cleanup deployment: `dpl_CctY2XdRPZhzSGeNC1D3uqCah5TM` / `READY`

No additional EP012 segment may contact the provider without another fresh, explicit authorization.

## Fresh authorized Discovery Pip canary

After the two hook segments were finalized and their temporary carrier was removed, Justin provided fresh authorization to continue with exactly one next paid Preview segment: `DL_DISCOVERY_01__PIP`, with a maximum of one provider request and no retry.

### Precheck

Immediately before arming the single-use carrier:

- HTTP 200 / `status: READY`
- `DL_HOOK_01__PIP`: `SUCCEEDED` / `ALREADY_SUCCEEDED`
- `DL_HOOK_01__GOAT`: `SUCCEEDED` / `ALREADY_SUCCEEDED`
- `DL_DISCOVERY_01__PIP`: `ABSENT` / `ELIGIBLE`
- global ledger: `6` requests / `320` characters
- EP012 succeeded: `2` requests / `85` characters
- provider requests made: `2`
- storage-verified executions: `2`
- failed attempts, reservations, unfinalized entries, and recovery-required entries: all `0`
- Preview runtime: true
- Production runtime: false

### Executed result

The carrier contained exactly one Generate invocation and no retry loop.

- Carrier staging commit: `d725b7e5117a68f264a0edc40c72d0635af57024`
- Command staging commit: `a28569436f00be5d29b10b719fed29ac38ec25cb`
- Armed commit: `1dbcc1c8836e620183fb0dde0e0a6e3ec40a168b`
- Preview deployment: `dpl_4ipQPzmSq912CdYFv9zFYrqQ8wVM`
- Deployment target/state: Preview / `READY`
- Result: `SUCCEEDED`
- Segment: `DL_DISCOVERY_01__PIP`
- Character count: `80`
- Generate invocations: `1`
- ElevenLabs/provider requests for this canary: `1`
- Automatic retries: `0`
- Storage verified: true
- MP3 bytes: `76948`
- MP3 SHA-256: `99f3a5e9d1e3d7d30982127f1a9fd3f295f985e7e1066d0a452f140c1cff76e8`
- Receipt and MP3 read-back contracts: verified
- Scenery access: none
- Production enabled: false

### Durable postcheck and cleanup

- global ledger: `7` requests / `400` characters
- EP012 succeeded: `3` requests / `165` characters
- EP012 remaining: `8` requests / `295` characters
- provider requests made: `3`
- storage-verified executions: `3`
- `DL_DISCOVERY_01__PIP`: `SUCCEEDED` / `ALREADY_SUCCEEDED`
- failed attempts, reserved requests/characters, unfinalized entries, and recovery-required entries: all `0`
- Production runtime: false

The active build hook was disarmed immediately after the successful carrier result. The temporary command and carrier were removed.

- Disarm commit: `f684c336e2776b6210157299a53f8794286ec83f`
- Command cleanup commit: `11f46ab3b5804d069072b04957941b4b3eb6daa1`
- Carrier cleanup commit: `6d4503e56a4a26ebdeb40d0fd9eac2400bf18561`
- Final cleanup deployment: `dpl_ByoDo8q1jDE2r924eVU5wA6xRWf7` / `READY`

No additional EP012 segment may contact the provider without another fresh, explicit authorization.

## Authorized remaining eight-segment completion batch

Justin authorized hands-off completion of the eight remaining paid Preview segments, with exactly one provider request per segment, no automatic retries, and an immediate stop on any mismatch. Production, scenery, dialogue-lock mutation, PR readiness, retargeting, merging, and unrelated storage remained out of scope.

### No-contact validation

The staged carrier required the exact branch, team, project, Preview runtime, authorization marker, starting ledger identity, eligible segment set, cumulative counters after every segment, and final ledger ceilings. Before arming it, a validation deployment overrode the branch identity to an unauthorized value. The carrier compiled and loaded, then exited at its first branch gate before any API, ledger, storage, or provider call.

- Carrier staging commit: `6e281f8e062cd27d3e9da1f9b1edff51153b02cb`
- Command staging commit: `26b1c24901b53f806b0fb00012f875ab7d1d601a`
- No-contact validation commit: `7bab8e37b3e342e2a627ecf8c37bb46856fbe314`
- No-contact validation deployment: `dpl_4JC7UGNXbG6PjsXJdb9iREZWPsuJ` / `READY`
- Validation result: `SKIPPED BRANCH_NOT_AUTHORIZED`
- Precheck: HTTP 200 / `status: READY`
- Starting global ledger: `7` requests / `400` characters
- Starting EP012 ledger: `3` requests / `165` characters
- Remaining authorized work: `8` requests / `295` characters
- All eight target segments: `ABSENT` / `ELIGIBLE`
- Failed attempts, reservations, unfinalized entries, and recovery-required entries: all `0`
- Production runtime: false

### Executed result

Exactly one Preview deployment was created for the armed commit. The carrier made eight explicit sequential Generate calls, one for each remaining segment, with no retry loop. After every success it checked the exact cumulative ledger counters and verified the receipt and MP3 read-back contract before proceeding.

- Armed commit: `87afa844c0cd10a2a75a40c9b180bab1a47f60d6`
- Preview deployment: `dpl_Gs8qEvitr4zUx5yQzRGX3i1AMavQ` / `READY`
- Deployment target: Preview (`target: null`)
- Result: `SUCCEEDED`
- Generate invocations: `8`
- ElevenLabs/provider requests: `8`
- Automatic retries: `0`
- Storage verified for all eight artifacts: true
- Scenery access: none
- Production enabled: false

| Segment | Characters | MP3 bytes | MP3 SHA-256 |
|---|---:|---:|---|
| `DL_DECISION_01__GOAT` | 56 | 45601 | `6cb94e856d510bcdba8e3254a3c5b34401feb9c67a4835cf746a966cd913ed9b` |
| `DL_ACTION_01__PIP` | 23 | 20524 | `4bf5172b65887660274823eb1c05c0b21e7704a17373495d60e0b1a0719276db` |
| `DL_ACTION_01__GOAT` | 30 | 25539 | `4265afd7e082658ef5d95d0202d5eeaa71d1bb923a64e1f0113b9c163dbe0f8f` |
| `DL_COMPLICATION_01__GOAT` | 26 | 24285 | `7fcce6989523c1d571ee4c15bb924fe712597a76eae832d10ce9637ba7c0fbde` |
| `DL_COMPLICATION_01__PIP` | 37 | 37660 | `3e6d78f8ba7658c4efa3cadd5a7711f2f95d04f566f4d06d0bd0a9ff7b10fd14` |
| `DL_PAYOFF_01__PIP` | 66 | 56886 | `46234f9a04f22ace55fa75b5a80b53f89032bcfc9fde41f16817b288176637f4` |
| `DL_BUTTON_01__GOAT` | 25 | 26375 | `d58793390af203748e5ac6509d84264aa54d33af06eb291be20e7d0377794f4b` |
| `DL_BUTTON_01__PIP` | 32 | 35152 | `10727aef3e6fdfb394f604fa18a883d17e8150167a602207cdd5c447472da212` |

### Durable completion postcheck

From the final clean Preview deployment, read-only preflight returned:

- HTTP 200 / `status: COMPLETE`
- All `11 / 11` request checks: `SUCCEEDED` / `ALREADY_SUCCEEDED`
- Global ledger: `15` requests / `695` characters
- EP012 succeeded: `11` requests / `460` characters
- EP012 remaining: `0` requests / `0` characters
- Provider requests made: `11`
- Storage-verified executions: `11`
- All artifacts storage verified: true
- Next provider contact permitted: false
- Failed attempts, reserved requests/characters, unfinalized entries, and recovery-required entries: all `0`
- Preview-only runtime: true
- Production runtime: false
- Scenery requests: `0`
- Dialogue lock mutated: false

### Cleanup

The armed build hook was disarmed immediately after the batch result. The temporary package command and carrier were removed, and the normal Preview build was restored.

- Disarm commit: `60333e6244202eadcbb5310eb6efb49529c23b17`
- Command cleanup commit: `2c58eebc166a57cc883ea23c4ce1d906c012023c`
- Carrier cleanup commit: `30e78aacd249e43fdbb36087882b28a46cf6ab3b`
- Final clean deployment: `dpl_8WRKYKpHF98r1MiudREmdWPKAUzs` / `READY`

EP012 paid voice generation is complete. The ledger now rejects further provider contact for this authorization.
