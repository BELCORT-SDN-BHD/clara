### ADR-041 — Migration 0020 DEPLOYED; typed egress consent is live and DARK (2026-07-25)

**Decision:** WB-R23 is **closed in production**. Egress consent is now a **typed** relation plus a
separate owner **activation** — a grant alone does not authorize — reachable only through
`prepare_egress_dispatch` / `consume_egress_dispatch`. Deterministic ingest is live on
`document.classified`; the `sources/` namespace is reserved, canonical by construction, and
carries its own budget. **Model synthesis ships DARK. LIVE: Supabase 20 migrations · Fly
`clara-runtime` release v27 (`deployment-01KYD5MB9J9M9J3SWPA4B2PHF5`) · zero freeze impact.**

**The ceremony, as run** (owner-gated; the owner ran the three `fly` commands the classifier
gates, the agent ran the rest): backup-first (`2026-07-25T17-33-49-882Z`, 103,050,311 bytes,
full profile over `clara`/`graphile_worker`/`workflow`/`workflow_drizzle`, 34 firm-doc objects
mirrored, **zero 501s**, `ping: success`, exit 0) → **quiesce** (0 non-idle, **0 advisory
locks**, 0 idle-in-transaction; the 12 residual sessions were plain-idle Supavisor sockets
holding nothing) → **deploy the runtime image FIRST** (v27; verified beforehand that it
enumerates `source_cap_exceeded` / `reserved_slug_namespace` at `wiki-projection.mjs:180,186`
and that the outgoing v26 does **not**) → **prove EXCLUSIVE new-binary leadership** (ten loops
acquired by the new tag, 9 advisory locks across 9 distinct backends, `/ready` true over 14
checks with zero warnings) → **RE-QUIESCE** (the R5 addition; 0 locks, 0 non-idle) → probe
(d1=d2=d3=**0**, d4=d5=30) → **preflight in 77 ms** (30 pages canonicalized, 30 titles, 30
version rows, 30 correction envelopes, re-asserting both directions itself) → probe again (all
five directions **0**) → **apply in 842 ms** through `scripts/migrate.mjs`, one transaction,
`applied 0020_typed_consent · 20 total` → `notify pgrst` → **post-verify 11/11** → restart,
`/ready` true zero warnings, `wiki_projection` lag 0 with `configurationBlocked: false`.

**The receipt.** 30/30 source pages carry the canonical title AND body; **zero filename
fragments remain anywhere in wiki bytes** — the A7 caller-prose channel is closed on production,
not merely in the schema. All 30 preimages are preserved in `payload.preimage`. Books untouched
at 35 journal entries. **Every event appended is accounted for:** seq 470–499 are the 30
`wiki.page_canonicalized` corrections, and seq 500–529 are 30 `lint.finding_transition` rows —
the first post-deploy lint pass **superseding all 30 accumulated `orphan_page` findings against
source pages**, exactly as the runbook predicted. Zero open lint findings of any kind now remain:
A5/A6's exemption is working on live, not just on the rig.

**DARK is confirmed on the hard case.** All five clients return byte-identical
`{"verdict":"unknown","authorization_id":null}` — and one of them is RPR, which holds a **live
legacy purpose-blind consent** and owns all 30 source pages, so it is precisely where a bleed
would surface. Typed consents, activations and dispatch authorizations: **0**. Wiki synthesis
holds: **0**. The probe minted nothing. **Stated honestly:** `wiki_synthesis_holds` being empty
is positive proof the counterparty synthesis lane has *never* run in production, so "zero
synthesize calls" is true whether that lane is dark or broken — the runtime half of the DARK
check is recorded as **no contrary evidence, not proof**. The discriminating evidence is the
DB-side probe against a real legacy consent, plus the rig's consumer battery.

**Why (what R5's second round bought).** Two blockers were found in the ceremony itself before it
ran, and both would have bitten. (a) The apply step **named no command** while the entire
rollback posture rests on "the migration is one transaction" — that transaction comes from
`scripts/migrate.mjs:149-157`, not from the file, which has no `begin`/`commit`; a `psql -f`
would have **half-applied 0020 onto production** with no `schema_migrations` row recording it.
(b) The original ordering left the runtime **up** between the preflight and the apply, where
`planDeterministicIngest` calls the pre-A7 ingest verb with no surface guard — one
`entry.approved` in that window mints a fresh non-canonical page and aborts the apply on a page
that did not exist when the probe was read. The re-quiesce closed it, and on the night nothing
raced. Also corrected pre-flight: a fourth `wiki_pages` locker without the ratified client-row
prefix (0019 R2's deadlock shape, reproduced on a rig), a rollback instruction naming an **empty
set** of A5-aware images, and a step-7 "verification" that was an **unrecoverable production
write**. **Residual, tracked:** `notify pgrst` returned `NOTIFY` but consumption was not
confirmable without an authenticated call; currently inert because no dashboard surface calls a
0020 verb yet. Ref: WB-R23 · WB-R24 · PRs #89/#91 · contract v1.6 §10.3 · the runbook as-run.
