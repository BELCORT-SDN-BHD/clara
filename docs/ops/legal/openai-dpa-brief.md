# OpenAI Data Processing Addendum — Compliance Brief

> **DRAFT FOR OWNER REVIEW AND SIGNATURE.** Prepared by Clara (an AI agent), NOT a lawyer.
> This is a working brief to help Tao (BELCORT Sdn Bhd) decide what to sign and what to do
> next — it is not legal advice and should not be relied on as a substitute for advice from a
> Malaysian-qualified lawyer, particularly on the PDPA/MIA sections in Part 3. Every claim
> below is sourced: vendor claims cite OpenAI's own pages (fetched today), Malaysian-law
> claims cite the official text/regulator. Access date for every citation: **2026-08-22**,
> unless marked otherwise.

## 0. What this document is for

Clara's runtime sends client-document content to OpenAI's API for document classification,
bank-statement reading, and a two-channel "witness" extraction pair (vision + OCR-text) used
to corroborate invoice facts. This brief answers, with citations: **what agreement governs
that today, whether OpenAI trains on the data, how long it's kept, who else touches it, how
data crosses the border, and how BELCORT actually executes the paperwork** — then maps that
onto what Clara's code actually does, and closes with what the owner needs to act on.

This is **not** the tracing/observability question. Clara's own run-trace logging (chat
history, tool-call records) is a separate flow that stays in Clara-controlled Postgres and
does **not** go to any vendor — see §2.4. Nothing in this brief authorizes turning that on.

---

## 1. What governs OpenAI API processing today

### 1.1 The governing agreements

OpenAI's current stack (effective **January 1, 2026**) is two documents plus the API's own
data-handling pages:

- **OpenAI Business Terms** — the base contract. Acceptance is by use, not a separate
  signature: *"By clicking 'I agree,' accepting the Order Form, or using the Services,
  Customer agrees to this Agreement."* The Business Terms fold in data handling directly:
  *"OpenAI will not use Customer Content to develop or improve the Services, unless Customer
  explicitly agrees to such use,"* and *"OpenAI will only use Customer Content as necessary to
  provide Customer with the Services, comply with applicable law, enforce the OpenAI
  Policies, and prevent abuse."*
  (Source: https://openai.com/policies/business-terms/, accessed 2026-08-22 — the page at this
  URL currently displays on-page as "OpenAI Services Agreement"; the URL slug and legal content
  are unchanged, but the "Business Terms" brand name may be legacy. §17 of the same document
  names the contracting entity — see §4 item 8 below, now confirmed.)

- **The Data Processing Addendum (DPA)** is triggered by the Business Terms themselves, not
  by a separate click: *"If Customer uses the Services to process Personal Data, OpenAI and
  Customer will comply with the DPA, which is incorporated by this reference into the
  Agreement."* The DPA page itself: *"This OpenAI Data Processing Addendum ('DPA') supplements,
  and is incorporated into, the OpenAI Services Agreement ('Agreement') governing use of the
  Services."*
  (Source: https://openai.com/policies/data-processing-addendum/, accessed 2026-08-22.)

  **Reading this plainly: because Clara's documents contain personal data (counterparty
  names, sometimes individual names on receipts/claims), the DPA already applies to
  BELCORT's account by operation of the Business Terms — no separate click is legally
  required to make it apply.** What a separate step buys the firm is *evidence* — see §1.6.

- **API data-handling specifics** (training default, retention, ZDR) live on OpenAI's
  developer and enterprise-privacy pages, not inside the DPA's own text — see §1.2–§1.3.

### 1.2 Is API input used to train models?

