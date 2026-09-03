# Forest camera ground-cover recovery V1

Unpaid CPU. `paidCreateCount=0`. Lighting not touched.

## What changed

Separate cover layer over the locked-camera footprint. Vendor ground shader was not rebuilt.

Owned sources used: Soil_Loose, Corylus keyed leaves, Fallen_Needles, Rhytidiadelphus moss meshes, Granite_A, Pebbles, Tilia/Oak/Spruce twigs, Carex, Dryopteris.

## Proofs (do not overwrite)

| Proof | SHA256 | Class | Dominant defect |
|---|---|---|---|
| V1 | `6fb06c0e76dfbf3112648fb283ad37ec3ba7e2f51765ffb5833da669dd5dca29` | FAIL | Cover too narrow; salmon sides/horizon; rainbow autumn appends; gray soil |
| V2 | `fffe871b050db2a18a465e9d94fd78f2e2ee050db1e27c7d1d6db09d2219da78` | FAIL | Foreground salmon mostly gone; straight horizon salmon band; gray soil |
| V3 | `93d8bf4634da135d18abe6671e3de525d8d0bd77aa17bac6e6f2b7d04618c12a` | FAIL | Vendor plane hidden after cover; horizon salmon band remains |

All 1280×720, locked camera/lighting.

## Conclusion

Hiding `TJ_VendorGround` after V3 did **not** remove the horizon salmon band. That band is not the vendor plane shader. It is locked HDRI/atmosphere and/or preserved EcoKit background cards (y>=18). Those locks were not changed.

Foreground soil still reads gray under locked lookdev lighting. Isolated Soil_Loose is brown; this lighting flattens it. Litter at 42 mm still reads as small cards.

`forestMaterialsProductionReady=false`. Lighting stays gated.
