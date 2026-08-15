# DR §10 — Sealed-report reproducibility (Wave E lane ζ)

*Companion to `docs/ops/DR.md`. §10 lives here, and its two cadence clauses live in DR.md beside
the cadence bullets they extend — the `docs/ops/DR-full-drill.md` precedent, for the same reason:
DR.md sits at the repo's 500-line file discipline, and a drill runbook grows.*

**A sealed artifact you have never re-rendered from its pinned dataset + evaluator + renderer
digest is not proven reproducible.** That sentence is this section's whole reason to exist, and it
is the same sentence DR.md §5's header makes about backups.

**What is protected, and by whom.** `clara.verify_report_artifact` recomputes the dataset and
manifest hashes from source facts and diffs them strictly — and reports its byte-level claim as
**`unverified_by_this_function`**, in its own return payload, because the bytes are produced
*outside* the database. So the DB proves the artifact's INPUTS still reconcile; only a re-render
proves the artifact's BYTES do. Any other split would let a green DB check imply a byte claim
nobody made.

**The renderer.** A separate Fly app `clara-render` (`sin`), image built from
`packages/reporting-render/Dockerfile`, run as a batch machine — no `[http_service]`, no
`[[services]]`, and no inbound network at all. Every sealed artifact's manifest pins the exact
**image digest** (never a tag), the source commit, the Node/OS/architecture, the layout engine and
its version, the pinned text extractor and its version, every font and image hash, and the locale
and timezone. Re-rendering means running THAT digest again against THAT dataset.

## The drill (described)

1. Read the target artifact's inputs first, through the door built for it:
   `select clara.replay_render_inputs('<artifact_id>');` — a **human** verb (granted to
   `clara_authenticated`, never to the worker's role), `STABLE`, firm-scoped in its own body, and it
   moves nothing: no job is enqueued, nothing is dispatched, no state changes. It returns the
   artifact's **own sealed manifest** verbatim (so the drill re-renders what was pinned THEN, not
   what the system would pin today) plus `expected_sha256`, `expected_byte_size`,
   `renderer_image_digest`, `dataset_id`, `dataset_sha256`, `storage_key` and `sealed_at`.
   Then run `clara.verify_report_artifact(<artifact_id>)` — inputs must reconcile before a byte
   claim means anything — and read the manifest for `books_snapshot_id`, `evaluator_versions` and
   `asset_hashes`.

   *A foreign artifact id and an absent one return the identical refusal, by design: the door is
   not an oracle for which ids exist. If you get `report_artifact_not_found` on an id you believe
   in, check which firm you are authenticated as before checking the id.*
2. Pull the pinned image **by digest**: `docker pull registry.fly.io/clara-render@sha256:<digest>`.
   A tag is not acceptable here, and the worker refuses one — the whole point of the drill is that
   the name still resolves to the bytes it resolved to when the artifact was sealed.
3. Re-render against the pinned inputs, replaying the render job's own request manifest. The
   worker derives its timestamps and document id from the manifest and never from a clock, so a
   correct re-render is byte-identical rather than merely equivalent.
4. **Compare sha256 against the artifact row.** Equal → PASS. Different → the artifact is **not**
   reproducible, and that is a finding, not a retry: record it, and do not overwrite the stored
   object. (The storage PUT is `x-upsert:false`, so overwriting is structurally impossible anyway
   — the drill cannot accidentally destroy the evidence it just produced.)
5. For a `signed_original`: **retrieve** it and hash it. It is retained and retrieved, **never
   regenerated** — re-rendering a signed original is not a drill, it is a forgery.

