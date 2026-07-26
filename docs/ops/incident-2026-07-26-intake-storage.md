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

This probe answers it and **writes nothing** — it PUTs against an object that already exists, so
a healthy write path returns **409** (`x-upsert: false`):

```sh
KEY=$(psql -At -c "select name from storage.objects where name like '%/docs/%' order by created_at desc limit 1")

fly ssh console -a clara-runtime -C "/usr/local/bin/node -e \"
  const j=process.env.CLARA_STORAGE_ROLE_JWT, b=process.env.CLARA_STORAGE_URL;
  (async()=>{ const r=await fetch(b+'/$KEY',{method:'PUT',
      headers:{authorization:'Bearer '+j, apikey:j, 'content-type':'application/pdf', 'x-upsert':'false'},
      body:Buffer.from('probe')});
    console.log('PUT -> '+r.status); console.log((await r.text()).slice(0,220)); })()\""
```

Read it as: **409** → the write path is healthy and the fault is elsewhere in finalize (look at
`scanFile` and `verifyCanonical`). **401/403** → authorization on INSERT specifically, despite the
grant and policy. **5xx** → Storage-side write failure. **413** → a size limit.

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
