#!/usr/bin/env bash
# Runpod entry for first paid GPU FINAL_1080P benchmark.
# Expects R2_* + RUNPOD_* env. Never echoes secret values.
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
export NVIDIA_DRIVER_CAPABILITIES="${NVIDIA_DRIVER_CAPABILITIES:-compute,utility,graphics}"
export DDP_BENCH_ROOT="${DDP_BENCH_ROOT:-/workspace/ddp-bench}"
export BENCH_PREFIX="${BENCH_PREFIX:-ddp-system-tests/first-gpu-benchmark}"
mkdir -p "$DDP_BENCH_ROOT/out" "$DDP_BENCH_ROOT/production-library" /var/log/ddp
LOG=/var/log/ddp/first-gpu-bench.log
exec > >(tee -a "$LOG") 2>&1

echo "DDP_BOOTSTRAP_START $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "DDP_POD_ID=${RUNPOD_POD_ID:-unknown}"

heartbeat() {
  local msg="$1"
  python3 - "$msg" <<'PY' 2>/dev/null || true
import os, sys
msg = sys.argv[1] if len(sys.argv) > 1 else "ping"
try:
    import boto3
    from botocore.client import Config
except Exception:
    raise SystemExit(0)
bucket = os.environ.get("R2_BUCKET", "").strip()
endpoint = os.environ.get("R2_ENDPOINT", "").strip()
ak = os.environ.get("R2_ACCESS_KEY_ID", "").strip()
sk = os.environ.get("R2_SECRET_ACCESS_KEY", "").strip()
if not (bucket and endpoint and ak and sk):
    raise SystemExit(0)
prefix = os.environ.get("BENCH_PREFIX", "ddp-system-tests/first-gpu-benchmark").rstrip("/")
s3 = boto3.client(
    "s3",
    endpoint_url=endpoint,
    aws_access_key_id=ak,
    aws_secret_access_key=sk,
    region_name="auto",
    config=Config(signature_version="s3v4"),
)
body = f"{os.environ.get('RUNPOD_POD_ID', 'unknown')} {msg}\n".encode()
s3.put_object(Bucket=bucket, Key=f"{prefix}/results/heartbeat.txt", Body=body, ContentType="text/plain")
print("DDP_HEARTBEAT_OK", msg, flush=True)
PY
}

terminate_self() {
  local reason="${1:-done}"
  echo "DDP_TERMINATE reason=$reason"
  if [[ -n "${RUNPOD_POD_ID:-}" && -n "${RUNPOD_API_KEY:-}" ]]; then
    curl -sS -X POST "${RUNPOD_API_ENDPOINT:-https://api.runpod.io/graphql}" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${RUNPOD_API_KEY}" \
      -H "User-Agent: DoodleDashProductionWorker/1.0" \
      --data "{\"query\":\"mutation (\$podId: String!) { podTerminate(input: { podId: \$podId }) }\",\"variables\":{\"podId\":\"${RUNPOD_POD_ID}\"}}" \
      >/tmp/ddp-terminate.json || true
    echo "DDP_TERMINATE_HTTP_DONE"
  fi
  exit 0
}

trap 'terminate_self trap_exit' EXIT

# Ensure python/pip exist on slim CUDA images before heartbeat/boto3.
if ! command -v python3 >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq python3 python3-pip >/dev/null
fi
python3 -m pip install -q --disable-pip-version-check boto3 || true
heartbeat "bootstrap_entered"

apt-get update -qq
apt-get install -y -qq curl ca-certificates xz-utils ffmpeg python3 python3-pip \
  libx11-6 libxi6 libxxf86vm1 libxfixes3 libxrender1 libgl1 libglib2.0-0 \
  libegl1 libglvnd0 libglx0 >/dev/null

python3 -m pip install -q --disable-pip-version-check boto3
heartbeat "deps_installed"

# Install Blender 4.2.3 if missing
if ! command -v blender >/dev/null 2>&1; then
  echo "DDP_INSTALL_BLENDER"
  heartbeat "blender_download_start"
  mkdir -p /opt/blender
  curl -fsSL "https://download.blender.org/release/Blender4.2/blender-4.2.3-linux-x64.tar.xz" -o /tmp/blender.tar.xz
  tar -xJf /tmp/blender.tar.xz -C /opt/blender --strip-components=1
  ln -sf /opt/blender/blender /usr/local/bin/blender
  rm -f /tmp/blender.tar.xz
  heartbeat "blender_installed"
fi
blender --version | head -1
heartbeat "assets_download_start"

python3 - <<'PY'
import os, sys
from pathlib import Path
import boto3
from botocore.client import Config

root = Path(os.environ["DDP_BENCH_ROOT"])
prefix = os.environ["BENCH_PREFIX"].rstrip("/") + "/"
bucket = os.environ["R2_BUCKET"].strip()
endpoint = os.environ["R2_ENDPOINT"].strip()
ak = os.environ["R2_ACCESS_KEY_ID"].strip()
sk = os.environ["R2_SECRET_ACCESS_KEY"].strip()
region = os.environ.get("R2_REGION", "auto").strip() or "auto"

s3 = boto3.client(
    "s3",
    endpoint_url=endpoint,
    aws_access_key_id=ak,
    aws_secret_access_key=sk,
    region_name=region,
    config=Config(signature_version="s3v4"),
)

needed = [
    ("production-library/characters/pip_production.blend", root / "production-library/characters/pip_production.blend"),
    ("production-library/characters/goat_production.blend", root / "production-library/characters/goat_production.blend"),
    ("production-library/environments/meadow_production.blend", root / "production-library/environments/meadow_production.blend"),
    ("production-library/props/adventure_map.blend", root / "production-library/props/adventure_map.blend"),
    ("scripts/blender/first_gpu_benchmark.py", root / "first_gpu_benchmark.py"),
]
for key_suffix, dest in needed:
    key = prefix + key_suffix
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"DDP_DOWNLOAD {key_suffix}", flush=True)
    s3.download_file(bucket, key, str(dest))
    if dest.stat().st_size < 100:
        raise SystemExit(f"Downloaded empty object: {key}")
