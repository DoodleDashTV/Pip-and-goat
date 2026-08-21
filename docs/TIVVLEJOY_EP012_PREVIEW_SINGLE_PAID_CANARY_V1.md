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