No, by default: *"As of March 1, 2023, data sent to the OpenAI API is not used to train or
improve OpenAI models (unless you explicitly opt in to share data with us)."*
(Source: https://developers.openai.com/api/docs/guides/your-data, accessed 2026-08-22.)

Confirmed independently on the enterprise page: *"By default, data from ChatGPT Business,
ChatGPT Enterprise, ChatGPT for Healthcare, ChatGPT Edu, ChatGPT for Teachers, and the API
Platform (after March 1, 2023) isn't used for training our models, unless you have explicitly
opted in."*
(Source: https://openai.com/enterprise-privacy/, accessed 2026-08-22.)

**Owner action implied:** nobody at BELCORT should ever tick an "opt in to share data for
training" box in the OpenAI console. Confirm this is unchecked (§4).

### 1.3 Retention — standard and zero-data-retention (ZDR)

**Standard (what Clara runs under today):** *"OpenAI may securely retain API inputs and
outputs for up to 30 days to provide the services and to identify abuse. After 30 days, API
inputs and outputs are removed from our systems, unless we are legally required to retain
them."* (Source: https://openai.com/enterprise-privacy/, accessed 2026-08-22.) The developer
page frames the same number as an abuse-monitoring log: *"By default, abuse monitoring logs
are generated for all API feature usage and retained for up to 30 days, unless longer
retention is required by law."* (Source: https://developers.openai.com/api/docs/guides/your-data,
accessed 2026-08-22.)

**Zero Data Retention (ZDR):** *"You can also request zero data retention (ZDR) for eligible
endpoints if you have a qualifying use-case."* Eligibility is not self-serve: *"Eligible
customers may have their customer content excluded from these abuse monitoring
logs...by getting approved for...Zero Data Retention...Currently, these controls are subject
to prior approval by OpenAI."* Approval requires "acceptance of additional requirements" and
is reached through OpenAI's sales/support channel, not a console toggle by default.
(Source: https://openai.com/enterprise-privacy/ and
https://developers.openai.com/api/docs/guides/your-data, accessed 2026-08-22.)

Separately, org-level **Data Retention controls** exist in the console once approved —
re-confirmed directly on OpenAI's own developer page (not a third-party summary, as an earlier
draft of this brief had it): *"Once approved, customers can configure ZDR through the console
by navigating to Settings → Organization → Data controls, where there's a dedicated Data
Retention tab. Organizations can set controls at both the organization level and individual
project level."* The same page adds a detail worth flagging for the owner: *"When ZDR is
enabled, the `store` parameter for certain endpoints is automatically treated as `false`, even
if requests attempt to set it to `true`."*
(Source: https://developers.openai.com/api/docs/guides/your-data, accessed 2026-08-22 — the
same official page already cited in §1.2/§1.3 above. The authenticated console screen itself
was not opened for this brief; the quotes above are OpenAI's own published documentation of it.)

**What this means for BELCORT today:** unless someone has requested and been approved for
ZDR, every prompt and response Clara sends to OpenAI — including OCR text and, for the vision
witness channel, the client's original document image — sits on OpenAI's systems for up to
30 days for abuse-monitoring purposes before deletion.

### 1.4 Sub-processors

OpenAI publishes a live sub-processor list and commits to 15 days' notice before adding a new
one, with an objection-and-cure mechanism (Source: DPA text, quoted in §1.6). As of today the
published list names (non-exhaustive extract): **Microsoft Corporation** and **CoreWeave,
Inc.** (cloud infrastructure), **Oracle Cloud Infrastructure**, **Google Cloud Platform**,
**Amazon Web Services, Inc.**, **Cloudflare, Ltd.** (CDN), **TaskUs, LLC** and **Accenture
International Limited** (customer support / content moderation), **Snowflake, Inc.** and
**Fivetran, Inc.** (data warehousing/ETL), **Okta, Inc.** (auth, via Auth0), and several
others.
(Source: https://openai.com/policies/sub-processor-list/, accessed 2026-08-22 — the page did
not display a visible last-updated date in the fetched content; treat the list as
point-in-time and re-check before relying on it for an audit.)

### 1.5 International transfer mechanism

The DPA's Section 4 (International Data Transfers) states EEA/Swiss data moves under
*"agreements containing SCCs"* and UK data moves under the UK Addendum to the SCCs, with
England & Wales law and the ICO as supervisory authority for the UK leg. (Source:
https://openai.com/policies/data-processing-addendum/, accessed 2026-08-22.)

Re-verified directly against the CURRENT DPA's own Schedule 1 §8 (an earlier draft of this
brief sourced this paragraph from a third-party-hosted 2023 copy instead — unnecessary, since
the live page already carries it): *"'SCCs' means the standard contractual clauses for the
transfer of personal data to third countries adopted by the EU Commission on June 4, 2021."*
Module Two (Controller-to-Processor) of the SCCs applies when Customer is a Data Controller;
Module Three (Processor-to-Sub-processor) applies when Customer is itself a Data Processor;
and *"the optional docking clause in Clause 7 does not apply."* Governing law for the EEA leg
is the data exporter's EU member state (Schedule 1). Malaysia is not in the EU/EEA/UK/
Switzerland, so **the SCC/UK-Addendum machinery is not what authorizes BELCORT's own
transfer** — that is a PDPA question, covered in Part 3.
(Source: https://openai.com/policies/data-processing-addendum/, Schedule 1 §8, accessed
2026-08-22 — the same current DPA cited throughout §1.)

### 1.6 How BELCORT actually executes this

Two separate things get conflated in vendor conversations; keep them apart:

1. **Legal incorporation of the DPA into BELCORT's contract with OpenAI** — this already
   happens automatically the moment personal data is processed through the API, per §1.1. No
   further owner action makes the DPA "more in force" than it already is.

2. **Getting a piece of paper with BELCORT's name on it, for the firm's own audit file** —
   this is what a Gate-2/C6-style compliance checklist (ADR-0011, PRD §6 law 16) actually
   wants, because "the DPA applies by operation of law" is a much weaker thing to show a
   client or a regulator than "here is the countersigned copy naming BELCORT Sdn Bhd, Org ID
   org-xxxxx." OpenAI's own console has historically offered a self-serve path for this — an
   online form asking for the org's full legal name and OpenAI Organization ID (found under
   Settings → Organization → General on platform.openai.com), which returns a countersigned
   PDF by email. **I could not independently re-verify this exact self-serve flow against the
   current, authenticated console** (WebFetch cannot reach an authenticated settings page) —
   the description above is triangulated from third-party compliance write-ups, not from
   OpenAI's own page text, and may describe an older version of the flow superseded by the
   January 2026 Business Terms' auto-incorporation language. **This is the single most
   important thing on the owner's checklist to confirm live** — see §4.

---

## 2. Mapping Clara's processing onto this framework

Grounded in the repo as it stands today (migrations through `0102_f_a2_statement_activation.sql`,
`packages/runtime/lib/egress.mjs`, ADR-0011, PRD §6 law 16, and the 2026-08-22 Track-A sitting
ruling TA-P3, `docs/adr/0074-the-track-a-sitting.md` — an earlier draft of this brief cited a
non-existent "PR-1 ledger" for this ruling; ADR-0074 is the actual record).

### 2.1 What data actually leaves Clara, and to whom

Every governed call goes through OpenAI's API (`@ai-sdk/openai`, model default
`gpt-5.6-terra`, overridable by `CLARA_CHAT_MODEL`) — there is no other LLM vendor in the
runtime today. Document OCR itself is a **separate** vendor (Azure Document Intelligence,
`packages/runtime/lib/egress.mjs` `AZURE_ENGINE_SNAPSHOT`) and is out of scope for this brief,
which is OpenAI-only per the task that produced it.

