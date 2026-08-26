# Codex frontend handoff — integration errata (2026-08-27)

**What this is.** The clarabook-frontend build (a separate Codex session's frontend work,
now merged and archived to design-history) worked from a snapshot of this repo. Its own
manifests were honest about their staleness: audit base commit `d4b6cd2`, and this repo's
`main` has moved **36 commits** past that base (verified this session:
`git log --oneline d4b6cd2..HEAD | wc -l` → **36**, run against `main @ a87cc71`). **Six** of
the seven rows below correct integration claims that went stale as a direct result of that
gap, confirmed by the 2026-08-26 adversarial scan and re-verified independently in this
session against the live repo. **The seventh, (vii), is a different shape** — a verification
instrument error (a Windows long-path checkout truncation) that had made a real, present
asset in the clarabook-frontend repo look absent; it is included here because it was
originally drafted as an eighth staleness finding and needed the same public correction once
found wrong. **This page trues the rows below. It is not a finding against the handoff's
authors** — every staleness claim it corrects was accurate at `d4b6cd2` and went stale only
because Track-A's backend kept shipping underneath it.

**Method.** Every correction below was re-derived from this repo's own source at `main @
a87cc71` — a migration file, a live catalog body, or `apps/dashboard/app/shared/parts.ts`
itself — cited with `file:line` or an exact grep count, not carried on the scan's word alone.
Where a row describes what the *external* clarabook-frontend manifest itself said, this
session did not have file-level access to that repo; the wording is carried from the task
brief that requested this errata (itself downstream of the 2026-08-26 scan). The base
document this repo can independently confirm as the likely lineage of several of these
misreadings is `docs/plan/active/frontend-handoff-2026-08-23.md` — the handoff this repo
actually landed and handed to the Codex frontend session (commit `c8e9b65`, 2026-08-23) —
frozen at exactly the commits this errata now trues.

## The seven corrections

### (i) `begin_close` is LIVE and human-capability-gated, not prohibited

**Stale claim (lineage):** `frontend-handoff-2026-08-23.md` §3.6 reads *"`begin_close`
deliberately has NO human door (`:397-399`) — do not add one"* — a sentence about not
building a **new UI affordance**, which a downstream manifest can misread as "`begin_close`
itself is off-limits."

**Corrected fact.** `clara.begin_close(p_fy, p_op_key)` is a live, callable, human-facing
Postgres function, unchanged in its external signature and still capability-gated —
`packages/db/migrations/0120_f_a4_pr_1b_close_lifecycle.sql:1139-1153`:

```sql
create or replace function clara.begin_close(p_fy uuid, p_op_key text)
...
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if not clara._has_capability(c.firm, c.actor, 'close_and_attest') then
    raise exception 'closing a fiscal year takes the close_and_attest capability (key 2)'
      using errcode = 'CLR04', ...
  end if;
  return clara._begin_close_core(c.firm, c.actor, p_fy, p_op_key);
