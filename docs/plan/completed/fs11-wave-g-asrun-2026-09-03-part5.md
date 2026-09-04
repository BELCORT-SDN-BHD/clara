*Part 5 of 6 of the FS-11 Wave-G factory-reset as-run (2026-09-04) — the lead's as-run record, written at the final clock-out truing. Previous: `fs11-wave-g-asrun-2026-09-03-part4.md` · Next: `fs11-wave-g-asrun-2026-09-03-part6.md`.*
*Parts 1–3 are the step TEMPLATE, written before the ceremony opened. Parts 4–6 are the AS-RUN, transcribed from the lead's own as-run notes; every stamp, id and count is transcribed and nothing is derived. Where the notes are silent, the line says "not recorded".*

# FS-11 · Wave-G factory reset — AS RUN, step 15 and the product walk's first half (裁-180 · 裁-181 · 裁-182 · 裁-183)

**Window:** 03:11:01 → 05:02 MYT 2026-09-04. Every figure below was read from the DATABASE or off
the product's own page, never from a chat reply (constraint 2). Refusals are recorded as refusals
with their code and receipt; nothing was pushed past a wall. The bank lane, the close, the reports
and steps 17–19 continue in part 6.

---

## Step 15 · the pre-walk reads

| read | stamp | result |
|---|---|---|
| **15.0** `clara.stripe_event_problems where resolved_at is null` (the 裁-147 manual line) | 03:11:01 | **0 rows — EMPTY.** The table's columns are `id, event_id, problem, detail, noticed_at, resolved_at, resolved_by, resolution`; the template's `kind` is `problem` |
| **15.4-pre** `report_artifacts` | 03:11:27 | **0**, before any render |
| client roster after seed | 03:11 | Meridian Logistics + Sunrise Retail (Alara) · Highland Coffee (Borneo). **The constraint-13 fixtures — ROME PROPERTIES `e2b0f365…`, ROME SECRETARY `e054b797…`, BEE CREATIVE SOLUTION, ROME PUBLIC ADVISORY — went with the schema and must be re-onboarded** |
| **15.3 OPS.x** `node packages/runtime/scripts/check-parts-parity.mjs` at `ba8e7d35` | 03:12:37 | `parts-parity: OK — reader ⊇ emittable; emittable={freeform_result}; allowlist={agent_receipt, firm_question, close_proposal}`, exit 0. *(Deployed pair: web built from `ba8e7d35`, runtime v71 from `344f7ad8`. The gate's census names `chatTurn.v16.prompt.ts:187` as the emit site while v17 serves; the reader set is identical — a truing curiosity, not a gate failure.)* |

### 15.1 / 15.2 · the corpus inventory — 03:17

Written to [`corpus-manifest-2026-09-04.md`](corpus-manifest-2026-09-04.md) — the inventory the repo
lacked. RPR 117 files · RS 87 · BEE 289 · decrypted RPR 9. **Series pick BY MEASUREMENT:
`clara-rpr-decrypted` (series C)** — A's Apr/May/Jun e-statements carry `/Encrypt`, B's Apr/May
hardcopy scans are 1-page; C is the only Apr–Jul series that is both complete and readable.
**Four 资料缺失 marks, each probed by name against the corpus and none found:** BEE GL/TB (either
FY) · RPR Feb-2025 statements · RPR Mar-2025 statements · a named producer/certifier for RS and RPR.

### The RS books pin — its subject no longer exists (settled 03:14)

No repo script posts books: `packages/db/scripts` holds reset / seed / onboard-rpr / dr-* /
deploy-evaluator only, and `deploy/` holds post-verifies, the CoA CSV and the `0049` identifier
seed. **ROME SECRETARY's 7-row 3,396,500 books were built THROUGH THE PRODUCT during Slice 6 (the
"2506 close") and served as the Wave-E CVB. They died at step 4 under 裁-177 (no backup).** So the
standing pin's SUBJECT is gone. Disposition, recorded rather than papered over: the fixture estate
re-runs as seed (done) + `onboard-rpr` (through the audited writers) + whatever the walk itself
posts, and **the 3,396,500 pin is UNPROVEN POST-RESET (subject gone by ruling), with a NEW books pin
minted from what the walk posts.** This is **not** stop-the-line — that clause is for a fixture that
comes back DIFFERENT, not for one deliberately deleted by ruling.