What leaves Clara for OpenAI, concretely:

| Lane | What is sent | Purpose (see §2.2) |
|---|---|---|
| `wiki-projection.mjs` | client-derived text for advisory-wiki synthesis | `wiki_synthesis` |
| Bank-statement second reader | the pdf/image bank statement itself | `statement_extraction` |
| Witness pair — vision channel | the client's **original filed document bytes** (image/pdf) | `witness_extraction` |
| Witness pair — text channel | **OCR-derived text** re-sent to the vendor for the text-side witness read | `witness_extraction` |
| `classify-llm.mjs` | the document's **stored OCR layout text** (not the image) | currently ungoverned — see §2.3 |

**Never sent, by design:** IC (identity card) or passport images or numbers. This is a
structural product decision, not a vendor setting — the F-A2 corpus-sitting ruling excludes
IC copies from ingestion entirely (*"the IC copy is EXCLUDED from ingestion entirely (a pure
identity document with no accounting content — excluding it costs nothing and removes the
single highest-sensitivity item)"*, `docs/adr/0072-the-f-a2-rulings-and-the-corpus-sitting.md`,
block "OD-4"), and the newer onboarding-document ruling (TA-P3) independently closes the
admissible-document list against IC/passport for the firm-level narrow purpose. Counterparty
names and registration numbers **are** sent where they appear on an ordinary business
document (invoice, statement, receipt) — that is unavoidable given the product classifies and
extracts those documents.

