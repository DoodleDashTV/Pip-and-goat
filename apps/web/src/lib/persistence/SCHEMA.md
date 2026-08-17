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

- `preview-localStorage` — current browser Preview. Non-durable.
- `production-database` — boundary only. Writes throw
  `PRODUCTION_PERSISTENCE_UNAVAILABLE` until a later authorized connect.
