# The ceremony DSN bridge

**F-T4 item F.** Every ceremony that touches the live database needs `sslmode=verify-full`
against the Supabase session pooler, with the pooler's CA pinned — otherwise a connection that
merely says "encrypted" is silently unauthenticated TLS (`sslmode=require`/`no-verify`), which is
what actually happened twice (`fix-queue-survey.md` F22: `f-a1-pr1-ceremony-asrun.md:15-20,72-78`,
`f-a1-pr3-ceremony-asrun.md:13-19`). Both times the cause was the same: the tooling that pins the
CA and pipes the DSN was **session-local** — written for one ceremony, never committed, gone by
the next. This doc and the two scripts it describes are the fix: **in the repo, for good.**

## What's here

| file | job |
|---|---|
| `ops/tls/pooler-ca.crt` | the pooler's CA — a **public trust anchor**, not a credential (see provenance below) |
| `scripts/ops/dsn-pipe.mjs` | reads a DSN on **stdin only**, forces `sslmode=verify-full`, pins the CA, spawns the given command with the DSN in the **child's environment only** |
| `scripts/ops/dsn-pipe.selftest.mjs` | the hermetic battery — wired into `pnpm lint`, runs on every PR |

## Using it

```sh
# Anywhere the DSN can be produced on stdout without ever touching argv or a file:
fly ssh console -a clara-backup -C "printenv DATABASE_URL" | node scripts/ops/dsn-pipe.mjs -- pnpm migrate
```

`scripts/ops/dsn-pipe.mjs` refuses to run if `ops/tls/pooler-ca.crt` is missing (fail-closed, never a silent
plaintext fallback), refuses a DSN that doesn't parse as `postgres://` / `postgresql://`, and
never echoes what it read — every refusal message is static. The child's exit code passes
through untouched. It sets, in the **child's env only**: `DATABASE_URL` (with `sslmode` forced to
`verify-full`), `PGSSLROOTCERT` and `NODE_EXTRA_CA_CERTS` (both pointed at the committed CA), and
`PGSSLMODE=verify-full` as a redundant safety net for libpq tools that read `PG*` vars instead of
a DSN. The DSN is never written to a file, never appears in this script's own argv or its child's
(both proved live in the selftest — see below), and is never logged.

## The CA's provenance, and why committing it is lawful

`ops/tls/pooler-ca.crt` is **"Supabase Root 2021 CA"** — a self-signed X.509 root certificate,
valid until **2031-04-26**. It was captured by performing the **pre-authentication** half of the
Postgres TLS handshake (the `SSLRequest` exchange) against the live pooler
(`aws-0-ap-southeast-1.pooler.supabase.com:5432`, the same host `docs/ops/DR.md:160` already
names) and reading the certificate chain the server presents — the same information
`openssl s_client -starttls postgres -showcerts` shows anyone who connects. **No credential, no
DSN and no authentication was ever involved**: a TLS server's certificate chain is public by the
nature of TLS (it is sent to any client before login), so capturing it commits no secret. Hard
constraint 4 governs DSNs and secrets; a CA certificate is a trust anchor, the opposite of a
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
the capture above against the live pooler, confirm the new certificate is self-signed
(`openssl verify -CAfile new.crt new.crt` → `OK`) and carries **no** `PRIVATE KEY` block, then
replace `ops/tls/pooler-ca.crt` in a PR through the normal ladder.

## The positive live leg — a REVIEW ITEM, run before any ceremony, not wired into CI

The selftest (`scripts/ops/dsn-pipe.selftest.mjs`) is deliberately **hermetic** — it proves the
CA-pinning mechanism, the argv/disk non-leak, and the failure modes against a **throwaway local
TLS fixture**, never the real pooler, so `pnpm lint` never depends on third-party network
reachability. What it does **not** prove is that the *committed* certificate still validates the
*real, current* pooler. That is a deliberate, named gap (per the F-T4 PR-1 build order) — run this
by hand before any ceremony that will use the bridge, and at PR review time:

```sh
# WITH the pinned CA — expect "Verify return code: 0 (ok)":
echo | openssl s_client -connect aws-0-ap-southeast-1.pooler.supabase.com:5432 \
  -starttls postgres -CAfile ops/tls/pooler-ca.crt 2>&1 | grep -i "verify return code"

# WITHOUT any CA (default trust store) — expect a self-signed-certificate refusal, NOT "ok":
echo | openssl s_client -connect aws-0-ap-southeast-1.pooler.supabase.com:5432 \
  -starttls postgres 2>&1 | grep -i "verify return code\|verify error"
```

Neither command needs a password or a DSN — the Postgres `SSLRequest` handshake completes before
any authentication is attempted, so this is safe to run from anywhere with network reachability
to the pooler. **Both directions were run and captured during this PR's build**: WITH the CA,
`Verify return code: 0 (ok)`; WITHOUT any CA, `verify error:num=19:self-signed certificate in
certificate chain` / `Verify return code: 19`. That evidence is this PR's review record for the
live leg; re-run it again before trusting an older PR's evidence at ceremony time.

## Ceremony runbooks

The one-line TLS step lives inline in each: `wave-b-0019-ceremony-runbook.md`,
`wave-b-0021-ceremony-runbook.md`, `wave-b-ceremony-runbook.md`, `runtime-hard-restart.md`,
`DR.md`.