### 2.2 The named purposes — one processing class, one named purpose (TA-P3 = A)

The DB enforces this structurally, not by convention. `packages/db/migrations/0020_typed_consent.sql`
creates `clara.client_egress_purpose_consents` / `..._activations` with `purpose text not null
check (purpose in ('wiki_synthesis'))`; `0038_wave_c_b_bank.sql` widens the CHECK to add
`'statement_extraction'`; `0090_f_a1_walls.sql` widens it again to add `'witness_extraction'`.
Each purpose requires (a) a typed **consent** row (client-signed, evidence document required)
and (b) a separate owner-only **activation** row — a consent alone does not authorize
(`egress.mjs`: *"a typed grant alone does not authorize — an owner ACTIVATION must exist
too"*). This is digest law 58: *"OCR egress is a two-tier gate, and consent is typed and
purpose-scoped, re-checked at the dispatch boundary."*

**Purposes live in the database today (three):** `wiki_synthesis`, `statement_extraction`,
`witness_extraction`.

**Purpose ruled but not yet shipped:** the 2026-08-22 Track-A sitting (TA-P3) rules a fourth
named purpose, `bank_matching`, for the bank-agency-agent's matching reads — designed in
`docs/plan/active/bank-agency-design.md` §3.7 and `bank-agency-annexes-1-mechanics.md` §Annex
E, with its own null-document-hash CHECK conjunct (the `wiki_synthesis` shape). **As of this
writing it is not in any merged migration** — grep of `packages/db/migrations/*.sql` for
`bank_matching` returns nothing; it exists only in design docs. Do not sign a client consent
naming `bank_matching` until the migration ships and the CHECK constraint actually admits it.

### 2.3 The gap TA-P3 flagged: `classify`'s egress is currently ungoverned

This is worth the owner's direct attention. `packages/runtime/lib/classify.mjs`'s own header
comment describes the classifier as *"a classify task (a local, no-egress LLM read of
already-extracted text)"* — but `classify-llm.mjs` calls `openai(modelId)` via the Vercel AI
SDK, i.e. it sends the document's OCR text to OpenAI's API exactly like the governed lanes do.
`GOVERNED_EGRESS_PURPOSES` in `egress.mjs` lists only the three purposes above; `classify` is
not gated by `prepare_egress_dispatch`/`consume_egress_dispatch` at all today.

The 2026-08-22 sitting ruled on this directly. The exact ruling text, `docs/adr/0074-the-track-
a-sitting.md` line 97 (TA-P3; a prior draft of this brief paraphrased this as a verbatim quote
and mis-cited it to a "PR-1 ledger" — corrected here): *"`classify`'s live ungoverned egress
comes under the purpose list (document-processing): today it ships OCR text to a provider with
no consent of any kind, and F-A7a may not be built on it until that closes."* That fix has not
landed as of this brief. **Until it does, every document Clara classifies — for every
client, whether or not that client has signed any egress consent — has its OCR text sent to
OpenAI.** This is a live compliance gap, not a hypothetical one, and it sits squarely inside
what this brief is meant to flag for the owner (§4).

### 2.4 Tracing/telemetry — a different flow, and it is OFF

Separately from the API calls above, Clara's runtime can in principle log full-content run
traces (chat turns, tool calls) to a cloud observability vendor. **This is not enabled and is
not what the OpenAI DPA analysis above authorizes.** ADR-0011: *"The runtime writes full-
content run traces into our own Postgres. Cloud-vendor trace export ships feature-flagged
OFF, enabled later only after: an executed DPA, firm-facing client authorization..., a
documented PDPA cross-border basis, short retention, tested deletion, and field-level
minimization."* PRD §6 law 16 restates the same gate, and the most recent standing ruling
(ADR-0072, block ⑤, 2026-08-20) reconfirms it on the live Wave-G corpus run: *"Vendor tracing
stays OFF for the whole run — the C6 checklist is still open owner/legal work and PRD §6.16
keeps the flag closed until it is evidenced."* Digest law 57 carries the same text forward.
**Nothing in §1 changes this** — even a fully executed OpenAI DPA does not, by itself, turn
tracing on; MIA client authorization and a documented PDPA cross-border basis are separate,
still-open items.

