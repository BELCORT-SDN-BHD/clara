# INCIDENT — 2026-07-26 — **RESOLVED, and "intake is DOWN" was WRONG**

> ## ⚠️ THE HEADLINE CLAIM WAS MY INFERENCE, NOT A FACT
>
> **Intake was never down for new documents.** The only file I tested with —
> `RPRJV202502001 - SECRETARY FEE - RM2,600.pdf` — **was already ingested in Clara**
> (document `89e9d362`, filed, with an approved entry). Every "failure" was a **duplicate
> re-upload**, which is the ordinary case: a human re-dropping a file they already sent.
>
> ### Two real bugs, both now fixed
>
> **1. `putCanonical` could never detect a duplicate.** Supabase returns a duplicate as
> **HTTP 400 wrapping `{"statusCode":"409","error":"Duplicate"}`** — the real status is in the
> BODY. The code branched on `response.status === 409`, which is therefore never true, so the
> "already exists" path was unreachable and every duplicate became a fatal `storage_error`.
>
> **2. The error body was discarded.** `Storage upload failed (400)` cannot distinguish a
> duplicate from a permission denial from a bad key — and 400 is what Supabase returns for all
> three. Both the upload and read paths now carry the body.
>
> **And one real misconfiguration:** `NEXT_PUBLIC_CLARA_RUNTIME_URL` was unset in the
> Cloudflare Pages build, so bytes and finalize transited a Pages Function — which is why the
> error arrived as an opaque Cloudflare HTML 502 instead of the runtime's own JSON. Fixing it
> is what let the true error surface. Genuinely wrong, genuinely worth fixing — but not "the
> outage", because there was no outage.
>
> ### What this cost, and the pattern
>
> Four coherent diagnoses. **Three wrong**: expired credential (checked, wrong), needs UPDATE
> (acted on in production, reverted), same-origin transport (real bug, not the cause). One
> destructive probe that **overwrote a client document** (recovered byte-identical). And the
> premise — "intake is down" — was never verified against a document Clara had not already
> seen. **One control would have collapsed the whole thing: test with a file the system has
> never seen.**



> ## ⛔ ROOT CAUSE — CORRECTED. My first two diagnoses were BOTH WRONG.
>
> **The actual cause is not in the database at all.**
> `NEXT_PUBLIC_CLARA_RUNTIME_URL` is **unset in the Cloudflare Pages build**, so
> `wire.ts:runtimeBase()` returns `""` and **both the byte `PUT` and `finalize` go
> same-origin into a Pages Function instead of direct to Fly.** `intake.ts` states the
> requirement in its own header: *"a deployment MUST set the runtime URL so bytes never
> transit a serverless function."*
>
> Decisive evidence:
> - The dashboard renders **`runtime: same-origin proxy`** on the page.
> - The runtime's spool `/data/spool` contains **no `intake-*` files at all** (only
>   `task-*` from 2026-07-19) — **no bytes ever arrived**, so finalize had nothing to seal.
> - The 502's body was a **Cloudflare** error page, not a Fly one.
> - `CLARA_INTAKE_CORS_ORIGINS` on the runtime is **already** `https://app.clarabook.com`
>   — the direct path was designed and provisioned, then never switched on.
>
> **FIX:** set `NEXT_PUBLIC_CLARA_RUNTIME_URL=https://clara-runtime.fly.dev` in the
> Cloudflare Pages project and **rebuild** (it is a build-time `NEXT_PUBLIC_*` var, so a
> redeploy is required — changing it without a rebuild does nothing).
>
> ### The two wrong diagnoses, kept because the errors are the lesson
>
> **WRONG #1 — "the storage-role JWT expired."** The README calls the credential
> *"Rotated, unexpired"* and `storage.mjs:51-54` throws this exact code on expiry, so it
> was the obvious candidate. Checked before reporting: **valid to 2027-01-15.** Checking
> is what stopped a wrong report reaching the owner.
>
> **WRONG #2 — "the upload path needs UPDATE on storage.objects."** This one I did not
> just think, I **acted on it** and granted UPDATE in production. The reasoning: a `PUT`
> with the role JWT returned `permission denied for table objects` while the INSERT
> succeeded. Both observations true; the inference false. **`putCanonical`
> (storage.mjs:81) uses `method: "POST"`** — the create verb, needing INSERT only. *The
> function's name says put; the request says POST.* My probe used PUT, which in Supabase
> Storage is the UPDATE/replace endpoint — so it measured **a verb the runtime never
> calls**, and its 403 was the correct refusal of a privilege we withhold on purpose.
> After the grant, intake **still failed**, and a `POST` with the same JWT to a fresh key
> returned **200** — the create path had been healthy throughout.
>
> That same wrong probe also **overwrote a real client document** (see the destructive-probe
> warning below; recovered byte-identical the same minute).
>
> **REVERTED:** `packages/db/deploy/wave-b-storage-update-amendment-REVERT.sql` restores
> the ratified `INSERT + SELECT only` posture, validated on the rig fixture. Least privilege
> is not something to give away on a plausible-but-unverified inference.
>
> ### The lesson, stated plainly
>
> Three times I had a coherent story that fit every observation and was still wrong. What
> broke the loop each time was **reading the code that actually runs** — the HTTP method in
> `putCanonical`, the empty env var in `runtimeBase()`, the absent spool files — rather than
> reasoning from symptoms. **Symptom-driven inference on someone else's API is where this
> went wrong, twice.**

