# ClaraBook — Beta Terms of Service (agent template)

> **STATUS: AGENT TEMPLATE — NOT LEGAL ADVICE, NOT REVIEWED BY A MALAYSIAN LAWYER.**
> Drafted under the owner's ruling of 2026-09-02 (裁-125): user-facing legal text for beta is the
> agent's template, refined with a lawyer at the official live launch; nothing is darkened or cut
> for beta. Same posture as the beta DPA placeholder (裁-90).
>
> **Version:** `beta-terms v1 (agent template, 2026-09-02)`
> **Language:** English governs. A short Bahasa Malaysia summary is at §14; it does not govern.
> **Companion document:** `docs/ops/legal/clara-beta-dpa.md` — the data-processing consent the
> firm signs at the same signup step. **These Terms never override it on a data-protection
> question** (§13.5).

---

## Front matter

### F.1 · What this document is for

Clara's signup is self-serve: a Malaysian accounting firm creates an account, confirms an email
code, signs the data-processing consent, and pays through Stripe Checkout, and a firm exists at
the end of it. Today the only text the applicant agrees to is the **data-processing consent** —
which is a PDPA instrument and nothing else. It says who processes what, where it goes, and what
rights the firm has. It does **not** say what the service is, what it costs, who owns the books,
what happens when it breaks, or what happens when either side walks away.

**So there is presently no contract.** Absent one, the relationship falls back to whatever a
court would imply, which is a bad place for both sides — worse for the operator, who has no cap,
no disclaimer, and no termination path, and worse for the firm, which has no written promise
about its own data. This document is the missing contract, drafted to sit beside the consent
rather than swallow it.

It is written for a customer who is a **Malaysian accounting firm**, not a consumer, not an
enterprise with a procurement department, and not a developer. Short clauses, plain English, and
every place a lawyer must look marked `[LAWYER]`.

### F.2 · How it is presented

Accepted at the **same signup step as the DPA**, as a separate tick with a separate record —
step ④ of the checkout gate (`docs/plan/active/checkout-gate-design.md` §1). Two texts, two
scroll panes or two links, two ticks, one screen. Neither is pre-ticked. Neither is bundled into
another action. The applicant cannot reach Stripe Checkout (step ⑤) until both are recorded.

The evidence shape is the DPA's existing one, reused: bind the **version key** and the
**sha256 of the exact bytes shown**, plus the user and the timestamp. Spelling is not identity —
recording "they agreed to beta-terms v1" proves nothing about what v1 said on that day; recording
the digest does.

### F.3 · One document kind or two? — the recommendation, and the byte-identity consequence

The storage question the owner has to settle: does the terms text become a **second body inside
the DPA's existing row** (one combined "Beta Agreement", zero schema change), or a **second
document kind in the same store** (`kind in ('dpa','terms')`, one additive migration)?

**Recommendation: two document kinds. Do not combine the bodies.** Three reasons, the first of
which is the one that decides it.

1. **A consent and a contract must be separately withdrawable, and one body makes that
   impossible.** PDPA consent is withdrawable at any time; the DPA text already promises exactly
   that ("You may withdraw at any time by writing to tools@belcort.com"). A contract is not
   withdrawable by one side at will. If the two live in one body under one signature, there is
   no way for the firm to say "I withdraw my consent" as an act distinct from "I terminate the
   contract", and no way for the store to record that it happened. Worse, it makes the consent
   look bundled — consent obtained as a condition of a commercial agreement is the classic weak
   consent, and s.129(3)(a) of the PDPA is the basis the whole cross-border position rests on
   (`pdpa-cross-border-transfer-basis-memo.md` §6.1). Combining them puts the strongest leg of
   the compliance file at risk to save one migration.
2. **The byte-identity law does not survive combination intact.** 裁-90's law is per-body: the
   canonical body is the content between its `clara-dpa-body` markers in its own file, and the
   row's `source_path` names that file as provenance. Two bodies in two files, two digests, two
   `source_path` values — the law generalises with no change at all. **One combined body means
   one digest over a mixture**: a lawyer's edit to a single indemnity clause changes the digest
   of the *consent*, so every firm's data-protection signature is suddenly "against a superseded
   version" for a reason that has nothing to do with data protection, and the re-consent promise
   in DPA ¶10 fires on a commercial edit. The digest stops meaning "what you agreed to about your
   data" and starts meaning "what the whole legal pack said that week".
3. **Length.** The DPA v2 body is deliberately short enough to read at a signup step. These Terms
   are roughly three times its length. Folding them together produces a body nobody reads, which
   is the substantive complaint about click-wrap generally, and which JPDP's own notice-then-
   consent sequencing (Guideline No. 3/2025 §7.2–7.3) is designed to prevent.

**What "two kinds" costs, precisely.** One additive migration, no D1 write-quiesce window, no
rewrite of anything already stored:

- `clara.dpa_documents` gains `kind text not null default 'dpa'` with a CHECK over a closed list.
  Every existing row is a `'dpa'` by the default, so nothing is restated.
- The partial unique index that today admits exactly one row with `effective_to is null` must
  become **`(kind) where effective_to is null`** — otherwise the first terms row collides with
  the current DPA row and the migration fails at apply. *This is the one line that will be missed
  if the migration is written from the prose above rather than from the live index definition.*
- `clara.dpa_signatures` is already unique per `(user_id, dpa_version)`, and version keys are
  globally distinct (`clara-beta-2026-08-a` vs `clara-beta-terms-2026-09-a`), so **one user can
  hold one signature per document without a schema change** — but the door and the read surface
  must stop assuming "the current document" is singular. `[LAWYER]` is not the marker for this
  one; it is a build note for the FS-4 lane.
- The checkout intent's mid-flow pin becomes two pins, so a signup that starts before a swap and
  finishes after it completes against the pair it was shown.
- The table stays append-only, and the one permitted UPDATE is still the first `effective_to`
  stamp. Nothing about 裁-90's swap ceremony changes; it runs twice, once per kind.

**Rejected alternative — a separate table.** It buys nothing. The columns are identical, the
append-only property is identical, the swap ceremony is identical, and a second table doubles the
surface that has to keep them.

### F.4 · The rendering rule this text obeys

