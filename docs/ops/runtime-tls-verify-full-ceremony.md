# Turning the runtime's lane DSNs to `verify-full` — the ceremony

**H-43.** The runtime image now ships the Supabase pooler CA at a fixed path. This is the OTHER
half: re-setting the lane DSN secrets so each one actually pins that CA. **Neither half works
alone**, and the order is fail-closed in the wrong direction if reversed.

> **Who runs this.** The orchestrator, as the owner's delegate through the real audited doors
> (hard constraint 14, 裁-189). Secrets travel **env-to-env and are never printed** — every
> command below is written so no DSN reaches a shell history, an argv, a transcript or a file.
> The DSN bridge that enforces that is `docs/ops/dsn-bridge.md`; read it first.

## What the code half already did

| piece | where |
|---|---|
| the CA in the runner stage at `/app/ops/tls/pooler-ca.crt` | `packages/runtime/Dockerfile` |
| the fingerprint pin + the ported structural validation | `packages/runtime/lib/tls-ca.mjs` |
| the boot assert (refuses a pinned-but-broken CA; WARNs when nothing is pinned) | `packages/runtime/lib/pools.mjs`, inside `assertProductionPoolConfig` |
| the drift cells (the COPY line, the two fingerprint pins agreeing) | `packages/runtime/tests/l9-tls-ca.test.mjs` |

The source of the certificate is `ops/tls/pooler-ca.crt` — a **public trust anchor, not a
credential**; `docs/ops/dsn-bridge.md` records both independent captures and why committing it
is lawful.

## Step 1 — the live positive leg, BEFORE anything else

The in-repo batteries are hermetic by design: they prove the mechanism against throwaway TLS
fixtures, never the real pooler. They do **not** prove the *committed* certificate still
validates the *current* pooler. A stale CA would turn this ceremony into an outage, so run the
pair from `docs/ops/dsn-bridge.md` ("The positive live leg") by hand and record both exits:

- WITH `ops/tls/pooler-ca.crt` and `-verify_hostname` — expect **exit 0**.
- WITHOUT any CA — expect a **nonzero** exit ("self-signed certificate in certificate chain").

Neither command needs a password or a DSN: the Postgres `SSLRequest` handshake completes before
authentication. **Absence of this run is not evidence the CA is current.**

## Step 2 — deploy the IMAGE first, and verify it boots

```sh
fly deploy --config packages/runtime/fly.toml --remote-only --yes \
  --build-arg CLARA_BUILD_SHA=$(git rev-parse HEAD)
```

Then confirm the machine is up and the CA is where the DSNs will point. **Use Node, not
`openssl`** — the runner stage installs `ca-certificates` but not the `openssl` CLI, so an
`openssl x509` call inside the image exits 127 (measured while building this ceremony, against
`node:20-bookworm-slim`):

```sh
fly ssh console -a clara-runtime -C "ls -l /app/ops/tls/pooler-ca.crt"
fly ssh console -a clara-runtime -C "node -e \"const{X509Certificate}=require('node:crypto');const c=new X509Certificate(require('node:fs').readFileSync('/app/ops/tls/pooler-ca.crt'));console.log(c.subject.replace(/\n/g,' '),c.ca,c.fingerprint256,c.validTo)\""
```

Expect `CN=Supabase Root 2021 CA`, `true`, the pinned fingerprint, and `Apr 26 ... 2031 GMT`.
The printed fingerprint must equal the pin in `packages/runtime/lib/tls-ca.mjs`. A certificate
is public, so printing its subject and fingerprint leaks nothing.

**Do not proceed until this deploy is serving.** Setting `sslrootcert` on a secret before the
file exists in the image makes every lane throw inside `readFileSync` at connect time — a total
outage with a confusing error, on every lane at once.

## Step 3 — re-set the secrets, env-to-env, never printed

**FIVE secrets take the pin in this ceremony.** Three more take it whenever their own operator
ceremonies run, and one — `DATABASE_URL` — is checked by the code but is not a deployed secret;
the table below is the whole census, so count it rather than a sentence.

| secret | login | in this ceremony? |
|---|---|---|
| `WORKFLOW_POSTGRES_URL` | the durable world's own DSN | **yes** |
| `CLARA_RUNTIME_DATABASE_URL` | `clara_runtime_login` | **yes** |
| `CLARA_READ_DATABASE_URL` | `clara_agent_read_login` | **yes** |
| `CLARA_WRITE_DATABASE_URL` | `clara_wake_write_login` | **yes** |
| `CLARA_FREEFORM_DATABASE_URL` | `clara_freeform_login` | **yes** |
| `CLARA_BANK_DATABASE_URL` | `clara_wake_bank_login` | deferred — when its ceremony runs |
| `CLARA_STRIPE_WEBHOOK_DATABASE_URL` | `clara_stripe_webhook_login` | deferred — when its ceremony runs |
| `CLARA_AUTH_WALL_DATABASE_URL` | `clara_auth_wall_login` | deferred — when its ceremony runs |
| `DATABASE_URL` | the base env identity | **not deployed** — see below |

`DATABASE_URL` is in `TLS_CHECKED_DSN_VARS` (`packages/runtime/lib/tls-ca.mjs`) because the boot
assert must judge whatever is actually set, and this variable is a legitimate base source on a
local rig and in `scripts/serve.mjs`'s own `WORKFLOW_POSTGRES_URL` fallback. The deployed runtime
does not set it — `packages/runtime/README.md`'s secrets list does not name it — so there is
nothing to re-set here. It is listed so the code's nine checked variables and this table's rows
reconcile rather than quietly differing by one.

Each value gains, replacing whatever it carried for either parameter:

```
?sslmode=verify-full&sslrootcert=/app/ops/tls/pooler-ca.crt
```

`sslrootcert` in the DSN itself is what makes the pin **exclusive** rather than merely additive:
`pg-connection-string` turns it into an explicit `ssl.ca`, which REPLACES Node's ~150-root
default store for that connection. `NODE_EXTRA_CA_CERTS` only AUGMENTS that store and is not a
substitute — `docs/ops/dsn-bridge.md` proves both polarities through the real client.

Set them in ONE `fly secrets set` call so the machine restarts once, reading each value from the
environment and never from argv. Secrets never enter `packages/runtime/fly.toml`; that file says
so itself.

## Step 4 — prove it, from outside and from inside

1. `fly logs -a clara-runtime` must show **no** `[clara-runtime] TLS WARNING` line. The
   "no configured DSN carries sslrootcert=" warning firing after this step means a secret did
   not take.
2. `/ready` must return `ready: true` with every configured lane `ok: true` under `checks.pools`
   — the per-lane probe (H-48) is what turns "the secrets took" from an inference into a
   measurement, because each lane opens a real connection and issues its own `SET ROLE`.
3. Record the reading in a dated as-run under `docs/plan/`, with the step-1 exits.

## Rollback

Reverting the secrets (dropping `sslrootcert`) restores the previous posture without a redeploy;
the CA staying in the image is inert. Reverting the IMAGE while the secrets still carry
`sslrootcert` is the outage shape from step 2 — roll the secrets back first.

## Rotation

When the pooler's CA is replaced, **three things move in one PR**: `ops/tls/pooler-ca.crt`,
`EXPECTED_CA_FINGERPRINT_SHA256` in `scripts/ops/dsn-pipe.mjs`, and the same constant in
`packages/runtime/lib/tls-ca.mjs`. A cell asserts the two constants agree, and the boot assert
refuses a certificate whose fingerprint does not match — so a `.crt` swap alone fails closed by
design. The in-image path does **not** change: it is baked into every secret above.
