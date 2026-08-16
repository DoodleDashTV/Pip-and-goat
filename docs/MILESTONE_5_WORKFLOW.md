# Studio Milestone 5 — Episode workflow and launch safety

Parallel studio track stacked on Milestone 4. Not DDP Steps 9–16. Not
theatrical character binding. Draft PR #26 stays unmerged.

## Why this branch

Milestone 4 shipped planners and fail-closed proxy gates. Those planners were
not yet a walkable episode workflow, and create-episode / generate-final /
cloud preflight did not consult them.

This branch adds that wiring without touching Pip, Goat, production-library,
locked voices, or the theatrical stack.

## What shipped

| System | Role |
| --- | --- |
| Workflow | BRIEF → OUTPUT_GATE walk; terminals `PIPELINE_TEST_COMPLETE`, `STORY_PLAN_READY`, `BLOCKED` |
| Assembly | Pure FFmpeg argv for 9:16 lavfi animatic holds and a synthetic mix |
| Launch safety | create-episode / generate-final / paid-resource refuse |
| Persist | Additive `preproduction_runs` table (TEXT `episode_id`, no FK) |
| UI / API | `/workflow`, `/api/workflow` |

Forbidden terminals: `FINAL_RENDER`, `THEATRICAL`, `PUBLISHING`. There is no
flag that opens them.

## Commands

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm validate:milestone5
pnpm validate:milestone4
```

Do not run paid GPU commands. Do not merge Draft PR #26.

## Rollback

Remove the workflow / assembly / launch-safety modules, `/workflow`, the
additive Prisma table, and the create-episode / generate-final / preflight
hooks. Milestone 4 planners remain. `production-library/` is untouched.
