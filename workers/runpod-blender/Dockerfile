# DDP Runpod Blender GPU Worker
#
# Build from the REPOSITORY ROOT so the Blender scene scripts can be baked in:
#   docker build -f workers/runpod-blender/Dockerfile -t <registry>/ddp-runpod-blender:<tag> .
#
# Secrets are NEVER baked into the image — R2 + Runpod credentials and the job
# id are injected at runtime as environment variables. Paid GPU launch stays
# gated (ALLOW_PAID_GPU_LAUNCH=false) until explicit approval.
FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    BLENDER_VERSION=4.2.2 \
    PYTHONUNBUFFERED=1 \
    IDLE_SHUTDOWN_MINUTES=5 \
    MAX_JOB_RUNTIME_MINUTES=180 \
    CLOUD_RENDER_ENABLED=false \
    ALLOW_PAID_GPU_LAUNCH=false \
    BLENDER_ASSEMBLE_SCRIPT=/opt/ddp-worker/blender/assemble_scene.py \
    STARTUP_WATCHDOG_MS=180000

# Headless GL/EGL selection for Blender 4.2 EEVEE-Next, which needs a real
# off-screen GL context even in --background. On a GPU pod the NVIDIA container
# runtime injects libEGL_nvidia + /usr/share/glvnd/egl_vendor.d/10_nvidia.json;
# libglvnd's dispatch (libglvnd0 + libegl1) then routes EGL to the NVIDIA
# vendor. The worker (src/headless-gl.js) sets __GLX_VENDOR_LIBRARY_NAME=nvidia
# and EGL_PLATFORM=surfaceless on GPU, and LIBGL_ALWAYS_SOFTWARE=1 +
# GALLIUM_DRIVER=llvmpipe (Mesa) as a CPU software fallback. These GL vendor
# hints are safe defaults; the worker overrides per detected hardware.
ENV __GLX_VENDOR_LIBRARY_NAME=nvidia \
    __EGL_VENDOR_LIBRARY_DIRS=/usr/share/glvnd/egl_vendor.d \
    NVIDIA_DRIVER_CAPABILITIES=compute,utility,graphics

# Runtime deps for headless Blender 4.2 EEVEE (GPU via CUDA/NVIDIA-EGL + CPU via
# Mesa llvmpipe fallback), ffmpeg/ffprobe encode+QC, CA certs for R2 TLS, and the
# X/GL/EGL libraries + fonts a headless Blender needs to create a GL context.
# libglvnd0 provides the GL/EGL vendor-neutral dispatch used to reach the
# NVIDIA EGL vendor library on a GPU pod.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates xz-utils \
    ffmpeg \
    python3 python3-pip \
    libx11-6 libxi6 libxxf86vm1 libxfixes3 libxrender1 libxext6 libsm6 \
    libxrandr2 libxinerama1 libxcursor1 libxdamage1 libxkbcommon0 \
    libglvnd0 libgl1 libglx0 libglib2.0-0 libglu1-mesa libegl1 libgles2 \
    libgl1-mesa-dri libgomp1 \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

# Blender (CPU/GPU EEVEE capable build)
RUN mkdir -p /opt/blender && \
    curl -fsSL "https://download.blender.org/release/Blender4.2/blender-${BLENDER_VERSION}-linux-x64.tar.xz" \
      -o /tmp/blender.tar.xz && \
    tar -xJf /tmp/blender.tar.xz -C /opt/blender --strip-components=1 && \
    rm /tmp/blender.tar.xz && \
    ln -sf /opt/blender/blender /usr/local/bin/blender

# Node 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /opt/ddp-worker

# Worker runtime dependencies (production only — includes @aws-sdk/client-s3).
# npm ci against the standalone lockfile guarantees the full, reproducible
# dependency tree is baked in (no pnpm workspace symlinks).
COPY workers/runpod-blender/package.json ./
COPY workers/runpod-blender/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Worker source.
COPY workers/runpod-blender/src ./src

# Blender scene scripts (assemble_scene.py + helpers) baked in for offline render.
COPY scripts/blender ./blender

# ---- Build provenance -------------------------------------------------------
# The render code above is baked in, so a pullable digest-pinned image can still
# run stale scene assembly. Stamp the image with the commit it was built from and
# a content fingerprint of the baked render code, then FAIL THE BUILD if the
# declared fingerprint disagrees with what was actually copied in. That makes the
# published label trustworthy from the registry alone, which is what preflight
# checks before any paid launch.
ARG DDP_SOURCE_COMMIT=unknown
ARG DDP_WORKER_BUILD_TIME=unknown
ARG DDP_RENDER_CODE_SHA256=unknown

ENV DDP_SOURCE_COMMIT=${DDP_SOURCE_COMMIT} \
    DDP_WORKER_BUILD_TIME=${DDP_WORKER_BUILD_TIME} \
    DDP_RENDER_CODE_SHA256=${DDP_RENDER_CODE_SHA256} \
    DDP_PROVENANCE_FILE=/opt/ddp-worker/provenance.json

RUN node ./src/provenance.js --write "$DDP_PROVENANCE_FILE" --expect "$DDP_RENDER_CODE_SHA256" && \
    node ./src/character-capability.js --write /opt/ddp-worker/character-capability.json --root /opt/ddp-worker

LABEL org.opencontainers.image.title="ddp-runpod-blender" \
      org.opencontainers.image.source="https://github.com/DoodleDashTV/Pip-and-goat" \
      org.opencontainers.image.revision="${DDP_SOURCE_COMMIT}" \
      org.opencontainers.image.created="${DDP_WORKER_BUILD_TIME}" \
      ddp.source.commit="${DDP_SOURCE_COMMIT}" \
      ddp.worker.build.time="${DDP_WORKER_BUILD_TIME}" \
      ddp.render.code.sha256="${DDP_RENDER_CODE_SHA256}" \
      ddp.character.master="true" \
      ddp.character.job.kind="CHARACTER_MASTER_BUILD" \
      ddp.character.stage.count="26" \
      ddp.character.blender="${BLENDER_VERSION}" \
      ddp.character.capability.schema="TIVVLEJOY_CHARACTER_WORKER_CAPABILITY_V2" \
      ddp.character.live.capable="true" \
      ddp.character.mandatory.dry.run="false" \
      ddp.character.entrypoint="TIVVLEJOY_CHARACTER_MASTER_DISPATCH_V4" \
      ddp.character.authorized.download.capable="true" \
      ddp.character.requires.paid.authorization="true" \
      ddp.character.live.authorization="TIVVLEJOY_GOAT_REAL_PAID_EXECUTION_AUTHORIZATION_V4" \
      ddp.character.source.writes.forbidden="true" \
      ddp.character.output.persistence="true" \
      ddp.character.synthetic.live.verified="true"

# Health endpoint / check.
# Force REQUIRE_GPU_HEALTH=false for the Docker HEALTHCHECK: the pod sets
# REQUIRE_GPU_HEALTH=true for the real worker, and without this override the
# HEALTHCHECK would inherit that and run a multi-minute EEVEE benchmark under a
# 10s Docker probe timeout — marking the container unhealthy and restarting it
# before single-shot can write startup-status.json.
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
  CMD env REQUIRE_GPU_HEALTH=false node ./src/health.js || exit 1

# Default: single-shot mode when RENDER_JOB_ID is provided; otherwise idles.
CMD ["node", "./src/worker.js"]
