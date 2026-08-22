# TIVVLEJOY_PRODUCTION_PLAYBOOK_V1

Checkpoint: `TIVVLEJOY_PRODUCTION_PLAYBOOK_V1`

Content companion to the existing software playbook
`docs/TIVVLEJOY_REAL_EPISODE_PRODUCTION_PLAYBOOK_V1.md`.

This does not rebuild Episode Planner, Shot Assembly, voice authorization,
scenery inspection, or QC. It does not authorize spend, merge, or publish.

Operator UI: `/audience-engagement` · `/episode-planner` · `/episode-preflight`

## Story-to-release sequence

1. Episode concept
2. Audience Engagement Blueprint
3. Script / story planning
4. Shot and camera planning
5. Animation / audio / scenery planning
6. Engagement Readiness report
7. Human approval of engagement
8. Existing render readiness
9. Existing QC / release process
10. Optional manual aggregate analytics
11. Human pilot comparison
12. Authorized future batch

Software around the later gates already exists. This playbook does not pass
those gates.

## Engagement Readiness

States: `NOT_EVALUATED` · `BLOCKED` · `NEEDS_REVISION` ·
`READY_FOR_HUMAN_REVIEW` · `HUMAN_APPROVED`

A video may reach `READY_FOR_HUMAN_REVIEW` only when:

- The hook is concrete and positive
- The central goal is understandable and visually trackable
- The causal sequence is complete
- Pip and Goat remain canonical
- Humor is safe
- Motion and audio support the story
- Pacing includes comprehension time
- The payoff is satisfying and shown through action
- Replay design is non-deceptive
- 9:16 character and focal readability checks pass
- Cost and reuse information is present

Only a human may set `HUMAN_APPROVED`.

## Causal chain

Every episode needs:

1. Discovery
2. Trigger or mistake
3. Consequence
4. First attempt
5. Second attempt or escalation
6. Cooperative solution
7. Meaningful payoff

## Age bands

Ages 5–7: clear visual objective, literal cause and effect, safe physical
humor, short sentences, strong expressions. No story-critical wordplay.

Ages 8–10: additional inference, callbacks, light wordplay, layered
motivation, optional background clues. Must not confuse younger viewers.

## Pilot rule

Produce and human-review three excellent pilots before scaling a format.
Raw views cannot pick a winner. A human authorizes any next batch. Automatic
spend stays closed.

Do not begin producing the registered pilots from this document.

## Fail-closed

- Preview and synthetic fixtures until a later verified report says otherwise
- No Production mutation from this playbook
- No paid voice, provider contact, GPU, storage write, or scenery byte access
- No child personal information
- No external analytics connection
- No auto-publish

## Related

- `docs/TIVVLEJOY_REAL_EPISODE_PRODUCTION_PLAYBOOK_V1.md`
- `docs/TIVVLEJOY_FIRST_EPISODE_HUMAN_REVIEW_PLAYBOOK_V1.md`
- `docs/TIVVLEJOY_RESEARCH_INFORMED_KIDS_ENGAGEMENT_V1.md`
- `docs/TIVVLEJOY_DO_NOT_REBUILD_MATRIX_V1.md`
