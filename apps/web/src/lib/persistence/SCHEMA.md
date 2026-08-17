# TivvleJoy persistence foundation

Migration-ready PostgreSQL tables for a future production database. This
increment does **not** connect `DATABASE_URL`, object storage, or a paid
provider. Public Preview keeps using `localStorage` key
`tivvlejoy.preview-workspace.v1`.

## Tables

| Table | Purpose |
| --- | --- |
| `tivvlejoy_workspaces` | User/workspace settings (format, fps, paid/theatrical flags) |
| `tivvlejoy_productions` | Production records owned by a workspace |
| `tivvlejoy_episodes` | Episode records (non-canonical classification) |
| `tivvlejoy_assets` | Asset metadata only; `object_key` reserved for later durable storage |
| `tivvlejoy_voice_profiles` | Voice notes plus consent metadata; no provider voice ID |
| `tivvlejoy_workflow_statuses` | Draft workflow stage per episode |
| `tivvlejoy_readiness_results` | Readiness snapshots; `production_ready` stays false while gates are closed |
| `tivvlejoy_render_requests` | Draft render requests; never contacts a GPU provider |
| `tivvlejoy_audit_events` | Action audit trail without secret values |

## Relationships

- workspace 1—* productions
- production 1—* episodes, assets, voice_profiles, readiness_results, render_requests
- episode 1—1 workflow_status
- workspace 1—* audit_events

No foreign keys point at canonical `production-library` files, Pip, or Goat.

## Adapters

- `preview-localStorage` — current browser Preview. Non-durable. Active whenever
  a Preview database is not explicitly connected.
- `preview-database` — application-side adapter for a future Preview database.
  Requires explicit `TIVVLEJOY_PERSISTENCE_MODE=preview-database` plus
  `TIVVLEJOY_PREVIEW_DATABASE_CONNECT=1`. This increment never authorizes a
  live connection. Missing configuration shows
  `Preview database: Not connected` and keeps the browser Preview workspace.
  Failed preview-database writes are not rewritten to localStorage.
- `production-database` — boundary only. Writes throw
  `PRODUCTION_PERSISTENCE_UNAVAILABLE` until a later authorized connect.

## Validation

Record IDs, schema version, workspace ownership, import size, malformed
backups, idempotent writes, redacted database errors, and secret-stripped
audit details are enforced in `validation.ts`. Tests use an in-process
memory store only. No remote database is opened.

## Voice generation tables

- `tivvlejoy_voice_lines` — draft dialogue metadata, approval, fixture object keys
- `tivvlejoy_voice_usage_ledger` — monthly paid/fixture character counts

These tables are migration-ready only. Public Preview keeps fixture lines in
the application store. No API keys, authorization headers, or signed URLs
are stored.
