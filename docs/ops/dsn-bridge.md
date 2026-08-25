# The ceremony DSN bridge

**F-T4 item F.** Every ceremony that touches the live database needs `sslmode=verify-full`
against the Supabase session pooler, with the pooler's CA pinned — otherwise a connection that
merely says "encrypted" is silently unauthenticated TLS (`sslmode=require`/`no-verify`), which is
what actually happened twice (`fix-queue-survey.md` F22: `f-a1-pr1-ceremony-asrun.md:15-20,72-78`,
`f-a1-pr3-ceremony-asrun.md:13-19`). Both times the cause was the same: the tooling that pins the
CA and pipes the DSN was **session-local** — written for one ceremony, never committed, gone by
the next. This doc and the scripts it describes are the fix: **in the repo, for good.**

## What's here

| file | job |
|---|---|
| `ops/tls/pooler-ca.crt` | the pooler's CA — a **public trust anchor**, not a credential (see provenance below) |
| `scripts/ops/dsn-pipe.mjs` | reads a DSN on **stdin only**, forces `sslmode=verify-full` and pins the CA, spawns the given command with the DSN in the **child's environment only** |
| `scripts/ops/dsn-pipe.selftest.mjs` | the hermetic core battery — wired into `pnpm lint`, runs on every PR |
| `scripts/ops/dsn-pipe.pgpath.selftest.mjs` | the real node-postgres-path battery (the DSN rewrite exercised through the actual client library, throwaway fixture) — also wired into `pnpm lint` |
| `scripts/ops/dsn-pipe.ca.selftest.mjs` | `validateCa()`'s own structural-validation battery — also wired into `pnpm lint` |
| `scripts/ops/dsn-pipe.selftest-helpers.mjs` | shared test scaffolding for the two battery files |

## Using it

```sh
# Anywhere the DSN can be produced on stdout without ever touching argv or a file:
fly ssh console -a clara-backup -C "printenv DATABASE_URL" | node scripts/ops/dsn-pipe.mjs -- pnpm db:migrate
```

`scripts/ops/dsn-pipe.mjs` refuses to run if `ops/tls/pooler-ca.crt` fails a structural
preflight check (see "CA validation" below — existence alone is not enough), refuses a DSN that
doesn't parse as a complete `postgres://` / `postgresql://` URI (host and database both
required), and never echoes what it read — every refusal message is static. The child's exit
code passes through untouched.

It sets, in the **child's env only**:
- `DATABASE_URL` — the DSN with `sslmode` forced to `verify-full` and `sslrootcert` forced to
  the committed CA's path, **replacing any value the caller's DSN carried for either** (the pin
  is exclusive, not additive — see "Why the DSN itself carries `sslrootcert`" below);
- `PGSSLROOTCERT` / `NODE_EXTRA_CA_CERTS` — both pointed at the committed CA;
- `PGHOST` / `PGPORT` / `PGUSER` / `PGPASSWORD` / `PGDATABASE` — derived from the **same
  rewritten DSN**, so a bare libpq CLI tool works with **no connection argument at all**:
  `psql -v ON_ERROR_STOP=1 -f file.sql` (never `psql "$DATABASE_URL" -f file.sql`, which would
  put the DSN into `psql`'s own argv — see "What this bridge does not control" below).

Any pre-existing `PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD`/`PGDATABASE`/`PGSERVICE`/
`PGSERVICEFILE`/`PGHOSTADDR`/`NODE_OPTIONS` in the calling shell's environment is scrubbed
before the child ever starts (mirrors `packages/db/lib/pg.mjs:28-37`'s `PG_IDENTITY_VARS` — the
identical hazard: any of these surviving could silently redirect a bare libpq client to a
different server). Two settings are refused **loudly** instead — an operator should know their
shell was hostile, not have it silently worked around: `NODE_TLS_REJECT_UNAUTHORIZED=0`
(disables TLS validation process-wide for any Node child) and `NODE_DEBUG` containing
`child_process` (makes Node print the full spawn environment, DSN included, to stderr).

The DSN is never written to a file, never appears in this script's own argv or its child's
(both proved live in the selftest, including the OS temp dir, not just the working directory),
and is never logged.

### What this bridge does not control

The bridge itself never puts the DSN in argv, a log, or a file. **An arbitrary child can still
leak what it explicitly re-emits** — nothing stops a ceremony script from doing
`psql "$DATABASE_URL" -f file.sql` (shell-expanding the DSN into `psql`'s own argv, visible to
`ps` on that box) or printing `$DATABASE_URL` to a transcript. This guarantee is scoped to the
bridge's own process and its documented, audited entrypoints (the recipes in this file and the
five ceremony runbooks below) — not to anything a hand-written command chooses to do with the
env it's handed. The PG* identity vars above exist specifically so the documented recipes never
need to touch `$DATABASE_URL` as an argv literal in the first place.

