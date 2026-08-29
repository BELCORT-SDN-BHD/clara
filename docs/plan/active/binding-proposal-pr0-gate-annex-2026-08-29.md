# 裁-18b PR-0 design gate — ANNEX: evidence, refuted candidates, overturned refutations

> Companion to `binding-proposal-pr0-gate-2026-08-29.md` (the gate record of record). This annex holds
> what the ranked list compresses: the verbatim evidence behind the sharper findings, the candidate
> findings that were killed by adversarial verification, and — kept deliberately — **the two
> refutations this pass got wrong**, with why.
>
> `[N]` = the native lens pass · `[C]` = the Codex cross-model pass. Frontier `0147`.

## A · The Codex claims, independently re-verified

Every `[C]` finding was re-read against the live bodies rather than accepted. All six checked claims
**CONFIRMED**; two carry corrections that change what a build lane should do.

| claim | verdict | correction |
|---|---|---|
| F3 passes on a name substring alone | **CONFIRMED** | none — and it is worse than stated: the registration arm compares the *counterparty's stored* `registration_normalized`, not a value read fresh off the document |
| `name_family_is_ambiguous` never called in the vendor-binding path | **CONFIRMED** | **line pointer wrong** — `0103:755` is `name_family_candidates`; the function is at **`0103:781`** |
| runtime binding matches by `starts_with` on F1 | **CONFIRMED** | none |
| interactive credentials keep the directing human; `0084` already measures them | **CONFIRMED** | none — `0084:123` is the assignment; `:122` is the is-agent test |
| `0143` admits an irrelevant region | **CONFIRMED** | none |
| the post-time control must port `0029`'s full behaviour | **CONFIRMED** | **port source wrong** — `execute_rule_post` was CoR'd at `0030:456` and `0046:782`; the **last live shape is `0046:1364-1420`**. Porting `0029` re-introduces the pre-LCP F1 **equality** test that `0030` replaced with `starts_with` |

Digest laws quoted verbatim, all at the cited lines: **law 69** `docs/adr/README.md:400-404` —
*"maker/checker measures the DIRECTING human with standing re-read at approval time"*; **law 79**
`:472-478` — attribution is judgement under four walls, one of them *"a name-family collision guard"*;
**law 80** `:479-481` — *"every clocked act is receipted"*.

## B · C1 — the identity gap, in the live bytes

`clara._binding_f3_holds`, `0028_vendor_identity_binding.sql:246-326`, single definition, never
redefined and never spliced. The whole corroboration reduces to a geometry gate AND this OR:

```sql
  and (
    (nullif(clara._binding_normalize(p_registration_norm),'') is not null
      and position(clara._binding_normalize(p_registration_norm)
        in clara._binding_normalize(text_content))>0)
    or
    (nullif(clara._binding_normalize(p_name_norm),'') is not null
      and position(clara._binding_normalize(p_name_norm)
        in clara._binding_normalize(text_content))>0)
  )
```

`position(needle in haystack) > 0` is unanchored containment — not equality, not `LIKE`, not
`starts_with`. Every call site passes the **counterparty's stored** fields (`cp.registration_normalized`,
`cp.name_normalized` — `0028:437-438`, `0028:634-638`, `0029:1000-1001`, carried into `0030:431-432`
and `0046:1389-1390`), so F3 never asks "does the document print *this* registration"; it asks "does
this stored string appear somewhere in the top quarter of page 1".

Runtime selection, `0030_vendor_binding_f1_lcp.sql:412-433` — live, and untouched by `0101`'s splice
(which swaps only the extraction-selection statement):

```sql
    and starts_with(v_norm_name,b.f1_vendor_name_norm)
    ...
    and cp.registration_normalized is not distinct from b.registration_at_signing
    and clara._binding_f3_holds(
      p_document,cp.registration_normalized,cp.name_normalized)
```

`outcome='bound'` additionally needs exactly one matching binding and
`starts_with(v_invoice_id_norm, v_f2_prefix)` (`0030:435-448`); two matches return `ambiguous`. **That
ambiguity check is per-binding, not per-name-family** — it catches two *bindings* that both match, not
two *counterparties* whose names share a prefix, which is what the collision guard at `0103:781` is
for.

**Why the estate is exposed by its own fixtures.** Constraint 13's roster is a name family — ROME
PROPERTIES · ROME SECRETARY · ROME PUBLIC ADVISORY. A binding whose F1 LCP is the shared prefix, held
by a counterparty with a blank or non-printed registration, matches all three by `starts_with` and
corroborates by name containment.

## C · B2 — the two-tier receipt contract, in the estate's own words

