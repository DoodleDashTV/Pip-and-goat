# Next Pip upload gate

When another Pip model is uploaded:

1. Preserve the uploaded file unchanged.
2. Record its exact filename and SHA-256 hash.
3. Open it in Blender 4.2.3 LTS.
4. Compare it against the ten binding five-view reference images and the approved long-wing appearance.
5. Determine whether its accessories are separated or fused.
6. Confirm that its front has exactly one diagonal cross-body strap.
7. Generate neutral front, rear, sides, three-quarter views, shoulder close-ups, satchel attachments, and a turntable.
8. Report strengths, defects, repairability, and production suitability.
9. Do not replace current Pip automatically.
10. Stop for Justin’s visual approval before retopology, rigging, canon replacement, theatrical binding, or merging.

Command: `scripts/tivvlejoy/ingest-next-pip.sh /path/to/file`
