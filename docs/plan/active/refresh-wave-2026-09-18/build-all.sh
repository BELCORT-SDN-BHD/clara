#!/bin/bash
# Launch the ten rig builds in parallel and summarise.
DIR=/c/Users/zhant/Desktop/clara-rebuild/docs/plan/active/refresh-wave-2026-09-18
OUT=$1
while read -r n port; do [ -z "$n" ] && continue; bash "$DIR/build-rig.sh" "$n" "$port" "$OUT" & done <<TABLE
635 55701
636 55702
642 55703
651 55704
655 55705
656 55706
657 55707
658 55708
659 55709
660 55710
TABLE
wait
echo "===== SUMMARY $(date -u +%FT%TZ) ====="
for n in 635 636 642 651 655 656 657 658 659 660; do echo "--- $n ---"; grep -E "install exit|migrate exit|seed exit|migrations |SMOKE|HEAD" "$OUT/$n.log"; done