裁-58 forbids the string **"RM0"** on any customer-facing surface — it reads as "free", and beta
is not free, it is unpriced. This document therefore says **"no fee is charged"** and **"trial"**
in words and never prints a zero amount. If the lawyer's revision reintroduces a numeral there,
it reintroduces the defect.

### F.5 · Launch-time checklist for the lawyer

Ordered by what blocks a live launch, not by clause number.

| # | Item | Where |
|---|---|---|
| 1 | **The liability cap is a real number, not the fees paid.** During beta the fees paid are nil, so a fees-paid cap is an absolute exclusion in substance, and the Federal Court in *CIMB Bank Bhd v Anthony Lawrence Bourke* held that a clause absolutely precluding a remedy is void under s.29 Contracts Act 1950. Pick the floor figure. | §10.3 |
| 2 | **Fill every `[verify]` placeholder**: company registration number, registered address, DPO name once appointed, the support and legal contact addresses, the notice period figures, the cap figure. A signing customer sees placeholders; the DPA's own drafting rule forbids them in a live body. | throughout |
| 3 | **Rule on the forum**: courts of Malaysia at Kuala Lumpur (recommended, §12.2) or AIAC arbitration. Read §12.2's reasoning before choosing arbitration. | §12.2 |
| 4 | **Confirm the consumer question**: is a sole-proprietor accounting firm ever a "consumer" under s.3 Consumer Protection Act 1999, and does s.24B's "shall apply to all contracts" pull Part IIIA over a B2B contract? The draft is written to survive either answer; confirm that is still true after your edits. | §10.1 |
| 5 | **SST treatment** of a locally-supplied accounting-software subscription, and the registration threshold and taxable-service group that apply to BELCORT. | §6.5 |
| 6 | **e-Invoice**: when BELCORT starts charging, confirm whether MyInvois applies at BELCORT's turnover, and what the customer is entitled to receive. | §6.6 |
| 7 | **The four PDPA items the cross-border memo left open**: JPDP data-controller registration, the s.12A DPO appointment and notification, the s.12B breach-notification runbook, and whether to commission a Transfer Impact Assessment. None is closed by these Terms. | §5, memo §8 |
| 8 | **Check the IP position on AI output** — the Copyright Act 1987's authorship requirement and what it means for reports Clara drafts. The draft assigns rather than warrants. | §7.3 |
| 9 | **Confirm the entire-agreement and non-reliance wording** cannot be read to exclude liability for fraudulent misrepresentation. | §12.6 |
| 10 | **Decide the deletion and export periods** against the firm's own 7-year record-keeping duties, and confirm they match the DPA's retention sentence. | §11.3 |
| 11 | **Review the acceptable-use clause** for anything unenforceable as drafted, particularly the competing-product restriction. | §4 |
| 12 | **Confirm the professional-responsibility framing** against the MIA By-Laws — that the Operator gives no accounting or tax advice and the firm stays the professional of record. | §4.4 |

### F.6 · Sources this draft relies on

Each is named where it is used. **Nothing below was drafted from memory**; where a section number
could not be confirmed against an official text in this session it is marked `[verify §]`.

- **Contracts Act 1950 [Act 136]** — s.10 (agreements are contracts), s.24 (lawful object),
  **s.29 (agreements in restraint of legal proceedings are void, with Exceptions 1 and 2 saving
  arbitration)**, ss.74–75 (damages). *Section numbers taken from the reprint and from the
  Federal Court commentary cited at F.5 item 1; the full official text was not fetched in this
  session —* `[verify §]` *on ss.10, 24, 74, 75.*
