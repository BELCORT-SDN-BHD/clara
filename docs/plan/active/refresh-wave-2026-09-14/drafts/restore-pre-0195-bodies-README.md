# `0196_restore_pre_0195_bodies.sql` — DRAFT

**DRAFT ONLY.** Not applied, not under `packages/db/migrations`, not committed, not pushed.
File sha256 (LF) `8067151550c7b07ef27304ae49133cd7b91d6f6074e68b116ff486080f5680ad`.

## What it restores (2 bodies)

- **`clara._record_journal_entry_core` → its 0194 body** (`eca58b99…` = 0195's prestate pin),
  not its 0184 body. 0195's change was ONE contiguous 86-line insertion — the CLR13
  `egress_not_authorized` wall — and nothing else moved. The 0184 body predates #643 and would orphan
  the `clara.periodic_adjustments` rows the 0194 doors still admit.
- **`clara.persist_document_extraction` → its 0123 body** (`8ba95a52…` = 0191's prestate pin).
  0191 spliced in one `clara._assert_field_path` call; that grammar lives at this door only (no
  table CHECK carries it) and is the wall runbook 6d(ii) names against pre-release XLSX `r=` paths.

## What stays

Everything else. Nine recut bodies are KEPT, reasoned in the header — notably
`prepare_egress_dispatch` (restoring it strands parked `claraWork_v3` runs one step earlier than
the wall did) and the four owner egress verbs (restoring them removes the owner's only kill switch
over rows that remain). All 0188–0195 tables, columns, CHECKs, doors and rows stay.

## Compatibility image

The frontier goes **up**, to 0196, so `frontier_requires_body` still fires: **the compatibility
image MUST carry `claraWork_v3`**; v82 is still not a legal boot target. Only the
*requirement* goes away. **Parked v3 runs then post without the wall** — the cost of a rollback.

## Scratch-apply evidence (rigw3b :55459, `clara_0196` = copy of `clara_w3`; dropped after)

`1 new migration(s) applied · 191 total`; pins matched, tail passed, restored shas exact,
owner/ACL/DEFINER posture unchanged. Batteries:
work-journal-post **32/32**, work-journal-admission **20/20**, periodic-adjustment **19/19**,
document-capability-registry **16/16**, work-egress-authority **24 pass / 7 fail**
(`w631.write.refused`, `.prepared_only`, `.other_run`, `.invalidated`, `.walled_from_v3`,
`.unknown_bundle`, `.withdrawn_after_consume` — `.authorised` and `.grandfathered` stay green),
field-path-grammar **0/7** (all at one cohort hook: *"validator=true spliced_into_persist=false"*).
Baseline on an untouched copy of the same estate: **125/125**. The 14 reds ARE the rollback.

**Deviations:** a scratch dir holding ONLY the draft cannot work — `migrate.mjs`'s F4 history check
aborts (measured); it must hold the 190 release files plus the draft. Pre-images were read
read-only off rig637/`clara_637` (0187 checksum `5fc28e38…`); no `clara_pre` created.
`w631.write.*` lives in `work-egress-authority.test.mjs`, not `work-journal-post`.

## Hosted procedure — two steps, neither alone

1. Machine stopped (`flyctl machine stop 48ee715b763048`), apply through the DSN pipe as step 6c:
   `(cd packages/db && <dsn pipeline> | node ../../scripts/ops/dsn-pipe.mjs -- node`
   `scripts/migrate.mjs)` → expect `1 new migration(s) applied · 191 total`.
2. Then release the compatibility image (carrying `claraWork_v3`) and start the machine.

**Renamed 2026-09-15; counts above are STALE after the 0196–0198 release.** This draft was written as `0196_restore_pre_0195_bodies.sql`; PR #822 (#692) took the number 0196 on `main` on 2026-09-14, and 0197/0198 followed and were released on 2026-09-15 (`RELEASE-RUNBOOK-0196-0198.md`). Read the numbers in this file as: the draft takes number **0199** (or the then-next free number); the directory handed to `migrate.mjs` must hold all **193** release files plus the draft (F4 history check, `migrate.mjs:329-341`); the expected line is `1 new migration(s) applied · 194 total`; the frontier rises to that number and `frontier_requires_body` still fires, so the compatibility image must still carry `claraWork_v3`. When this draft is ever used it takes the then-next free number, its pre-state pins are re-read from the hosted bodies of that day, and its tail assertions are re-run on a rig chain first.
