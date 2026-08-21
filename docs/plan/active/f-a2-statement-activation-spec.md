# F-A2 Window B — the bank-statement witness ACTIVATION: the spec of record

> Companion to `docs/plan/active/f-a1-witness-pair-design.md` §3.7 and
> `packages/db/migrations/0098_f_a1_statements.sql` (F-A1 PR-4, merged `d618f91`). This document
> is the spec the Window-B build was executed against; it is carried in-repo because the
> migration, the battery and the ceremony all cite it, and a spec that lives only in a scratch
> directory cannot be cited by an immutable artifact.
>
> **Status: live.** §9's open calls are ADJUDICATED (recorded inline). The build is
> `0102_f_a2_statement_activation.sql` + the `statementFacts_v2` registry repoint.

## 0 · TL;DR

Activation is **two artifacts deployed as one window**, in a fixed order:

1. **A DB migration** recutting the SAME wb-0020-pinned `clara._enqueue_invoice_facts_core(uuid)`
   body F-A1 PR-3's cutover already recut once — changing exactly **one engine literal** in the
   `bank_statement` classification arm (the retiring Azure snapshot → the witness statement
   snapshot) and re-keying the statement typed-consent lookup's `purpose` literal from
   `statement_extraction` to `witness_extraction`. **`v_lane` stays `statement_facts`** — untouched
   (0098's own LANE DECISION, §7).
2. **The runtime registry repoint** — `statementFacts:` in `packages/runtime/workflows/registry.ts`
   moves from `statementFacts_v1` to the already-built, already-frozen, already-deployed-but-inert
   `statementFacts_v2` (shipped in PR-4's image: "BUILT, FROZEN and UNPOINTED").

Both land inside **one D1 write-quiesce window**, in that order — not because either step alone
is unsafe, but because the gap *between* them is: a router minting witness-stamped statement
tasks while the OLD image (`statementFacts_v1`, still Azure-shaped) still claims the
`statement_facts` lane is a correctness hazard the design does not cover (§5). 0098's own text
proves the **mirror-image** gap is already guarded (a repointed image meeting Azure-stamped tasks
WAITS); the router-arm-before-repoint gap is the one this spec closes procedurally.

## 1 · What was UNPOINTED, named exactly

| Artifact | State before activation | What activation does |
|---|---|---|
| `clara._persist_statement_core_v2` (0098 §3) | LIVE, reachable only via `persist_statement_facts_v2` | Untouched — already the write path once tasks reach it |
| `clara.persist_statement_facts_v2(uuid,jsonb)` (0098 §4) | LIVE, granted to `clara_runtime` | Untouched — already callable |
| `statementFacts.v2.*` runtime files | Built, frozen, deployed in the live image | Nothing to build — only the registry pointer moves |
| `registry.ts`'s `statementFacts:` entry | Points at `statementFacts_v1` | **Repointed to `statementFacts_v2`** |
| the router's `bank_statement` arm | `v_lane:='statement_facts'; v_engine:='azure-di:…';` | `v_engine` → the witness snapshot; `v_lane` unchanged |
| the statement typed-consent lookup | `a.purpose='statement_extraction'` | → `a.purpose='witness_extraction'`, **same refusal codes** (`statement_multi_client` / `consent_inactive`) |
| `GOVERNED_EGRESS_PURPOSES` (`egress.mjs`) | already both purposes | No change — `statement_extraction` is never dropped |
| the wb-0020 restore pairs | carry PR-3's + opener ②'s layers | Gain a Window-B layer, reversed outermost-first |

**What does NOT move:** the `statement_facts` lane (§7), the page-budget reservation (statements
keep it — 0098's "PAGE BUDGET — NO LAPSE HERE"), and the already_completed engine_kind map for
statements.

## 2 · The migration

Splice discipline, verbatim in shape from the PR-3 cutover: read the LIVE body via
`pg_get_functiondef`, assert the target substring occurs **exactly once**, `replace()` only there,
execute the result. Anchors are **whole blocks, comment included**, so the wb-0020 reversal can
carry the comment back.

**Prestate** measures every claim: the target exists exactly once; 0098's persist half is live
(read by **signature**, never by migration number); the lane↔engine prefix CHECK already admits
`llm-%` on `statement_facts` (discovered by shape); neither half is already applied; both splice
anchors are unique; and the whole prosrc is **sha-pinned** to the body the F-A2 openers' part-1
migration prints as its handoff.

**The prestate pin (§9 item 4, ADJUDICATED — whole body).** The pin is the openers' printed
handoff value, not the PR-3 post-state. A mismatch means either that migration did not apply
first or the body moved: **the ceremony stops**. The anchor-uniqueness counts stay the
load-bearing guard; the sha is the tripwire that the base is the body those anchors were verified
against. The ordering is *also* checked fact-driven — the prestate reads the invoice arm's `:v2`
engine literal, which only opener ② produces — because migration numbers are claimed at merge and
a name check would pin a filename.

**D1 write-quiesce: OWED.** `_enqueue_invoice_facts_core` is a live hot-path body (every document
classification reaches it). The file carries its own quiesce guard, fail-closed on an absent
heartbeat table.

**REGISTERED SIDE EFFECT.** The consent branch opens
`if v_lane in ('statement_facts','statement_parse')` — **one branch, two lanes** — so the free
LOCAL csv/ofx parse now answers to `witness_extraction` too, though it egresses nothing. This is
what 0098's deferral contract asks for (it names "the statement typed-consent arm", whole); it is
not a new oddity (the csv lane was already gated on an egress purpose); and live impact is nil
because the PR-3 ceremony already activated `witness_extraction` for every live client. **Owner
call, recorded not taken:** whether the local csv lane should eventually get its own non-egress
gate.

## 3 · In-flight discipline at the flip

- A task **already `running`** when the window opens: quiesced by the write-hold itself — an
  in-flight PL/pgSQL call runs to completion on the body it started with.
- A task **`queued` with the OLD Azure engine_id**, still queued when the window closes: claimed
  post-window by `statementFacts_v2` (the registry points the whole lane at v2 regardless of any
  one task's stamp). `assertStatementEngineStamp` compares the task's stamp against the image's
  snapshot BEFORE any egress and **WAITS** — it does not misfire and does not crash. Lane
  `statement_facts` deliberately keeps `azure-%` admissible so that backlog stays storable.
  **Operationally:** count the queued backlog immediately before opening the window; drain if
  large, else accept the bounded wait (it occupies the shared `ocr_concurrency` window). A
  judgement call, never a blocker — worst case is a delayed statement, never a wrong one.
- A task enqueued **after** the router re-key but **before** the repoint — the gap §5 closes.
  `statementFacts_v1` does not consult the task's engine_id at all; it is hardcoded to the Azure
  call. **No DB-side guard exists for this direction**, unlike its mirror. Closed procedurally.

## 4 · The bank running-balance CHAIN requirement (digest law 14 / C3)

Carried, not weakened, by bytes already in 0098 — no new work at activation.
`_persist_statement_core_v2` is spliced off the catalog from the live ancestor, and its
prestate/postcheck pin the chain-lock call and **both** continuity edges; the refusal ORDER is
asserted POSITIONALLY in 0098's tail census; the per-row printed running-balance check is
inherited through the two-reader flag, which the witness arm sets exactly as the legacy OCR arm
did. Activation changes **which engine mints the task and which workflow persists it** — it does
not touch that body at all.

## 5 · Ceremony shape — what the ONE window must contain

Mirrored on the proven F-A1 PR-3 ceremony recipe:

1. Sleeper machine on the backup image, DSN captured env-to-env.
2. **Pre-quiesce tripwire:** with the runtime still up, read the live frontier and sha-pin
   `_enqueue_invoice_facts_core`'s CURRENT prosrc **via a rig replay, never a name-grep** — the
   PR-3 lesson: provenance of a live body is measured by replay. A mismatch aborts before the stop.
3. **D1 OPEN:** stop the runtime machine, wait for heartbeat staleness (>90s).
4. Apply the migration — prestate/tail notices green; **read the coverage verdict** (§6).
5. **Redeploy the runtime image carrying the registry repoint.** The image is built and
   smoke-verified BEFORE the window; this step is the restart onto it, not a fresh build.
6. Positive-read probe (§8).
7. **D1 CLOSE:** runtime restarted, `/ready` 200, sleeper destroyed, zombie-session sweep
   (`pg_terminate_backend` on idle `clara_runtime_login` sessions after any hard restart).

**Why steps 4 and 5 are inside the SAME window (§9 item 1, ADJUDICATED — binding ceremony rule):**
the runtime machine stays **STOPPED across both**, so no claim can occur in the gap. This is
procedural, not a code fix, and it is stated as a rule with the same force as the D1 obligation.

**Bundling:** Window B runs **AFTER** Window A (the F-A2 openers + the witnessFacts.v2 image) —
never bundled. ⑤ (zombie-session sweep) is standard ceremony hygiene at step 7.

## 6 · Consent posture — no new surface, but coverage must be READ

`clara.client_egress_purpose_activations` is keyed strictly on `(firm_id, client_id, purpose)` —
no lane, document_kind or engine column anywhere in the key — so the `witness_extraction`
activations already on file from the PR-3 ceremony satisfy the re-keyed lookup for **any**
enqueue, regardless of which document_kind or lane triggered it. **No additional consent
declaration, grant, or activation op is required by the migration itself.**

**But coverage is a per-client question, and the read must be able to say NO.** A global "does
anyone hold `witness_extraction`" count answers YES the moment one client does, and stays silent
about every *other* client holding a live `statement_extraction` activation and no witness one —
exactly the clients who lose **both** statement lanes at the flip (their enqueues settle terminal
`consent_inactive`). The ceremony read is therefore a **set difference**, and complete coverage is
**zero rows**:

```sql
select a.firm_id, a.client_id
  from clara.client_egress_purpose_activations a
  join clara.client_egress_purpose_consents c
    on c.id=a.consent_id and c.firm_id=a.firm_id and c.client_id=a.client_id
   and c.purpose=a.purpose
 where a.purpose='statement_extraction'
   and a.deactivated_at is null and c.revoked_at is null
   and not exists (
     select 1 from clara.client_egress_purpose_activations w
       join clara.client_egress_purpose_consents wc
         on wc.id=w.consent_id and wc.firm_id=w.firm_id and wc.client_id=w.client_id
        and wc.purpose=w.purpose
      where w.firm_id=a.firm_id and w.client_id=a.client_id
        and w.purpose='witness_extraction'
        and w.deactivated_at is null and wc.revoked_at is null);
```

The migration's tail runs exactly this and **names every uncovered client** by `(firm_id,
client_id)`. It does **not** hard-fail the apply: this is a DATA state the ceremony adjudicates
(grant+activate for the named clients, or deliberately accept the pause), not a schema state. The
battery proves the query both ways — rows on an inverted fixture, zero on a covered one — because
a check that has only ever returned zero has not been shown able to return anything else.

## 7 · THE LANE DECISION, and the coin-flip heal

**The lane does not move,** and 0098 ruled it rather than leaving it implicit:
`clara._invoice_fact_state` resolves the WITNESS regime by `t.lane = 'llm_witness'`, so a
statement pair on that lane would be resolved by the INVOICE cross-regime dispatcher and reach the
duplicate-bill / sales walls; and `witnessFacts.v1`'s `ownsWitnessLane()` claims every
`llm_witness` task BY LANE ALONE and would read a bank statement with invoice prompts. Cost of the
choice, stated: `statement_facts` shares the `ocr_concurrency` window rather than getting its own.

**The coin flip** (the legacy statement pair self-superseding under one shared `engine_kind` with
a uuid tie-break) heals **partially, by construction, going forward**, and the scope is precise:

- **the witness arm** — closed BY CONSTRUCTION and already live since PR-4: its two rows land
  under two DIFFERENT kinds, so the kind-scoped supersede trigger can never pair them, and the arm
  uses `clock_timestamp()` with a floor rather than the ancestor's implicit `now()`;
- **the legacy structured/human arms** — never at risk (they never mint a two-reader pair);
- **the legacy OCR arm** — **NOT fixed by activation.** That body is byte-frozen and, per the
  workflow/writer-immutability law, cannot be. What activation removes is the **only live path
  that still mints new tasks onto it**. So activation closes the defect for all NEW statement
  extractions **by removing the last minting path, not by fixing the trigger or the ancestor** —
  a materially different mechanism from PR-1's structural kind-scoping fix, stated precisely so a
  reader skimming "heals at re-kinding" cannot assume the ancestor itself was repaired;
- **historical rows** — never repaired; `superseded_by` is one-way once-only.

**Net: activation is the step that makes the heal reach production traffic.** PR-4 shipped a
healed write path nothing was routing through.

## 8 · Battery + the ceremony positive-read list

**Battery:** the router re-key's pre/post splice assertions (every arm the file does not name
re-asserted); `f-a2.activation-engine-literal` — the migration's literal string-equals the
runtime's `STATEMENT_WITNESS_ENGINE_SNAPSHOT.engineId`, **both sides read independently**; the
consent re-key with its **negative twin** (a `statement_extraction`-only activation now REFUSES,
proving the literal MOVED rather than the check widening to accept either); the coverage
set-difference both ways (§6); the csv/ofx side effect, refusal and admit sides; the wb-0020
restore-pair inverse; and — **the highest-value cell** — a task enqueued PRE-migration
(Azure-stamped, queued) claimed POST-migration+repoint **WAITS** at the provenance guard rather
than egressing or crashing, proven by what the run DID (zero model calls, no settle, no metering,
no authorization consumed).

**Ceremony positive reads:** live frontier includes the claimed number · the live prosrc carries
the witness literal in the `bank_statement` arm and NOT the Azure one (byte read, not name-grep) ·
the consent lookup reads `witness_extraction` · `statementFacts:` resolves to `_v2` **in the
deployed bundle** (in-VM grep) · the §6 coverage set difference returns zero rows · a live smoke
enqueue classifies to `bank_statement` and mints a witness-stamped task · `/ready` 200 · zero
stale `clara_runtime_login` sessions post-restart.

## 9 · Open calls — ALL ADJUDICATED

1. **The router-arm-before-repoint gap.** *Ruled:* one uninterrupted D1 window, runtime machine
   held STOPPED between the apply and the repoint deploy. Binding ceremony rule (§5).
2. **Pre-window queued backlog size.** *Ruled:* not a blocker. The migration's tail COUNTS and
   prints it at apply; the ceremony reads it before opening and drains if non-trivial.
3. **Whether the openers' runtime work rides the same image as the repoint.** *Ruled:* Window B
   runs AFTER Window A, never bundled.
4. **Whole-body sha pin.** *Ruled:* yes — pin the whole prosrc, against the openers' printed
   handoff, and state the refusal's meaning plainly (§2).
5. **The coverage read** (added at review). *Ruled:* per-client set difference, printed
   unmissably, never a hard failure (§6).
