### ADR-040 — Migration 0020 (typed egress consent) BUILT through five ratchet rounds and PR'd; Gate W2's dependency audit CLOSED live (2026-07-25)

**Decision (0020):** egress consent stops being one purpose-blind row and becomes a **typed** relation plus a separate owner **activation** — a grant alone does not authorize. The runtime reaches both only through `prepare_egress_dispatch` (plan time) and `consume_egress_dispatch` (the dispatch linearization point). A uniquely filed `document.classified` event now resolves its client and mints a deterministic `sources/<document_id>` wiki page; that namespace becomes reserved, gets its own budget, and its bytes become a pure function of the document uuid. **Model synthesis ships DARK**; deterministic ingest deliberately goes live. Contract v1.6 (amendments A1–A8). PR #89, **not yet deployed** — its ceremony is `docs/ops/wave-b-0020-ceremony-runbook.md`, ruled **RUNTIME-IMAGE-FIRST** because the live image predates A5 and would treat `source_cap_exceeded` / `reserved_slug_namespace` as unrecognised typed refusals and block the firm cursor (§10.3 step 4 says so itself). Image-first is safe because the surface guards are **per-event, not cached at startup** — verified at the call sites, not from the comment asserting it — so the new image on the 19 database degrades lane-locally and lights on the next event after the apply, no restart.

**The five ratchet rounds, and what each cost to find.** **R1** returned a **BLOCKER**: `consume_egress_dispatch` never checked the authorization was minted *for the dispatch being performed* — the binding was **audit-only**, which is exactly what Clara's cardinal invariant forbids (structural DB enforcement, not model discipline). Adjudicating it a blocker required **amending a ratified contract** (A1, the six-argument signature; a mismatch now returns `unknown` WITHOUT consuming). R1 also found that **no owner path existed to stamp `consent_evidence`** without granting legacy purpose-blind egress — the feature *could not be used as designed*, and the battery had passed only through a superuser fixture (A3). **R2**: cross-firm lock reach in `classify_consent_evidence_document`. **The A5 owner-ruling review**: `orphan_page` made the exemption a **superlinear daily verb** — measured on a rig at 900 pages 356 ms and 2,700 pages 9,790 ms, 27.5× for 3×, extrapolating to ~55 minutes per client at the 50,000 ceiling. **R4**: canonicalizing the ROWS left the **append-only event spine** stale, so a projection rebuilt from `domain_events` would restore the filename-bearing bytes — right about the rows, wrong about the architecture; fixed by APPENDING `wiki.page_canonicalized` correction envelopes plus a fifth bridge direction, because history is never rewritten.

**R5 — the probe told the truth (empirical, with Codex out of credits).** The two shipped ceremony artifacts were **driven on a rig** rather than read. The preflight came out clean: idempotent, row-scoped, safe to interrupt because it is one transaction. The **probe** did not — and it is the artifact whose output decides whether a human runs the remediation. **(C) A SILENT FALSE-CLEAN:** every relation it reads is under RLS, so as `clara_authenticated` it returned all zeros and `<none>` and exited 0 — *byte-identical to a clean database* — while §10.3 says "if `needs_canonicalization` is 0, skip to step 2". It now proves from the catalog that RLS cannot filter for the current role and refuses otherwise; and because every wiki relation is FORCE RLS, the gate also accepts a role covered by an unconditional permissive policy, or it would lock out `clara_fn_owner`, the one role that reads that way and can see every row. **(A) TWO OF FIVE DIRECTIONS:** the header promised the whole question while computing 4 and 5 only — reproduced on the rig, a `sources/` page with canonical bytes and no ingest log read `needs_canonicalization = 0`, `<none>`, clean, and the apply then aborted on direction 1. All five now report; D1/D2/D3 carry the remedy **INVESTIGATE**, because `wiki_log` is append-only and no script can repair a creation fact. **(B) A MITIGATION THAT DID NOT EXIST:** §11's A8-R1 ruling said the probe reports the completeness population; it did not. All three are now pinned to **behaviour** in `wb-0020-upgrade`'s fourth cell — one violator injected per direction, the probe asserted to name each, then the migration run and asserted to fail on *exactly* the direction named — and proven non-vacuous by failing against the pre-R5 file.

**Decision (Gate W2):** WB-R21 let the dependency audit run **interim** with exactly two known deviations. 0019 removed the `_assert_filing_wiki_unreferenced` veto, so **the known-deviation set is empty and the audit runs clean**. Executed read-only against production inside `begin read only`: **claim (1) — no gate/bound/floor/autopost fn reads wiki — and the structural half of claim (2) are CLOSED.** 315 `clara` functions; 9 name a wiki relation, 9 carry a call edge, and the union is exactly the twelve audited verbs, with no authority function in either set. Scanned over ALL functions, not just `SECURITY DEFINER` ones. Proven to FAIL on three injected shapes: an unauthorized relation-namer, an **overload of an authority name** that only calls, and an authority fn **renamed away** — the vacuous-pass trap, where an audit silently scans a short set and issues a green receipt. **NOT closed, and the artifact says so in its own header:** claims (2)-behavioural, (3) and (4) need a real wake credential and a real draft; `get_context_pack` correctly refuses a simulated wake context, which is *why* that half is journey work. Recording them as closed on catalog evidence would be the very defect class R5 had just found. PR #90; receipt `docs/plan/research/wave-b/live-gate-w2-2026-07-25.md`.

