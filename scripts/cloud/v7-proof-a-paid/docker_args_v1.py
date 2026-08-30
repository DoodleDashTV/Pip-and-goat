"""RunPod dockerArgs must be NVIDIA-entrypoint argv, not a nested sh -c blob."""
from __future__ import annotations

# The pinned scenery image inherits:
#   Entrypoint: /opt/nvidia/nvidia_entrypoint.sh
#   Cmd:        node ./src/scenery-showcase-entry-v2.js
# dockerArgs are appended to Entrypoint (Docker default) or replace Cmd.
# A single-string `sh -c '...'` is not the same argv shape as Cmd.

NVIDIA_ENTRYPOINT = "/opt/nvidia/nvidia_entrypoint.sh"
IMAGE_CMD = ("node", "./src/scenery-showcase-entry-v2.js")

# Space-split safe: first token `node`, second `-e`, remainder is the program.
# Three space-separated tokens: node, -e, <no-space program>.
# Works as extra argv to /opt/nvidia/nvidia_entrypoint.sh on the current pin.
CURRENT_PIN_DOCKER_ARGS = (
    "node -e "
    "(async()=>{console.log(JSON.stringify({event:'IMAGE_PROCESS_STARTED'}));"
    "console.log(JSON.stringify({event:'NODE_ENTRY_STARTED'}));"
    "const r2=require('/opt/ddp-worker/src/r2-client');"
    "const ctx=r2.createR2Client(process.env);"
    "console.log(JSON.stringify({event:'R2_CLIENT_STARTED'}));"
    "await r2.downloadToFile(ctx,process.env.V7_ENTRY_KEY,'/tmp/v7-proof-a-entry.js');"
    "require('child_process').spawnSync('node',['/tmp/v7-proof-a-entry.js'],{stdio:'inherit'})})()"
    ".catch(e=>{console.error(String(e&&e.message||e));process.exit(1)})"
)

PREFERRED_BAKED_DOCKER_ARGS = "node ./src/v7-proof-a-boot.js"


def docker_args_compatible(docker_args: str) -> dict:
    value = str(docker_args or "").strip()
    blockers: list[str] = []
    if not value:
        blockers.append("DOCKER_ARGS_EMPTY")
    if value.startswith("sh -c") or value.startswith("bash -lc") or value.startswith("sh -lc"):
        blockers.append("NESTED_SHELL_DOCKER_ARGS")
    tokens = value.split()
    if tokens and tokens[0] not in {"node", "blender"}:
        blockers.append("FIRST_TOKEN_NOT_IMAGE_CMD_SHAPE")
    return {
        "ok": not blockers,
        "blockers": blockers,
        "entrypoint": NVIDIA_ENTRYPOINT,
        "imageCmd": list(IMAGE_CMD),
        "dockerArgs": value,
        "compatible": not blockers,
        "finding": (
            "dockerArgs must be extra argv for /opt/nvidia/nvidia_entrypoint.sh, "
            "matching Cmd shape `node <file-or--e>`."
        ),
    }