---

## Original write-up (kept for the record)

# OPEN INCIDENT — document intake is DOWN (storage step), 2026-07-26

**Impact: no document can enter Clara.** Intake fails at the storage step for every upload.
Everything already in the system is unaffected — books, wiki, and reads are fine. This blocks
the daily loop's front door, and therefore Gate P, the B-12 capture rows, and any further
document-driven gate work.

**Found by:** attempting to post RPR's `RPRJV-202502/001` secretary-fee voucher (the one
still-to-capture row with a document in hand) through the normal daily loop.

## Symptom, reproduced twice

Two uploads of the same 342,566-byte PDF, 08:45:29Z and 08:49:07Z:

```
clara.document_intakes → status = failed
                         failure_code = storage_error
                         sha256 = NULL      storage_key = NULL      document_id = NULL
```

Browser saw `finalize intake failed (502)` with a **Fly edge HTML error page** as the body —
i.e. the app did not return a clean response, though it got far enough to set `storage_error`.

**Last successful storage write: `2026-07-25 20:08:09Z`** (Bee Creative's management accounts —
`storage.objects` has nothing newer). So this began within the last ~12 hours.

## Eliminated — with the evidence, so nobody re-checks these

| candidate | verdict | how |
|---|---|---|
| runtime down | ❌ healthy | v27, `/ready` **true**, machine `started`, 2/2 checks passing |
| Supabase Storage down | ❌ healthy | service key lists buckets **200** and objects **200** |
| service key expired | ❌ valid | `role=service_role`, expires **2036-07-16** |
| **storage-role JWT expired** | ❌ **valid** | read from inside the runtime: `role=clara_storage_docs`, exp **2027-01-15**. This was the leading hypothesis — the README calls the credential *"Rotated, unexpired"* and `storage.mjs:51-54` throws exactly this code on expiry. It is **not** expired. |
| storage rejects that JWT | ❌ accepted | a **GET with the runtime's own role JWT returns real object bytes** — auth works, SELECT works |
| table grants | ❌ correct | `clara_storage_docs` holds INSERT + SELECT on `storage.objects`; `authenticator` is a member |
| RLS policy missing | ❌ present | `clara_storage_docs_insert` (cmd=a) and `_select` (cmd=r) both exist |
| key violates the policy regex | ❌ satisfies it | policy needs `^firms/<uuid>/docs/<64hex>\.<ext>$` with UUID **version nibble [1-5]** and **variant nibble [89ab]**; firm `cde5917c-7861-4a2d-95e3-91d8a7230053` passes both (`4`, `9`), and it is the same firm as every prior successful upload |
| migration 0021 | ❌ considered, rejected | applied today between the last success and the failures, but it adds one function and touches no relation, policy, grant or storage path |