---

## 3. Malaysian law overlay — why an OpenAI DPA is necessary but not sufficient

Two Malaysian sources bear directly on why "we signed OpenAI's DPA" cannot be the end of the
compliance story for an accounting firm:

**MIA By-Laws (confidentiality).** The Malaysian Institute of Accountants' By-Laws on
Professional Ethics, Conduct and Practice, R114.1(d), require a member not to *"disclose
confidential information acquired as a result of professional and business relationships
outside the firm or employing organization without proper and specific authority, unless
there is a legal or professional duty or right to disclose."* (Source:
https://mia.org.my/wp-content/uploads/2022/08/By-Laws-Amended-as-at-1-July-2022.pdf, accessed
2026-08-22.) A DPA is a contract between BELCORT and OpenAI about how OpenAI handles data —
it says nothing about whether BELCORT had the client's specific authority to hand that data to
a processor in the first place. That authority has to come from the client, which is exactly
why TA-P3 requires every client to sign a named-purpose consent at onboarding (§2.2) rather
than relying on the vendor contract alone.

**PDPA 2010, s.129 (cross-border transfer), as amended.** The original Act's text: *"A data
user shall not transfer any personal data of a data subject to a place outside Malaysia unless
to such place as specified by the Minister... Notwithstanding subsection (1), a data user may
transfer any personal data to a place outside Malaysia if—(a) the data subject has given his
consent to the transfer; ... (f) the data user has taken all reasonable precautions and
exercised all due diligence to ensure that the personal data will not in that place be
processed in any manner which, if that place is Malaysia, would be a contravention of this
Act..."* (Source: Personal Data Protection Act 2010 [Act 709], official text,
https://lom.agc.gov.my/ilims/upload/portal/akta/outputaktap/Act%20709%20ori.pdf, accessed
2026-08-22, §129(1) and §129(3).) The **Personal Data Protection (Amendment) Act 2024**
[Act A1727] amends s.129 by deleting subsection (1) (the "whitelist" mechanism) and deleting
ground (h) of subsection (3) (the public-interest ground) — confirmed against the Act's own
gazetted text: *"12. Section 129 of the principal Act is amended— (a) by deleting subsection
(1); ... (c) in subsection (3)— ... (iv) by deleting paragraph (h)."*
(Source: Act A1727, official gazette text,
https://www.pdp.gov.my/ppdpv1/wp-content/uploads/2024/11/Act-A1727.pdf, accessed 2026-08-22,
§12.)

This amendment (Act A1727 §12) is now confirmed **in force from 1 April 2025** — an earlier
draft of this brief could not verify this and pushed the date to a secondary source; the
primary gazette notice reads plainly once fetched directly: *"1 April 2025 as the date on
which sections 2, 3, 4, 5, 8, 10 and 12 of the Act come into operation."*
(Source: Federal Government Gazette P.U.(B) 522, 24 December 2024,
https://www.pdp.gov.my/ppdpv1/wp-content/uploads/2024/12/PENETAPAN-TARIKH-PERMULAAN-KUAT-KUASA.pdf,
accessed 2026-08-22.)

The Department of Personal Data Protection (JPDP) has separately published **Personal Data
Protection Guidelines No. 3/2025 on Cross-Border Personal Data Transfer** (issued 29 April
2025) for the amended regime — a distinct document, not in fact hosted at the URL an earlier
draft of this brief cited for it.
(Source: https://www.pdp.gov.my/ppdpv1/en/akta/personal-data-protection-guidelines-on-cross-border-transfer-of-personal-data-cbpdt/,
accessed 2026-08-22.)

**Reading these together:** signing the OpenAI DPA and getting client consent under s.129(3)
(consent, or the reasonable-precautions/due-diligence ground) are two different acts of
paperwork, both needed. The DPA is the OpenAI-facing half; the client consent (TA-P3's
per-purpose signature) plus a documented PDPA cross-border basis is the client-facing half.
Neither substitutes for the other — this is exactly the sequencing ADR-0011 and digest law 57
already lock in.

