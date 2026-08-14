# Proposed materials v0 — not approved

**Label:** proposed upgrade
**Approved:** no
**Replaces canonical assets:** no

`shader_recipes_v0.json` is the source of truth. `materials_v0.blend` is a
Blender 4.2.3 datablock dump of the same recipes under `THEATRICAL_*` names so
look-dev can be inspected without opening the production library.

Rules enforced by `scripts/assets/theatrical_shaders.py`:

- never change Base Color
- never change Metallic
- never write into `production-library/`

This pass only fills sockets the v1.1 prototype left thin (eye coat, accessory
sheen, keratin coat, paper/ground roughness). It does not add maps, grooms, or
mesh edits. It cannot make Pip or Goat theatrical on its own.