`0126_f_a7_beta_filing_verb.sql:158-170`, the estate stating the impossibility the 裁-18b design walks
into:

> `-- agent_filing_receipts row -- structurally impossible for a RAISE (the abort undoes`
> `-- anything inserted earlier in the same transaction) without a SAVEPOINT-and-commit-`
> `-- separately pattern nowhere described in the design. … the receipts table's own column shape`
> `-- (failing_rungs text[]) only makes sense for a Tier-B-reached outcome -- a Tier A raise`
> `-- happens before v_failing is ever populated. This train's reading: Tier A stays unreceipted`

and `0126:846-850`, the mechanism that makes durable refusals work:

> `-- Tier A raises (CLR*), never reserved before every structural premise holds. Tier B is`
> `-- ALWAYS fully evaluated -- every rung, every time -- and accumulates a failing_rungs vector;`
> `-- filing requires that vector empty. A refusal COMMITS: the receipt is durable and the same`
> `-- transaction opens a firm question, never a silent no-op.`

## D · B8 — what `0029`'s post-time control actually did

Fourteen ordered steps, all inside `if e.vendor_binding_id is not null then … end if;`
(`0029_vendor_binding_executor.sql:977-1284`). **Port target is `0046:1364-1420`** (the last live
shape), not this text — see §A.

1. `:977` gate on the `vendor_binding_id` marker.
2. `:978-981` **lock the exact binding row** — `select * … where id=e.vendor_binding_id for update`.
3. `:982-986` refuse if the marker has no authority row.
4. `:988-992` re-read the counterparty the binding points at.
5. `:994-1059` one snapshot re-reading the **current** latest-done `invoice_facts` + `ocr`
   extractions, the current vendor_name / registration / invoice_id regions, re-evaluating
   `_binding_f3_holds` against the **current** counterparty identity (`:1000-1001`), and computing via
   lateral `bm` (`:1040-1059`) whether **any other live binding** would also match today.
6. `:1061-1066` read the **draft-phase** `vendor_binding_resolutions` row for this entry.
7. `:1068-1077` derive F1 / F2 / the other binding's F2 / `v_binding_live`.
8. `:1079-1136` **re-validate the `vendor_identity` receipt envelope** shape, keys and counters.
9. `:1138-1195` **independently re-resolve the counterparty** from the document's current fields via
   `_resolve_counterparty` (birth / same / different / ambiguous / registration_conflict).
10. `:1197-1224` fold 8 and 9 into `v_binding_reason`.
11. `:1226-1265` first-reason-wins ladder: revoked · expired · not-live · identity drift
    (merged/retired/registration mismatch) · draft-resolution missing or mismatched · no current facts ·
    no current OCR · **another live binding also matches** · other binding's F2 fails · **F1/F2 fail** ·
    **F3 fails** · counterparty mismatch · **unique exact binding match**
    (`coalesce(v_binding_matches,0)<>1 or v_matching_binding is distinct from e.vendor_binding_id`).
12. `:1267-1268` outcome = `bound` iff no reason.
13. `:1269-1277` persist the `phase='post'` resolution row, carrying
    `compared_to_resolution_id = v_draft_resolution` and `entry_revision_token`.
14. `:1279-1283` a non-null reason short-circuits through a named skip.

Steps 8 and 9 are the ones a paraphrase drops and they are load-bearing —
`binding_receipt_unrecognized`, `binding_page_resolves_other` and `binding_uncorroborated` originate
there, not in the ladder.

## E · Refuted candidates

Findings formed and then killed by reading the live lineage. Recorded because a later reader will form
them again.