### 16A.7 (part) · the fixture estate through the real doors — 03:14:19

`onboard-rpr.mjs --firm-name BELCORT --live` through the bridge: dry-run checksum `b37f0b7a…9888` =
live checksum; **firm REUSE BELCORT `04daf86c…` acting as the founder `4648ac2a…`; client CREATE
ROME PROPERTIES SDN BHD `acb60b65-6211-421d-add0-a337c36c5456`** (reg `202501005621` / `1607035V` in
the op_key); **28 accounts created / 0 reused; 0 members; writes = 29; exit 0** — every write through
`create_client` / `upsert_account`, the audited writers, no hand rows. Read-back 03:14:34: the client
row under BELCORT created 19:14:16.848Z; `coa_accounts` for it = **28**; `audit_log` rows in the last
two minutes = **29** (= writes).

### Milestone 4 · members invited — ≈03:16

`/admin/members` roster: Tao · tools@belcort.com · Active · joined 2026-09-03 · **Owner**; *"The
invitation to tao@belcort.com was sent."*; a pending invite tao@belcort.com · Admin · Pending · sent
2026-09-03 · expires 2026-09-10 · Revoke. DB 03:16:33: `firm_invites`
**`771960a8-90a0-4182-9877-9a583794b3fd`** · firm `04daf86c…` · tao@belcort.com · admin · pending ·
created **19:15:59.283Z** · expires +7 d (the token column was never read).

---

## 裁-180 (owner, 03:20) — 照計畫: the desktop corpus is the walk's data

The owner asked, verbatim: 「为什么放rome的资料进去, 不是factory reset 吗? 我们自己e2e 产品的core features? 还是
我们误会了什么?」 Answered from the repo: constraint 13 · 裁-63 · step 16A.7 all say *reset, then re-run
the fixtures through the real doors and walk the product on the desktop corpus*; the Rome/BEE files
ARE the test data by ruling (ADR-0075). The synthetic alternative was offered. **Ruled: 照計畫 —
the real Rome/BEE documents, series C, the four 资料缺失 marks stand.**

---

## Step 16A · the product walk — milestone 5, the in-thread interview (03:21:58 → 03:58:30)

- **03:21:58** the Clara pane's "Begin client onboarding" minted `clients`
  **`7a045c7f-b7c3-4cf3-b3d9-c82312e35716` · ROME SECRETARY SDN BHD** under BELCORT and
  `onboarding_plans` **`c1fbfe71-7479-44bb-baab-108695e3d308`** (scope client, state open, revision
  1, review_maker the owner, `opened_by_agent` f) with **0 plan items** and **no
  `clientOnboarding_v4` run yet**. The interview lives in the client workspace's chat, not on the
  firm home — recorded as a **discoverability finding**, not a failure.
