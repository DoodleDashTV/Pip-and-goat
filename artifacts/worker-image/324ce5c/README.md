# Worker image at `324ce5c` — published (boot-diagnostics rebuild)

Rebuild after two confirmation pods wrote no `startup-status.json`.

| | |
| --- | --- |
| Digest | `sha256:32a0e34fde92c90acb3a6b7d6e880216ef162483cd4f6ada8a538b106a388adb` |
| Source commit | `324ce5ceaa798ee62d3450e95a64084d0d867912` |
| Render code | `cbd8061f83492bc967994b22dcfb21bbd6b52e341ddf9b60fa956d5738806a29` |
| Assets | `7876ac737de602578b67a8a20d85ea8a917c7ac4dac5e668f8bae37343e8f4b7` |

Changes vs `9a60cc9` image: early R2 `PROCESS_STARTED` before GPU health gate;
Docker HEALTHCHECK forces `REQUIRE_GPU_HEALTH=false`.