print("DDP_DOWNLOAD_OK", flush=True)
PY

# Health: nvidia + tiny EEVEE
nvidia-smi || terminate_self "no_nvidia"
python3 - <<'PY'
import subprocess, tempfile, os
from pathlib import Path
td = Path(tempfile.mkdtemp(prefix="ddp-tiny-"))
script = td / "t.py"
out = td / "f.png"
script.write_text(f"""
import bpy
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
try:
    scene.render.engine = 'BLENDER_EEVEE_NEXT'
except Exception:
    scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = 64
scene.render.resolution_y = 64
scene.render.filepath = r'{out.as_posix()}'
bpy.ops.mesh.primitive_cube_add()
bpy.ops.render.render(write_still=True)
print('DDP_BENCH_OK')
""")
res = subprocess.run(["blender", "--background", "--factory-startup", "--python", str(script)], capture_output=True, text=True, timeout=180)
text = (res.stdout or "") + "\n" + (res.stderr or "")
print(text[-1500:])
if "DDP_BENCH_OK" not in text or res.returncode != 0:
    raise SystemExit("tiny EEVEE health failed")
print("DDP_TINY_EEVEE_OK")
PY

heartbeat "tiny_eevee_ok"
echo "DDP_FINAL_RENDER_START $(date -u +%Y-%m-%dT%H:%M:%SZ)"
heartbeat "final_render_start"
# Prefer vulkan/opengl backends when available
set +e
blender --background --factory-startup --python "$DDP_BENCH_ROOT/first_gpu_benchmark.py"
RC=$?
set -e
echo "DDP_FINAL_RENDER_EXIT=$RC"

python3 - <<'PY'
import os
from pathlib import Path
import boto3
from botocore.client import Config

root = Path(os.environ["DDP_BENCH_ROOT"])
prefix = os.environ["BENCH_PREFIX"].rstrip("/") + "/"
bucket = os.environ["R2_BUCKET"].strip()
endpoint = os.environ["R2_ENDPOINT"].strip()
ak = os.environ["R2_ACCESS_KEY_ID"].strip()
sk = os.environ["R2_SECRET_ACCESS_KEY"].strip()
region = os.environ.get("R2_REGION", "auto").strip() or "auto"
s3 = boto3.client(
    "s3",
    endpoint_url=endpoint,
    aws_access_key_id=ak,
    aws_secret_access_key=sk,
    region_name=region,
    config=Config(signature_version="s3v4"),
)

uploads = [
    (root / "out/gpu-benchmark-report.json", "results/gpu-benchmark-report.json", "application/json"),
    (root / "out/final_rep_1s/shot.mp4", "results/shot.mp4", "video/mp4"),
    (Path("/var/log/ddp/first-gpu-bench.log"), "results/bootstrap.log", "text/plain"),
]
for path, suffix, ctype in uploads:
    if not path.exists():
        print(f"DDP_SKIP_UPLOAD missing={path}", flush=True)
        continue
    key = prefix + suffix
    print(f"DDP_UPLOAD {suffix} bytes={path.stat().st_size}", flush=True)
    s3.upload_file(str(path), bucket, key, ExtraArgs={"ContentType": ctype})
print("DDP_UPLOAD_OK", flush=True)
# Marker for orchestrator
s3.put_object(Bucket=bucket, Key=prefix + "results/COMPLETE", Body=b"ok\n", ContentType="text/plain")
print("DDP_COMPLETE_MARKER_WRITTEN", flush=True)
PY

terminate_self "benchmark_complete"