```

Migration `0120` (F-A4 PR-1b, the "entrance seam" body-move, D-15) moved the post-authority
logic into a shared `_begin_close_core` and added a **second, agent-only** entrance
(`clara._agent_begin_close_core` → the same core) alongside it — it did not remove or gate
off the human entrance. The migration's own tail census confirms both entrances are live and
that neither the human capability gate nor the delegate call was lost
(`0120:1621-1623`). **What §3.6 actually meant, correctly read**: do not build a *second*
approval UI in front of a DB verb that already gates itself — not that the verb is
unreachable or forbidden. A `/close` UI may call `begin_close` for a human holding
`close_and_attest` exactly as it always could.

### (ii) The `parts[]` union is 18 live types, not 21 — three are retired

**Stale claim (lineage):** `frontend-handoff-2026-08-23.md` §3.1 names a 21-member union
including `kb_rule_proposal`, `rule_post_receipt`, and `bank_rule_proposal`.

**Corrected fact.** The live union, `apps/dashboard/app/shared/parts.ts:139-161`, is
**18 members**: `text · tool_call · tool_result · tool_error · clarify · clarify_closed ·
attachment · je_review · refusal · doc_review · diff · sweep_receipt · open_question ·
bank_recon_receipt · fixed_asset · depreciation_run_receipt · adjustment_run_receipt ·
staff_advance`. The three named-retired types are **absent** — confirmed by reading the
full union declaration, not by a name search alone (review law 2: absence is evidence only
when a read actually looked at the whole closed set, which this did). They retired with the
bank-rules learn loop and the autopost rules tier (F-A2/F-A3's retirement trains, migrations
`0118` and `0129` — see (iii)); the corresponding chat cards and their catalog entries are
gone with them. **Any frontend work still branching on these three part kinds is dead code**;
the `AllCovered`/`NoExtra` compile-time guard (`apps/dashboard/app/chat/partCatalog.ts`) will
catch a *missing* entry but cannot catch three entries kept for types that no longer exist —
that is a manual cleanup, not a `tsc` failure.

### (iii) Bank agency: 13 live wake verbs (0121) + the 11-function rules loop retired (0129)

**Corrected fact, both halves independently counted:**

- **13 `wake_*` bank verbs are live**, `packages/db/migrations/0121_f_a3_pr1b_agent_limb.sql`:
  `wake_unmatch_bank_match · wake_void_bank_reconciliation ·
  wake_resolve_bank_line_exception · wake_add_bank_account · wake_upsert_account ·
  wake_void_bank_statement · wake_propose_bank_line_exception ·
  wake_propose_bank_identifier_promotion · wake_get_bank_pack · wake_match_bank_line ·
  wake_settle_from_bank_line · wake_complete_bank_reconciliation ·
  wake_resolve_and_book_bank_line` — counted directly off the `create function` lines
  (13 hits).
- **11 rules-loop functions are permanently retired**, `packages/db/migrations/
  0129_f_a3_pr3_retirement_parity_doors.sql:377-397` (the file's own comment: *"SS1 —
  RETIREMENT ... Eleven DROPs"*): `propose_bank_rule · sign_bank_rule · retire_bank_rule ·
  accept_bank_rule_suggestion · _bank_rule_sightings · _bank_rule_pattern_norm ·
  list_bank_rule_candidates · list_bank_rules · list_bank_line_suggestions ·
  match_bank_line`'s and `settle_from_bank_line`'s **rule-arity overloads** (the
  non-rule-arity overloads of the latter two survive — this is an overload-level
  retirement on two names, not a blanket drop of those two names). BUILT+MERGED+CEREMONIED
  2026-08-25/26 (PR #343, `PROGRESS.md`'s F-A3 lane row). The retirement is **whole**: the
  four dashboard bank-rules surfaces the base handoff flagged as "coming down" have no
  backend left to call.

### (iv) Filing + attribution are LIVE (0123-0126), not "DESIGNED"

**Stale claim (lineage):** `frontend-handoff-2026-08-23.md` §4.4/§5 rows 10-11 mark
`wake_file_document` and the attribution clarification surface **DESIGNED** (specified,
unbuilt) as of 2026-08-23.

**Corrected fact.** F-A7's full filing/interview/judgement family shipped across four
migrations, all merged and W2/W3-ceremonied 2026-08-25 — headers read directly:

- `0123_f_a7_gamma_egress.sql` — γ train, the fifth egress purpose (`document_processing`)
  and its consent gate at enqueue.
- `0124_f_a7_alpha1_file_document_extraction.sql` + `0125_f_a7_alpha2_judgement_recut.sql` —
  α train, the judgement-basis admission and the name-family congruence wall.
- `0126_f_a7_beta_filing_verb.sql` — β train, **the filing verb itself** plus the interview
  wake surface, `wake_credentials` gaining the `filing` kind and its allowlisted verbs.

The backend attribution/filing surface is real and callable; a frontend still treating it as
"unbuilt, presume no shape" is scoping work against a stale premise.

### (v) The freeform read surface (0131) is live and un-named in the stale manifests

**Corrected fact.** `packages/db/migrations/0131_f_a6_freeform_read.sql` — "F-A6 PR-1: THE
AUDITED FREEFORM READ (DB)" — merged and W4-ceremonied 2026-08-26 (PR #346). This is the
audited "ask the books" read surface the base handoff's row 23 marked **DESIGNED**
(specified, unbuilt) at `d4b6cd2`. It is now a real backend surface with its own receipt
page contract (`freeform-read-design.md`), and — per the 2026-08-26 scan this errata carries
forward — it is **absent from the clarabook-frontend manifests entirely**, not merely marked
stale: no row names it at all, because it did not exist yet at the audit base. Any 磨合-era
inventory of "what Wave F adds that the frontend inherits" needs this row added fresh, not
corrected from an existing one.

### (vi) Two report-download paths now exist (0127, 0132)

**Stale claim.** `frontend-handoff-2026-08-23.md` §4.2 states plainly: *"this build ships no
signed-download door — do not fabricate a link"* (row 19 marks reports **PART-BUILT
(metadata only)**).

**Corrected fact — two distinct download surfaces shipped since:**

- **`0127_f_a5_pr3_signed_original_archive.sql`** — F-A5 PR-3, "the signed-original archive
  doors" (design `reporting-agency-design.md` §3.8/3.9, annex A.4/A.5): closes a gap an
  independent review found live on `main` (`wake_seal_report_artifact(p_kind=
  'signed_original')` was reachable without the human-door reservation TA-P14(2) names) with
  a BEFORE INSERT wall on `clara.report_artifacts` keyed on `sealed_by`, not
  `prepared_by_agent`. This is the **archive/seal** download path.
- **`0132_f_a5b_pr1_sandbox_export.sql`** — F-A5b PR-1, the sandbox export lane's DB layer:
  three new relations, five ungranted cores, **nine verbs (six wake, three
  `clara_runtime` worker verbs, three human)**, the owner-ratified `sandbox_watermark` trio
  (en/ms/zh). This is the **narrative/free-query export** download path — watermark burned
  into the bytes per digest law/TA-P10, never a CSS layer (base handoff §3.7 is still the
  correct behavioural contract for this path; only its "no door exists" premise is stale).

A frontend built against the "no download door" premise needs both paths designed in, with
the watermark-burn discipline (vi's second bullet) kept intact for the sandbox path
specifically — the archive path is signed-original, not narrative, and carries no watermark
requirement.

### (vii) The brand-guideline PDF package is PRESENT and verifies clean — this row is a verification-practice note, not a defect

**This corrects an earlier draft of this same errata**, which had (vii) as an absence
finding ("the package is NOT in their repo"). That draft claim was itself an instrument
error, caught and corrected 2026-08-27: the original scratchpad clone used to look for the
package sat under a long temp-directory prefix (~110 characters), and Git for Windows without
`core.longpaths` enabled silently fails to materialize the deepest paths in a checkout under
that condition — so a full-tree `find` against that clone read a **truncated checkout**, not
the real repo state. This is the same absence-from-the-wrong-instrument class named in this
project's own standing lessons (an absence is only evidence when the read that produced it
was sound).

**Corrected fact.** The package **IS present** in the clarabook-frontend repo, on `main`
(merge commit `a770988`), at path output/pdf/clarabook-brand-guideline-package-v1.0/ (not
backtick-quoted here deliberately — it is a path in the OTHER repo, not this one, and this
repo's own harness-links gate resolves every backtick-quoted slash-path against clara-rebuild's
own tree) — 43 files.
Re-verified 2026-08-27 from a fresh clone taken deliberately to avoid the long-path failure
mode (short path `C:\ct`, `core.longpaths=true`, `core.autocrlf=false`): **all 42 manifest
checksums verify OK** (the manifest lists 42 of the 43 files — one is presumably the manifest
itself). The §5 checksum step **is runnable**, and passes.

**This session's own limits, stated plainly.** This worktree has no access to the
clarabook-frontend repo, so this correction — the commit id, the file count, the clean
checksum re-verification — is carried from the coordinator's own 2026-08-27 re-check, not
independently re-run here. What this errata adds is the **practice note** every future
checkout needs to avoid repeating the same false-absence: on Windows, a deep temp-directory
clone can silently drop long-path files well within a normal repo's path-length range, and
the fix is to clone short-path with long paths explicitly enabled, never to trust an absence
that instrument produced.

**The practice, for whoever next clones clarabook-frontend on Windows:**

```sh
# Short path, long paths enabled, CRLF left alone (the manifest itself is CRLF-terminated):
git -c core.longpaths=true -c core.autocrlf=false clone <clarabook-frontend-url> C:\ct
cd C:\ct/output/pdf/clarabook-brand-guideline-package-v1.0
# Strip \r before piping to sha256sum -c -, or every line "fails" on a trailing-CR mismatch:
tr -d '\r' < SHA256SUMS.txt | sha256sum -c -
```

A deep default temp-path clone (this repo's own scratchpad convention, or any long
`AppData\Local\Temp\...` prefix) is the failure mode to avoid specifically for this package's
directory depth — shallow repo checkouts elsewhere in this project have not shown the same
issue, so this is not a blanket "never use the scratchpad" rule, only a named trap for this
one deep-path asset tree.

## What this errata does not do

It does not re-litigate any of the base handoff's still-correct rows (§0's settled rulings,
the two-lane wire, hydrate-never-trust, the money/receipts contracts) — those are unaffected
by the 36-commit gap and stand as written. It does not replace
`docs/plan/active/frontend-handoff-2026-08-23.md` or its addendum; read both, then apply
these seven corrections on top. It does not assign blame — a 36-commit gap between a handoff
and a corpus-fast backend is the ordinary cost of building the two in parallel, and the base
handoff said so itself in its own staleness framing.

## Re-proving this errata

```sh
git log --oneline d4b6cd2..HEAD | wc -l   # expect 36, against main@a87cc71 or later
sed -n '139,161p' apps/dashboard/app/shared/parts.ts   # expect 18-member union
grep -c "^create function clara.wake_" packages/db/migrations/0121_f_a3_pr1b_agent_limb.sql  # 13
grep -c "^drop function" packages/db/migrations/0129_f_a3_pr3_retirement_parity_doors.sql    # 11 (of the file's named retirement block)
ls packages/db/migrations | grep -E "^01(23|24|25|26|27|31|32)_"   # the seven migrations this page cites
```
