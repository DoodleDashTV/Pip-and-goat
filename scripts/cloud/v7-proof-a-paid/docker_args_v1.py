"""RunPod dockerArgs must be NVIDIA-entrypoint argv, not a nested sh -c blob."""
from __future__ import annotations

# The pinned scenery image inherits:
#   Entrypoint: /opt/nvidia/nvidia_entrypoint.sh
#   Cmd:        node ./src/scenery-showcase-entry-v2.js
# GraphQL dockerArgs is a single string. RunPod applies it as bash -c and/or
# space-split extra argv. A `node -e (async()=>{...})()` string is invalid in
# both forms: bash dies on `(`, and str.split() truncates the program.

NVIDIA_ENTRYPOINT = "/opt/nvidia/nvidia_entrypoint.sh"
IMAGE_CMD = ("node", "./src/scenery-showcase-entry-v2.js")

# Exact string used on pod 0msnqqdigglatj. Kept only to prove it is incompatible.
BROKEN_NODE_E_DOCKER_ARGS = (
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

# File-shaped extra argv. Survives bash -c and space-split. Requires the boot
# file to be baked into the worker image.
PREFERRED_BAKED_DOCKER_ARGS = "node ./src/v7-proof-a-boot.js"
CURRENT_PIN_DOCKER_ARGS = PREFERRED_BAKED_DOCKER_ARGS


def docker_args_compatible(docker_args: str) -> dict:
    value = str(docker_args or "").strip()
    blockers: list[str] = []
    if not value:
        blockers.append("DOCKER_ARGS_EMPTY")
    if value.startswith("sh -c") or value.startswith("bash -lc") or value.startswith("sh -lc"):
        blockers.append("NESTED_SHELL_DOCKER_ARGS")
    if " -e " in f" {value} " or value.startswith("node -e"):
        blockers.append("NODE_E_DOCKER_ARGS")
    if any(ch in value for ch in ("(", ")", "{", "}", "`", "&", "|", ";")):
        blockers.append("SHELL_METACHAR_DOCKER_ARGS")
    tokens = value.split()
    if len(tokens) != 2:
        blockers.append("DOCKER_ARGS_NOT_TWO_TOKENS")
    if tokens and tokens[0] not in {"node", "blender"}:
        blockers.append("FIRST_TOKEN_NOT_IMAGE_CMD_SHAPE")
    if len(tokens) >= 2 and not (tokens[1].startswith("./") or tokens[1].startswith("/")):
        blockers.append("SECOND_TOKEN_NOT_FILE_PATH")
    return {
        "ok": not blockers,
        "blockers": blockers,
        "entrypoint": NVIDIA_ENTRYPOINT,
        "imageCmd": list(IMAGE_CMD),
        "dockerArgs": value,
        "compatible": not blockers,
        "finding": (
            "dockerArgs must be two space-separated tokens `node ./src/<file.js>` "
            "so GraphQL string application (bash -c or space-split) cannot mangle them."
        ),
    }