## The ONE fact still missing

**The PUT's actual HTTP status.** `putCanonical` (`packages/runtime/lib/storage.mjs:81-95`)
throws `storage_error` on any non-OK response and the status never reaches the DB or the log.

> ## ⛔ THE PROBE BELOW IS WRONG AND DESTRUCTIVE — DO NOT RUN IT
>
> **In Supabase Storage, `PUT /object/<bucket>/<path>` is the UPDATE endpoint, not
> create-if-absent.** It **overwrites** an existing object, and `x-upsert: false` does not
> prevent it — that header only governs the *create* verb (`POST`). This probe was written
> believing a PUT against an existing key would 409 and write nothing. It does not: it
> returns **200 and replaces the object's bytes.**
>
> **It was run, and it destroyed one.** `BEE CREATIVE - Management Accounts YA2024.pdf`
> (138,491 bytes) was replaced with the 5-byte string `probe` at 2026-07-26 10:12:22Z, while
> `clara.documents` still recorded the original `byte_size` and `sha256` — a silent
> storage/provenance divergence on a filed client document.
>
> **Recovered the same minute:** the original was on disk with a matching hash, re-PUT with the
> service key, and read back — 138,491 bytes, sha256 `22719184…0b40`, byte-identical to the
> DB's record. No posted figure ever depended on it (Bee Creative's finalized carry-down used
> the **keyed** seed, not the document-tied one), so the books were never at risk. The scare is
> real regardless: a routine "read-only" diagnostic silently rewrote a client record.
>
> **The correct probe is below**, under "A SAFE write probe". This one is kept, struck
> through, because the mistaken reasoning is the lesson.

~~This probe answers it and **writes nothing** — it PUTs against an object that already exists, so
a healthy write path returns **409** (`x-upsert: false`):~~

```sh
KEY=$(psql -At -c "select name from storage.objects where name like '%/docs/%' order by created_at desc limit 1")

fly ssh console -a clara-runtime -C "/usr/local/bin/node -e \"
  const j=process.env.CLARA_STORAGE_ROLE_JWT, b=process.env.CLARA_STORAGE_URL;
  (async()=>{ const r=await fetch(b+'/$KEY',{method:'PUT',
      headers:{authorization:'Bearer '+j, apikey:j, 'content-type':'application/pdf', 'x-upsert':'false'},
      body:Buffer.from('probe')});
    console.log('PUT -> '+r.status); console.log((await r.text()).slice(0,220)); })()\""
```

~~Read it as: **409** ...~~ *(the reasoning above was wrong — see the warning.)*

## A SAFE write probe

The verbs, which the whole mistake turned on:

| verb | Supabase Storage meaning | needs |
|---|---|---|
| `POST /object/<bucket>/<path>` | **create** — fails if the object exists | INSERT |
| `PUT /object/<bucket>/<path>` | **update / replace** — overwrites | INSERT **and UPDATE** |

`putCanonical` uses **PUT**, which is exactly why the missing UPDATE grant broke intake.

To probe the write path without touching any real document, **POST to a canonical-shaped key
under a random firm UUID** — it satisfies the RLS predicate, collides with nothing, and is
deleted afterwards with the service key (the custom role has no DELETE, by design):

```sh
# 1. create under a throwaway firm uuid
FIRM=$(python -c "import uuid;print(uuid.uuid4())")
SHA=$(python -c "print('c'*64)")
fly ssh console -a clara-runtime -C "/usr/local/bin/node -e \"
  const j=process.env.CLARA_STORAGE_ROLE_JWT, b=process.env.CLARA_STORAGE_URL;
  (async()=>{ const r=await fetch(b+'/firms/$FIRM/docs/$SHA.pdf',{method:'POST',
      headers:{authorization:'Bearer '+j, apikey:j, 'content-type':'application/pdf'},
      body:Buffer.from('probe')});
    console.log('POST -> '+r.status); console.log((await r.text()).slice(0,200)); })()\""
# 2. then DELETE it with the service key (never leave probe objects behind)
```

