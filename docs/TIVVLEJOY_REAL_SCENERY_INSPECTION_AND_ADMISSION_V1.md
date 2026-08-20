# TIVVLEJOY_REAL_SCENERY_INSPECTION_AND_ADMISSION_V1

Stacked on Draft PR #84. This system moves TivvleJoy scenery from uploaded /
store-only / synthetic planning toward real inspected, classified, and
approval-ready library admission.

## Distinctions

- **upload != inspected.** A private R2 object is only a stored source.
- **inspected != approved.** Inspection receipts never approve an asset.
- **approved package != every child approved.** One ZIP can contain many
  logical candidates. Each child needs its own receipt.
- **raw source != production asset.** Production consumes approved logical
  children, never `STORE_ONLY` packages.
- **synthetic != real evidence.** Fixture hashes cannot masquerade as
  commercial inspection.
- **store-only != shot-ready.** World Builder and Shot Assembly stay closed
  until an approved registry record exists.

## Pipeline

```
catalog / audit receipt
→ source identity (sourceId + receipt + size + hash)
→ isolated materialization
→ safe archive inventory
→ static 3D inspection
→ optional isolated Blender (if already present)
→ texture / material / dependency audit
→ logical child discovery
→ semantic / style / quality / depth / canonical analysis
→ visual evidence queue
→ explicit human approval
→ approved environment asset
→ registry / World Builder / longevity refresh
```

Filename is provenance metadata only. It is never a production identity.

## Safety

Commercial bytes stay out of Git. Embedded scripts are inventoried, never
run. Botaniq, Geo-Scatter, Gaffer, and Physical Starlight are not activated.
No GPU, RunPod, or paid compute is launched. Production is not mutated.