| # | candidate | why it does not survive |
|---|---|---|
| **R-1** `[N]` | *裁-18a's wall will refuse Clara's proposals and strand single-admin firms* — the hazard design §3.4 and annex G-a exist to prevent. | The wall landed at `0144:375-377` in the actor-comparison form the design asked for; `clara.agent_user_id()` is the fixed literal `00000000-0000-4000-8000-000000c1a7a0` (`0002:334-335`), never equal to a human `c.actor`. **Discharged**, not pending. *(But see §F — this is the same mechanism that makes B1 possible.)* |
| **R-2** `[N]` | *W10's CHECK is illegal because it calls a function.* | `clara.agent_user_id()` is `language sql immutable` reading no relation — a bare `select` of a literal. Legal in a CHECK. Annex E R1's prosrc pin (`0b958c48…`) is the right residual control and should stay. |
| **R-3** `[N]` | *A poisoned invoice can inject a foreign document, or another firm's region, into the basis.* | Refuted at two live walls: the **whole** `p_documents` set is proven real and firm-congruent before any citation is examined (`0143:257-266`); each citation must resolve to a region whose document is `= any(v_docs)` at that document's current done generation (`0143:319-352`). **Provenance is walled. Relevance is not — that is B7, and it is a different hole.** |
| **R-4** `[N]` | *Enabling a third `wake_engine_sources` row invalidates the "idle slot" premise `0138`/`0140` assert.* | Those are prestate reads of the **`close_prep`** row specifically (`0138:298-300`, `0140:255-279`). PR-4 inserts a **different `source_key`**, and the enable is a runtime ceremony, not a migration, so on a fresh rig those prestates still pass. Only M6's rollout half survives. |
| **R-5** `[N]` | *The survey's prosrc pins are all stale because the set was authored at frontier `0142`.* | Only partly: the survey anticipated the hardening batch and carries **both** shas for `sign_vendor_identity_binding` (`binding-proposal-survey.md:69`). Residual is a build instruction (take the post value) plus a re-take of A.5 at `0147` for `list_review_queue`. |
| **R-6** `[N]` | *The derivation and the resolver disagree on which extraction generation is current, so valid citations refuse.* | Same predicate. Derivation `0030:150-156`; resolver `0143:341-345` — both "newest done, per document, per engine_kind". |
| **R-7** `[N]` | *A partial index `where status='proposed' and expires_at > now()` would make the one-open wall self-healing.* | **Illegal** — Postgres requires an IMMUTABLE index predicate and `now()` is STABLE. The escape does not exist, which is why B5 needs an in-door sweep. |
| **R-8** `[C]` | *"The partial unique index closes the gap with no body change."* | Refuted by the propose-vs-sign transition race (B5). |
| **R-9** `[C]` | *"One stable name fingerprint identifies the vendor."* | Refuted — F1 is explicitly stability-only (`0030:29`) and matched by prefix. |

## F · Overturned — two refutations this pass got WRONG

Kept in full rather than deleted, because a gate record that erases its own errors cannot show where
the second reviewer earned his keep.

**F1 · The T2 "ask Clara" path.** This pass originally listed it as a refuted candidate, arguing:
*"mechanically true and deliberate — 裁-18c's named way out, quoted in the refusal message itself. Not
a substantive bypass: the human can only ask; the DB decides."*

**That was wrong on the normative question.** It reasoned from 裁-18c (a narrow ruling about solo
firms) and never reached digest **law 69**, which measures the **directing human** and has a live
precedent in `0084:123`. `[C]` found it; **裁-32 has now ruled in `[C]`'s direction** — a multi-human
firm cannot self-sign a directed proposal. The mechanical half of the original reading was accurate;
the conclusion drawn from it was not. **Lesson: a narrow ruling does not displace a standing law, and
"the owner sanctioned an escape hatch" is not a reason to stop checking which principal a wall
measures.**

**F2 · The eligibility predicate as a robust wall.** The same refutation leaned on the derivation's
ladder — *"three approved, un-reversed, non-rule-posted, document-bearing entries on three distinct
posting dates ≥14 days apart, with a stable ≥8-char LCP … no amount of asking manufactures that."*

**That was wrong twice over.** `[C]`'s **B6** shows the predicate counts *journal entries* and reads
*caller-controlled `posting_date`*, so one document reused three times with backdated postings passes.
`[C]`'s **C1** shows that even a genuine corpus proves only *"these entries canonicalise to this
counterparty"*, never *"these documents came from that vendor"*. **Lesson: a predicate quoted at
length reads as rigorous; count what each conjunct actually constrains, and ask what the whole ladder
proves rather than how many rungs it has.** This is the finding class that produced the gate's only
CRITICAL, and this pass walked past it while quoting the very lines that contained it.

## G · Reviewer attribution summary

| severity | `[N]` only | `[C]` only | both / merged |
|---|---|---|---|
| CRITICAL | — | C1 | — |
| BLOCKER | B2, B3 | B1, B6, B7 | B4, B5, B8 |
| MATERIAL | M1, M2, M4, M5 | M9 | M3, M6, M7, M8 |
| NIT | N1–N4 | — | — |

`[C]` supplied the identity-corpus lens and the separation-of-duties principal — the two places where
the design's own framing ("no model-generated value enters the row"; "Clara proposes, a human signs")
was true and yet insufficient. `[N]` supplied the contract-level defects a cross-model reader working
mostly from the design text would not hit: the unwritable refusal receipt, the wrong resolver
signature, the stale-proposal deadlock, the FK cycle, the receipt read path, and the stale citations in
the frontend delta. Neither pass alone would have produced this fold list.
