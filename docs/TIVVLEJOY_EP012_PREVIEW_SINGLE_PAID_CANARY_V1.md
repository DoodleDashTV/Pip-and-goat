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
