# Wave 3 · lane 02 · ticket #982 — resolve a trade-invoice counterparty by TIN

**Branch** `riders/w3-lane02` · **base** `ffe63a0dd084e99b84c1368119845be273c421ce`
**Worktree** `C:\Users\zhant\Desktop\clara-wt\636` · **database** `clara_l02` (127.0.0.1:55742)
**Status: DONE.** Every acceptance criterion the brief owns is closed on the database and web
halves; the conversation half is delivered as a successor contract, per the wave ruling.

## Commits (`git log --oneline ffe63a0d..HEAD`)

| commit | what |
|---|---|
| `6629e2af5` | `feat(db): #982 a trade-invoice party resolves by its TIN (0274, slice 1)` |
| `e1a9ab635` | `feat(db): #982 a TIN two live parties hold refuses with both (0274, slice 2)` |
| `fdb266fdd` | `feat(db): #982 a registration/TIN clash refuses with both sides (0274, slice 3+4)` |
| `536c5df5c` | `feat(runtime): #982 the identifier conflict is the counterparty box's error (slice 5)` |
| `18a84e220` | `feat(web): #982 the chooser shows each candidate's TIN, and answers the identifier conflict` |
| `2b9ebd839` | `fix(web): #982 spell the ticket out in three test titles, so the colour rule stays strict` |

Nothing was pushed, no PR was opened, no GitHub issue was touched. No other worktree was read or
written; the only file written outside the worktree is this report.

## The ticket was still live on this branch

- `clara._trade_invoice_resolve_party` was 0225's body verbatim on `clara_l02`
  (`sha256(prosrc) = 4967217e…`), and no migration between 0226 and 0272 names it
  (`grep -rln "_trade_invoice_resolve_party" packages/db/migrations/` → only `0225_trade_invoices.sql`).
- Measured red on the rig before any code: a submission whose only identifier was a TIN left as
  `CLR10` / `party_unresolved` — *"no vendor of this client answers to C55337894603"*.
- `apps/web/components/accounting/trade-invoice-form.tsx`'s candidate mapping built
  `{counterparty_id, name, registration_no}` and dropped `tin`, exactly as the owner's ruling
  corrected the ticket's own list.

## The seams I tested at (written before the first test, WORK-ORDER rule 4)

1. **`clara.admit_trade_invoice_work`**, driven as `clara_runtime` (the one role that holds it),
   read back through `clara.trade_invoices`. `clara._trade_invoice_resolve_party` is an ungranted
   internal — 0225's own tail asserts that — so no cell calls it directly.
2. **`TRADE_INVOICE_FIELD_DEFAULTS` + `workErrorResponse`** in `packages/runtime/src/workRoutes.ts`
   (both exported for exactly this).
3. **`TradeInvoiceFormView`'s rendered behaviour** through its injectable `submit` seam.
4. **The browser walk** `apps/web/e2e/trade-invoice-walk.spec.ts`, driving the real built app and
   the real same-origin proxy against the lane's mock runtime.

## The slices, each red first

| # | cell | the red I measured | the code that turned it green |
|---|---|---|---|
| 1 | `p982.tin.resolves` | `CLR10` / `party_unresolved`: *"no vendor of this client answers to C55337894603"* | 0274's joint identifier tier; the TIN arm resolves on a single live match |
| 2 | `p982.tin.ambiguous` | `expected detail.reason="party_ambiguous" … got {"reason":"party_unresolved"}` | the arm counts first and, above one, raises `party_ambiguous` with both candidates |
| 3 | `p982.tin.conflict` | *"expected SQLSTATE CLR10 but the call SUCCEEDED"* — the door silently preferred the registration number | the `party_identifier_conflict` arm, carrying both sides |
| 4 | `p982.tin.agree`, `.kind_scoped`, `.id_wins`, `.normalised` | characterisation (green on first run) — see the vacuity control below | — |
| 5 | `982.route` | `field` was `basis`, not `invoice.counterparty` | one more row of `TRADE_INVOICE_FIELD_DEFAULTS` |
| 6 | `ticket 982 — the chooser shows each candidate's TIN…` | neither TIN on screen | the mapping keeps `tin`; the chooser renders `Reg. …` / `TIN …` |
| 7 | `ticket 982 — party_identifier_conflict is a banner…` | the banner rendered the bare key `TradeInvoice.refusals.party_identifier_conflict` | the message, and the same banner + chooser |
| 8 | the walk's two cells | (extension of a green cell + a new cell) | — |

