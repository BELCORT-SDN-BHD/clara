#!/bin/bash
# Runs <command...> with DATABASE_URL rewritten from the pooler DSN to the direct database host
# (user postgres, db.<ref>.supabase.co:5432, TLS verified against the system CAs). Child of via-probe.sh.
set -u
export DATABASE_URL="$(node -e "const u=new URL(process.env.DATABASE_URL); const ref=decodeURIComponent(u.username).split('.')[1]; u.username='postgres'; u.hostname='db.'+ref+'.supabase.co'; u.port='5432'; u.searchParams.set('sslmode','verify-full'); u.searchParams.delete('sslrootcert'); u.searchParams.delete('uselibpqcompat'); console.log(u.toString())")"
export DIRECT_HOST="$(node -e "console.log(new URL(process.env.DATABASE_URL).hostname)")"
export PGHOST="$DIRECT_HOST" PGUSER=postgres PGSSLMODE=verify-full; unset PGSSLROOTCERT
exec "$@"