**The CI half of the same claim.** Every PR runs a **double render in one image** and asserts the
two sha256s are identical (`packages/reporting-render/lib/engine.mjs`'s `doubleRender`). CI proves
determinism *within* an image; this drill proves it *across seven years*. Neither substitutes for
the other, and neither is evidence for the other.

### The control arm — why A == B is not the whole test

**Byte-equality proves nothing unless the output is CAPABLE of varying.** A drill that passes
because it is measuring a constant has measured nothing at all: if the renderer had silently
stopped reading its inputs, or the comparison had been run against the same file twice, or the
engine had been emitting a fixed placeholder, every arm of an A-versus-B test would still come
back green. That is the absence-as-evidence law applied to determinism — the same shape as a
guard that passes because it lost the ability to fail.

So **every run of this drill renders four times**, and the document it renders is the product's own
emission — `assemble()`'s output via `packages/reporting-render/scripts/drill-fixture.mjs`, not a hand-written fixture, because
a fixture cannot see an engine mismatch in a preamble it never emits. Three arms, all required:

| Arm | Assertion | What it establishes |
|---|---|---|
| A vs B | identical sha256 | the render is reproducible |
| A vs C (changed `SOURCE_DATE_EPOCH`) | **identical** sha256 | the environment's clock is not an input — a real document pins its date from the reporting period, so two lawful re-renders of one manifest cannot disagree because a wall clock moved |
| A vs D (changed pinned input — a different `period_end`) | **different** sha256 | the manifest actually reaches the bytes, so the first arm is a measurement rather than a tautology |

**The clock arm's polarity was inverted here until 2026-08-15, and the flip is the honest record of
a design change rather than a correction of a typo.** While the drill rendered a fixture that pinned
no date of its own, `SOURCE_DATE_EPOCH` was the only thing reaching the PDF's timestamps, so
requiring it to CHANGE the bytes was the right capable-of-varying control. Once `assemble()` began
pinning the document's date from the reporting period — which is what makes a re-render reproducible
seven years out — the epoch stopped being an input at all, and the old arm would have failed. The
capable-of-varying job moved to arm D, where a changed *manifest* must move the bytes.

A run reporting only A == B is **not** a pass, and neither is one where D matched: a changed input
that leaves the output identical means the pin is not wired to anything, which is a worse finding
than a mismatch. **This binds every engine-version bump** — the Dockerfile's bump procedure names
this drill, all three arms, for exactly that reason.

**HISTORICAL — first execution (build spike, 2026-08-14), under the TWO-ARM definitions this
document used at the time.** DETERMINISM **PASS** (A == B,
`53b3d2c2978fc7693eaa205c8ec0c81961d2bcc081a1bbd851541d1be4058e62`), CONTROL **PASS** (C differed,
`33c325906bba2d13960f2f0d19d37f856ebff50235e33946cf233255a19762ff`), against
`typst 0.12.0 (737895d7)` with `pdftotext 22.12.0` on `node v20.20.2 / x86_64`.

> That run rendered a hand-written fixture that pinned no document date, so "C differed" was the
> correct control THEN and is **not** evidence for the drill as it now stands: under the three-arm
> table above, a differing C would be a FAILURE. Kept as the dated record of what was actually
> observed, not as current evidence. The current arms are A==B, A==C and A!=D.

**Stable across an image REBUILD, which is the stronger property and the one this section actually
needs.** The drill was re-run after the image was rebuilt from a changed Dockerfile, and every
hash above came back byte-for-byte identical. Two renders inside one image only establish that the
running container is deterministic; re-rendering a seven-year-old artifact means rebuilding — or
re-pulling — an image and getting the same bytes out, so the property under test is that the
*bytes survive the build*, not merely the run. That is what was measured. It also means the
determinism does not rest on build-time nondeterminism happening to be absent from a particular
layer cache, which is the failure a same-image drill cannot see.

## Exercised evidence — **RUN 2026-08-15**

The deploy ceremony was executed from merged `main` at **`faf33ecbbc6b350baba85d75048c8483f2485a31`**.
What follows is what was observed, not what was intended.

**Renderer image digest — four independent agreeing reads.**

```
sha256:b25b600d6689ecfab4fe0342c3474fdad2f75b651c4e9e8d74b45b403650ca6a
```

The push transcript printed it; `docker pull` by digest re-derived it (a pull by digest is
content-addressed — the client rehashes the bytes and refuses them on mismatch); `fly image show`
reported it for the live machine; and Fly's own runner logged `Pulling container image
registry.fly.io/clara-render@sha256:b25b600d…` at machine start. Four tools, four reads, one value.
One read would have been the build transcript describing itself.

**The three-arm drill, against that digest** (not against a locally-built approximation of it):

```
  A (epoch 1767139200)  aeed77d6887d35959797468a9dc3512e19854507ad543d13506464eacc4c0d37
  B (same inputs)       aeed77d6887d35959797468a9dc3512e19854507ad543d13506464eacc4c0d37
  C (epoch 1234567890)  aeed77d6887d35959797468a9dc3512e19854507ad543d13506464eacc4c0d37
  D (changed period)    80ac2def5567de35c9bedf60463473bfff2d244f44795ae2fed8be2638d81a86
  DETERMINISM PASS — A == B
  CLOCK       PASS — a changed SOURCE_DATE_EPOCH leaves the bytes
  CONTROL     PASS — a changed pinned input changes the bytes
double-render-drill: PASS — all three arms
```

Run from Windows via the script's documented portability overrides
(`CLARA_DRILL_DOCKER="wsl -e docker"`, host/guest stage translation, explicit `CLARA_DRILL_FONT`),
which is the first exercise of that path. Registry auth was `flyctl auth token` piped into
`docker login --password-stdin` — stdin, never argv.

**First live worker run** (machine `2862624f777308`, `clara-render-worker`):

```
clara-render: worker=clara-render:56203e97… engine=typst typst 0.12.0 (737895d7) extractor=pdftotext (poppler-utils) 22.12.0
clara-render: DONE — sealed=0 refused=0 abandoned=0
Main child exited normally with code: 0
```

The engine pin is confirmed **live** as typst 0.12.0 — the version the fixture's preamble is
written against. Exit 0 with all three counters at zero is a clean drain: the worker connected,
went through `claim_render_job`, and found nothing claimable. Machine config read back from Fly:
`schedule: hourly`, `restart: on-failure max_retries 3`, image pinned at
`registry.fly.io/clara-render:render-1@sha256:b25b600d…`.

**Storage identity, read from inside the machine.** `session_user=clara_runtime_login`,
`current_user=clara_runtime` after the worker's own `set role`. The storage credential decoded from
its own claims: `role=clara_storage_docs`, `exp=2027-01-15T05:16:35Z`, matching the designated
`CLARA_STORAGE_ROLE`. Direct `select` on `clara.render_jobs` and `clara.firms` returned **42501
permission denied** — recorded as a positive finding: the renderer reaches the queue only through
the SECURITY DEFINER verbs and holds no direct table read on either relation.

**Supavisor headroom: `33 / 60`** (prior standing measure 35/60). By `application_name`: Supavisor
19, unnamed 7, PostgREST 2, Supavisor auth_query 2, postgres_exporter 1, pg_cron 1, pg_net 1. This
app adds a peak of 1, so the projected peak is 34/60. A point-in-time read, not a high-water mark.

**The leader's dispatch half — bound 2026-08-15, on the second attempt.** The three
`CLARA_RENDER_FLY_*` values were first set with `--stage` and the runtime restarted; the restart
did NOT bind them. Staged secrets are applied by creating a **new machine version**, and a
restart reuses the machine's existing config, secret set included — so the runtime came back
healthy carrying exactly the environment it already had, and the readiness probe's 200 was true
throughout without ever contradicting the absence. `fly secrets deploy -a clara-runtime` bound them.
Verified by a **process** read — `printenv CLARA_RENDER_FLY_APP` inside the running VM returning
`clara-render`, against the same command exiting 1 before the deploy, with `CLARA_STORAGE_ROLE`
as the positive control. The leader now starts machine `2862624f777308` directly; the hourly
schedule returns to being the fallback it was designed as.

*`fly secrets list` shows staged values with a `Staged` status and is an APP-level read: it
reports what is set on the application, not what is bound inside a running VM. Reading it as
confirmation is what produced a "verified present" for an environment that did not have them.*

**WHAT THIS RUN DOES NOT ESTABLISH.** No sealed artifact was produced, because no render job
existed to claim — so the end-to-end round trip (replay a real artifact's pinned inputs, re-render,
compare to `expected_sha256`) is **still unrun**, and the drill above proves reproducibility of the
engine inside the image, not of a sealed artifact from live data. The §"drill (described)" steps
remain described. That distinction is the entire reason this section exists, and a later reader
must not read a green deploy ceremony as a green DR drill.

## Deploy — the commands of record

Per `packages/reporting-render/fly.toml`'s own law, the exact commands live in ONE place, and this
is it. **Do not run a plain `fly deploy`:** on a service-less app it still creates AND STARTS a
machine, i.e. it would fire a live render run on every deploy.

```sh
fly apps create clara-render --org personal

# The FOUR secrets the worker needs. Values come from the environment or a file fed to stdin —
# never argv, never chat, never the image. DATABASE_URL carries the SAME value clara-runtime
# holds as CLARA_RUNTIME_DATABASE_URL: the worker executes `set role clara_runtime`, so its
# login must be clara_runtime_login.
#   DATABASE_URL · CLARA_STORAGE_URL · CLARA_STORAGE_ROLE · CLARA_STORAGE_ROLE_JWT
fly secrets import -a clara-render --stage   # reads name=value pairs from stdin

fly deploy . --config packages/reporting-render/fly.toml \
    --dockerfile packages/reporting-render/Dockerfile \
    --build-only --push --image-label render-1 -a clara-render

fly machine run registry.fly.io/clara-render:render-1@sha256:<the digest the push printed> \
    -a clara-render --region sin --schedule hourly \
    --vm-size shared-cpu-1x --vm-memory 1024 \
    -e CLARA_RENDER_IMAGE_DIGEST=sha256:<the same digest> \
    -e CLARA_RENDER_SOURCE_COMMIT=<40-hex commit>
```

**The image reference is TAG-AND-DIGEST, and both halves are load-bearing.** A bare tag is
mutable — a later push with the same `--image-label` silently repoints it, which is the very
confusion the worker's refuse-a-tag-where-a-digest-belongs check exists to prevent, except the
mutable reference would be the machine's own image. Pinning the digest alongside the tag makes the
machine's image and the manifest's `renderer_image_digest` agree *by construction* rather than by
an operator copying one into the other. **Digest ALONE does not work:** `fly machine run
registry.fly.io/clara-render@sha256:…` fails on flyctl v0.4.66 — it resolves the reference and then
appends the digest a second time, producing `…@sha256:…@sha256:…`, which the API rejects with
`config.image: invalid image identifier`. Observed 2026-08-15, not theorised.

`fly machine run` **disregards fly.toml configuration entirely** — its flag set IS the runtime
contract. The image digest and the source commit are passed here because an image cannot know its
own digest while it is being built; the worker **refuses to seal without them**, and refuses a tag
where a digest belongs, so "unknown" and "reproducible" can never be indistinguishable inside a
sealed artifact.

**The storage variables are `CLARA_STORAGE_URL`, `CLARA_STORAGE_ROLE` and
`CLARA_STORAGE_ROLE_JWT`** — the names `packages/runtime/lib/storage.mjs` actually reads, reached
from the worker through `packages/reporting-render/lib/objects.mjs`. `CLARA_STORAGE_URL` is the **full private-bucket object
base** (the Storage REST `/storage/v1/object/<bucket>` base), because `storage.mjs` builds object
URLs as `${base}/${key}`; a bare `https://<project-ref>.supabase.co` is the wrong shape and will
produce wrong URLs. *An earlier revision of this file passed a `CLARA_RENDER_STORAGE_URL` that
nothing in the repo read — the ceremony of 2026-08-15 found it by running the command. The failure
would have been fail-closed (`realConfig()` throws `storage_error` 503 rather than sealing
anything), but the run would have refused every upload.*

**These are `fly secrets`, not `-e` flags**, because two of them are credentials; `CLARA_STORAGE_ROLE`
is only a role name and may ride either way. Staged secrets ("staged, not set on VMs") bind when
the machine is created, which is why the secrets step precedes the machine step.

**Running flyctl from Windows** carries the same three hazards DR.md §9 step 6 records for
`clara-backup`: a guest path is written `//run/…` (flyctl validates it with the HOST's rules),
`MSYS_NO_PATHCONV=1` is needed under Git Bash, and any command override must sit after a `--`
terminator.

## Three ceremony steps that are NOT inherited

**Order matters: step 1 comes BEFORE the machine is created.** `fly machine run --schedule hourly`
creates a machine that starts immediately, so a machine standing before the prefix is reachable can
attempt a seal that must fail. Step 3 necessarily comes after, because it needs the machine's id.

1. **Extend the storage role's policy to the `reports/` prefix.** `safeKey`'s live regex admits
   only `firms/…/docs/…`, and the storage role check in `packages/runtime/lib/storage.mjs` is
   about the ROLE, not the prefix — so `reports/` does not come along for free with the shared
   `firm-docs` bucket. Extend the policy deliberately, then take the **positive read**: upload one
   object and read it back **by key**, before the first seal. An absent policy would otherwise
   surface as a failed render at the worst possible moment, and "the role already works for docs"
   is an inference, not a read.

   **Done 2026-08-15, and here is the shape that worked.** Two policies were ADDED —
   `clara_storage_reports_insert` (cmd=a, `WITH CHECK`) and `clara_storage_reports_select` (cmd=r,
   `USING`), both to `clara_storage_docs` — each cloned from the live `docs` pair's byte-exact
   predicate with exactly two substitutions: the path segment docs → reports, and the extension class →
   `(pdf|json)`, matching `safeReportKey`'s
   `^firms/[0-9a-f-]{36}/reports/[0-9a-f]{64}\.(pdf|json)$`. **Add, do not ALTER:** permissive
   policies are OR'd, so a new pair extends reach while leaving the live document-intake path — the
   one that took the 2026-07-26 outage — outside the blast radius. **Clone the live predicate; do
   not compose one** from a description: the live text validates uuid version and variant nibbles
   more strictly than `safeKey` does, and a hand-written predicate looks right while differing.
   Both commands are required — a read-only extension passes a shallow check and then fails at the
   first seal. **No UPDATE policy**: the PUT is overwrite-impossible (`x-upsert:false`), which is
   what makes a sealed artifact's object immutable, and granting UPDATE to clear an error would
   quietly dismantle that.

   *A GET cannot answer this question.* Probing `reports/` with a read returns
   `404 not_found NoSuchKey` whether the prefix is permitted or forbidden — under RLS a denied
   SELECT yields no row, and object storage reports no-row as not-found. This was established on
   2026-08-15 with a negative control: a prefix no policy admits answered identically to the
   known-good `docs/` prefix. **Only the write discriminates**, which is why the step is a PUT
   followed by a read-back and not a probe.

2. **Re-verify Supavisor headroom before deploy** — the standing law every consumer-adding wave
   has followed. Last measured **33/60** (2026-08-15 ceremony; 35/60 previously, at
   `docs/plan/completed/wave-e-f6f9-acceptance.md`). This app adds **no standing sessions**: a
   short-lived DSN session per job, no pool, no LISTEN client, and worker concurrency capped at 1
   in v1 — so the peak it adds is **1**, for a projected 34/60.

3. **Wire the leader's dispatch half — on `clara-runtime`, AFTER the machine exists.**
   `readDispatchConfig` (`packages/runtime/lib/reconciler-render.mjs`) requires
   `CLARA_RENDER_FLY_API_TOKEN`, `CLARA_RENDER_FLY_APP=clara-render`, and either
   `CLARA_RENDER_FLY_MACHINE_ID` or `CLARA_RENDER_IMAGE_REF`; `CLARA_RENDER_FLY_REGION` defaults to
   `sin`. Prefer the **machine id** — it starts THAT machine instead of creating a new one each
   time. The token needs machine-START rights on `clara-render`, so a token scoped to
   `clara-runtime` alone will not do. Until this is set, the deployment is *unwired*: jobs still
   enqueue and the hourly fallback still drains them, so renders are **delayed, never stranded**
   (cell A33 arm ii), and the belt still reaps exhausted jobs. The chicken-and-egg is the reason
   this is a step rather than a footnote — the machine id does not exist until step 2 of the deploy
   block has run. Set these with `fly secrets set`/`import` and then **`fly secrets deploy`** —
   staged secrets bind by creating a new machine version, and **restarting the machine does not
   bind them**. Verify with a process read (`printenv CLARA_RENDER_FLY_APP` inside the VM), never
   with `fly secrets list`.

## Dispatch, and what happens when it fails

The runtime leader starts a render machine when a claimable job exists
(`packages/runtime/lib/reconciler-render.mjs`); the Fly **scheduled** machine is the fallback. A
leader outage therefore **delays** renders rather than stranding them — the queue row stays
claimable, the wait it actually suffered is recorded on that row, and the scheduled wake picks it
up. That is `docs/plan/active/wave-e-acceptance-matrix.md` cell **A33**, arm (ii), and it is
written to be a measurement rather than a hope.

A dispatch that could not start a machine is recorded on the job rows themselves
(`last_dispatch_ok`, `last_dispatch_error`), because "no render appeared" and "we could not start
the renderer" are different facts and only the second one is actionable. A job in that batch that
has already gone terminal is **skipped** by the receipt write and counted in the return's `skipped`
— the terminal row is immutable, and one finished job must not cost its four neighbours their
receipt.

## When a job dies for good — the requeue door

A job that burns every attempt without any worker reporting is parked `failed` by the leader's
sweep, with `last_error.reason = failed_at_cap_without_report`. That row is **immutable and stays**:
it is the record of what happened.

To produce the report anyway, mint its successor:

```sql
select clara.requeue_render_job('<failed job id>', 'fly capacity incident 2026-08-15');
```

- **Human-only** (`clara_authenticated`), firm-scoped, and **audited** — the operator is the audit
  row's actor, the report's original requester rides as `on_behalf_of`, and the stated reason is
  written both on the new row (`requeue_reason`) and into the audit log. A render costs money and
  re-runs a client's statements; that is not a machine's decision to make, so no runtime role holds
  this grant and `clara.enqueue_render_job` refuses to resurrect a failed request on its own.
- The successor **RE-DERIVES the pinned request from today's facts.** It does not copy the
  predecessor's manifest, and copying was never on offer: the seal gate the worker actually goes
  through — `clara._seal_report_artifact_core`, called by `clara.complete_render_job` —
  re-derives every DB-owned pin at completion and refuses a manifest that disagrees with it. Since
  `clara.statutory_wording` is append-only, one verified row landing after the failure moves the
  aggregate the pins hash — so a verbatim successor would be refused at completion, every time,
  after burning its five attempts. Re-derivation is what makes the retry completable at all.
- It carries `supersedes_render_job_id`, so the chain from incident to eventual artifact is readable
  years later. Only one successor may be live per **(run, kind)** at a time
  (`render_job_already_requeued`).

### If something upstream moved, you are asked before it renders

When the re-derived digest differs from the failed job's, the call **REFUSES** and hands back both
digests:

```
CLR43  requeue_manifest_drifted
       superseded_manifest_sha256: <the failed job's>
       manifest_sha256:            <today's>
```

That is not an error to route around — it is the door telling you the successor would render a
**different document** from the one that failed, because verified wording, a published template or
the resolved layout moved in between. Read both manifests. If the newer document is the one the firm
should have, say so explicitly:

```sql
select clara.requeue_render_job('<failed job id>', 'wording landed 2026-08-15', true);
--                                                                             ^ p_accept_drift
```

The flag defaults to **false**, so nobody consents by omission, and the audit row records
`manifest_changed`, `drift_accepted` and **both digests** — "the retry rendered a different document,
and a named person accepted that" is readable years later. A verbatim retry of the old document is
not available through any door; if the old document specifically is what you need, that is the
replay drill above, which reproduces the sealed artifact rather than sealing a new one.

**Read the failure before requeuing.** The reap fires on jobs whose workers never reported — an
image that cannot start, an OOM, a Fly capacity incident. Requeuing without fixing the cause simply
burns another five attempts.
