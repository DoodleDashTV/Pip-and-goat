# TIVVLEJOY_SHOWRUNNER_SYSTEM_V1

TivvleJoy plans episode creative intent before a director chooses cameras or
cuts. This layer is software only. It does not write a final script, approve
voices, or authorize production.

## Contract

`EpisodeCreativeIntent` is synthetic story metadata used for tests and Preview
consoles. Required fields:

- identity: `episodeId`, `seasonId`, `episodeNumber`
- story: `episodeGoal`, `storyProblem`, `openingHook`, `mainQuestion`
- tone: `emotionalArc`, `comedyGoal`, `adventureGoal`, `discoveryGoal`,
  `characterGrowthGoal`, `PipGoal`, `GoatGoal`
- world: `primaryLocationPurpose`, `secondaryLocationPurpose`, `heroPropPurpose`
- images: `openingImageIntent`, `midpointIntent`, `climaxIntent`,
  `endingButtonIntent`
- continuity: `callForward`, `callback`
- profiles: `paceProfile`, `energyProfile`, `dialogueDensityTarget`,
  `visualNoveltyTarget`
- hash: `episodeCreativeIntentSha256`

`synthetic` is always `true` for generated fixtures.

## Determinism

The hash is canonical JSON. Display labels and input-object key order are not
part of identity. Rebuilding the same episode number and locations produces
the same hash.

Pace rotates across the seven `PACE_PROFILES` so a 60-episode season does not
share one cut rate.

## Safety

- No arbitrary final scripts.
- No DoodleDash wording in new user-facing copy.
- No claim that a fixture is a real approved episode.

See `docs/TIVVLEJOY_DIRECTING_SYSTEM_V1.md` and
`docs/TIVVLEJOY_REAL_EPISODE_PRODUCTION_PLAYBOOK_V1.md`.
