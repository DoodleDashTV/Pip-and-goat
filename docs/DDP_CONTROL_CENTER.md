# DDP Control Center

Isolated mobile-first private dashboard that orchestrates **OpenAI build-director** planning and **Cursor Cloud Agent** dispatch/status/cancel for Doodle Dash Production side work.

## Ownership boundary

| Role | Name / branch |
|------|----------------|
| Canonical production owner | **DoodleDash Production** (`cursor/setup-dev-environment-ba2f`) |
| This service | Control Center on `agent/ddp-control-center` only |

## Honest branch-isolation guarantee

Cursor Cloud Agents API **does not** accept an exact worker branch name when `workOnCurrentBranch=false`. Cursor auto-generates `cursor/...` branches from `startingRef`.

Control Center therefore:

1. Always sends `workOnCurrentBranch=false` and `autoCreatePR=false`
2. Pre-assigns a client `agentId` (`bc-<uuid>`) for idempotent create
3. Verifies **observed** branches from Cursor run metadata are not protected
4. Treats local `agent/*` names as **policy labels**, not an API pin
5. Does **not** treat prompt text as a security boundary

Protected / lookalike names rejected in policy checks include `main`, `master`, `production`, `agent/main`, `*/main`, and configured canonical branches.

## Safety defaults

```bash
CONTROL_CENTER_RUNTIME_MODE=development   # or test | live
CONTROL_CENTER_SAFE_MODE=true
CLOUD_RENDER_ENABLED=false
ALLOW_PAID_GPU_LAUNCH=false
CONTROL_CENTER_KILL_SWITCH=false
```

- Live mode (`SAFE_MODE=false`) **refuses to start** without strong `CONTROL_CENTER_AUTH_TOKEN`, `CONTROL_CENTER_SESSION_SECRET`, `CONTROL_CENTER_REPO_URL`, `OPENAI_API_KEY`, and `CURSOR_API_KEY`.
- Missing/corrupt persisted state **denies dispatch** until an operator clears the latch (ENV kill switch cannot be cleared via API).
- No Runpod launches from Control Center code paths. A live Cursor agent still has repo access; paid/dangerous goals require plan-bound approval, and worker prompts include explicit denial policy. That is **policy**, not an absolute sandbox.

## Layout

```
packages/control-center/     Core engine
apps/control-center/         Next.js mobile dashboard (:3100)
scripts/control-center/      CLI helpers
docs/DDP_CONTROL_CENTER.md   This document
```

## Commands

```bash
pnpm install
pnpm control-center:test
pnpm --filter @doodle-dash/control-center-web lint
pnpm control-center:safe-zero
pnpm control-center:dev
```

## API

Browser sessions use **HttpOnly / SameSite cookie** auth after `POST /api/auth/login`. Bearer API token remains supported for automation. Login is rate-limited.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/auth/login` | Cookie session login |
| POST | `/api/auth/logout` | Revoke session + clear cookie |
| GET | `/api/dashboard` | Dashboard snapshot |
| POST | `/api/jobs` | Create job (`run: true` to execute) |
| POST | `/api/jobs/safe-zero` | $0 loop |
| POST | `/api/jobs/:id/run` | Execute / reconcile |
| POST | `/api/jobs/:id/cancel` | Cancel with visible failure states |
| POST | `/api/jobs/:id/refresh` | Explicit reconcile |
| POST | `/api/approvals/:id` | Plan-bound approve/reject |
| POST | `/api/kill-switch` | Toggle persisted kill (not ENV) |
| POST | `/api/dispatch-clear` | Clear recovery dispatch denial |
| POST | `/api/autopilot` | Pause/resume |
| GET | `/api/audit` | Audit log |

## Dispatch state machine

`queued → directing → ready_to_dispatch → dispatching(intent) → dispatched/running → terminal`

Crash-safe rules:

- Persist preassigned `cursorAgentId` **before** create
- Never create a replacement agent when an id already exists
- Ambiguous mid-create without durable id → `blocked` (manual reconcile)
- Background poller reconciles active jobs; it never creates agents
