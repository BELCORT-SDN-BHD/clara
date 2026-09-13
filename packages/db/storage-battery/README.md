# Storage grant/policy battery (#620 AC4 / C-57 / C83.28 / C88.9)

An allowed/denied battery for [`../deploy/storage-provision.sql`](../deploy/storage-provision.sql),
run against a **real Supabase Storage service** on an isolated, disposable stack the vendor's own
CLI boots (`supabase start`). It is the first thing in this repository that touches
`storage.objects` RLS or the Storage HTTP API at all.

| File | What it is |
|---|---|
| `run.mjs` | The battery. Boots the stack, applies the ceremony, runs the cells, disposes the stack. |
| `verdicts.mjs` | The pure response-verdict vocabulary the denial cells assert with (`deniedWith`, `absent`, …). Split out so a reviewer can feed it a fabricated response — a wrapped 409 duplicate, a bare 500 — and watch the verdicts differ without booting a stack. |
| `supabase/config.toml` | The CLI project config — Postgres + Storage + the API/auth pieces Storage needs, everything else off. |
| `hosted-probe.sql` | A **read-only** probe for the release session to run against the LIVE project through the DSN pipe. Local evidence cannot answer what the hosted estate carries. |

## What this proves

Through the **repository's own production door** — `putCanonical` / `verifyCanonical` /
`downloadCanonical` from `packages/runtime/lib/storage.mjs`, unmodified, with a real
`CLARA_STORAGE_URL` / `CLARA_STORAGE_ROLE` / `CLARA_STORAGE_ROLE_JWT` — and through raw `fetch`
**only for verbs the runtime never calls**:

| Cell | Assertion |
|---|---|
| B1 | A conforming key POSTs and is created. |
| B2 | The same POST again returns `existed`, not a fatal error — the wrapped-409 branch, the exact code path of the 2026-07-26 incident. |
| B3 | GET read-back verifies: `verifyCanonical` and `downloadCanonical` both match the sha, bytes byte-identical. |
| B4 | `x-upsert:true` and `PUT` on the same key are both refused with a wrapped **403** and the stored bytes are unchanged. |
| B5 | `DELETE` is refused with a wrapped **403** and the object is still readable — delete-never, asserted positively. |
| B6 | A non-conforming key (wrong prefix, 63-hex sha, uppercase extension, path traversal) is refused, on every variant, on three independent counts: the production door created **nothing**, the raw POST was answered with a wrapped **403** (a wrapped 409 duplicate is never read as a denial), and a privileged service-key GET reports the key **absent**. |
| B7 | The same conforming key in a **different bucket** is refused with a wrapped **403 or 404** — the policy is bucket-scoped. |
| B8 | A non-designated role JWT and an expired JWT are refused on POST (wrapped **403**) *and* GET (wrapped **403/404**), at the runtime pre-flight and on the wire. |
| B9 | **LIMIT** — a conforming key in another firm's namespace is allowed (see below). |
| B10 | Catalog assertions on the stack DB: no escalation bit on `clara_storage_docs`; `update`/`delete`/`truncate`/`references`/`trigger` on `storage.objects` all false while `insert`/`select` are true; the role inherits none of `postgres` / `supabase_storage_admin` / `service_role` / `supabase_admin` / `anon` / `authenticated` (the temporary-admin-grant detector); `pg_policies` lists exactly `clara_storage_docs_insert` and `clara_storage_docs_select` for the role. |
| B11 | Fixture cleanup with the stack's **service** key (never the custody role), then zero rows left in either bucket. B6's candidate keys are on the cleanup list too, so a weakened policy reds B6 — the cell that names the weakening — and not this one. |
| B12 | **LIMIT** — the wiki key family (see below), refused *by Storage*: the cell requires the failure to carry the HTTP status only the post-request branch can produce. |

### What a refusal has to look like

Every denial cell asserts the **status**, not a boolean. Supabase Storage answers a policy denial
as outer `HTTP 400` with the real status wrapped in the body (`{"statusCode":"403",…}`), and it
answers a *duplicate* under `x-upsert:false`, a *missing object* and a *server fault* with the same
outer 400 or with no wrapper at all. So `!response.ok` cannot tell a denial from a write that
landed, and `verdicts.mjs` is where that distinction lives: `403` for a policy or permission
denial, `403`-or-`404` for a denied read (the vendor hides a read the SELECT policy forbids as
"not found"), `404` from a privileged service-key probe to assert **absence**. A response with no
wrapped status is judged on its own HTTP status and can never pass for a policy answer it never
carried.