**One regression I caused and measured, rather than reasoned about.** The conflict test was first
written as a single conjunction, `if v_reg_hit and … and lower(regexp_replace(v_reg_row.tin …))`.
PostgreSQL does not promise to short-circuit `and`, so every submission carrying no registration
number raised `55000` *"record v_reg_row is not assigned yet"* and `p982.tin.resolves` went red.
The test is now nested inside `if v_reg_hit …`, and the file records why.

**Vacuity control for the slice-4 characterisation cells.** `cp.kind = v_want` was removed from the
TIN arm only (count and read), the broken body committed to `clara_l02`, and the battery re-run:
exactly `p982.tin.kind_scoped` went red and the other six stayed green. The body was then restored
byte for byte by `CLARA_MIGRATION_REDO=0274_trade_invoice_party_tin` (live
`sha256(prosrc) = be2df90e5899a1692682d843e6967be828952b3e42f3b09fe317437677db7cf8`, battery 7/7).

## Acceptance criteria, each with its evidence

| AC | evidence |
|---|---|
| A submission carrying only a TIN resolves when exactly one live, unmerged counterparty of the required kind holds that TIN | `p982.tin.resolves` — green; a second vendor with no TIN exists in the cell, so it proves a match rather than "there is only one row". The arm filters `merged_into is null and retired_at is null`. |
| A TIN matching more than one live counterparty refuses with the candidates rather than choosing one | `p982.tin.ambiguous` — `CLR10` / `party_ambiguous`, two candidates, both ids as expected, each carrying its `tin`. The `refusesTi` wrapper also proves no Work, invoice, entry or committed receipt was written. |
| A TIN and a registration number each matching a different live counterparty refuse with a reason distinct from `party_unresolved` and `party_ambiguous`, carrying both candidates | `p982.tin.conflict` — `CLR10` / `party_identifier_conflict`, two candidates, `matched_on` reading `registration` and `tin` on the right ones. |
| A submission naming a counterparty id, or whose identifiers agree, keeps its present outcome and refusal text | `p982.tin.id_wins` (id arm returns before the identifier tier), `p982.tin.agree` (identifiers agreeing resolve, **and** a TIN that reached nobody is not a disagreement), plus the whole #655 battery unchanged: `trade-invoice.test.mjs` 30/30 green after the recut. The `party_unresolved` and `party_ambiguous` detail shapes are byte-identical to 0225's (I deliberately reverted an early addition of `tin` to the `party_unresolved` detail). |
| The chooser shows each candidate's TIN, for the new refusal and for `party_ambiguous` | `ticket 982 — the chooser shows each candidate's TIN beside its registration number` (unit) and the walk's `a refused party renders its candidates INLINE…`, whose second candidate now has **no** registration number, so its TIN is the only thing that tells it apart; and `ticket 982 — an identifier conflict names what disagreed and offers BOTH parties` (walk) asserting `Reg. 200101065565` and `TIN C65565565652` on screen. |
| The resolver recut ships as a new migration at the next free number; no applied migration is edited | `packages/db/migrations/0274_trade_invoice_party_tin.sql` (new). `0225_trade_invoices.sql` is untouched — `git show --stat` on every commit shows no migration but 0274. |
| `start_trade_invoice_work` names the TIN key and the new refusal in its successor contract; the frozen `chatTurn_v21` body is untouched | the successor contract below; `node scripts/check-frozen-workflows.mjs` → *OK — 312 frozen file(s) verified … no manifest diff*. |

## The migration

**`packages/db/migrations/0274_trade_invoice_party_tin.sql`** · applied checksum
`2ecb37de67d8b827d365a87a5c3ef01010d56cc69bc6433f4f7ef72e63330cb7` · stem `trade_invoice_party_tin$`.
It recuts **exactly one body** and creates **one index**; no table, column, trigger, policy or grant
moves, and no other function is created or recut.

### Prestate pins (all MEASURED on `clara_l02` at `0272_document_capability_wall_completion`, 267 files)

| signature | `sha256(prosrc)` | role in this file |
|---|---|---|
| `clara._trade_invoice_resolve_party(uuid,text,jsonb)` | `4967217e8d413f3f58d935aea966764a91c42afc2c15342e8bfcfe2a23a7a0a8` | **RECUT.** Marker-tolerant: a body already carrying `#982` is the supported #957 redo. |
| `clara.admit_trade_invoice_work(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text)` | `c1693503fa0221de53af2e1ddfe716c2baa9c3e3d82c14e02007a04c45d70f5c` | the ONE caller (twice: step 5 and step 7 under the rung). Re-pinned in the tail. |
| `clara._canonical_counterparty(uuid,uuid)` | `bbbe4a5e9ba57da93f162c74777b5c780a98b64445054291426593b47b3852b4` | the id arm, carried over verbatim, reads it. |
| `clara.create_counterparty(uuid,text,text,text,text,text)` | `797f4675e1a4cab726be138ce3932940e4ec17e6c46cfabce5f6feadaff2dc5d` | the identifier normalisation this file mirrors byte for byte (0021:99-101). |
| `clara.set_counterparty_identifiers(uuid,uuid,text,text,text)` | `451a03bf2d4b43adea4a3ececb321b5cb2f0a912a6c8e67a779f1b29b441c51f` | the other writer of `clara.counterparties.tin`, and the second copy of that normalisation (0215:965-967). |

