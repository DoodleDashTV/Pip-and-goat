# TIVVLEJOY_EPISODE_DIRECTOR_PACKAGE_V1

The Director Package binds one episode:

- creative intent and beats
- shot sequence and Final Shot Specs
- editorial timeline
- audio and caption plans
- approval matrix, review notes, revision state

Hash: `episodeDirectorPackageSha256`.

It binds into the existing Episode Production Packet without claiming
`REAL_PRODUCTION_READY` or `PRODUCTION_READY`.

Persistence stores hashes and references only. No media binaries. Cold
restart must restore the same hashes. Optimistic concurrency:

- stale edit → `WRITE_CONFLICT` / `WRITE_STALE`
- identical duplicate → `WRITE_IDEMPOTENT`

Journal events are sanitized: intent/camera/staging/edit/SFX/music/caption
created, review added, revision requested/resolved, shot approval recorded,
package compiled. No secrets.
