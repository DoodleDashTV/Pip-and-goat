# Blender automation scripts

Modular Python stubs for headless scene assembly. Each script supports normal
CLI execution and Blender `--python script.py -- ...` argument forwarding. Asset
loading scripts emit a JSON `MISSING_ASSET` status and exit with code `2` when a
required asset path is absent or does not exist.

- `load_character.py`
- `load_location.py`
- `load_prop.py`
- `apply_animation.py`
- `configure_camera.py`
- `configure_lights.py`
- `apply_lip_sync.py`
- `render_frames.py`
- `assemble_scene.py`
- `characters/` — reusable TivvleJoy character build department (`build_character.py`). Dry-run safe. Never overwrites SOURCE. Never false-PASSes without real Goat bytes and Blender.