Non-sha premises the prestate also pins: `clara.counterparties.tin` exists, and
`uq_counterparties_client_registration` exists — the partial unique on
`(client_id, kind, registration_normalized)` that makes the registration arm's *at most one live
match* true and the ticket's "several parties share one registration number" carve-out unreachable.
**Integrator: the resolver pin is the one another lane could move.** Its post-image is
`be2df90e5899a1692682d843e6967be828952b3e42f3b09fe317437677db7cf8`.

### The first-apply branch, proved separately (wave-3 addendum)

A marker-tolerant pin hides its sha branch from a redo, so I proved the other branch by hand:
inside one transaction, 0225's own `create function` statement for the resolver was re-run (which
restored `prosrc` to exactly `4967217e…`, printed by the script), the `do $t982_pre$` block was run
**verbatim**, and it reported `#982 prestate: clean` **without** the redo notice. The transaction
was rolled back; the live body afterwards is `be2df90e…` and still carries the marker. The
from-scratch chain proof on a disposable cluster remains the integrator's.

### Redo trail (#957)

The migration was applied once and redone three times as the slices grew, plus once to restore the
deliberately broken body: `CLARA_MIGRATION_REDO=0274_trade_invoice_party_tin pnpm db:migrate`, with
`CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1`. Each redo printed the prestate's REDO branch and the
tail's OK. A final plain `pnpm db:migrate` reports `0 new migration(s) applied · 268 total`, so the
file on disk matches the applied checksum.

### The data-dependent branch

The tail has no row-count branch. The ONE data-dependent path in the change itself — a TIN held by
more than one live party — was entered on this database before the last redo, because
`p982.tin.ambiguous` creates exactly that state through `clara.create_counterparty`, the estate's
own door. Both branches of the conflict test (registration row holds the TIN / does not) are
entered by `p982.tin.agree` and `p982.tin.conflict`.

### The resolution order after 0274

