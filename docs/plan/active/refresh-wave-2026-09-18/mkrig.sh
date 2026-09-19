# usage: mkrig.sh <name> <port>   — (re)create a PG17 cluster "<name>" on <port>, trust auth, 127.0.0.1
set -e
NAME="$1"; PORT="$2"
pg_dropcluster --stop 17 "$NAME" >/dev/null 2>&1 || true
pg_createcluster 17 "$NAME" -p "$PORT" -- --auth-local=trust --auth-host=trust >/dev/null 2>&1
printf "listen_addresses = '127.0.0.1'\nmax_connections = 200\n" > "/etc/postgresql/17/$NAME/conf.d/rig.conf"
pg_ctlcluster 17 "$NAME" start && sleep 2 && /usr/lib/postgresql/17/bin/pg_isready -h 127.0.0.1 -p "$PORT"
pg_lsclusters
