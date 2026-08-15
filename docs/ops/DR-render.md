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
emission — `assemble()`'s output via `scripts/drill-fixture.mjs`, not a hand-written fixture, because
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

## Exercised evidence — **NOT YET RUN**

**This section is deliberately empty of results.** DR.md §5 and §5b carry verbatim transcripts
because those drills were executed; this one has not been, and a described drill recorded as
though it were an exercised one is precisely the failure DR.md §5's own scope note was written to
prevent. The first run lands here in the same shape — the commands, the observed hashes, and the
PASS/FAIL — replacing this paragraph.

## Deploy — the commands of record

Per `packages/reporting-render/fly.toml`'s own law, the exact commands live in ONE place, and this
is it. **Do not run a plain `fly deploy`:** on a service-less app it still creates AND STARTS a
machine, i.e. it would fire a live render run on every deploy.

```sh
fly deploy . --config packages/reporting-render/fly.toml \
    --dockerfile packages/reporting-render/Dockerfile \
    --build-only --push --image-label render-1 -a clara-render

fly machine run registry.fly.io/clara-render:render-1 \
    -a clara-render --region sin --schedule hourly \
    --vm-size shared-cpu-1x --vm-memory 1024 \
    -e CLARA_RENDER_IMAGE_DIGEST=sha256:<the digest the push printed> \
    -e CLARA_RENDER_SOURCE_COMMIT=<40-hex commit> \
    -e CLARA_RENDER_STORAGE_URL=https://<project-ref>.supabase.co
```

`fly machine run` **disregards fly.toml configuration entirely** — its flag set IS the runtime
contract. The image digest and the source commit are passed here because an image cannot know its
own digest while it is being built; the worker **refuses to seal without them**, and refuses a tag
where a digest belongs, so "unknown" and "reproducible" can never be indistinguishable inside a
sealed artifact. Secrets (`DATABASE_URL`, the storage role JWT, and the Fly API token the runtime
leader uses to dispatch) ride as `fly secrets` — never as argv, never in the image.

**Running flyctl from Windows** carries the same three hazards DR.md §9 step 6 records for
`clara-backup`: a guest path is written `//run/…` (flyctl validates it with the HOST's rules),
`MSYS_NO_PATHCONV=1` is needed under Git Bash, and any command override must sit after a `--`
terminator.

## Two ceremony steps that are NOT inherited

1. **Extend the storage role's policy to the `reports/` prefix.** `safeKey`'s live regex admits
   only `firms/…/docs/…`, and the storage role check in `packages/runtime/lib/storage.mjs` is
   about the ROLE, not the prefix — so `reports/` does not come along for free with the shared
   `firm-docs` bucket. Extend the policy deliberately, then take the **positive read**: upload one
   object and read it back **by key**, before the first seal. An absent policy would otherwise
   surface as a failed render at the worst possible moment, and "the role already works for docs"
   is an inference, not a read.
2. **Re-verify Supavisor headroom before deploy** — the standing law every consumer-adding wave
   has followed. Last measured **35/60**
   (`docs/plan/completed/wave-e-f6f9-acceptance.md`). This app adds **no standing sessions**: a
   short-lived DSN session per job, no pool, no LISTEN client, and worker concurrency capped at 1
   in v1 — so the peak it adds is **1**.

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
- The successor **copies the pinned request verbatim** rather than re-deriving it. Re-deriving would
  answer "what would we pin today", and a template published in the meantime would silently render a
  different document under the same request.
- It carries `supersedes_render_job_id`, so the chain from incident to eventual artifact is readable
  years later. Only one successor may be live at a time (`render_job_already_requeued`).

**Read the failure before requeuing.** The reap fires on jobs whose workers never reported — an
image that cannot start, an OOM, a Fly capacity incident. Requeuing without fixing the cause simply
burns another five attempts.