---

## 4. What the owner must do

1. **Confirm the OpenAI training opt-in is OFF.** Log into platform.openai.com → Settings →
   Organization → Data controls, and confirm no "share data to improve models" toggle is
   enabled for BELCORT's org. (§1.2)
2. **Decide whether to request Zero Data Retention.** ZDR needs OpenAI's prior approval
   (contact OpenAI sales/support) and is not a self-serve toggle. Given client documents
   include bank statements and invoices, weigh whether the 30-day abuse-monitoring retention
   is acceptable or whether ZDR is worth pursuing. (§1.3)
3. **Get BELCORT's own countersigned DPA copy for the audit file**, or confirm the current
   equivalent flow live in the console (Settings → Organization) — do not take this brief's
   description of the self-serve form as current fact; verify it yourself and save whatever
   the console actually gives you (a PDF, an on-screen confirmation, or an emailed copy),
   along with BELCORT's Organization ID (org-...). (§1.6, §5)
4. **Do not sign any client consent naming a `bank_matching` purpose yet** — the DB does not
   enforce it and no dispatch path exists for it. Wait for the migration to merge. (§2.2)
5. **Treat `classify`'s current behaviour as an open compliance gap, not a settled fact.**
   Every document classified today sends its OCR text to OpenAI regardless of whether that
   client has signed any egress consent. Ask engineering (or track TA-P3's fix) for the
   `document_processing`-purpose gate before relying on "we only send data we have consent
   for" as a blanket true statement to a client or regulator. (§2.3)
6. **Do not treat this brief, or an executed OpenAI DPA, as authorization to turn on vendor
   trace/telemetry export.** That stays off pending a separate MIA client-authorization
   document and a documented PDPA cross-border basis — both still open per ADR-0011/PRD §6
   law 16. (§2.4)
7. **Get a Malaysian-qualified lawyer's sign-off on Part 3** before treating this brief's
   PDPA/MIA reading as settled — it is Clara's best-effort synthesis of official text, not a
   legal opinion.
8. **Record the OpenAI contracting entity for BELCORT's account.** The Business Terms'
   definitions section names it directly: *"'OpenAI Contracting Party' means: (a) OpenAI OpCo,
   LLC, for Customers located outside the EEA or Switzerland; (b) OpenAI Ireland Ltd. for
   Customers located in the EEA or Switzerland; or (c) OpenAI Public Sector, LLC if designated
   on the Order Form."* A Malaysia-domiciled, non-public-sector account contracts with
   **OpenAI OpCo, LLC** (a US entity) by default. Confirm no Order Form designates the Public
   Sector entity instead, and record this alongside the executed DPA copy. (Source:
   https://openai.com/policies/business-terms/, §17, accessed 2026-08-22 — this resolves what
   an earlier draft of this brief listed as unconfirmed in §5.)

---

## 5. Facts I could not verify

- **The exact current self-serve DPA-signing flow** (org-ID form → countersigned PDF) is
  triangulated from third-party compliance blog posts, not from OpenAI's own page text. The
  current (January 2026) Business Terms/DPA pages I fetched directly describe the DPA as
  auto-incorporated by use, and do not themselves describe a separate signing form. It is
  possible OpenAI has simplified or removed the separate form since those third-party posts
  were written. **Verify live in the console** before telling a client "we have an executed
  DPA" based on this brief alone.
- ~~Which OpenAI contracting entity governs a Malaysia-billed account~~ — **RESOLVED** during
  this brief's 2026-08-22 citation-verification pass: see §4 item 8 (OpenAI Business Terms §17,
  fetched and quoted directly — OpenAI OpCo, LLC, for a non-EEA/Switzerland, non-public-sector
  account).