Read it as: **200** → the write path is healthy. **403 permission denied for table objects** → a
missing GRANT (this incident: UPDATE). **new row violates row-level security policy** → the
grant is fine and the RLS predicate rejected the key. **413** → a size limit.

**Never PUT a key you did not just create.**

## Two observability defects this exposed — fix regardless of the cause

1. **The runtime logs NOTHING for a failed intake.** Two failures produced zero log lines; the
   log over that window contains only ClamAV self-checks. The status from a failed storage call
   is discarded at `storage.mjs:95` (`Storage upload failed (${response.status})` becomes a
   generic `storage_error` in the DB) and never written anywhere durable. **A failure whose cause
   is unrecoverable after the fact is the defect, separately from whatever broke.**

2. **`/ready` has no storage check.** It reports `db, world, control, taxonomy, relay` — so with
   intake completely broken, readiness said **true** and would have passed any deploy gate. The
   whole document lane can be down and nothing goes red.

## Not affected

Books, wiki, reads, the runtime's consumer loops, and everything already ingested. B-12's
still-to-capture checklist (`docs/plan/research/wave-b/live-gate-b12-rpr-2026-07-26.md`) was
derived from documents read off disk, not through intake, so it stands.

---

## Applying the fix

Live, owner-run (the session classifier blocks live mutations):

```
python "<scratchpad>/live_psql_file.py" packages/db/deploy/wave-b-storage-update-amendment.sql
```

Expect `=== storage amendment 1 COMPLETE - 4/4 ===`. It runs in one transaction and aborts
whole on any failed assertion, so a partial widening of the boundary is not a reachable state.

Then re-test intake end to end by uploading a document through `/documents`. If it still fails
with `permission denied for table objects`, the next candidate is **`storage.buckets` SELECT**
(currently denied) — deliberately left out of this amendment because nothing has proven the
upload needs it, and unproven grants on a security boundary are how boundaries rot.

## Follow-ups this incident earned

1. **Fix the two observability defects** (below) — a failure whose cause is unrecoverable
   afterwards is its own bug, separate from whatever broke.
2. **Add a storage write-probe to `/ready`.** *(Trued 2026-08-27: this item's original
   "reported `ready: true` for ~12 hours" framing inherited the retracted "intake is down"
   headline above — there was no ~12h outage; every observed failure was a duplicate
   re-upload.)* What stayed true regardless of that correction: `/ready` never touched storage
   at all, so it could not have corroborated anything storage-side, real or not — a read-only
   reachability check would have stayed green either way. **Shipped 2026-08-27** (PR #358;
   promoted to a hard readiness gate by 裁-61 on 2026-08-30): `checks.storage_write` in
   `packages/runtime/lib/health.mjs`, with the probe itself in
   `packages/runtime/lib/storage-probe.mjs`. The runtime logs classified red↔green transitions,
   tolerates one transient failure, and `/ready` returns 503 on the second consecutive failure;
   Fly then marks the machine unhealthy for routing. The remaining ALARM half — an external
   check that pages someone when it flips — is `docs/ops/DR.md`:304's still-open "external
   `/ready` uptime checks" wiring piece.
3. **Rig-cover the storage grant surface.** The fixture written for this amendment
   (`scratchpad/storage-fixture.sql`) should become a permanent battery so a vendor change
   that needs another privilege fails in CI instead of in production.
4. **Re-read the assumption.** The whole design rests on Supabase honouring a *custom Postgres
   role* in the Storage JWT. That still works today, but this incident is evidence the contract
   moves without notice. Worth an owner decision on whether to keep depending on it or move
   writes to scoped S3 credentials.
