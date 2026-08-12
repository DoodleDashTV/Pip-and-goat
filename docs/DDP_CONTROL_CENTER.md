# DDP Control Center

Isolated mobile-first private dashboard that orchestrates **OpenAI build-director** planning and **Cursor Cloud Agent** dispatch for Doodle Dash Production side work.

## Ownership boundary

| Role | Name / branch |
|------|----------------|
| Canonical production owner | **DoodleDash Production** (`cursor/setup-dev-environment-ba2f`) |
| This service | Control Center on `agent/ddp-control-center` only |

Control Center **must not** merge into, reset, rebase, or edit the canonical owner branch. Worker jobs are forced onto `agent/*` branches.

## Safety defaults

```bash
CLOUD_RENDER_ENABLED=false
ALLOW_PAID_GPU_LAUNCH=false
CONTROL_CENTER_SAFE_MODE=true   # auto-true when OpenAI or Cursor keys missing
```

- No Runpod launches
- No R2 production writes
- No production secret changes
- Paid / destructive / live-dispatch actions require approval gates

## Layout

```
packages/control-center/     Core engine (store, auth, director, cursor, orchestrator)
apps/control-center/         Next.js mobile dashboard (port 3100)
scripts/control-center/      CLI helpers (safe-zero loop)
docs/DDP_CONTROL_CENTER.md   This document
```

## Environment

Copy from root `.env.example` and set:

| Variable | Purpose |
|----------|---------|
| `CONTROL_CENTER_AUTH_TOKEN` | Login password / API bearer |
| `CONTROL_CENTER_SESSION_SECRET` | Signed session tokens |
| `CONTROL_CENTER_DATA_DIR` | Persistent JSON state directory |
| `CONTROL_CENTER_SAFE_MODE` | Force mock OpenAI/Cursor ($0) |
| `CONTROL_CENTER_KILL_SWITCH` | Server-side hard stop |
| `OPENAI_API_KEY` | Live director (optional) |
| `OPENAI_MODEL` | Default `gpt-4.1-mini` |
| `CURSOR_API_KEY` | Live Cursor Cloud Agents API (optional) |
| `CURSOR_API_BASE_URL` | Default `https://api.cursor.com` |
| `CONTROL_CENTER_REPO_URL` | Target GitHub repo |
| `CONTROL_CENTER_PROTECTED_BRANCHES` | Comma-separated deny-write list |

Secrets stay in environment variables only — never committed.

## Commands

```bash
# Install (from repo root / worktree)
pnpm install

# Unit + integration tests (package)
pnpm --filter @doodle-dash/control-center test

# $0 end-to-end loop (mock when keys absent)
pnpm control-center:safe-zero

# Mobile dashboard
pnpm control-center:dev
# → http://localhost:3100
```

## API (Bearer auth)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/auth/login` | Exchange auth token for session |
| GET | `/api/dashboard` | Full dashboard snapshot |
| POST | `/api/jobs` | Create job (`run: true` to execute) |
| POST | `/api/jobs/safe-zero` | Run the $0 loop |
| POST | `/api/jobs/:id/run` | Execute queued job |
| POST | `/api/jobs/:id/cancel` | Cancel + Cursor cancel |
| POST | `/api/jobs/:id/refresh` | Poll Cursor status / store result |
| POST | `/api/approvals/:id` | `{ decision: approved\|rejected }` |
| POST | `/api/kill-switch` | `{ enabled: boolean }` |
| POST | `/api/autopilot` | `{ state: running\|paused }` |
| GET | `/api/audit` | Audit log |

## Persistence & recovery

State is atomically written to `CONTROL_CENTER_DATA_DIR/state.json` (projects, jobs, approvals, audit, kill switch, autopilot). On boot, interrupted `directing`/`dispatching` jobs are re-queued; corrupt files are quarantined and a recovery audit entry is recorded.

## Live $0 proof

With both `OPENAI_API_KEY` and `CURSOR_API_KEY` set and `CONTROL_CENTER_SAFE_MODE=false`, `pnpm control-center:safe-zero` will:

1. Ask OpenAI for a worker plan
2. Dispatch a Cursor Cloud Agent on an `agent/*` branch from the canonical baseline ref
3. Store the agent id/url/result into Control Center state
4. Surface it on the dashboard

Without those keys the same loop runs in mock mode and still proves local orchestration end-to-end.