- **Consumer Protection Act 1999 [Act 599]** — s.2 (application, with s.2(2)'s exclusions),
  s.3 ("consumer" means a person acquiring goods or services **of a kind ordinarily acquired for
  personal, domestic or household purpose**), Part IIIA ss.24A–24J (unfair contract terms; s.24A
  "unfair term" and "standard form contract", s.24B application, s.24C procedural unfairness,
  s.24D substantive unfairness). *`[verify §]` on the current status of s.2(2)(g) (electronic
  trade transactions) and on the exact reach of s.24B — the official PDF could not be text-
  extracted here and the academic literature disagrees about s.24B.*
- **Personal Data Protection Act 2010 [Act 709]**, as amended by the **Personal Data Protection
  (Amendment) Act 2024 [Act A1727]** — s.129 as rewritten (whitelist deleted 1 April 2025;
  s.129(3)'s seven self-standing bases), new s.12A (Data Protection Officer, in force 1 June
  2025), new s.12B (breach notification, in force 1 June 2025), new s.5(1A) and amended s.9
  (the Security Principle now binds a data processor directly, in force 1 April 2025), and the
  global "data user" → "data controller" rename. Commencement per **P.U.(B) 522/2024**. Guidance:
  **Personal Data Protection Guidelines No. 3/2025 (Cross Border Personal Data Transfer)**
  §§4.1–4.2, 5.3–5.6, 7.2–7.3, 16.2. *All of this is already verified and cited in*
  `docs/ops/legal/pdpa-cross-border-transfer-basis-memo.md` *— this draft does not re-derive it.*
- **Personal Data Protection (Class of Data Users) Order 2013 [P.U.(A) 336/2013]**, Schedule
  item 9(a)(iii) — "accountancy" is a registrable class.
- **Electronic Commerce Act 2006 [Act 658]** — s.2 (application to commercial transactions
  conducted electronically, subject to the Schedule), s.3 (consent to use electronic messages,
  which may be inferred from conduct), s.6 (legal recognition), **s.7 (formation and validity of
  contract — a contract is not denied validity because an electronic message was used in its
  formation)**, **s.9 (signature — an electronic signature attached to or logically associated
  with the message, adequately identifying the signer and indicating approval, and as reliable as
  is appropriate)**, and the Schedule (the Act does not apply to powers of attorney, wills and
  codicils, trusts, or negotiable instruments). *`[verify §]` on the internal lettering of s.9's
  conditions and on whether "consent" sits at s.3 or s.5 in the current reprint — two secondary
  sources numbered it differently.*
- **Digital Signature Act 1997 [Act 562]** — s.62 (a digital signature made in accordance with
  the Act satisfies a signature requirement and is as legally binding as a handwritten one).
  **It is an enabling route, not a mandate**: nothing in the DSA requires a certified digital
  signature for an ordinary commercial contract, and the ECA 2006 route above is what a click-
  wrap acceptance uses. Said plainly at §12.9.
- **Limitation Act 1953 [Act 254]** — s.6(1), six years for actions founded on contract or tort.
  Relevant because s.29 Contracts Act 1950 voids a clause that *shortens* that period.
- **Income Tax Act 1967 s.82A** and **Companies Act 2016 s.245** — seven-year record retention.
  `[verify §]` on the precise subsections.
- **Service Tax Act 2018 [Act 807]** and the service-tax expansion effective 1 July 2025.
  `[verify §]` on the taxable-service group and registration threshold that catch a locally-
  supplied accounting-software subscription — the digital-services provisions most often quoted
  (ss.56A–56F) address **foreign** registered persons, and BELCORT is a local supplier.
- **MIA By-Laws (On Professional Ethics, Conduct and Practice)** — R114.1(d), R114.2, R114.3(b),
  quoted verbatim and verified in `docs/ops/legal/client-ai-authorization-letter-template.md`.
- **Product law**: `docs/product/PRD.md` §6 (invariants 1, 2, 5, 8, 10, 16(a), 16(b)),
  `docs/ops/DR.md` §§1–5 (backup posture), `docs/plan/active/billing-design.md` §§1–3,
  `docs/plan/active/checkout-gate-design.md` §§1–3, ADR-0077 (裁-57 · 58 · 68 · 73 · 74).

### F.7 · Facts about the product this draft asserts, and where each comes from

A customer-facing promise that the product does not keep is worse than no promise. Every
operational claim below is traceable.

| Claim in the Terms | Source |
|---|---|
| the DB owns every authoritative number; Clara proposes | PRD §6 invariant 1 |
| accounting history is append-only; corrections are reversals | PRD §6 invariant 8 |
| enumerated acts are reserved to a human | PRD §2 (as narrowed by ADR-0071) |
| client documents egress only under typed, purpose-scoped consent plus a separate owner activation, re-checked at dispatch | PRD §6 invariant 16(a); digest law 58 |
| vendor trace export ships OFF | PRD §6 invariant 16(b); ADR-0011; digest law 57 |
| roles are `viewer < bookkeeper < admin < owner`, DB-enforced; one firm per user; the last active owner cannot be removed | PRD §2 |
| tenant isolation is forced RLS plus EXECUTE-only grants; no service credential reaches a browser | PRD §6 split-trust corollary |
| exports are CSV / PDF / XLSX, persisted as auditable artifacts | PRD §4 item 15, §5 item 8 |
| daily managed backups, 7-day retention, **no point-in-time recovery today**; RPO ≤ 24h and RTO ≤ 4h are *targets*, not SLAs; a real restore has been exercised | `docs/ops/DR.md` §§1–2, §5 |
| hosting is Supabase (ap-southeast-1), Fly.io (Singapore), Cloudflare | DPA ¶4, `docs/ARCHITECTURE.md` |
| Stripe holds card details; the DB keeps only reconciliation fields | DPA ¶9(b); 裁-91 |
| an unpaid signup is never deleted and is never sent a reminder | 裁-74 |
| beta runs at a trial price; nothing is charged until the price is ruled and re-accepted | 裁-57, 裁-58; ADR-0077 |
| MyKad and passport images are excluded from ingestion | DPA ¶6; ADR-0072 ⑤ |

---
---

# ClaraBook — Beta Terms of Service

**Version `beta-terms v1`. Effective from the date you accept it. English governs.**

**Please read this before you tick.** It is short on purpose. If a clause is unclear, write to us
before you agree, not after — [verify: support address, e.g. `support@belcort.com`; the owner
contact of record today is `tools@belcort.com`].

---

## 1 · Who this is between, and what the words mean

**1.1 The parties.** These Terms are an agreement between:

- **the Operator** — **BELCORT SDN BHD**, a company incorporated in Malaysia, company number
  [verify: SSM registration number], registered office [verify: registered address] ("we", "us",
  "our"); and
- **the Firm** — the accounting firm that accepts these Terms and opens a firm on ClaraBook
  ("you", "your").

**1.2 Definitions.**

| Term | Meaning |
|---|---|
| **ClaraBook** | the platform: the web application, the database, the agent runtime, and everything we operate to deliver them. |
| **Clara** | the AI agent inside ClaraBook — the part that reads documents, drafts entries, answers questions and proposes work. |
| **Clients** | your own clients, whose books and documents you process using ClaraBook. **They are not our customers and they do not log in.** |
| **Firm Data** | everything you or your Members put into ClaraBook, or that ClaraBook produces for you: documents, transactions, accounting records, reports, the client knowledge base, and the personal data inside any of them. |
| **Members** | the individuals you authorise to use ClaraBook under your firm. |
| **the DPA** | *Clara — data processing consent*, the data-processing text you sign at the same signup step, in the version recorded against your signature. |
| **Beta** | the period before we set prices and tell you they apply, described in §2. |
| **PDPA** | the Personal Data Protection Act 2010 [Act 709], as amended by the Personal Data Protection (Amendment) Act 2024 [Act A1727]. |

**1.3 A note on the two names.** "Clara" is the agent; "ClaraBook" is the platform she works
inside. We use them precisely because §4 turns on the difference: Clara proposes, and the
platform's database decides. `[LAWYER]` — *and a naming note for the owner: the DPA text
currently uses "Clara" for both the agent and the operating platform. Whichever pair of names is
chosen must be used identically in both documents before either goes live.*

---

## 2 · Beta — what it does and does not mean

**2.1 ClaraBook is in beta, and beta here means early, not incomplete.** We are not holding
features back and we are not shipping you a demonstration. What is built is built and it is the
same product we intend to sell. What beta means is that the product is young: it changes often,
it has not been through a year of other firms' edge cases, and we have not yet set our prices.

**2.2 What may change.** Features may be added, changed or withdrawn during Beta. Where a change
removes something you were relying on, we will tell you before it happens where we practicably
can, and afterwards where we cannot. Changes to *these Terms* follow §12.5, not this clause.

**2.3 No service level yet.** There is **no SLA during Beta** — no uptime commitment, no response
time, no credits. §9 says what we actually do about availability and backups, so you can judge
the risk yourself rather than take a number on trust. `[LAWYER]`

**2.4 Price during Beta.** **No fee is charged during Beta.** Checkout runs in subscription mode
at a trial price and your card is collected but not charged. You will see "trial" on your plan,
not an amount.

**2.5 How a price is introduced.** We will not begin charging you by letting a trial lapse. Before
your first paid cycle:

  (a) we will tell you the price, the included quantities, and the date the first paid cycle
      starts, at least **[verify: 30] days** beforehand; and
  (b) you must **actively accept** the priced plan. Silence is not acceptance and continued use
      is not acceptance.

If you do not accept, your firm moves to §11's termination path with the full export window; we
do not charge you and we do not lock your data away because you declined. `[LAWYER] — this
clause is the substance of the owner's ruling that nothing charges until the price is ruled and
re-accepted; it should survive review intact.`

**2.6 Support during Beta.** Support is by email to [verify: support address], best-effort,
Malaysian business hours [verify: hours]. We do not promise a response time during Beta. There
is no telephone support.

---

## 3 · Your account, your firm, and your people

**3.1 Signing up.** You create an account, confirm your email address with a six-digit code we
send you, sign the DPA, and complete checkout. A firm exists only when all of that is done. If
you stop part-way, **your incomplete signup is kept, not deleted, and we will not send you
reminder emails**. You can come back and finish it.

**3.2 You must be authorised.** By accepting, you confirm you are authorised to bind the Firm.

**3.3 Roles.** ClaraBook has four roles, enforced in the database rather than in the interface:

| Role | What it can do |
|---|---|
| **viewer** | read and export |
| **bookkeeper** | day-to-day bookkeeping — upload, chat with Clara, propose and approve journals, propose knowledge entries |
| **admin** | firm administration — approve knowledge entries, invite and manage Members, firm settings, create clients |
| **owner** | ownership acts — transfer, firm deletion |

Each role includes the ones below it. Some structural rules follow from this and cannot be
switched off: **one person belongs to one firm**, the **last active owner cannot be removed**, a
Member cannot demote or remove themselves, and a Member cannot act on someone of strictly higher
rank.

**3.4 You are responsible for your Members.** You choose who gets an account and what role they
hold. Their acts on ClaraBook are your acts for the purposes of these Terms. You must remove a
Member's access promptly when they leave or change role — removal takes effect immediately, not
at the end of a session.

**3.5 Credentials.** Keep them secret; one account per person; tell us promptly at [verify:
security contact] if you believe an account has been compromised. We will never ask you for your
password.

**3.6 Accuracy.** Keep your firm's contact and billing details current. We send notices to the
email address on the owner account (§12.4).

---

## 4 · How you may use ClaraBook, and where professional responsibility sits

**4.1 The licence.** For as long as this agreement runs, we grant you a non-exclusive,
non-transferable right to use ClaraBook for your firm's own accounting work for your own Clients.

**4.2 What you must not do.** You must not:

  (a) upload identity-card (MyKad) or passport images. ClaraBook does not send them to AI
      providers and we do not want them in the system;
  (b) put data into ClaraBook that you have no authority to process or to disclose to a
      processor — see §4.5;
  (c) attempt to reach another firm's data, test or circumvent the tenant-isolation or
      authorisation walls, or use a credential you were not issued. **Reporting a weakness you
      find in good faith is welcome and is not a breach of this clause** — write to [verify:
      security contact];
  (d) attempt to make Clara act outside the authority the product gives her, including by
      embedding instructions in documents or messages intended to be read as commands;
  (e) resell, sublicense, or white-label ClaraBook, or provide it as a service to anyone other
      than your own Clients, without our written agreement;
  (f) copy, decompile or reverse-engineer the platform except to the extent Malaysian law says
      you may despite this clause;
  (g) use ClaraBook to break the law, or to process data for a purpose your Client has not
      authorised;
  (h) use ClaraBook, or its outputs, to build or train a competing product or model.
      `[LAWYER] — narrow this to what is genuinely necessary and enforceable; a broad
      competing-product clause in a small-business contract is often more trouble than it is
      worth.`

**4.3 Fair use of the AI allowance.** Your plan includes an AI allowance shared across your whole
firm. Use above the allowance is billed as its own line, never as a silent throttle: **we do not
stop your service because an allowance ran out**, and we do not archive or delete your clients to
reduce your bill.

**4.4 You remain the professional of record.** This is the most important clause in the document.

  (a) You are the accountant. Your obligations under the **MIA By-Laws (On Professional Ethics,
      Conduct and Practice)** and every other rule that binds your practice remain yours,
      unchanged and undiminished by anything ClaraBook does.
  (b) **We do not provide accounting, audit, tax or legal advice.** We provide software. Nothing
      Clara says, drafts, proposes or explains is our professional advice to you or to your
      Client, and we are not engaged by your Client for anything.
  (c) **Clara prepares and proposes; she does not decide.** Every authoritative figure in your
      books is produced by the platform's database from your own data by a deterministic,
      versioned calculation — never typed by the AI model. Clara can propose a figure and can
      check one, but a number she generated does not enter a durable report unless the database
      reproduces it.
  (d) **Some acts are reserved to a human and Clara can never satisfy them**, including closing a
      period, approving opening balances, excepting a bank line, statutory wording, designating a
      canonical record, granting a capability, and e-filing.
  (e) **Review the work.** Clara is good and she is not infallible. You must review what she
      produces before you rely on it, issue it, or file it. `[LAWYER]`

**4.5 Your Clients' own authorisation is still your job.** Signing the DPA covers your firm's own
data and your instructions to us. **It does not give you authority to send your Clients'
confidential information outside your firm.** For that, each Client must authorise the disclosure
under **MIA By-Law R114.3(b)**, be given PDPA notice, and consent to any transfer outside
Malaysia. We provide a template letter; obtaining it and keeping the signed original is yours.
The DPA says the same thing at its paragraph 7, and neither document changes the other.

---

## 5 · Data

**5.1 Your data is yours.** Firm Data belongs to you (or to your Clients, as between you and
them). We claim no ownership of it. §7.2 says what licence we need to run the service, and it is
no wider than that.

**5.2 The roles under the PDPA.** For Firm Data, **you are the data controller** (the PDPA's term
since the 2024 amendment; formerly "data user") and **we are your data processor**. We process it
to run ClaraBook for you, on your instructions. Our own providers act as our processors in turn.
Since 1 April 2025 the PDPA's Security Principle binds a processor directly, so this is our
obligation as well as yours, not merely a promise to you.

**5.3 The DPA governs the detail.** What we process, where it goes, which providers see it, how
long it is kept, and what rights the people in your data have are all set out in **the DPA**, in
the version recorded against your signature. **Read it. It is not boilerplate** — it names the
countries, the providers, and the two limits on deletion.

**5.4 AI processing.** Document contents and accounting data are read by AI providers outside
Malaysia. Inside the product, a client document leaves ClaraBook **only** under a typed,
purpose-scoped consent, activated separately, and re-checked at the moment of dispatch — a
consent on file does not by itself authorise a send. Cross-border transfers rest on your
Clients' consent under **s.129(3)(a) PDPA** and, separately, on contractual necessity under
**s.129(3)(b)**.

**5.5 Traces stay with us.** ClaraBook's internal run traces are written to storage we control.
**We do not export traces to any outside vendor.** If that ever changes it will require an
executed processor agreement, your Clients' authorisation, a documented cross-border basis, short
retention and tested deletion — and you will be told before it happens, not after.

**5.6 No training on your data.** We do not permit your data to be used to train AI models, and
we do not sell it.

**5.7 Aggregated and anonymised data.** We may use aggregated, de-identified information about how
ClaraBook is used to operate and improve it. This never includes Firm Data or anything that
identifies you, a Member, a Client, or any individual. `[LAWYER]`

**5.8 Breach.** If we become aware of a personal-data breach affecting Firm Data we will tell you
without undue delay, with what we know, so you can meet your own duty to notify the Commissioner
under **s.12B PDPA**. Our duty to you here does not displace yours as data controller.

---

## 6 · Fees, billing and tax

**6.1 The shape of the price.** A ClaraBook subscription is one base charge per firm, which
includes a number of paid seats, a number of active-client slots and a shared AI allowance.
Anything above an included quantity is billed as **its own line on the invoice** — never folded
invisibly into the base. Your invoice shows every component so you can reconstruct the total
yourself.

**6.2 What counts.** A **seat** is capacity, not a named person: the owner, admin and bookkeeper
roles consume a seat; viewers do not [verify: confirm against the plan you publish]. An **active
client slot** is capacity too, not tied to a particular client. Archived clients carry a lower
retention charge and free their slot; a client scheduled for deletion keeps the retention charge
until it is actually purged, because that is when we stop holding the data. **You are never
charged both an active fee and a retention fee for the same client in the same cycle.**

**6.3 Changes mid-cycle.** Adding capacity takes effect immediately and is **prorated**, and the
AI allowance is prorated with it. Removing capacity takes effect at the start of the next cycle.
We never automatically archive or delete anything to reduce your capacity.

**6.4 Payment.** Payment is by card through **Stripe**, our payment processor. **We do not store
your card details** — Stripe does. Our database keeps only what is needed to reconcile a payment:
the payment and session identifiers, amount, currency, status and timestamps. Stripe's own terms
and privacy policy govern its handling of your payment details, and a request about those details
goes to Stripe.

**6.5 Tax.** All fees are **exclusive of Sales and Service Tax (SST)** and of any other tax or
duty. Where SST applies to the service, we will add it and show it as its own line. **No SST
arises during Beta because no fee is charged.** `[LAWYER] [verify §] — confirm the taxable-service
group and the registration threshold that apply to a locally-supplied accounting-software
subscription under the Service Tax Act 2018 and the 1 July 2025 expansion. The digital-services
provisions most often quoted address foreign registered persons, and BELCORT is a local supplier,
so those are the wrong provisions to cite here.`

**6.6 Invoices.** We issue an invoice for each cycle. `[verify] — confirm whether MyInvois
e-invoicing applies at BELCORT's turnover when charging begins, and state here what the customer
receives.`

**6.7 Refunds.** **Nothing is charged during Beta, so nothing is refundable.** After Beta, fees
are non-refundable except where Malaysian law requires otherwise or where we have charged you in
error, in which case we refund the error. `[LAWYER]`

**6.8 Late payment and suspension.** If a payment fails we will tell you and give you at least
**[verify: 14] days** to fix it. If it is still unpaid after that we may suspend access to
ClaraBook. **Suspension is not deletion.** For at least **[verify: 30] days** after suspension you
keep the ability to export your data (§11.2), and we do not delete Firm Data during that window.
`[LAWYER] — a suspension that also blocks export would leave a firm unable to meet its own
statutory record-keeping duty; keep the export path open.`

**6.9 Price changes after Beta.** We may change prices on at least **[verify: 30] days'** notice
before the start of a cycle. If you do not accept a change, you may terminate under §11.1 before
the new price takes effect, and the old price applies until then.

---

## 7 · Intellectual property

**7.1 Ours.** We own ClaraBook — the software, the database design, the models of the accounting
domain, the interface, the documentation and everything in them. Nothing here transfers any of it
to you. You get the licence in §4.1 and nothing more.

**7.2 Yours.** You own Firm Data. You grant us a non-exclusive licence to host, copy, transmit,
process and display it **for the sole purpose of providing ClaraBook to you** and for the
purposes set out in the DPA. The licence lasts as long as we hold the data under §11.3 and no
longer. It does not let us do anything with your data that the DPA does not cover.

**7.3 What Clara produces for you.** Reports, journals, analyses and other outputs Clara drafts
from your data are yours to use without restriction. To the extent we hold any right in them, we
assign it to you. **We do not warrant that any output attracts copyright** — Malaysian copyright
law requires a human author, and the position on AI-assisted output is unsettled.
`[LAWYER] [verify §] — Copyright Act 1987, the authorship requirement.`

**7.4 Feedback.** If you send us an idea, a bug report or a suggestion, we may use it freely and
without payment. You keep no rights in it and we take on no obligation to act on it. We will not
identify you as its source without asking.

**7.5 Your name.** We will not use your firm's name or logo as a customer reference without your
written agreement.

---

## 8 · Confidentiality

**8.1 The obligation.** Each of us will keep the other's confidential information confidential,
use it only for this agreement, and protect it at least as carefully as our own. **Firm Data is
your confidential information.** ClaraBook's non-public technical detail is ours.

**8.2 The usual exceptions.** The obligation does not cover information that is public through no
breach, was already known without a duty of confidence, is independently developed, or is
lawfully received from a third party. It also does not stop a disclosure required by law, a
regulator or a court — where the disclosure is compelled, the disclosing party will tell the other
first if it is lawfully able to.

**8.3 How long.** Three years after this agreement ends, **except for Firm Data and anything
about your Clients, which stays confidential indefinitely** — your professional duty of
confidentiality has no expiry date and neither does ours to you. `[LAWYER]`

---

## 9 · Availability, backups and disaster recovery

This section is written to be checkable rather than reassuring. **There is no SLA during Beta**
(§2.3); what follows is what we actually do.

**9.1 Where ClaraBook runs.** The database is hosted with Supabase in the ap-southeast-1
(Singapore) region, the agent runtime on Fly.io in Singapore, and the web application is served
over Cloudflare's network. The DPA names these too, because they are cross-border transfers as
well as an operational fact.

**9.2 Backups.** The database has **managed daily backups with seven days' retention**.
**Point-in-time recovery is not enabled today.** In plain terms: if something goes badly wrong, we
recover to the most recent daily backup, not to the minute before it happened. Firm documents in
storage are backed up separately.

**9.3 Our internal targets** — targets, not promises, and not SLAs:

| | |
|---|---|
| Maximum data loss in a recovery (RPO) | 24 hours |
| Maximum time to restore into a fresh environment (RTO) | 4 hours |

**9.4 We rehearse.** We have performed real restores, not described ones, and we re-verify on a
schedule. A backup nobody has restored is not a backup.

**9.5 Maintenance.** We may take ClaraBook down for planned maintenance. We will give notice where
we practicably can and prefer low-traffic windows. Emergency maintenance may happen without
notice.

**9.6 Your own copy.** Whatever we do, **export your data periodically** (§11.2). You have
seven-year record-keeping duties of your own [verify §: Income Tax Act 1967 s.82A; Companies Act
2016 s.245] and those are yours to meet, not ours.

---

## 10 · Warranties, disclaimers and liability

*This is the section a Malaysian lawyer must read hardest, for the reason at F.5 item 1.*

**10.1 Whether the Consumer Protection Act 1999 applies.** We think it does not: under **s.3 of
the Consumer Protection Act 1999**, a "consumer" acquires goods or services **of a kind ordinarily
acquired for personal, domestic or household purpose**, and an accounting firm buying
accounting-firm software is not doing that. But **nothing in this agreement is drafted to depend
on that being right.** If any part of that Act — including **Part IIIA** on unfair contract terms —
does apply, it applies, and any term of ours that conflicts with it gives way to the extent of
the conflict. `[LAWYER] [verify §] — confirm whether s.24B's "shall apply to all contracts"
extends Part IIIA beyond consumer contracts; the commentary is not settled, and a sole
proprietorship blurs the line further.`

**10.2 What we warrant, and what we do not.**

  (a) We warrant that we will provide ClaraBook with reasonable care and skill.
  (b) Otherwise, and **to the extent Malaysian law permits**, ClaraBook is provided as it is. We
      do not warrant that it will be uninterrupted or error-free, that Clara's proposals will
      always be right, or that it will meet a requirement you have not told us about.
  (c) **Nothing in this agreement excludes or restricts any liability that Malaysian law does not
      allow us to exclude or restrict.** `[LAWYER]`

**10.3 Limitation of liability — and the clause that must not be got wrong.**

  (a) Neither of us is liable to the other for indirect or consequential loss, loss of profit,
      loss of business, loss of goodwill, or loss of anticipated savings.
  (b) Subject to (c), each party's total liability arising out of or in connection with this
      agreement, in contract, tort (including negligence) or otherwise, in any twelve-month
      period, is capped at **the greater of (i) the fees you paid us in the twelve months before
      the claim arose and (ii) RM[verify: a real figure — RM5,000 is a placeholder, not a
      recommendation]**.

  > **`[LAWYER]` — READ THIS BEFORE ACCEPTING (b).** A cap expressed only as "the fees paid" is
  > **nil during Beta**, because no fee is charged. A cap of nil is not a limitation of liability;
  > it is a total exclusion, and in *CIMB Bank Bhd v Anthony Lawrence Bourke* the Federal Court
  > held that a clause absolutely precluding a party from any remedy is **void under s.29 of the
  > Contracts Act 1950**. The monetary floor in (ii) exists to stop the cap collapsing to nothing.
  > **Choose the figure deliberately.** A figure so small it is illusory reproduces the same
  > problem; a figure the Operator could not survive is not a limitation either. Delete the floor
  > and you are very likely left with an unenforceable clause and therefore no cap at all.

  (c) The cap does not apply to: fraud or fraudulent misrepresentation; wilful misconduct; death
      or personal injury caused by negligence; a party's breach of its data-protection
      obligations under the DPA or the PDPA; your obligation to pay fees due; or any liability
      that cannot lawfully be capped. `[LAWYER]`
  (d) **We do not shorten your time to sue.** The limitation period is whatever the **Limitation
      Act 1953** gives you. *A clause shortening it would be void under s.29 of the Contracts Act
      1950 anyway, so it is not attempted.*

**10.4 Indemnities, both ways and narrow.**

  (a) **You indemnify us** against claims by a third party arising from your putting data into
      ClaraBook that you had no authority to process or disclose, or from your use of ClaraBook
      in breach of §4.2.
  (b) **We indemnify you** against claims by a third party alleging that ClaraBook itself, used
      as we intend, infringes that third party's intellectual property rights in Malaysia.
  (c) Each indemnity is conditional on the indemnified party telling the other promptly, not
      admitting liability, and letting the other conduct the defence with reasonable
      co-operation. Neither indemnity covers a settlement made without the indemnifier's
      agreement. `[LAWYER]`

**10.5 Nothing here limits your professional obligations.** A cap between us has no effect on what
you owe your own Clients or your regulator.

---

## 11 · Term, termination, export and deletion

**11.1 Term and termination.**

  (a) This agreement starts when you accept it and runs until it is ended.
  (b) **During Beta, either of us may end it at any time on [verify: 14] days' written notice**,
      for any reason or none.
  (c) After Beta it runs cycle to cycle. You may end it with effect from the end of the current
      cycle; we may end it on **[verify: 30] days'** notice.
  (d) Either of us may end it immediately if the other commits a material breach and does not fix
      it within **[verify: 14] days** of being asked to, or becomes insolvent.
  (e) We may suspend rather than terminate where that is the proportionate response — for
      non-payment (§6.8) or for use that is unlawful or endangers the platform or other firms.
      We will tell you why. `[LAWYER]`

**11.2 Export.** You can export your data at any time while your firm is open, using ClaraBook's
own exports (CSV, PDF and XLSX), and each export is kept as an auditable artifact. **After
termination or suspension you keep the ability to export for [verify: 30] days.**

**11.3 Deletion.** After the export window closes we delete Firm Data within **[verify: 90] days**,
unless Malaysian law requires us to keep something for longer, and subject to the two limits the
DPA already names and which we repeat here so they are not a surprise:

  (a) **Accounting history is append-only by design.** While your firm exists, a correction is
      recorded as a reversal and not as an erasure, and the audit trail is kept. Deletion under
      this clause removes the dataset; it does not rewrite history inside a live firm.
  (b) **Payment details are Stripe's**, not ours, and are deleted on Stripe's own retention terms.
      Our reconciliation fields (§6.4) are financial records we may need to keep for our own
      statutory period.

  `[LAWYER] — align these figures with the DPA's retention sentence and with the Operator's own
  seven-year record-keeping duties. A firm should be told plainly to export before deletion,
  because its statutory duty to keep records outlives its subscription.`

**11.4 What survives.** §§1, 5.8, 7, 8, 10, 11.3, 11.4 and 12 survive termination, along with any
payment obligation already accrued.

---

## 12 · General

**12.1 Governing law.** Malaysian law governs this agreement and anything arising out of it,
including non-contractual claims.

**12.2 Disputes and forum — the recommendation, with the reasoning.**

  (a) **First, talk.** If a dispute arises, either of us may raise it in writing, and both of us
      will try in good faith to settle it within **[verify: 30] days**. **This step never blocks
      anyone**: either party may go to court at any time, before or during the window, and this
      clause does not restrict that right or shorten any time limit. *(Drafted this way on
      purpose — a mandatory pre-action step that barred proceedings would itself risk being a
      restraint under s.29 of the Contracts Act 1950.)*
  (b) **Then, the courts of Malaysia**, with proceedings commenced in **Kuala Lumpur**.

  > **`[LAWYER]` — courts, not arbitration, and why.** Exception 1 to s.29 of the Contracts Act
  > 1950 expressly saves an arbitration agreement, so an AIAC clause would be valid. It would
  > still be the wrong choice here. Both parties are Malaysian, so there is no foreign-forum
  > problem to solve. The customers are small firms, and the disputes will be small — a monthly
  > subscription, a disputed invoice line, a data question. Arbitration's fees and tribunal costs
  > would exceed the amount in dispute in most realistic cases, which in practice denies the
  > smaller party a remedy and makes the clause look like a barrier rather than a forum. The
  > courts, including the Magistrates' and Sessions Courts for small sums, are cheaper and faster
  > for this profile. **Choose arbitration only if the customer profile changes** — larger firms,
  > cross-border customers, or a confidentiality need the courts cannot meet.

**12.3 Force majeure.** Neither of us is liable for a failure caused by something genuinely
outside our control. This never excuses a payment obligation, and it does not extend indefinitely:
if it lasts more than **[verify: 30] days**, either of us may terminate. `[LAWYER]`

**12.4 Notices.** We send notices to the email address on your owner account, and to any billing
address you have given us. You send notices to [verify: legal/notice address]. An emailed notice
takes effect on the next business day. It is your job to keep your address current (§3.6).

**12.5 Changes to these Terms.**

  (a) These Terms are stored as **versions**. A change is published as a **new version**, with its
      own version key, its own exact text and its own effective date. **Old versions are never
      rewritten or deleted**, and the version you accepted stays recorded against your signup with
      the date and the exact text you saw.
  (b) For a **material** change we show you the new version and ask you to accept it, at your next
      sign-in. Until you do, the version you last accepted continues to govern your use.
  (c) For a change that is not material — a typo, a clarification, a new contact address — we may
      publish the new version and tell you, without asking you to re-accept.
  (d) **A change is never applied retrospectively.** `[LAWYER] — confirm "material" needs no
      further definition; consider naming the categories that always count (price, liability,
      data handling, termination).`

**12.6 Entire agreement.** These Terms, the DPA, and the plan details shown at checkout are the
whole agreement between us and replace anything said before. Neither of us relies on any
statement not written in them. **This does not exclude liability for fraudulent
misrepresentation.** `[LAWYER]`

**12.7 Order of precedence.** If they conflict: **(1) the DPA**, on any data-protection question;
**(2) these Terms**; **(3) the plan details at checkout**, on commercial quantities and prices.
The DPA is put first deliberately — it is the instrument that carries your Clients' data
protection, and a commercial clause should never be able to erode it.

**12.8 Assignment.** You may not assign or transfer this agreement without our written agreement,
which we will not unreasonably withhold. We may assign it to a company that acquires our business
or the ClaraBook product, on notice to you.

**12.9 How you accept, and why that is enough.** You accept by ticking the box and continuing.
That is a valid contract in Malaysia: the **Electronic Commerce Act 2006** provides that a
contract is not denied legal effect because an electronic message was used in its formation
(s.7), and that an electronic signature attached to or logically associated with an electronic
message satisfies a signature requirement (s.9). **A certified digital signature under the
Digital Signature Act 1997 is not required for this agreement** — that Act offers a route
(s.62), not an obligation, and the Electronic Commerce Act route is the one a tick uses. We record
the version, the exact text, the moment, and who accepted.

**12.10 Severability.** If a clause is unenforceable, it is cut to the minimum extent needed and
the rest stands.

**12.11 No waiver.** Not enforcing something once does not give it up.

**12.12 No partnership.** Nothing here makes us partners, agents, or joint venturers, and neither
of us may bind the other.

**12.13 Third parties.** Nobody other than you and us can enforce these Terms. `[LAWYER] [verify]
— confirm the position on third-party rights in Malaysia; there is no Malaysian equivalent of the
UK Contracts (Rights of Third Parties) Act, so this clause may be belt-and-braces rather than
necessary.`

**12.14 Language.** These Terms are written in English, and **the English text governs**. Any
translation, including the Bahasa Malaysia summary at §14, is provided for convenience only.

---

## 13 · How this fits with the DPA — a short map

Because two documents at one signup step invites confusion, here is which one answers what.

| Question | Document |
|---|---|
| What is the service, and what does it cost? | these Terms |
| Who may use it, and in what role? | these Terms §3 |
| Who is the data controller and who is the processor? | the DPA ¶2, restated at Terms §5.2 |
| Which providers see my data, and in which countries? | the DPA ¶¶4–5 |
| What is the legal basis for sending data outside Malaysia? | the DPA ¶5 |
| Can I get my data deleted, and what are the limits? | the DPA ¶9 for the rights; these Terms §11.3 for the periods |
| Who owns the books? | these Terms §7.2 |
| What happens if it breaks? | these Terms §§9, 10 |
| Do I still need my Clients' own authorisation? | **yes** — the DPA ¶7 and these Terms §4.5, saying the same thing |
| Which wins if they disagree? | the DPA, on any data-protection question (§12.7) |

**13.5 Neither document narrows the other.** These Terms do not reduce any right the DPA gives,
and the DPA does not create a commercial obligation these Terms do not.

---

## 14 · Ringkasan dalam Bahasa Malaysia

> **Ringkasan sahaja. Teks Bahasa Inggeris yang mengikat** (§12.14). Sila baca teks penuh dalam
> Bahasa Inggeris sebelum bersetuju. `[LAWYER] — semak terjemahan ini bersama peguam sebelum
> dipaparkan.`

**Siapa.** Perjanjian ini antara **BELCORT SDN BHD** ("Pengendali") dan **firma perakaunan** yang
mendaftar ("Firma"). **ClaraBook** ialah platformnya; **Clara** ialah ejen AI di dalamnya.

**Beta.** ClaraBook berada dalam peringkat beta — ia bermakna produk ini masih muda dan kerap
berubah, **bukan** bermakna ada ciri yang sengaja ditahan. **Tiada yuran dikenakan sepanjang
beta**, dan tiada jaminan tahap perkhidmatan (SLA) lagi. Sebelum sebarang caj bermula, kami akan
memberitahu harganya terlebih dahulu dan **tuan mesti bersetuju semula secara aktif** — diam
bukan persetujuan.

**Akaun dan peranan.** Empat peranan dikuatkuasakan dalam pangkalan data: *viewer*, *bookkeeper*,
*admin*, *owner*. Satu orang, satu firma. Firma bertanggungjawab atas ahlinya sendiri.

**Tanggungjawab profesional.** **Firma kekal sebagai akauntan yang bertanggungjawab.** Pengendali
**tidak** memberi nasihat perakaunan, audit, cukai atau undang-undang. Clara **menyediakan dan
mencadangkan**; pangkalan data yang mengeluarkan setiap angka berwibawa. Beberapa tindakan
dikhaskan untuk manusia — antaranya penutupan tempoh, kelulusan baki pembukaan, dan pemfailan
kepada pihak berkuasa. **Semak hasil kerja Clara sebelum bergantung padanya.**

**Data.** Data Firma milik Firma. Di bawah **APDP 2010**, Firma ialah **pengawal data** dan
Pengendali ialah **pemproses data**. Butiran penuh — apa yang diproses, ke mana ia pergi, berapa
lama disimpan, dan hak tuan — berada dalam **DPA** yang ditandatangani pada langkah pendaftaran
yang sama. **Baca DPA itu.** Jika kedua-dua dokumen bercanggah pada soal perlindungan data,
**DPA yang mengatasi**.

**Pelanggan tuan.** Persetujuan di sini **tidak** memberi kuasa menghantar maklumat sulit
pelanggan tuan ke luar firma. Setiap pelanggan mesti memberi kebenaran sendiri (**By-Laws MIA,
perenggan R114.3(b)**) dan persetujuan APDP untuk pemindahan ke luar Malaysia.

**Bayaran.** Melalui **Stripe**. Kami **tidak menyimpan butiran kad tuan**. Yuran tidak termasuk
**SST**. Tiada bayaran balik kerana tiada caj sepanjang beta.

**Ketersediaan.** Sandaran harian dengan simpanan tujuh hari; **pemulihan ke satu-satu masa (PITR)
belum diaktifkan**. Sasaran dalaman: kehilangan data maksimum 24 jam, masa pemulihan maksimum
4 jam. **Ini sasaran, bukan jaminan.**

**Liabiliti.** Liabiliti dihadkan, dengan pengecualian bagi fraud, salah laku sengaja, dan
pelanggaran kewajipan perlindungan data. Kami **tidak** memendekkan tempoh had masa tuan untuk
menuntut.

**Tamat dan data.** Sepanjang beta, mana-mana pihak boleh menamatkan dengan notis.
**Penggantungan bukan pemadaman** — tuan tetap boleh mengeksport data dalam tempoh yang
dinyatakan. Sila **eksport data tuan secara berkala**: firma tuan mempunyai kewajipan menyimpan
rekod selama tujuh tahun.

**Undang-undang.** Undang-undang Malaysia; **mahkamah di Kuala Lumpur**.

---

## 15 · Version history

| Version | Date | What changed | Status |
|---|---|---|---|
| `beta-terms v1` | 2026-09-02 | First draft. Agent template under 裁-125. | **NOT SEEDED. NOT IN FORCE.** Pending owner review, then a lawyer at official launch. |

**Nothing in this document has been reviewed by a Malaysian lawyer.** Every `[LAWYER]` marker is a
clause where that review changes the outcome, and every `[verify]` is a fact this draft could not
confirm from an official source in the session that wrote it.
