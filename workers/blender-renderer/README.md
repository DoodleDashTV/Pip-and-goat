# Blender render worker (later milestone)

This worker will:

1. Pull persistent render jobs from the queue
2. Download scene assets from object storage
3. Assemble and render with headless Blender
4. Encode preview/final outputs
5. Upload results and report status

Do not couple long renders to web request lifecycles.