## Why the DSN itself carries `sslrootcert`, not just the env vars

`NODE_EXTRA_CA_CERTS` **augments** Node's global TLS trust store (the committed CA plus Node's
~150 built-in Mozilla roots) — it does not replace it. A Node client that never reads
`sslrootcert` from the DSN itself would therefore still accept a certificate issued by any
publicly-trusted CA, not only the pinned one. `sslrootcert=<path>` in the DSN is what
`pg-connection-string` (node-postgres's DSN parser) turns into an explicit `ssl.ca`, which
**replaces** the default trust store for that one connection — that is what makes the pin
exclusive rather than merely additional. Proved end-to-end through the real `pg` client in
`scripts/ops/dsn-pipe.pgpath.selftest.mjs`, both polarities.

## CA validation — structural, not just existence

`dsn-pipe.mjs` parses the committed CA at every run (`validateCa()`) and fails closed unless
**all** of: the file is readable and non-empty, it is exactly one well-formed PEM `CERTIFICATE`
block, its `basicConstraints` extension says `CA:TRUE`, it is currently inside its own validity
window, and its **certificate fingerprint (sha256 over the DER-encoded certificate, `X509Certificate.fingerprint256`
— not a raw file hash of the PEM/base64 text, which would differ on re-wrapping or line-ending
changes to the same underlying certificate)** matches a constant pinned in `dsn-pipe.mjs` itself
(`80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`).
An empty or truncated file, a non-CA leaf certificate, or a swapped/corrupted certificate all
refuse — existence alone was never proof of trustworthiness.

## The CA's provenance, and why committing it is lawful

`ops/tls/pooler-ca.crt` is **"Supabase Root 2021 CA"** — a self-signed X.509 root certificate,
valid until **2031-04-26**. It was captured two ways, independently, and both agree byte-for-byte:

1. **The pooler's own handshake.** Performing the **pre-authentication** half of the Postgres
   TLS handshake (the `SSLRequest` exchange) against the live pooler
   (`aws-0-ap-southeast-1.pooler.supabase.com:5432`, the same host `docs/ops/DR.md:160` already
   names) and reading the certificate chain the server presents — the same information
   `openssl s_client -starttls postgres -showcerts` shows anyone who connects. **No credential,
   no DSN and no authentication was ever involved**: a TLS server's certificate chain is public
   by the nature of TLS (it is sent to any client before login), so capturing it commits no
   secret.
2. **An independent channel.** Supabase publishes the identical file at
   `https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt`, over
   standard web PKI (validated by curl's own default trust store — Amazon's certificate, a
   completely different trust chain than the pooler's). Fetched during this PR's build and
   byte-diffed against reading (1): **identical, file sha256
   `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`**. This closes the bootstrap
   circularity reading (1) alone would carry — "trust this CA because the server presenting it
   says so" — with a source that has nothing to do with the pooler's own handshake.

Hard constraint 4 governs DSNs and secrets; a CA certificate is a trust anchor, the opposite of a
secret — trusting it is the whole point of publishing it. `scripts/check-leaks.mjs`'s
`PRIVATE_KEY` rule and the CI `gitleaks` pass both scan for `PRIVATE KEY` PEM blocks specifically;
a `CERTIFICATE` block matches neither (verified locally against this exact file before commit —
**P-12 resolved: no scanner allowance was needed**).

**Chain presented by the pooler** (depth 0 → 2): leaf `*.pooler.supabase.com`, issued by
`Supabase Intermediate 2021 CA`, issued by the self-signed root committed here. Only the root is
pinned — the server supplies the leaf and intermediate on every handshake, which is how
`verify-full` is meant to work.

**Rotation.** The selftest's own structural cells fail once fewer than 30 days remain before the
committed certificate's `notAfter` — a monotonic trigger, never a pinned date. To re-pin: repeat
the capture above against the live pooler (and, ideally, the independent S3 channel too), confirm
the new certificate is self-signed (`openssl verify -CAfile new.crt new.crt` → `OK`) and carries
**no** `PRIVATE KEY` block, replace `ops/tls/pooler-ca.crt`, **and update
`EXPECTED_CA_FINGERPRINT_SHA256` in `dsn-pipe.mjs` in the SAME PR** (the two must move together —
a `.crt` swap alone fails closed against the old fingerprint by design).

## The positive live leg — a REVIEW ITEM, run before any ceremony, not wired into CI

The three selftest files are deliberately **hermetic** — they prove the CA-pinning mechanism (both
the raw-TLS layer and the real `pg` client path), the argv/disk non-leak, and the failure modes
against **throwaway local TLS fixtures**, never the real pooler, so `pnpm lint` never depends on
third-party network reachability. What they do **not** prove is that the *committed* certificate
still validates the *real, current* pooler. That is a deliberate, named gap (per the F-T4 PR-1
build order) — run this by hand before any ceremony that will use the bridge, and at PR review
time:

```sh
# WITH the pinned CA, hostname-verified, and scriptable (nonzero exit on ANY verify failure):
openssl s_client -connect aws-0-ap-southeast-1.pooler.supabase.com:5432 -starttls postgres \
  -CAfile ops/tls/pooler-ca.crt \
  -verify_hostname aws-0-ap-southeast-1.pooler.supabase.com -verify_return_error </dev/null
echo "exit: $?"   # expect 0

# WITHOUT any CA (default trust store) — expect a NONZERO exit, not "0":
openssl s_client -connect aws-0-ap-southeast-1.pooler.supabase.com:5432 -starttls postgres \
  -verify_return_error </dev/null
echo "exit: $?"   # expect nonzero (this run: 1, "self-signed certificate in certificate chain")
```

`-verify_return_error` makes `s_client` exit nonzero on any verification failure instead of
merely printing a return code that a recipe would otherwise have to grep for; `-verify_hostname`
adds the hostname check `sslmode=verify-full` itself performs (a CA-valid-but-wrong-name
certificate must still refuse). Neither command needs a password or a DSN — the Postgres
`SSLRequest` handshake completes before any authentication is attempted, so this is safe to run
from anywhere with network reachability to the pooler. **Both directions were run and captured
during this PR's build**: WITH the CA, `Verification: OK` / `Verified peername:
*.pooler.supabase.com` / exit 0; WITHOUT any CA, `verify error:num=19:self-signed certificate in
certificate chain` / exit 1. That evidence is this PR's review record for the live leg; re-run it
again before trusting an older PR's evidence at ceremony time.

## Known limitations

- **Windows-native spawn is unsupported as a ceremony surface.** `dsn-pipe.mjs` runs fine on
  native Windows for authoring and testing (this PR was built there), but every documented
  ceremony recipe assumes a POSIX shell (`fly ssh console | node ... -- ...`); WSL2 is the actual
  ceremony home (`AGENTS.md`'s CI runners are WSL2 for the same reason). Don't adapt a recipe to
  `cmd.exe`/PowerShell piping without re-proving the argv/disk cells there first.
- **A DSN's `options=` parameter can be mangled by `+`-encoding.** `URLSearchParams.toString()`
  (used internally by `withVerifyFull()`) encodes a literal space as `+` — the web-form query
  convention — not `%20`. A DSN carrying
  `options=-c search_path=foo` would round-trip with `+` in place of the spaces, which some URI
  consumers read literally rather than decoding. None of this bridge's own documented recipes use
  `options=`; if a future ceremony needs to, verify the receiving tool decodes `+` as a space
  before relying on it through this bridge.

## Ceremony runbooks

The six runbooks below route their live DSN-bearing commands through this bridge; each also
carries a one-line pointer back to this file at the point where DSN discipline is stated:
`wave-b-0019-ceremony-runbook.md`, `wave-b-0021-ceremony-runbook.md`,
`wave-b-ceremony-runbook.md`, `runtime-hard-restart.md`, `DR.md`,
`g1-operator-firm-ceremony.md`.
