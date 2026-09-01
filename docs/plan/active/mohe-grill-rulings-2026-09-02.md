# The 2026-09-02 rulings — the pre-pause truing sitting

> The seventh ledger, continuing `mohe-grill-rulings-2026-09-01-pm.md`. Context: the owner
> ordered the COMBINED PAUSE WINDOW open at ~02:30 MYT (vhdx compaction + the owner's Claude
> Code update — the session and every lane terminate, so state must be 100% in-repo), preceded
> by a full harness truing sweep (seven read-only drift-scan lanes over PROGRESS, the product
> law, AGENTS, the ADR digest, the plan index, the deferral census, and the ops READMEs). The
> sweep's corrections ship as the docs/harness-truing-2026-09-02 branch's PR (ADR-0069
> single lane). Resume map for the next session: `PROGRESS.md`'s 2026-09-02 posture + the
> evening state bridge in the `-09-01-pm` ledger.

## 裁-110 · RESERVED (recorded 2026-09-02 to close a silent numbering gap)

**The number was reserved in-session on 2026-09-01 for the cross-package test-guard proposal
and never written into any ledger** — the `-pm` ledger jumps 裁-109 → 裁-111, and a repo-wide
`git grep 裁-110` returned zero files until this entry. The subject: a standing guard for the
cross-package shared-DB test class (committed estate-global writes vs unscoped roster/singleton
reads under `pnpm -r` concurrency), which was fixed piecewise across #482 / #485 / #497 / #498 /
#501 during 2026-08-31…09-01. **The full proposal (incident table + the guard's shape) must be
AUTHORED INTO this ledger before it is put to the owner** — an unwritten proposal would be
re-derived from scratch after any compaction. Until that authoring, this entry and the
`PROGRESS.md` Backlog row are the number's only records. Status: PENDING AUTHORING, then
PENDING OWNER.

## 裁-114 · PRD §6 truing — both credential-law and egress-law texts corrected (owner, 2026-09-02)

**Asked at the pre-pause sweep via the grill protocol; the owner chose "both as recommended."**
The drift-scan's product-law lane found two §6 texts contradicting ruled-and-shipped reality:

1. **The split-trust corollary** (`PRD.md` §6 + `ARCHITECTURE.md` §1) read "service
   credentials live only in the agent service." False since P4-4: `apps/web`'s server-only
   invite Route Handler lawfully holds `SUPABASE_SERVICE_ROLE_KEY` (the repo's own
   `.env.example` was trued 2026-08-30; the law documents were not), and the owner-ruled FS-4
   design (裁-81/89) puts the Stripe webhook signing secret in `apps/web` too. **The ruling:
   the invariant is re-stated as the wall that actually holds — no service credential ever
   reaches a browser; no `NEXT_PUBLIC_`-prefixed variable ever carries one; `apps/web`'s
   server-only Route Handlers are a second, browser-isolated holder alongside the agent
   service.** The alternative (demanding the code move) was declined: it would reject the
   ruled checkout design.

2. **Invariant 16** was titled "client data egress is governed" but described ONLY
   observability-trace export, while the shipped governor of client-DOCUMENT egress — the
   typed, purpose-scoped consent subsystem (`0020_typed_consent.sql`, ADR-0040/0041, digest
   law 58) that the beta DPA itself cites — appeared nowhere in either law document (the word
   "consent" had zero hits in both). **The ruling: split into 16(a) document/OCR egress
   (typed consent + separate owner activation, re-checked at dispatch) and 16(b) trace export
   (the existing ADR-011 text); ARCHITECTURE gains the matching subsection.**

Cost stated at the ask: docs-only, rides the truing PR's single lane. Both texts are truings of
already-ruled decisions, not new policy — the DECISION here is that the law documents say so.
