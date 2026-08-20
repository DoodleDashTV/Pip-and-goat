# TIVVLEJOY_FIRST_REAL_SOURCE_READ_PLAN_V1

This plan selects the smallest useful commercial objects from the current private listing. It does **not** hard-code 136. It does **not** download bytes.

## Selection rule

Prefer:

- the smallest direct GLB
- the smallest relevant mountain object
- Tavern FBX if present, otherwise the smallest Tavern original
- Tavern textures if they exist as standalone objects
- the smallest useful Village source
- the smallest useful Forest source
- one sky/HDRI if it is relevant to EP012

Avoid:

- Botaniq
- historical addon versions
- wrappers when originals exist
- huge packages
- duplicate or unrelated content

## Cost

R2 GET is not proven zero-cost from in-repo configuration. The compiler returns `REAL_READ_AUTHORIZATION_REQUIRED` and downloads nothing.

Object identities in the compiled plan are hashes. Secret object URLs are not exposed.

## Stop condition

Inspect in role-per-byte order. If the first inspected sources already satisfy every required EP012 scenery role, stop. Do not read the rest of the listing for completeness.
