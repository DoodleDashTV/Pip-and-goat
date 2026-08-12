# DDP Runpod Blender GPU Worker
# Build only — do not deploy paid GPUs until pre-deployment gate + explicit approval.
FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    BLENDER_VERSION=4.2.3 \
    PYTHONUNBUFFERED=1 \
    IDLE_SHUTDOWN_MINUTES=5 \
    MAX_JOB_RUNTIME_MINUTES=180 \
    CLOUD_RENDER_ENABLED=false \
    ALLOW_PAID_GPU_LAUNCH=false

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates xz-utils \
    ffmpeg \
    python3 python3-pip \
    libx11-6 libxi6 libxxf86vm1 libxfixes3 libxrender1 libgl1 libglib2.0-0 \
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
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src

# Health endpoint / check
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node ./src/health.js || exit 1

CMD ["node", "./src/worker.js"]
