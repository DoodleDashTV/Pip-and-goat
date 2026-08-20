# TIVVLEJOY_SCENERY_PRODUCTION_LIBRARY_V1

Metadata/index layer only. No raw commercial binaries belong in Git.

Categories: `APPROVED_HERO`, `APPROVED_SUPPORTING`, `APPROVED_BACKGROUND`,
`APPROVED_INTERIOR`, `APPROVED_PROP`, `APPROVED_VEGETATION`, `APPROVED_SKY`,
`ARCHIVAL`, `BLOCKED`, `AWAITING_REVIEW`.

Search is semantic:

```
findApprovedAssets({ role: 'INTERIOR_SHELL', archetype: 'TAVERN', quality: 'HERO' })
```

`findByFilename()` is not a production resolver.

When approved records exist, World Builder refreshes capacity from the library
without changing resolver source code per asset. Longevity analysis must say
`REAL_APPROVED_LIBRARY_ANALYSIS` only after real approval evidence exists.
Unapproved packages cannot claim production capacity.