- **The current DPA's own base text does not print a fixed retention day-count.** The 30-day
  figure comes from OpenAI's developer/enterprise-privacy pages, not from the DPA document
  itself (whose Schedule 1, per what I could fetch, describes retention as ongoing "on a
  continuous basis depending on Customer's use" rather than a fixed number). Both pages are
  official OpenAI sources but they are not the same document — flagging so nobody assumes the
  30-day clause is contractually locked inside the DPA text itself.
- ~~The exact commencement date(s) for the PDPA 2010 (Amendment) Act 2024's changes to
  s.129~~ — **RESOLVED**: the primary gazette-notice PDF (P.U.(B) 522) and the amendment Act's
  own text (Act A1727 §12) are both plain, extractable text, not scanned images as an earlier
  draft of this brief assumed. See §3 for the direct quotes: **1 April 2025** is confirmed from
  the Minister's own commencement order, not a secondary source.
- **The OpenAI sub-processor list's own last-updated date** was not visible in the fetched
  page content — treat the §1.4 list as a snapshot taken 2026-08-22, and re-check
  https://openai.com/policies/sub-processor-list/ before relying on it for a client-facing
  representation.
- **Whether any lane in the runtime sets `store: false` or an equivalent zero-retention
  request-level flag on individual OpenAI API calls.** I sampled `classify-llm.mjs`,
  `wiki-projection.mjs`, `autodraft.mjs`, and `egress.mjs` and found plain `openai(modelId)`
  provider calls with no such override, but I did not read every call site in the runtime
  (e.g. the witness-pair and statement-extraction behavior files were not opened line-by-line
  for this brief) — the accurate general fact is "org-level retention governs unless a
  specific opt-in for ZDR is separately approved," and item 2 in §4 depends on the owner
  deciding this at the org level rather than relying on code-level flags either way.

---

## Verification log (2026-08-22 citation-verification pass)

Every URL below was re-fetched live on 2026-08-22 (openai.com pages block automated fetchers
directly with HTTP 403; those were re-fetched through a text-rendering proxy of the same URL,
and the two OpenAI PDFs and both Malaysian gazette PDFs were downloaded and text-extracted
directly — `pdftotext`, not an image/OCR read, confirming none of these four are scanned
documents as an earlier draft of this brief assumed for two of them). "CONFIRMED" below means
the exact quote or fact was found in the live source; three items were found to be **wrong in
the prior draft** and are marked FIXED, with the fix already applied in place above.

| # | Claim | Source | Verdict |
|---|---|---|---|
| 1 | "By clicking 'I agree,' accepting the Order Form..." | openai.com/policies/business-terms/ (§1.1) | CONFIRMED |
| 2 | "OpenAI will not use Customer Content to develop or improve the Services..." | same | CONFIRMED |
| 3 | "OpenAI will only use Customer Content as necessary..." | same | CONFIRMED |
| 4 | Effective date January 1, 2026 | same | CONFIRMED |
| 5 | Page displays as "OpenAI Services Agreement" at the /business-terms/ URL | same | CONFIRMED (new note added, §1.1) |
| 6 | §17 "OpenAI Contracting Party" = OpenAI OpCo, LLC outside EEA/Switzerland | same | CONFIRMED (new citation added, §4 item 8) |
| 7 | "This OpenAI DPA supplements, and is incorporated into..." | openai.com/policies/data-processing-addendum/ ; cdn.openai.com/pdf/openai-data-processing-addendum.pdf | CONFIRMED (two independent fetches of two formats agree) |
| 8 | DPA §4.1/4.2 — SCCs, UK Addendum | same | CONFIRMED |
| 9 | Schedule 1 §8.2 — England & Wales law, ICO supervisory authority | same | CONFIRMED |
| 10 | Sub-processor 15-days'-notice + objection/cure mechanism | same | CONFIRMED (consistent across both fetches) |
| 11 | Schedule 1 retention = "continuous basis depending on Customer's use", not a fixed day-count | same | CONFIRMED |
| 12 | Module Two/Three, docking clause disapplied, "June 4, 2021" SCC date | same, Schedule 1 §8 | CONFIRMED directly from the CURRENT page — **FIXED**: prior draft sourced this from an uncited "third-party-hosted 2023 copy" and pointed to a §5 caveat that didn't exist (§1.5) |
| 13 | "As of March 1, 2023, data sent to the OpenAI API is not used to train..." | developers.openai.com/api/docs/guides/your-data | CONFIRMED (direct fetch, no proxy needed) |
| 14 | "abuse monitoring logs...retained for up to 30 days" | same | CONFIRMED verbatim |
| 15 | ZDR requires prior approval, not self-serve | same | CONFIRMED |
| 16 | Data Retention tab under Settings → Organization → Data controls | same | CONFIRMED directly from the official page — **FIXED**: prior draft cited this as a "developer-community summary" and a dangling "flagged below in §5" that §5 never addressed (§1.3) |
| 17 | `store` param forced `false` under ZDR | same | CONFIRMED (new fact added, §1.3) |
| 18 | "By default, data from ChatGPT Business...isn't used for training..." | openai.com/enterprise-privacy/ | CONFIRMED |
| 19 | "OpenAI may securely retain API inputs and outputs for up to 30 days..." | same | CONFIRMED (second sentence verbatim on direct re-fetch; first sentence consistent across two independent fetches) |
| 20 | Sub-processor names (Microsoft, CoreWeave, Oracle, GCP, AWS, Cloudflare, TaskUs, Accenture, Snowflake, Fivetran, Okta) | openai.com/policies/sub-processor-list/ | CONFIRMED, all present |
| 21 | No visible last-updated date on that page | same | CONFIRMED (matches the brief's own hedge — no change needed) |
| 22 | MIA By-Laws R114.1(d) confidentiality quote | mia.org.my By-Laws PDF (as at 1 July 2022) | CONFIRMED verbatim |
| 23 | PDPA 2010 s.129(1) whitelist text | lom.agc.gov.my Act 709 official PDF | CONFIRMED verbatim (`pdftotext`, not scanned) |
| 24 | PDPA 2010 s.129(3)(a) and (f) text | same | CONFIRMED verbatim |
| 25 | Amendment Act 2024 deletes s.129(1) and s.129(3)(h) | pdp.gov.my Act A1727 official gazette PDF, §12 | CONFIRMED verbatim — **FIXED**: prior draft asserted this without a primary quote (§3) |
| 26 | Amendment (Act A1727 §12) commences 1 April 2025 | pdp.gov.my Federal Gazette P.U.(B) 522 | CONFIRMED verbatim — **FIXED**: prior draft called this unverifiable/scanned and deferred to secondary law-firm sources (§3, §5) |
| 27 | JPDP published a Cross-Border Personal Data Transfer Guideline | pdp.gov.my Guidelines No. 3/2025 (issued 29 April 2025) page | CONFIRMED — **FIXED**: prior draft cited the commencement-date page for this claim, which does not in fact mention the Guideline (§3) |
| 28 | TA-P3 ruling quote on `classify`'s ungoverned egress | `docs/adr/0074-the-track-a-sitting.md` line 97 | CONFIRMED once corrected — **FIXED**: prior draft's quotation marks wrapped a paraphrase, not the actual sentence, and cited a non-existent "PR-1 ledger" instead of ADR-0074 (§2, §2.3) |
| 29 | Internal repo facts: migrations 0020/0038/0090 purpose CHECKs, `egress.mjs` quote, `classify.mjs` header quote, `classify-llm.mjs` calls `openai(modelId)`, latest migration is `0102_f_a2_statement_activation.sql`, no `bank_matching` in any migration, ADR-0072 IC-exclusion quote, ADR-0011 quote, digest laws 57/58, `bank-agency-design.md` §3.7 / Annex E | direct repo read/grep | ALL CONFIRMED verbatim, no changes needed |

**Net result of this pass:** three citation defects fixed in place (a misquote + wrong source
name for the TA-P3 ruling; an unnecessary and improperly-cross-referenced third-party DPA copy
where the current official source already had the text; two dangling "see §5" pointers to
caveats that were never written). Three previously-unverified facts were resolved and upgraded
to CONFIRMED with primary citations (the OpenAI contracting entity; the PDPA amendment's
substance and its 1 April 2025 commencement date). No claim was found to be substantively
false — every fix was a sourcing/attribution correction, not a reversal of what the brief told
the owner to do. The four items still listed in §5 as unverified remain genuinely unverified
(they require either a live authenticated console session or reading every call site in the
runtime) and should stay on the owner's list.