| submitted | live parties of the wanted kind | outcome |
|---|---|---|
| counterparty id | — | 0225's outcome, whatever the TIN says |
| TIN only | exactly one holds it | resolves |
| TIN only | two or more hold it | `party_ambiguous`, candidates carried |
| registration + TIN | the registration-matched row also holds the TIN | resolves to it |
| registration + TIN | the TIN reached nobody | resolves by registration (0225's outcome) |
| registration + TIN | each reached a DIFFERENT live party | `party_identifier_conflict`, both carried |
| name / alias | — | 0225's arm, untouched |

**Why the TIN is normalised.** The estate has exactly one identifier normalisation,
`lower(regexp_replace(v,'[^a-zA-Z0-9]','','g'))`, byte-identical in `clara.create_counterparty`,
`clara.set_counterparty_identifiers` and the resolver's registration arm. The ruling puts the TIN
on that same tier, and a MyInvois TIN is printed with spaces and dashes exactly as a registration
number is (`p982.tin.normalised` drives `C 6556-5565651` against a stored `C65565565651`). There is
no `tin_normalized` COLUMN, so the arm normalises both sides at read time and
`ix_counterparties_client_kind_tin_normalized` — a partial expression index over live, unmerged
rows — keeps that an index scan rather than a sweep of every firm's parties, twice per admission.
0215's cross-client identity watch still compares `o.tin = cp.tin` raw and is **not** changed: it
answers a different question. That asymmetry is named in the file and filed as a follow-up below.

## Gates, with counts

| gate | command | result |
|---|---|---|
| db, files I added or touched, FULL gate chain | `node --test --test-concurrency=1 $GATES tests/trade-invoice-party-tin.test.mjs tests/trade-invoice.test.mjs` | **37 tests · 37 pass · 0 fail · 0 skipped** |
| db, census + isolation (no reset flags) | `… $GATES tests/operation-census.test.mjs tests/rig-isolation.test.mjs` | **33 tests · 32 pass · 0 fail · 1 skipped** — the skip is `T19 poison-role`, which needs `CLARA_RIG_ALLOW_RESET`, forbidden by RIG.md |
| runtime unit | `node --test tests/work-routes-unit.test.mjs tests/trade-invoice-unit.test.mjs tests/chat-turn-v21-tools.test.mjs` | **78 tests · 78 pass · 0 fail** |
| frozen closure | `node scripts/check-frozen-workflows.mjs` | OK — 312 frozen files, no manifest diff |
| parts parity | `node packages/runtime/scripts/check-parts-parity.mjs` | OK |
| typecheck | `pnpm typecheck` | exit 0 |
| lint, as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` | exit 0 (it failed first — see below) |
| whole web unit suite | `node scripts/run-tests.mjs` from `apps/web` | **4848 tests · 4846 pass · 0 fail · 2 skipped** — both skips are the live-Supabase-auth cells (`CLARA_LIVE_SUPABASE_AUTH_URL` unset), unrelated to this ticket |
| browser walk | `pnpm --filter @clara/web e2e trade-invoice` | **13 passed** (was 12 cells before this ticket) |

**The lint gate caught a real thing, on the second run.** `CI=true GITHUB_ACTIONS=true pnpm lint`
failed on two new test titles: the raw-colour rule cannot tell `#982` from a hex literal — any `#`
followed by three hex-looking characters trips it, which the rule's own message documents as ticket
994's known case, and the fix it prescribes is to reword the string, never to weaken the rule.
Three titles now read `ticket 982 — …`, and the walk was re-run after the retitle.

**Deviation: the walk ran on 3610/3611/3612, not lane 02's 3510/3511/3512.** All three of my
assigned ports were held by an abandoned e2e run in this worktree — `pnpm --filter @clara/web exec
playwright test` (pid 51192) with `e2e/serve-built.mjs` (45404) and `next start --port 3511` (43092),
all started **2026-09-20 07:22**, ~16 h before this session, the CLI holding 14 s of CPU and 16 KB
of working set, i.e. stuck rather than progressing. The work order forbids killing a process I did
not start, so I did not; I verified 3610-3612 were unbound (`netstat -ano`) and ran there. Those
ports belong to no lane in RIG.md (lane 11 ends at 3602). **The orchestrator should reclaim lane
02's triple before the next lane-02 worker.**

## Docs, in the same commits

- `packages/db/README.md` — a new `## 0274 — a trade-invoice party resolves by its TIN (#982)`
  section: the resolution table, the normalisation argument and its index, the nested-`if` finding,
  the redo/first-apply proof, and the frontier triad.
- `packages/runtime/README.md` — the `TRADE_INVOICE_FIELD_DEFAULTS` paragraph now reads *rows*, and
  names `party_identifier_conflict` as the second one; the note that it needed no arm at all.
- `apps/web/README.md` — a new paragraph under the trade-invoice section on the dropped `tin`, the
  labelled identifiers, and why the new refusal shares the banner and the chooser.
- `CONTEXT.md` — one new term in the house `term / _Avoid_` shape, **Identifier conflict**, placed
  beside `Counterparty identity` (a minimal hunk in a file nine other lanes are editing).

Shared files touched, each with the smallest possible hunk: `CONTEXT.md` (one term),
`apps/web/messages/en.json` (three keys, at their sorted positions), `packages/db/package.json`
(one `--import` token, appended in migration order after 0271's). `apps/web/test/manifest.txt` is
untouched — this ticket adds no web test file.

## Successor contract — `start_trade_invoice_work`, for the ONE shared cut `chatTurn_v22` / `claraWork_v6`

`packages/runtime/lib/trade-invoice-basis.ts` is in the frozen closure (`frozen-workflows.json:94`)
and `packages/runtime/workflows/chatTurn.v21.tools.ts` imports its schema and refusal map. **Nothing
in either file was edited.** The successor must carry the following, and nothing else changes on
this tool.

**Name** — `start_trade_invoice_work`, unchanged. **Part kind** — unchanged: a trade-invoice Work's
purpose is `journal_entry`, already in frozen `WORK_ACCEPTED_PURPOSES_V19`, so the `work_accepted`
part needs no widening and `check-parts-parity.mjs` stays green (verified green on this branch).

**1 · zod input.** `tradeInvoicePartySchema` keeps its four optional keys and its `.strict()`. Only
the `tin` key's `.describe()` changes, because the current text is now false:

```ts
    tin: z
      .string().trim().min(1).max(64).optional()
      .describe(
        "The tax identification number the document states, if it states one. IT RESOLVES THE "
        + "PARTY, at the same tier as the registration number (migration 0274): the door matches "
        + "it against this client's live counterparties of the required kind, after normalising "
        + "both sides the way a registration number is normalised. A payload whose only "
        + "identifier is a TIN resolves when exactly one live party holds it; several holders "
        + "leave as party_ambiguous with the candidates, and a TIN and a registration number "
        + "naming different live parties leave as party_identifier_conflict with both.",
      ),
```

**2 · Door call, argument order unchanged** —
`clara.admit_trade_invoice_work(p_client, p_author, p_intent_key, p_kind, p_particulars, p_basis, p_basis_origin, p_source_refs, p_model)`.
`p_particulars.counterparty` still carries `{id?, name?, registration_no?, tin?}`;
`tradeInvoiceFromInput` needs no change.

**3 · Refusal mapping.** `TRADE_INVOICE_REFUSALS` gains a **nineteenth** token; the eighteen
existing sentences stay byte-identical (the `party_ambiguous` sentence in particular must NOT be
reworded — the database now raises it for a TIN as well as a name, and the web surface renders its
own string):

```ts
  party_identifier_conflict:
    "The registration number and the tax identification number on this document name two "
    + "different parties. Say which one it is.",
```

That sentence is already live in `apps/web/messages/en.json` under
`TradeInvoice.refusals.party_identifier_conflict`; the successor must match it, as the file's own
rule says ("These strings are the SAME in the migration, in this module and in the stanza").
`isTradeInvoiceRefusalReason` needs no change — it reads the map's own keys.

**4 · The refusal's typed detail**, for a stanza that wants to render it:
`{reason, registration_no, tin, expected_counterparty_kind, candidates[]}`, where each candidate is
`{counterparty_id, name, registration_no, tin, matched_on}` and `matched_on` is `"registration"` or
`"tin"`. `party_ambiguous` raised for a TIN carries `{reason, tin, matched_on:"tin",
expected_counterparty_kind, candidates[]}` (no `name`), and raised for a name is unchanged.

**5 · Prompt stanza.** Two edits to the trade-invoice stanza, both factual:
- where it lists what resolves a party, say that the TIN resolves it at the registration number's
  own tier, and that Clara should pass the TIN whenever the document prints one — LHDN MyInvois
  requires the buyer TIN and BRN;
- the refusal-map sentence must read **NINETEEN tokens**, and must not collapse
  `party_identifier_conflict` into `party_ambiguous`: one reason names one thing. When it fires,
  Clara shows both parties and asks which the document is about; she never picks an identifier.

**Nothing in `claraWork` changes.** The conflict is refused AT ADMISSION, before a task exists, so
no mid-run question shape is needed — the same argument D12(a) makes for `party_ambiguous`.

## Follow-ups worth filing

1. **No `tin_normalized` column.** The resolver normalises at read time while 0215's cross-client
   identity watch compares `o.tin = cp.tin` raw, so "the same TIN" means two slightly different
   things in two places. A stored normalised column (written by the two identifier doors, like
   `registration_normalized`) would make them agree and let the index drop its expression.
2. **`matched_on` reaches the browser and nothing renders it.** The door raises it and
   `PartyCandidateWire` declares it; the chooser shows only the identifiers. Labelling which
   identifier reached each candidate would make the conflict banner self-explaining.
3. **The party PICKER (not the chooser) still shows only the registration number**
   (`trade-invoice-form.tsx`, the counterparty filter list). The same MyInvois argument applies, but
   it is outside this ticket's AC.
4. **Nothing constrains a TIN to one live party.** The estate holds a partial unique for
   `registration_normalized` and none for `tin`; whether duplicate live TINs should be refused at
   the identifier doors, or only surfaced, is a product question this ticket deliberately left open
   (it refuses at resolution time instead).
5. **Lane 02's e2e triple is held by an abandoned run** (see the deviation above).

## Anything unverified

- The arm was proved on `clara_l02` and in the browser walk against the lane's mock runtime. **No
  hosted database or deployment was touched**, and nothing here has been seen against real firm data.
- The **from-scratch** chain (0001 → 0274 on a disposable cluster) is the integrator's proof; I ran
  only the incremental apply and four redos on an already-migrated lane database.
- The **successor contract is a specification, not verified code**: by construction no cell drives
  `start_trade_invoice_work` with a TIN, because its module is frozen. The runtime half that IS
  verified is the HTTP responder (`982.route`) and the wire mapping the browser walk drives.
- The e2e walk proves the SCREEN, not the door: its runtime is `trade-invoice-mock.mjs`. The door's
  behaviour is proved only by the db battery, which drives `clara.admit_trade_invoice_work` itself.
- `operation-census` and `rig-isolation` were run although this file adds **no** SQL function (it
  recuts one and adds an index); their green is evidence that the recut moved no grant, not that a
  new door was attributed.
