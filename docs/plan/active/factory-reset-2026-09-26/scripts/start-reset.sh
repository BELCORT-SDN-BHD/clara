#!/bin/bash
# Factory reset, steps 9 and 10: destroy the probe, start the live machine on its unchanged image, boot lines, smoke.
set -u
export PATH="/c/Users/zhant/.fly/bin:$PATH"
SC="C:/Users/zhant/AppData/Local/Temp/claude/C--Users-zhant-Desktop-clara-rebuild/2d0e3faa-4367-4726-8208-67089ecdd96a/scratchpad"
PROBE="${PROBE:?}"; M=48ee715b763048
date -u +"9 probe destroy %H:%M:%SZ"; fly machine destroy "$PROBE" --app clara-runtime --force 2>&1 | tail -1
date -u +"9 machine start %H:%M:%SZ"; fly machine start "$M" --app clara-runtime 2>&1 | tail -1
for i in $(seq 1 24); do C=$(curl -s -o /dev/null -w '%{http_code}' https://clara-runtime.fly.dev/ready); date -u +"   /ready $C %H:%M:%SZ"; [ "$C" = "200" ] && break; sleep 5; done
sleep 8
fly logs --app clara-runtime --machine "$M" --no-tail 2>/dev/null | grep -E "serving git_sha|stranded bodies|durable world started|graphile|CONTROL listening|LEADER acquired|error|Error" | sed 's/^.*\] //' | cut -c1-300 | tail -10
fly machine list --app clara-runtime 2>/dev/null | grep -cE "^ [0-9a-f]{14}" | sed 's/^/machines: /'
echo "=== 10 smoke ==="; bash "$SC/release-wS/smoke.sh"
