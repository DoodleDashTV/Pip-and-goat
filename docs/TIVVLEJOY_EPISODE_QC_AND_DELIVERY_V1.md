# TIVVLEJOY_EPISODE_QC_AND_DELIVERY_V1

Metadata / synthetic-receipt QC and delivery manifests. No media is rendered
or encoded.

## QC profiles

Primary production profile `SHORT_60`: 1080×1920, 9:16, 30 fps, ~60 seconds.

Also configured: `SHORT_15`, `SHORT_30`. Format rules live in profile
configuration, not ad-hoc literals inside each check.

## QC categories

Video: VIDEO_FORMAT, RESOLUTION, ASPECT_RATIO, FRAME_RATE, DURATION,
FRAME_COMPLETENESS.

Audio: AUDIO_PRESENT, AUDIO_DURATION, DIALOGUE_TIMING, AUDIO_PEAK_POLICY,
LOUDNESS_POLICY.

Captions: CAPTION_TIMING, CAPTION_SAFE_AREA, TEXT_OVERFLOW.

Continuity: SHOT_CONTINUITY, CHARACTER_CONTINUITY, PROP_CONTINUITY,
LOCATION_CONTINUITY.

Approvals / provenance: VISUAL_APPROVAL_PRESENT, VISUAL_APPROVAL_FRESH,
ASSET_PROVENANCE, ASSET_HASH, CHARACTER_RIG_VERSION,
RENDER_MANIFEST_MATCH, DELIVERY_MANIFEST_MATCH.

States: PASS, WARNING, FAIL, NOT_EVALUATED.

Hard blockers and warnings are separate lists. `episodeQcSha256` is
deterministic. No final delivery if a required hard blocker fails.

## Delivery package

Manifest fields cover episode identity, production packet hash, render /
audio / caption / QC receipt refs and hashes, video profile, title,
description placeholder, season/episode numbers, thumbnail requirement,
delivery file slots, and `deliveryPackageSha256`.

Future platform slots exist for YouTube Shorts, TikTok, and Instagram Reels.
There are no platform APIs, uploads, credentials, or social posts.

Release readiness:

- NOT_READY
- QC_BLOCKED
- WAITING_FOR_APPROVAL
- READY_FOR_MANUAL_RELEASE

Never `AUTO_PUBLISHED`.