- **03:26:17** the first answer typed (the owner watching; the lead types client facts, never
  credentials — 裁-183's precedent had not yet been given, so this is fact-entry only). DB 03:26:22:
  `workflow_runs` **`clientOnboarding_v4` RUNNING, created 19:25:15.760Z** — the first durable run of
  the post-reset estate.
- **The interview as run: 17 steps + 2 sub-questions, every capture echoed and confirmed by a human
  "yes".** legal_name `ROME SECRETARY SDN BHD` · entity_type `sdn_bhd` · ssm `202501019265
  (1620678-M)` · turnover `<RM1M` (from the corpus: 22 sales invoices RM100–3,000) · tin skipped
  ("not registered, turnover < RM1M") · msic **82110** (read from the Wave-E acceptance record on the
  owner's instruction 「你去check, 自己回答」) · sst_regime `not_registered` — **a LEAD-derived answer
  the owner can amend**, from the corpus (turnover well under the RM500k service-tax threshold, no
  SST line on the 22 invoices) · sst_no skipped · statutory skipped (no payroll documents in the RS
  corpus) · banks free text "Maybank (MBB) current account; Alliance Bank (ALB) current account…" ·
  currency MYR · **fye 12** (the owner's own answer) · mpers_eligibility no → "a private entity —
  MPERS is available" · framework **MPERS**, edition **2016** · accounting_basis Accrual · coa_seed
  `yes` (`{"seed":"firm_template"}` + a deferred `coa_chart_apply` todo) · opening_position
  `new_first_year` (RS incorporated Jan 2025; opening = 0) · fa_depreciation no · sample_invoices
  attached.
- **DB PROOF 03:44:04:** `onboarding_plan_items` = **16 rows**, plan `revision_n` 16, state open,
  uncommitted, the run still `running`. The checklist card's header still read **"1 / 1"** at that
  moment — a during-run staleness, resolved on completion.
- **16A.2 upload half, 03:47:29.** Two RS invoices attached through the interview's own intake seam:
  `RSINV-250601-KONG-CHENG-RM2800.pdf` (101,829 B) and `EZSEC-QT-00065-KONG-CHENG-RM1700.pdf`
  (165,939 B). Network: **`POST /api/runtime/intake/documents` → 201 ×2; `PUT …/{id}/bytes` → 204 ×2;
  `POST …/{id}/finalize` → 202 ×2** (intakes `93dd0512-4186-43b5-9717-b15d3d1c9e10` and
  `de2e2e8e-33d7-40c6-8502-75066ce262fe`). **The Slice-5 intake pair works on the live origin through
  the Worker proxy.** DB 03:48: both intakes `finalized` (origin `documents_tab`, `application/pdf`,
  the two byte counts, no failure_code) → `documents`
  **`d7cb5098-26ab-4359-8020-d098abc4565c`** and **`5f6786f1-0481-4f3b-98ec-1829067157f8`**: status
  `ingested`, extraction_status `done`, page_count 1, `bytes_verified` t, created 19:47:25Z.
  `document_filings`: both filed to the client, basis `human`, 19:47:25.8 / 19:47:26.4.
  `document_processing_tasks`: lane `ocr`, engine **`azure-di:prebuilt-layout:2024-11-30`**, status
  done, attempt 1, 19:47:25.9 → **19:47:29.9 (≈4 s)**. `document_extractions`: engine_kind ocr,
  status done, page_count 1, envelope with pages/tables.
- **THE INTERVIEW COMPLETED 03:49.** On completion the card re-read the plan: **19 / 19 · open**,
  every item listed with Resolve / Amend, the must_ask ones tagged "Required before activation".
- **MILESTONE 5 COMMITTED 03:52:48 by the OWNER** (attestation box left empty; the door's first call
  returned a 400 asking for one, the page re-called with an attestation and it committed — the
  door's contract, not a defect). DB: `onboarding_plans` `c1fbfe71…` **committed**, revision 20,
  `committed_by` `4648ac2a…`, `commit_attestation` not null; `clients` `7a045c7f…` **active**;
  `workflow_runs` `clientOnboarding_v4` **completed 19:48:38.5Z**; `audit_log` +1.
- **THE CHART PLANTED 03:58:30.** Template `my_sme_starter` v1 ("Malaysian SME Standard Chart of
  Accounts (starter)", MPERS, 142 accounts, published 17:55:03Z at the seed). Families: the DB's plan
  rendered as the fieldset default (21 core locked-checked, `Equity - Company` +
  `Director and Related Party Balances` pre-checked for `sdn_bhd`), plus `Professional Services`
  ticked by the lead for a secretarial-services firm; **the irreversible "Apply the chart" was the
  owner's own intent, stated on the record.** Result: *"Applied: 86 accounts across 23 families.
  Adoption `934b94be-5f7c-4169-8107-1c8a1bc71c5f`."* DB: `coa_accounts` for RS = **86**;
  `coa_template_adoptions` `934b94be…` · template `ef767f7b…` v1 · state adopted · 23 families ·
  `adopted_by` `4648ac2a…` **19:58:30.4Z**.

### What the commit does NOT do — settled from the door body, 03:55

`0017_wave_b.sql`'s `commit_client_onboarding` sets `clients.status='active'`, snapshots the plan
revision, audits, and appends `onboarding.plan_committed` + `client.activated`. **It projects nothing
else, by design.** So, as measured immediately after the commit: `coa_accounts` = 0 (the chart is a
separate human act), `client_facts` = **0 rows for RS and 0 in the estate**, and
`clients.fy_end_month/day` **NULL despite `fye=12` being captured**. These are DESIGN, not walk
failures — and they are a **product gap** for the owner to decide on: a captured FYE that never
reaches `clients.fy_end_month`, and captures that never become `client_facts`. The consequence bit
three times later in the same night (the FY-end dialog, the `closing_stock_present` gate's
`trade_nature_fact_absent`, and — the expensive one — `direction_unresolved` on the client's own
sales invoice, below).

---

## 裁-181 (owner, 03:39) — the interview should propose, not only validate

The owner asked, verbatim: 「这个是agentic chat right? 如果user 不懂或者回答有一些瑕疵, agentic是可以自己输入
对的, 标准答案in database right? … 如果我回 lesser than 1M 这种会怎样?」 Answered from the code
(`interview.v1.core.ts:214-223`, `validateTurnover`): the interview is a **deterministic validator per
step**, not a free LLM — a fixed synonym map plus the exact band strings; anything else (e.g. "lesser
than 1M") is REJECTED and re-asked; every capture is echoed and confirmed; nothing reaches the DB
until Commit through the door. That is PRD §6 invariant 1 by design. **Ruled (verbatim 「是的, 我要的
东西是这样的」): an LLM normaliser that PROPOSES the value and still asks the human to confirm is
WANTED — a Backlog row, after beta, owner, 裁-181.**

---

## 16A.4 / 16B(b) · the coding lane, the consent wall, and the agent's first read

- **04:00 "Request autodraft" on the RSINV filing → the door answered "Not queued — this filing
  isn't in a ready coding lane right now."** No `autodraft_attempts` row, no task, no run: an honest,
  receipted refusal.
- **04:03 the lane's own reasons** (`clara._coding_lane_core(client, filing)`, both filings):
  **`needs_review · {facts_pending, vendor_unresolved, no_consent}`**. The root wall is
  **`no_consent`** — the client authorization letter
  ([`docs/ops/legal/client-ai-authorization-letter-template.md`](../../ops/legal/client-ai-authorization-letter-template.md),
  MIA By-Law R114.3(b)) must be on file and classified as consent evidence before any AI egress for
  that client. **The RS corpus holds no such letter** (the fourth 资料缺失 mark). Consent tables at
  04:05: `client_egress_consents` 0 · `client_egress_purpose_consents` 0 ·
  `client_egress_purpose_activations` 0 · `firm_egress_purpose_consents` 0 ·
  `firm_egress_purpose_activations` 0 — **no consent anywhere in the post-reset estate.** *This is
  the security mechanism working as designed, and it is recorded as a POSITIVE proof of the consent
  wall.*
- **THE CONSENT PATH, read from the tree at 04:08.** `no_consent` = no live row in
  `clara.client_egress_consents` (`0011:1520-1522`, `0031:462-464`). The path to a row: (1) the
  letter uploaded as a document; (2) `clara.classify_consent_evidence_document(...)` — **has a web
  button**; (3) `clara.grant_client_egress(...)` — **NO WEB SURFACE at this tip** (`grep
  grant_client_egress apps/web` returns nothing; the Compliance register carries no grant control);
  (4) `activate_client_egress_purpose(...)` for the purpose-gated lanes — **also no surface.**
  **Launch-relevant finding: a real beta firm cannot enable AI processing for a client through the
  product today.**
- **裁-182 (owner, 04:09, verbatim 「为甚么firm cereate 那个dpa的阶段就不要一次过同意全部东西??? uiux这样很乱,
  今天先1吧, 我要test core features.」): option 1** — produce the letter, upload and classify it through
  the UI, and walk the GRANT as the owner's delegate through the audited DB door. **Rider, the
  owner's product view:** consent should be collected ONCE at the firm's DPA stage, not per client
  through a dark door. **Lead's note for the sitting:** the MIA rule is per-CLIENT, so a single
  firm-level consent cannot replace it — but the product CAN collect the client letter inside the
  onboarding interview and grant on commit, which removes both the dark door and the extra clicks (a
  design Backlog row, owner, before 上市).
- **裁-183 (owner, 04:19, verbatim 「bro beta test only , just make it happen. 我们要test 功能啊啊. do the
  sql work in supabase and unlock it.」): produce the evidence and the grant NOW.** Executed as: the
  repo template §4 (EN) filled for ROME SECRETARY with the known facts and MARKED beta-walk
  placeholders for BELCORT's company no./address/tel and the retention period; signatory lines
  "electronically signed — approved in writing by Tao in the Clara beta walk"; all five purposes
  ticked; rendered to PDF with the workspace's own headless Chromium (no network); **uploaded through
  the product's Documents tab; classified through the UI button; and the GRANT through the audited
  door `clara.grant_client_egress` as the owner's delegate (JWT human-ctx = the owner's principal,
  every door check intact). NOT a raw insert — constraint 14 honoured.** The letter is a test
  instrument on test data; the lawyer pass (裁-166) replaces it before any external client.
- **CONSENT LIVE 04:25:48.** `documents` **`8eae997f-347d-418c-ab90-24fd5c662766`** (ingested,
  bytes-verified, OCR done, 3 pages, the region list reading the letter back verbatim) → the
  "Classify as consent evidence" dialog (*"Owner-level action — the DB refuses honestly if your
  session doesn't hold it. A reason is required."*) → `document_kind = consent_evidence` → the door
  receipt `{"status":"live","consent_id":"6d28a53f-64b6-4d8c-bf41-203748777103"}`;
  `client_egress_consents` ONE live row, `granted_by` `4648ac2a…`, **20:25:48.476Z**. The lane re-read
  the same second: **`no_consent` GONE**, `{facts_pending, vendor_unresolved}` remaining on all three
  RS filings. *(Product note: the consent letter itself is a filing in the coding lane — consent
  evidence should not sit there.)*
- **TYPED PURPOSES LIVE 04:29:31** (`grant_client_egress_purpose` then
  `activate_client_egress_purpose`, five pairs, exactly the letter's five ticked rows):
  `document_processing` `7992c4f5…`/`7cbba5e6…` · `witness_extraction` `1378c810…`/`720005f0…` ·
  `statement_extraction` `2d132a82…`/`4a102e1f…` · `bank_matching` `f00777e1…`/`e97606a2…` ·
  `wiki_synthesis` `fe052dcb…`/`1283ef9f…`. The firm-level purpose `firm_narrow_intake` was NOT
  granted — it governs UNFILED documents and every RS document is filed. **The classify gate
  (`0123:1404-1426`) reads the TYPED purpose, not the base consent** — which is why the base grant
  alone cleared `no_consent` but not the classify lane: two acts, by design.
- **04:30:31 re-extraction refused, correctly:** `clara.request_reextraction` →
  **`CLR16 · only an invoice-shaped document can be re-extracted (kind is unset)`**, rendered as an
  alert on the row. A document ingested BEFORE consent never got a classify task, so the human must
  set the kind first.
- **THE AGENT WOKE, 04:33:34 → 04:34:08.** `set_document_kind` (invoice, reason given) → audit ok →
  `[facts_gate] document=d7cb5098… enqueue_invoice_facts status=queued` → an **`llm_witness` task**
  (20:33:51 → 20:34:08, 17 s) → `persist_witness_facts ok` → **`open_sweep_run ok`**. The durable run
  **`witnessFacts_v3` completed 20:33:50**. `document_extractions` for RSINV now carries
  `doc_classify` (`clara-classify-human:v1`, confidence 1) plus **two LLM witness reads —
  `llm_vision_facts` and `llm_text_facts`, engine `llm-openai:gpt-5.6-terra:v2`**. Regions:
  invoice.total **2,800.00 (280000 cents)** · discount 200.00 · currency MYR · invoice_id
  `RSINV-2506/01` · invoice_date 06/06/2025 · type_code 01 · customer_name KONG CHENG RESTAURANTS SDN
  BHD · vendor_name ROME SECRETARY SDN BHD · vendor_registration `202501019265 (1620678-M)`.
  `_invoice_fact_state` = regime witness, total_cents 280000, `corroborated: false`,
  vendor_registration_verdict corroborated. **The numbers match the OCR and the PDF exactly
  (RM2,800 after a RM200 discount on RM3,000) — the DB owns them.** The lane moved to
  **`needs_you {tier_a_fails, direction_unresolved, vendor_unresolved}`** — three questions for the
  human.
- **`direction_unresolved` ROOT CAUSE** (`0049:872-951`, `_direction_from_extraction`): the invoice's
  vendor_name matches the client's name, but its vendor_registration finds **no row in
  `clara.client_identifiers`** → the contradiction branch `CLR30`. **RS had 0 identifiers: the
  interview captured the SSM into the PLAN only, and the commit never projects it.** So **every
  interview-onboarded client's own sales invoices stay `direction_unresolved` until an owner records
  the identifier through `clara.add_client_identifier`, which has NO web surface.** Walked as the
  delegate (裁-183): receipt `{"identifier_id":"dfaa85e2-595c-4b1c-825f-61032ef2f229"}` (kind ssm,
  `value_normalized` `2025010192651620678m`, **20:37:16Z**) → the direction reason cleared.
  *(A lead instrument error is on the record here: a direct `_document_direction` call with its
  arguments REVERSED answered CLR30 and briefly suggested a second defect; called correctly at 04:41
  it answers **`sales`** — law 3 applied to the lead's own instrument.)*
- **The sales lane.** With the direction resolved, the party looked up is the CUSTOMER, and
  `_resolve_counterparty` found none; the reason is *labelled* `vendor_unresolved` because
  `_sales_lane_active(BELCORT)` was **false** (`firm_limits` had no row for BELCORT). Both were
  fixed through real doors: counterparty **`e6890791-b3c9-4357-af17-840b68611620` · customer · KONG
  CHENG RESTAURANTS SDN BHD** created through the Registers dialog (audit `create_counterparty ok`
  **20:43:05**), and `set_sales_lane_activation` — an operator-level door with **no web surface** —
  run with an explicit watermark `2026-09-03 00:00+08` so the walk's filings sit inside the lane
  (audit `set_sales_lane_activation ok` **20:43:16**, `was_active` false). **The lane then read
  `ready {tier_a_fails}`** (informational on an active sales lane).

### 16B(b2) · the belt drafted, refused itself, and asked — 04:44:32 → 04:45:05

"Request autodraft" → *"Admitted — Clara will draft this filing."* (audit `request_autodraft ok` +
`admit_autodraft_task ok` 20:44:32) → the durable run **`autoDraft_v9` completed 20:44:48 →
20:45:06** → `autodraft_attempts` **`ae22c9c6-d0ec-4566-8be2-2e9736d53829`** · one_click · state idle
· attempt 1 · `last_refusal {"code":"CLR23","type":"refusal","message":"The counterparty could not be
resolved as proposed."}` → audit **`open_question ok` 20:45:04** then `settle_autodraft_task ok`
20:45:05. `open_questions` **`5302e464-f102-4da3-a6a6-043bd99d98f8`** · scope document · origin
`sweep_refusal` · opener_kind `wake` · status open. Answered by the human at 04:47
(`resolve_open_question ok` 20:47:32). **Second admission 04:48:24 → the SAME refusal, attempt 2,
state `parked`, a second question `bdf3648d-9e64-4653-8dc7-a11f173ae336`.**

**FINDING 04:50 — the CLR23 is a MASK, not a door refusal.** Both autodraft `agent_tasks`
(`1a268852…`, `31be58f4…`) are `failed · error_code internal`; the settle args carry `tokens: 0`
(the model was never called) and the admission carried `direction: "sales"`; the live
`_resolve_counterparty` answers `name_match_unregistered` for kind customer + that name, so **no door
refused.** `autoDraft.v9.errors.ts:150-153` maps any Postgres **23505** whose constraint name
contains "counterpart"/"alias" to `CLR23`. **Diagnosed by code reading, not from an observed stack
(law 2, stated as such):** the v9 pre-flight tried to BIRTH a counterparty and collided —
`uq_counterparties_client_unregistered_name` is (client, KIND, name) and would NOT collide with a
customer row, but **`uq_counterparty_aliases_live_name` is (client, alias_normalized) and is
KIND-BLIND**, so a vendor-kind (or kind-less) birth's own alias collides with the customer's. The
agent then opened a human question that no human answer can satisfy — the second admission
reproduced it exactly. **Verdict: a backend defect on the sales-invoice autodraft path on v71,
launch-blocker CLASS by 16B's own weight; not fixed tonight (a code change under the ladder); ruled
by the owner at the sitting.**

### 16B(b2) via CHAT — the agent proposed a journal — 04:52:54 → 04:53:16

`chatTurn_v17` run completed 20:52:48 → 20:53:16 (28 s); `agent_tasks` `2e31146b…` chat_turn
completed; audit **`draft_entry ok` 20:53:09** → `journal_entries`
**`63e5b493-3e44-4973-96e5-ad7154d0baa1`** · status DRAFT · origin document · posting_date 2025-06-06
· memo "RSINV-2506/01 — professional fees for incorporation of company" · coding_kind
`sales_invoice`; `proposed_counterparty` = `{"kind":"customer","existing_id":"e6890791…"}` — **the
chat path resolved the customer correctly where the belt's kind-less birth did not.** Lines (DB
04:54:56): `1100` Dr **280000** "Trade receivable — RSINV-2506/01" · `4000` Cr **280000**
"Professional fees — RSINV-2506/01"; Σdr = Σcr = 280000 cents. The pane carried tool receipts
(`read_document · list_journal_entries · read_books_freeform · draft_journal_entry`), a Journal-entry
review card with provenance `model_read`, and a **freeform read receipt** naming the exact SQL the
DATABASE ran, rows 1, 113 bytes, 27 ms, relations read `clara.counterparties`, *"The audited receipt
of one read. The rows themselves were never stored"* — **the freeform lane whose password was fixed
at 02:52 works in the field.** The model also caught the lead's own loose wording (the invoice says
"professional fees for incorporation of company", not secretarial fees).

**The POST arm (04:55) was REFUSED first: `CLR26 · an open question blocks this entry`** — the
agent's second open question, itself the product of the masked defect, blocked the human's post.
**The open-question wall worked as designed.** Dismissed with a reason on the record at 04:57:07
(`{"status":"dismissed"}`; the first attempt failed on a non-UTF8 ellipsis from the Windows console —
**door reasons typed through psql on Windows must be ASCII**). **POST DONE 04:58:19** — Approve with
an attestation naming the walk. DB 04:58:56: `journal_entries` `63e5b493…` **approved · 20:58:18.096Z
· maker_actor = the agent principal · checker_actor = the owner `4648ac2a…`**, revision token set;
audit `approve_entry ok` then `evaluate_sst_watch ok`.

**The REFUSE arm was exercised at the clarify gate.** A second chat turn on the EZSEC document raised
`agent_interruptions` **`ed930c00…`** (kind clarify, pending, 20:56:09): the agent had read the
purchase invoice correctly and asked before drafting against an account the lead named that the chart
does not have — and then caught that **`EZSEC-QT-00065` is explicitly headed "PROFORMA INVOICE" and
says it is a quotation**, asking whether to recognise it as an AP bill now or retain it pending the
final tax invoice. *A genuinely correct accounting catch; the lead had labelled the file wrongly.*
Answered as the human — do NOT recognise, retain pending the tax invoice — at 05:00:31
(`answer_interruption ok` 21:00:29); the chat run completed 21:00:35. **Entries for RS: exactly ONE,
approved. No proforma entry — correct.**

**BOOKS PIN 1 — 04:59:51, read from `trial_balance_as_of(RS, current_date)`, the DB's own
instrument:** `1100` Trade Receivables Control **Dr 280000** · `4000` Sales / Fees Income
**Cr 280000** — balanced. **RS TB 2,800.00 = 2,800.00, one posted entry `63e5b493…`.**

---