**Also ruled/recorded:** **Gate S DEFERRED on hard evidence** — the Bee Creative corpus is exactly 218 PDF + 70 JPG with no third file type anywhere, so no MyInvois e-invoice exists (evidence of absence, not absence of evidence). **Gate P needs an owner ruling**: all 218 PDFs were scanned and exactly 8 matched, all OpenAI, with nothing else in the corpus carrying a tax line — genuine Malaysian service tax (`MY FRP 24000037`, 8%, RM6.61–6.90 on the face) but a *foreign* registered person self-charging on an imported digital service, billed to the proprietor *personally* in USD, which is not "a local Sdn Bhd bills a business with SST". Whichever way it is ruled belongs in the receipt.

**R5 round two — the CEREMONY, not the migration (2026-07-26, contract v1.6).** Before letting
0020 touch production, six independent lanes attacked the ceremony itself. They changed **no
migration behaviour** — A1–A8 stand and `0020_typed_consent.sql` is byte-identical — and found
that the dangerous surface was the *instruments and the order*. **Two blockers, both confirmed by
direct inspection, not taken on trust.** (1) The apply step **named no command**, while the whole
rollback posture rests on "the migration is one transaction" — and that transaction comes from
`scripts/migrate.mjs:149-157`, not from the file, which contains no `begin`/`commit` at all. A
`psql -f` would have **half-applied 0020 onto production** with no `schema_migrations` row saying
so. (2) The ordering left the runtime **fully up** between the preflight and the apply, and
`planDeterministicIngest` calls the pre-A7 `record_wiki_source_ingest` on the `entry.approved`
lane with **no surface guard** — correctly, it is 19-era behaviour — so one such event in that
window mints a fresh non-canonical page and aborts the apply on a page that did not exist when
the probe was read. The ceremony now **re-quiesces before the preflight**. Also fixed: the
preflight was a **fourth `wiki_pages` locker taking the page row with no client-row prefix and
then requesting `firm_event_seq` inside the page loop** — precisely the wait-for-graph shape 0019
ratchet R2 outlawed and its post-verify probe 10 asserts over every locker in the schema; a
reviewer reproduced the deadlock on a rig. "Roll back only to an A5-aware image" named an **empty
set** (every prior release predates A5), so the rollback section now says plainly that the image
does not roll back either and the forward path is the only path. A new
`wave-b-0020-postverify.sql` replaces §10.3 step 3's prose with **eleven executable probes**, run
verbatim by the upgrade fixture so CI exercises the file the owner runs — and its own first draft
had to be corrected twice: its grant probes read `information_schema`, which shows nothing to a
role that neither granted nor belongs to the grantee (not reachable for live's `postgres`, which
inherits the owner — but a soundness argument resting on an incidental membership edge is one
refactor from silent, so both now read `relacl`); and its DARK receipt looped `status='active'`
clients, which would have **skipped the legacy-consent client** — the only row that can expose a
bleed — and still printed ALL PROBES PASSED. Step 7 was also instructing an **unrecoverable
production write as a verification** (a null-note ingest: measured +1 page, +1 version, +2
append-only events) immediately before step 8 asserted the page count was unchanged; both are
gone, and the page count is now correctly declared *expected to rise*, since deterministic
publication is the contract's own deliberate change #1.

**Rehearsed end to end on a rig seeded to mirror live** — 30 `sources/` pages on one client, all
needing canonicalization, plus a live legacy purpose-blind consent on that same client: probe
~30 ms · preflight **37 ms** (30 pages, 30 titles, 30 version rows, 30 correction envelopes) ·
apply **304 ms** · post-verify **11/11**. **The DARK claim was proven on the hard case**: with the
legacy consent live on the wiki client, `prepare_egress_dispatch` returned byte-identical
`{"verdict":"unknown","authorization_id":null}` for every purpose and every client, minting
nothing — no bleed. The A3 owner path (`classify_consent_evidence_document` → `grant_client_egress`)
was also driven end to end, closing R1-F3's "the feature cannot be used as designed" empirically
rather than by reading. **Named honestly:** `wiki_synthesis_holds` is empty on live, which is
positive proof the counterparty synthesis lane has *never* run in production — so "zero synthesize
calls" after the apply is true whether the lane is dark or broken, and step 8's runtime half is
recorded as *no contrary evidence*, not as proof.

**Why (the lesson this migration kept earning):** all five rounds found the same class — **a document claiming a property the code did not have** — and in several cases a green test pinned the *claim* rather than the behaviour. Two counter-moves now house practice: read a document's load-bearing verbs (*enforced · closed · only · reports*) and find the line that makes each true; and write the test against the artifact, then run it against the OLD artifact and require it to FAIL. With no cross-model lane available (Codex out of credits until 2026-07-29), the **empirical** substitute — drive it on a rig, inject a violator, assert the failure — outperformed reading, and is what found the false-clean. Ref: WB-R21 · WB-R23 · WB-R24 · PRs #89/#90.
