#!/bin/bash
# Runs INSIDE WSL as root: (re)create the ten PG17 clusters for wave 2026-09-18 and their databases.
set -e
DIR=/mnt/c/Users/zhant/Desktop/clara-rebuild/docs/plan/active/refresh-wave-2026-09-18
while read -r n port; do
  [ -z "$n" ] && continue
  bash "$DIR/mkrig.sh" "rig$n" "$port" >/dev/null
  runuser -u postgres -- createdb -p "$port" "clara_$n"
  echo "rig$n on $port: db clara_$n created"
done <<TABLE
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
pg_lsclusters
