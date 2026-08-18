#!/usr/bin/env bash
set -euo pipefail
if [[ $# -ne 4 ]]; then echo "usage: runner SOURCE_ID IMMUTABLE_BLEND REPORT_JSON TIMEOUT_SECONDS" >&2; exit 2; fi
source_id="$1"; immutable_source="$2"; report_json="$3"; timeout_seconds="$4"
worker_dir="$(mktemp -d)"; trap 'rm -rf -- "$worker_dir"' EXIT
test -f "$immutable_source"
case "$immutable_source" in *.blend) ;; *) exit 2 ;; esac
case "$report_json" in *.json) ;; *) exit 2 ;; esac
cp -- "$immutable_source" "$worker_dir/source.blend"; chmod 0400 "$worker_dir/source.blend"
TIVVLEJOY_BLENDER_NETWORK_ISOLATED=1 timeout --signal=KILL "$timeout_seconds" \
  unshare --net -- blender --background --factory-startup --disable-autoexec --noaudio \
  --python "$(dirname "$0")/scenery_inspect.py" -- --source-id "$source_id" \
  --source-copy "$worker_dir/source.blend" --report "$report_json"