`PASS|FAIL|LIMIT <id> <what>`, one line per cell, then a table. Any `FAIL` exits non-zero.
`LIMIT` is a measured, deliberately-accepted boundary — reported, never quietly passed. A LIMIT
cell that stops being true goes **red**, because the limit statements below are load-bearing
arguments elsewhere and a stale one is worse than no statement.

### Why not a bare SQL role test

`SET ROLE clara_storage_docs; insert into storage.objects ...` measures the Postgres half only,
and AC4 says outright that it "does not establish the Storage HTTP API boundary". The 2026-07-26
incident is the standing proof: a probe that used **PUT** — the verb Supabase Storage maps to
replace/UPDATE, and the verb the runtime never calls — measured a privilege gap that was never on
the runtime's path, and `../deploy/wave-b-storage-update-amendment.sql` granted UPDATE on
`storage.objects` on the strength of it. Its own REVERT records the correction: `putCanonical`
sends **POST**. Hence the rule this battery keeps — the production door wherever the verb exists,
raw `fetch` only where it does not.

## What this deliberately does NOT prove

1. **Tenant isolation.** B9 asserts, positively, that a conforming key in **another firm's**
   namespace is both writable and readable by this one credential. Storage RLS here is
   *key-shaped*, not *tenant-shaped*: the policy predicate is `bucket_id='firm-docs'` plus a
   content-addressed key regex with a UUID-shaped segment it never compares to the caller. Firm
   isolation rests entirely on `clara.get_document_for_human_read*` and the runtime's live
   membership check. **A green battery is not tenant isolation**, and the document-door tests are
   what carry that claim.
2. **The wiki (and report) object families.** B12 measures that a conforming *wiki* key —
   `firms/<firm>/wiki/<client>/<sha>.md`, written by `putWikiCanonical` into this **same** bucket
   with this **same** credential — is **refused**, because this repository's ceremony creates
   policies for `.../docs/<sha64>.<ext>` only. Whether the live project carries a second,
   out-of-band wiki pair is hosted-pending; `hosted-probe.sql` §4 lists every policy on
   `storage.objects` to answer it.
3. **Anything about the hosted project.** The stack is built from scratch by the CLI, so it shows
   what the ceremony *produces*, never what the live estate *currently carries*. In particular it
   cannot say whether `wave-b-storage-update-amendment-REVERT.sql` was ever applied live — both
   that amendment and its revert are manual ceremony scripts with no applied/pending ledger. That
   is `hosted-probe.sql`'s job, and its output is **hosted** evidence, labelled separately.
4. **The credential's own minting/rotation.** No code in this repository issues
   `CLARA_STORAGE_ROLE_JWT`; the battery mints its own HS256 token against the throwaway stack's
   own secret. Real TTL and rotation are hosted/ops facts.
5. **Byte durability.** No backup, mirror or retention behaviour is exercised.

## Running it

### Locally (Windows dev box → WSL2 Ubuntu)

Docker is required and Windows here has none, so the battery runs from WSL2 Ubuntu against the
repo on `/mnt/c`. Node must be 22.x:

```sh
wsl.exe -e bash -lc 'export PATH=/opt/node/bin:$PATH; cd /mnt/c/Users/<you>/Desktop/clara \
  && node packages/db/storage-battery/run.mjs'
```

The stack's containers and volumes are Linux-native (Docker's own storage), and `run.mjs` copies
`supabase/config.toml` into a **disposable workdir under the system temp directory** before
handing it to the CLI, so nothing about the run depends on `/mnt/c` I/O speed and no CLI state
(`supabase/.temp/`) is ever written into the repository.

`psql` must be on PATH (any 16/17/18 client works — the file contains no backslash commands);
override with `PSQL=/path/to/psql`. `pg` comes from `@clara/db`'s own dependency, so
`pnpm install --frozen-lockfile` must have run.

The CLI is invoked as `npx --yes supabase@<pinned version>` unless a `supabase` binary already on
PATH reports **exactly** the pinned version. A mismatched PATH binary is passed over rather than
trusted: a different vendor build is a different set of behaviours, and this battery asserts
vendor response shapes.

### Against a stack you are already running

No CLI and no Docker needed here, and **this run never stops a stack it did not start**:

```sh
CLARA_STORAGE_BATTERY_DB_URL=postgres://postgres:pw@127.0.0.1:54322/postgres \
CLARA_STORAGE_BATTERY_API_URL=http://127.0.0.1:54321 \
CLARA_STORAGE_BATTERY_JWT_SECRET=<the stack's JWT secret> \
node packages/db/storage-battery/run.mjs
```

All three or none: a **partly** configured target aborts, naming the missing variable, rather than
booting a different stack behind your back or skipping green — two of the three set means somebody
meant to point this battery somewhere, and answering a question nobody asked is the one outcome
worth refusing. The privileged key cells B6/B11 need is **minted from the secret** (on a
self-hosted stack every legacy key is an HS256 JWT over it), so no service-role key is ever asked
for or kept; `CLARA_STORAGE_BATTERY_ANON_KEY` exists for a stack that has moved to the newer
publishable-key format, which is not derivable from the secret.

### When it cannot run at all

`CLARA_STORAGE_BATTERY_ALLOW_SKIP=1` turns "no named stack and no way to boot one" into a **named
SKIP that exits 0** — the reason states what was missing and what would let it run. Without the
switch the same situation is a **red**, deliberately: CI never sets it, so a runner that lost
Docker or a `supabase/setup-cli` step that silently failed goes red there, where a skipped-green
battery is indistinguishable from a passing one.

`stack.mjs` is the whole of that decision, and
[`../tests/storage-battery-contract.test.mjs`](../tests/storage-battery-contract.test.mjs) measures
it — together with `verdicts.mjs`'s denial vocabulary — **with no stack, no database and no
network**, so the parts of AC4 that are ordinary deterministic code stay verified on every box
while the wire stays the provider stack's job. The two are separate evidence and are labelled
separately.

### In CI

`.github/workflows/ci.yml`'s `storage-policy-battery` job. It is gated by the `changes` job's
`storage` classifier output (true when the diff touches any `deploy/storage-*.sql` or
`deploy/wave-b-storage-*.sql` — the amendment pair that granted and revoked UPDATE on
`storage.objects` is an input to B4/B10 exactly as the provisioning file is —
`roles-bootstrap.sql`, `packages/db/storage-battery/**`, the contract test,
`packages/runtime/lib/storage.mjs`,
`packages/runtime/lib/storage-probe.mjs`, the workflow itself, `.github/actions/**`,
`pnpm-lock.yaml` or the root `package.json` — the last three because the job runs
`./.github/actions/setup-workspace` and imports `pg` from the frozen install, so they are inputs
to what it measures; fail-closed true on a missing range, on `schedule` and on
`workflow_dispatch`), installs the pinned CLI with
`supabase/setup-cli`, and is asserted in both directions by the terminal `ci` meta-gate. No
secrets: every value the battery uses belongs to the throwaway stack. CI is the weaker environment
for the two teardown assertions below and is meant to be: every job gets a fresh VM and an
`always()` dispose step, so what they actually protect is a dev box, where the next run has to live
with whatever the last one left behind.

## Teardown guarantee

* The stack is disposed with `supabase stop --no-backup` (which deletes the data volumes) inside a
  `finally`, and again on `SIGINT`/`SIGTERM`; the disposal is idempotent.
* **A failed disposal reds the run.** A non-zero `supabase stop` prints `::error::` and sets a
  non-zero exit code even when every cell passed, so "the stack was disposed" is an assertion and
  not a line a human has to notice in a log.
* **A leftover stack aborts the next run.** Before starting, `run.mjs` asks `docker` for
  containers named `supabase_*_clara-storage-battery`; a non-empty answer stops the run instead of
  narrating it, because `supabase start` would otherwise adopt them and the battery would report on
  a ceremony it did not apply. A second consecutive run that gets *past* that line is therefore the
  evidence that the first disposed cleanly. Where `docker` itself is unavailable the question cannot
  be asked at all, and the preflight says so rather than claiming a clean slate.
* B11 removes the battery's own objects *before* disposal and asserts both buckets are empty, so
  cleanup is a measurement and not a consequence of throwing the stack away.
* Disposing the whole stack is the **only** correct cleanup here: `clara_storage_docs` is
  cluster-global and is permanently excluded from `../tests/rig-cluster-reset.mjs`'s droppable
  roster (it is never migration-minted), so no role sweep could ever tidy up after a half-run.

## Evidence classes

`run.mjs` is **local (provider-stack)** evidence and labels its own banner
`PROVIDER STACK (supabase start), local`. `hosted-probe.sql` produces **hosted** evidence. The two
are never merged in a report; AC5/AC7 require them kept apart.
