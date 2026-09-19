#!/bin/bash
set -e
DIR=/mnt/c/Users/zhant/Desktop/clara-rebuild/docs/plan/active/refresh-wave-2026-09-18
for pair in "rigint 55720 clara_int" "rigrt 55721 clara_rt"; do set -- $pair; bash "$DIR/mkrig.sh" "$1" "$2" >/dev/null; runuser -u postgres -- createdb -p "$2" "$3"; echo "$1 on $2: db $3 created"; done
pg_lsclusters | grep -E "rigint|rigrt"
