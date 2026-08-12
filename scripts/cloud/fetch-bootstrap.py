#!/usr/bin/env python3
"""Fetch and exec the full Runpod GPU bench bootstrap from R2. No secrets printed."""
import os
import subprocess
import sys

import boto3
from botocore.client import Config


def main() -> int:
    bucket = os.environ["R2_BUCKET"].strip()
    endpoint = os.environ["R2_ENDPOINT"].strip()
    ak = os.environ["R2_ACCESS_KEY_ID"].strip()
    sk = os.environ["R2_SECRET_ACCESS_KEY"].strip()
    prefix = os.environ.get("BENCH_PREFIX", "ddp-system-tests/first-gpu-benchmark").rstrip("/")
    key = f"{prefix}/scripts/cloud/runpod-bench-bootstrap.sh"
    dest = "/tmp/runpod-bench-bootstrap.sh"
    s3 = boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=ak,
        aws_secret_access_key=sk,
        region_name=(os.environ.get("R2_REGION") or "auto").strip() or "auto",
        config=Config(signature_version="s3v4"),
    )
    print("DDP_FETCH_BOOTSTRAP", key, flush=True)
    s3.download_file(bucket, key, dest)
    os.chmod(dest, 0o755)
    os.execv("/bin/bash", ["bash", dest])
    return 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as e:
        print("DDP_FETCH_FAILED", str(e), file=sys.stderr, flush=True)
        raise
