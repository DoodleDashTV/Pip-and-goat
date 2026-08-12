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
    BLENDER_VERSION=4.2.3 \
    PYTHONUNBUFFERED=1 \
    IDLE_SHUTDOWN_MINUTES=5 \
    MAX_JOB_RUNTIME_MINUTES=180 \
    CLOUD_RENDER_ENABLED=false \
    ALLOW_PAID_GPU_LAUNCH=false \
    BLENDER_ASSEMBLE_SCRIPT=/opt/ddp-worker/blender/assemble_scene.py

# Runtime deps for headless Blender 4.2 EEVEE (GPU via CUDA + CPU via Mesa
# llvmpipe fallback), ffmpeg/ffprobe encode+QC, CA certs for R2 TLS, and the
# X/GL/EGL libraries + fonts a headless Blender needs to create a GL context.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates xz-utils \
    ffmpeg \
    python3 python3-pip \
    libx11-6 libxi6 libxxf86vm1 libxfixes3 libxrender1 libxext6 libsm6 \
    libxrandr2 libxinerama1 libxcursor1 libxdamage1 libxkbcommon0 \
    libgl1 libglib2.0-0 libglu1-mesa libegl1 libgles2 \
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

# Health endpoint / check
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node ./src/health.js || exit 1

# Default: single-shot mode when RENDER_JOB_ID is provided; otherwise idles.
CMD ["node", "./src/worker.js"]
