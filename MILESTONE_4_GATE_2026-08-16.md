# Milestone 4 gate — 2026-08-16

Character-independent pre-production on
`cursor/studio-character-independent-73f1`, branched from Milestone 3
`2fdac1d5783a1aaca55953214cc140eb9525085a`.

## Required local gates

Filled after the local run. Paid GPU was not launched.

| Command | Result |
| --- | --- |
| `pnpm test` | pending |
| `pnpm typecheck` | pending |
| `pnpm lint` | pending |
| `pnpm validate:milestone4` | pending |
| `pnpm validate:steps1-8` | pending (must stay green) |

## Protections verified in tests

- Theatrical / Steps 9–16 gate remains closed
- Approved fingerprint `7876ac737de60257…` unchanged
- Proxy occupants cannot enter FINAL output
- production-library is not written
- Locked voices are not cloned or replaced
- Draft PR #24 is not this branch

## Not claimed

- Final Pip or Goat facial controls, weights, animation, or lip-sync
- Theatrical character binding
- Hero renders
- Merge to any production branch
