# PDPA Cross-Border Transfer Basis Memo — Clara ↔ AI Processor (OpenAI)

> **DRAFT FOR OWNER (TAO) REVIEW AND SIGNATURE.** This is prepared by Clara's build agent, not
> a lawyer, and is not legal advice. It is a first-pass reading of the Personal Data Protection
> Act 2010 as amended, grounded in sources fetched live on **2026-08-22**, cross-checked against
> what the Clara codebase actually does today. Before this basis is relied on operationally, get
> it checked by a Malaysian data-protection lawyer or JPDP itself — several read points below
> are flagged as unverified and several carry real penalties if BELCORT gets them wrong (see §9).
> This memo is Document 3 of the C6 legal pack ordered 2026-08-22 (owner directive recorded in
> `docs/adr/0074-the-track-a-sitting.md`, TA-P3); Document 1 (OpenAI DPA brief) and Document 2
> (client authorization letter template) are companion drafts in the same directory.

## 1. What this memo is for

BELCORT Sdn Bhd operates Clara, which sends client accounting documents (invoices, statements,
onboarding-interview documents) to an AI processor — today **OpenAI** — for OCR-adjacent
extraction and "witness" corroboration reads. OpenAI's servers are outside Malaysia. Every such
call is a **transfer of personal data to a place outside Malaysia** if the document contains
personal data (a vendor's contact name, a director's name on an SSM extract, a bank statement
holder's name, an employee's name on a payroll slip). Section 129 of the Personal Data
Protection Act 2010 governs whether that transfer is lawful. This memo states: (a) what s.129
requires **today**, in its amended form; (b) which basis Clara/BELCORT should rely on; (c) what
record must be kept; (d) what the owner still has to do.

## 2. The law today: Personal Data Protection Act 2010, section 129, as amended

### 2.1 The regime changed on 1 April 2025 — the whitelist is gone

Section 129 of the **Personal Data Protection Act 2010 [Act 709]** ("Act 709") was rewritten by
the **Personal Data Protection (Amendment) Act 2024 [Act A1727]** — Royal Assent 9 October 2024,
gazetted 17 October 2024.
Source: *Laws of Malaysia, Act A1727*, official text published by the Attorney General's
Chambers' printer, `https://www.pdp.gov.my/ppdpv1/wp-content/uploads/2024/11/Act-A1727.pdf`
(fetched 2026-08-22). Clause 12 of Act A1727 reads, in relevant part:

> "**Amendment of section 129.** 12. Section 129 of the principal Act is amended— (a) by
> deleting subsection (1); (b) in subsection (2)— (i) by substituting for the words 'For the
> purposes of subsection (1), the Minister may specify' the words 'A data controller may
> transfer any personal data of a data subject to'; and (ii) in paragraph (a), by deleting the
> words ', or that serves the same purposes as this Act'; (c) in subsection (3)— (i) by
> substituting for the words 'subsection (1)' the words 'subsection (2)'; … (iv) by deleting
> paragraph (h); (d) by deleting subsection (4); and (e) in subsection (5), by substituting for
> the words 'subsection (1)' the words 'this section'."

**In plain terms:** the old s.129(1) prohibited any transfer outside Malaysia unless it was to a
place the **Minister had specifically gazetted** (the "whitelist"). That subsection is now
**deleted outright**. The old s.129(3) exceptions (which let a data user transfer to a
non-whitelisted place on specific grounds) survive, renumbered, minus one deleted paragraph
(h) and a deleted subsection (4) — both consequential to removing the whitelist mechanism, and
neither reproduced here since their original text was not independently re-fetched (see §9).

**Commencement:** clause 12 came into force on **1 April 2025**, per the official commencement
order:

> "(b) 1 April 2025 as the date on which sections 2, 3, 4, 5, 8, 10 and 12 of the Act come into
> operation."

Source: *P.U.(B) 522/2024, "Appointment of Date of Coming into Operation,"* Federal Government
Gazette, 24 December 2024, `https://www.pdp.gov.my/ppdpv1/wp-content/uploads/2024/12/PENETAPAN-TARIKH-PERMULAAN-KUAT-KUASA.pdf`
(fetched 2026-08-22).

The 2024 Act also globally replaces "data user" with "**data controller**" throughout Act 709
(clause 2). This memo uses "data controller" for the amended-regime discussion and "data user"
only when quoting language the amendment itself has not touched.

### 2.2 The rule in force today

The Personal Data Protection Commissioner's own guideline reproduces the current, in-force text
of s.129(2) and (3) verbatim (issued under s.48(g) of Act 709, so it is a primary regulator
statement of the law, not merely commentary):

> "4.1. Subsection 129(2) of the Act 709 provides that a data controller may transfer any
> personal data of a data subject to any place outside Malaysia if: (a) there is in that place in
> force any law which is substantially similar to the Act 709; or (b) that place ensures an
> adequate level of protection in relation to the processing of personal data which is at least
> equivalent to the level of protection afforded by the Act 709."
>
> "4.2. Notwithstanding subsection 129(2) of the Act 709, data controller may transfer any
> personal data to a place outside Malaysia if: 4.2.1. data subject has given consent to the
> transfer; 4.2.2. the transfer is necessary for the performance of a contract between data
> subject and data controller; 4.2.3. the transfer is necessary for the conclusion or performance
> of a contract between data controller and third party which — (a) is entered into at the
> request of data subject; or (b) is in the interests of data subject; 4.2.4. the transfer is for
> the purpose of any legal proceedings or for the purpose of obtaining legal advice or for
> establishing, exercising or defending legal rights; 4.2.5. the data controller has reasonable
> grounds for believing that in all circumstances of the case — (a) the transfer is for the
> avoidance or mitigation of adverse action against the data subject; (b) it is not practicable to
> obtain the consent in writing of the data subject to that transfer; and (c) if it was
> practicable to obtain such consent, the data subject would have given his consent; 4.2.6. the
> data controller has taken all reasonable precautions and exercised all due diligence to ensure
> that the personal data will not in that place be processed in any manner which, if that place is
> Malaysia, would be a contravention of the Act 709; or 4.2.7. the transfer is necessary in order
> to protect the vital interests of the data subject."

Source: *Personal Data Protection Guidelines No. 3/2025 — Cross Border Personal Data Transfer*,
Version 1.0, issued 29 April 2025 by the Commissioner,
`https://www.pdp.gov.my/ppdpv1/wp-content/uploads/2025/08/GP_CBPDT_EN-1.pdf` (fetched
2026-08-22), §4.1–4.2.

So the structure is: **s.129(2)** is a default gate (similar-law or adequate-protection
jurisdiction — this needs a formal Transfer Impact Assessment, see §2.3); **s.129(3)** is a set
of **seven independent, self-standing bases** that apply *regardless* of s.129(2) — consent,
contract-with-the-data-subject necessity, contract-with-a-third-party necessity, legal
proceedings, reasonable-grounds/adverse-action-avoidance, reasonable-precautions-and-due-
diligence, and vital interests. **Any one basis is sufficient.**

### 2.3 The "similar law / adequate protection" gate needs its own assessment — and expires

s.129(2)'s two limbs each require a **Transfer Impact Assessment ("TIA")** before a data
controller may rely on them:

> "5.6. The findings of the TIA shall be valid for no longer than three (3) years. Beyond that
> period, data controller shall conduct follow-up TIA…"

Source: same Guideline, §5.3–5.6 (fetched 2026-08-22). The TIA must weigh seven factors
including "whether there is similar or equivalent requirement regarding Data Protection
Officer" and "whether there is similar data breach notification requirement" (§5.4.4–5.4.5) —
i.e. it is a real comparative-law exercise, not a checkbox. **Recommendation: BELCORT should not
rely on s.129(2) for the OpenAI transfer** until a TIA is actually commissioned (see §6, §8).

### 2.4 Data Protection Officer duty — new, no small-firm carve-out found in the Act text

Act A1727 inserts a new Division 1A into Part II of Act 709:

> "**12A.** (1) A data controller shall appoint one or more data protection officers who shall be
> accountable to the data controller for the compliance with this Act. (2) Where the processing
> of personal data is carried out by a data processor on behalf of the data controller, the data
> processor shall appoint one or more data protection officers who shall be accountable to the
> data processor for the compliance with this Act. (3) The data controller shall notify the
> Commissioner on the appointment of data protection officer in the manner and form as determined
> by the Commissioner. (4) The appointment of data protection officer … shall not discharge the
> data controller or data processor from all duties and functions under this Act."

Source: Act A1727 (as above), clause 6, new s.12A. **This section carries no numeric threshold,
employee count, or revenue test** — the plain text reads "a data controller shall appoint," full
stop. A small accounting firm is a data controller like any other under the Act's own wording;
nothing in Act A1727 exempts it. Commencement: **1 June 2025** —

> "(c) 1 June 2025 as the date on which sections 6 and 9 of the Act come into operation."

Source: P.U.(B) 522/2024 (as above). **This duty is already in force as of today (2026-08-22).**

### 2.5 Data breach notification duty — new, also in force since 1 June 2025

> "**12B.** (1) Where a data controller has reason to believe that a personal data breach has
> occurred, the data controller shall, as soon as practicable, notify the Commissioner in the
> manner and form as determined by the Commissioner. (2) Where the personal data breach under
> subsection (1) causes or likely to cause any significant harm to the data subject, the data
> controller shall notify the personal data breach to the data subject in the manner and form as
> determined by the Commissioner without unnecessary delay. (3) A data controller who contravenes
> subsection (1) commits an offence and shall, on conviction, be liable to a fine not exceeding
> two hundred and fifty thousand ringgit or imprisonment for a term not exceeding two years or to
> both."

Source: Act A1727, clause 6, new s.12B (fetched 2026-08-22). Same commencement as §2.4 (1 June
2025, part of the same clause 6). Again, **no small-firm exemption is stated** in the Act text.
"Personal data breach" is separately defined: "any breach of personal data, loss of personal
data, misuse of personal data or unauthorized access of personal data" (Act A1727, clause 3(d),
new definition inserted into Act 709 s.4).

### 2.6 Data processor obligations — the amendment binds a processor directly

Before the 2024 amendment, Act 709's Security Principle (s.9) ran through the data user, who had
to "ensure" its processor complied. The amendment makes the processor directly liable:

> "(1A) Where the processing of personal data is carried out by a data processor on behalf of
> the data controller, the data processor shall comply with the Security Principle as specified
> in section 9."

Source: Act A1727, clause 4, new s.5(1A) — commenced **1 April 2025**. The same clause raises
the penalty for a Security-Principle breach (by controller or, now, by processor) from
"three hundred thousand ringgit or … two years" to **"one million ringgit or … three years,"**
and clause 5 (commenced **1 April 2025** — corrected; clause 5 is in the same P.U.(B) 522/2024
paragraph (b) list as clause 4, "sections 2, 3, 4, 5, 8, 10 and 12," not the paragraph (c)
1 June 2025 list, which covers only clauses 6 and 9) rewords s.9 itself so "a data controller
and a data processor shall" jointly carry the obligation, rather than the controller merely
policing the processor. Source: Act A1727, clauses 4–5; P.U.(B) 522/2024 (both fetched
2026-08-22, re-verified 2026-08-22).

## 3. Is BELCORT itself required to register as a data controller?

The **Personal Data Protection (Class of Data Users) Order 2013** [P.U.(A) 336/2013] lists the
classes of data user that must register under the Act. Its Schedule, item 9 ("Services"),
reads:

> "9. Services (a) A company registered under the Companies Act 1965 [Act 125] or a person who
> entered into partnership under the Partnership Act 1961 [Act 135] carrying on business as
> follows: (i) legal; (ii) audit; (iii) **accountancy**; (iv) engineering; or (v) architecture."

Source: *Personal Data Protection (Class of Data Users) Order 2013*, P.U.(A) 336/2013, Federal
Government Gazette, 14 November 2013, official copy hosted by JPDP at
`https://www.pdp.gov.my/ppdpv1/wp-content/uploads/2024/07/Perintah-Perlindungan-Data-Peribadi-.pdf`
(fetched 2026-08-22), Schedule item 9(a).

**BELCORT Sdn Bhd, a Malaysian accounting firm carrying on business as accountancy, falls
squarely within item 9(a)(iii).** This is a company-registered entity under the Companies Act
(2016, successor to the 1965 Act referenced in the Order — see §9 for the one open question on
that succession) carrying on an accountancy business. Registration as a data controller with
JPDP therefore appears **required**, not merely prudent, unless BELCORT already holds it.
**This is a fact the owner must confirm — see the checklist.**

## 4. What Clara actually sends today (grounded in the repo, not assumed)

This is not a hypothetical transfer; it is the product's live behavior, so the basis analysis
below is written against what actually happens:

- **Named, purpose-scoped egress consent is a structural DB constraint, not a policy promise.**
  `clara.client_egress_purpose_consents` (and its activation/revocation siblings) carry a
  `purpose` column CHECK-constrained to a **closed, named list**, re-checked at the dispatch
  boundary — "a grant alone does not authorize" (digest law 58, `docs/adr/README.md`). The live
  purpose list, read from the migrations, has grown as: `wiki_synthesis` only
  (`packages/db/migrations/0020_typed_consent.sql:153`), then `+statement_extraction`
  (`packages/db/migrations/0038_wave_c_b_bank.sql:5504`), then `+witness_extraction`
  (`packages/db/migrations/0090_f_a1_walls.sql:704`). Per the owner's 2026-08-22 ruling (TA-P3,
  `docs/adr/0074-the-track-a-sitting.md` line 86), a fourth purpose — **`bank_matching`** — is now approved for the
  purpose list, and the pre-existing `classify` egress (previously ungoverned) is being brought
  under a document-processing purpose so nothing egresses outside the named-purpose scheme.
- **One client signature, one complete purpose list, at onboarding** (TA-P3): every client signs
  once, and the product activates every purpose named in that one document — not a blanket
  "any purpose" consent, which the owner's ruling records as "legally weak under PDPA/MIA."
- **A narrow firm-level purpose covers the two structurally client-less moments** — reading a
  document before it is attributed to a client, and reading onboarding-interview documents —
  with output limited to an attribution verdict or form suggestion (never a posted accounting
  fact), and a **closed admissible-document list that refuses IC/passport copies outright**
  (TA-P3; consistent with ADR-0072 ⑤'s separate ruling excluding IC copies from the Wave-G real-
  client corpus ingestion entirely).
- **Identity-free regulatory lookups are not disclosures** (TA-P3) — a lookup against a public
  registry that carries no client-identifying personal data does not implicate s.129 at all,
  because nothing about an identifiable Malaysian data subject leaves Malaysia in that call.
- **Vendor trace export stays OFF.** This memo covers the **document-extraction/witness-read**
  egress, which is live. It does **not** cover the separate, still-parked cloud-vendor trace
  export feature (`docs/adr/0011-tracing-stays-in-clara-controlled-storage.md`; digest law 57;
  re-confirmed OFF at ADR-0072 ⑤ on 2026-08-20: "Vendor tracing stays OFF for the whole run — the
  C6 checklist is still open owner/legal work and PRD §6.16 keeps the flag closed until it is
  evidenced"). Turning tracing on is a **separate** decision gated on this same C6 checklist,
  not something this memo authorizes.

## 5. OpenAI's role and what its own paper commits to

OpenAI's Data Processing Addendum states its role plainly:

> "1.1. Scope and Roles. As part of providing the Services to the Customer under the Agreement,
> OpenAI may Process Customer Data on behalf of Customer. **OpenAI acts as a Data Processor on
> the Customer's behalf**, and this DPA governs such Processing."

> "2.5. Security. OpenAI will implement and maintain reasonable and appropriate organizational
> and technical security measures to protect Customer Data…"

> "2.7. Personal Data Breaches. OpenAI will notify Customer without undue delay after becoming
> aware of any Personal Data Breach…"

> "2.10. Sub-processor obligations. OpenAI shall enter into contractual arrangements with each
> Sub-Processor that imposes on them obligations comparable to those imposed on OpenAI under this
> DPA…"

Source: *OpenAI Data Processing Addendum, v.010126*, `https://cdn.openai.com/pdf/openai-data-processing-addendum.pdf`
(fetched 2026-08-22), §1.1, §2.5, §2.7, §2.10.

**A gap the owner should know about.** The DPA's own "International Data Transfers" clause (§4)
builds contractual transfer safeguards — Standard Contractual Clauses, a UK Addendum — **only
for EEA, Swiss, and UK-origin data** (§4.1, §4.2). It says nothing about Malaysia. That means the
DPA does not, by itself, hand BELCORT a ready-made "reasonable precautions and due diligence"
package for s.129(3)(f) or an "adequate protection" finding for s.129(2)(b) the way it does for
a European customer — BELCORT would have to build its own file (a TIA, or the ASEAN Model
Contractual Clauses the JPDP guideline separately recognizes: "the Association of Southeast
Asian Nations (ASEAN) Model Contractual Clauses for Cross Border Data Flows," Guideline
No. 3/2025 §12.9.1). This is the concrete reason §6 below recommends **not** leaning primarily on
s.129(3)(f)/s.129(2) for this vendor, at least not yet.

## 6. BELCORT's basis: what Clara should rely on

Given §4 and §5, the recommended primary basis for the document-extraction/witness-read egress
is a **combination of the two bases that do not require a TIA or an OpenAI-side transfer
package**:

1. **Consent — s.129(3)(a).** The client-facing authorization letter (Document 2 of this pack)
   is the vehicle: it must, per the Guideline, first give the data subject "personal data
   protection notice containing … the class of third parties to whom the data is transferred to;
   and … the purpose of the transfer" (Guideline §7.2), and only then record consent (§7.3). This
   maps directly onto TA-P3's design: one client signature, one complete named-purpose list, at
   onboarding.
2. **Contractual necessity — s.129(3)(b).** The engagement letter's core deliverable (bookkeeping,
   reconciliation, statutory reporting) cannot be performed without extracting data from the
   documents the client hands over; Clara's extraction/witness-read step is not an optional
   convenience layered on top of the engagement, it is how the engagement's core obligations get
   performed. The Guideline's own necessity test asks whether the transfer is for a *specified
   purpose*, not general practice, and whether there is a feasible lower-cost/same-outcome
   alternative (Guideline §8.3) — Clara's design (one named purpose per processing class, purpose
   re-checked at dispatch) is built to satisfy exactly that test.
3. **Reasonable precautions/due diligence — s.129(3)(f) — as a reinforcing, not primary, layer.**
   The OpenAI DPA's processor-role clause, security clause, breach-notice clause, and sub-
   processor flow-down (§5 above) are genuine due-diligence evidence and should be filed as such,
   but — because of the EEA/UK-only SCC gap — they should be treated as **corroborating** the
   consent/contract-necessity bases, not as a stand-alone basis until the Malaysia-specific gap is
   closed (a TIA, or ASEAN MCCs, or an OpenAI-side amendment).
4. **Do not currently rely on s.129(2)** (similar-law / adequate-protection) for this vendor. No
   TIA has been performed in this session or evidenced elsewhere in the repo; relying on it without
   one leaves BELCORT no defensible file if JPDP asks (Guideline §4.4: "The Commissioner may
   conduct an investigation on data controller to ascertain whether any act, practice or request
   contravenes Section 129 of Act 709").

## 7. The record to keep

The Guideline sets out, per basis, what record a data controller must be able to produce:

> "Paragraph 129(3)(a) of the Act 709 — Personal data protection notice; and Record of data
> subject's consent." "Necessary for the performance of a contract — Copy of the contract; and
> Proof that the processing is necessary for the performance of the contract."

Source: Guideline No. 3/2025 §16.2 (fetched 2026-08-22). For BELCORT, that means retaining, per
client: the signed authorization letter (Document 2) with its named purpose list, the engagement
letter, and — if s.129(3)(f) is ever invoked — the OpenAI DPA execution record plus this memo.
Clara's own architecture already produces adjacent evidence for this: every egress purpose grant
is a typed DB row (`grant_client_egress_purpose`), re-checked at dispatch, and TA-P4's receipt
discipline (owner ruling, 2026-08-22) extends model+version+rationale receipts to every agent
judgement act — the accounting side of this evidence trail is already being built; this memo
adds the *legal* record layer on top.

## 8. What the owner must do

1. **Confirm BELCORT Sdn Bhd's JPDP data-controller (data user) registration status.** §3's
   reading of the Class of Data Users Order 2013 (Schedule item 9(a)(iii), "accountancy") says
   registration is required. If BELCORT is not registered, register it.
2. **Appoint a Data Protection Officer and notify the Commissioner** (s.12A, in force since
   1 June 2025) — no exemption for a small firm was found in the Act text. This can be the owner
   himself, but the appointment and the Commissioner notification are separate acts, both
   outstanding.
3. **Stand up a breach-notification runbook** meeting s.12B's two clocks: "as soon as
   practicable" to the Commissioner on any reasonable belief of a breach, and "without
   unnecessary delay" to affected clients if the breach causes or is likely to cause significant
   harm. This is BELCORT's own duty as data controller — separate from, and in addition to,
   OpenAI's contractual duty to notify BELCORT of a breach on OpenAI's side (DPA §2.7).
4. **Rule on the basis(es)** in §6 — sign off that Document 2 (the client authorization letter)
   is drafted to carry the s.129(3)(a) consent notice plus the s.129(3)(b) contract-necessity
   framing, rather than leaning on an unassessed s.129(2) "adequate protection" claim.
5. **Decide whether to commission a Transfer Impact Assessment** for OpenAI (US) under §2.3/§2.7
   of the Guideline. Not required if §6's consent+contract-necessity basis is adopted and holds,
   but it strengthens the file and is the only route to relying on s.129(2) later. A TIA's
   findings expire after three years by the Guideline's own terms.
6. **Confirm with Document 1 (OpenAI DPA brief)** exactly which OpenAI agreement BELCORT is
   operating under (the plain API DPA quoted in §5, or a different Enterprise agreement), since
   that changes which transfer-safeguard clauses actually apply.
7. **Get this memo checked by a PDPA-qualified Malaysian lawyer or by JPDP directly** before
   relying on it operationally — see §9's open items, several of which carry real statutory
   penalties if read wrongly (up to RM1,000,000/3 years for a Security Principle breach by a
   controller or processor; up to RM250,000/2 years for a breach-notification failure).
8. **Keep tracing OFF** — nothing in this memo changes ADR-0011/digest law 57's separate, still-
   open C6 gate for cloud-vendor trace export.

## 9. Facts I could not verify

- **The full pre-amendment (pre-2025) text of s.129(1)–(4)** was not independently re-fetched
  verbatim; §2.1's description of the old "whitelist" regime is reconstructed from Act A1727's
  own amendment diff (an official source describing exactly what changed), not from a
  side-by-side read of the original clause. If a filing needs the literal pre-2025 wording,
  fetch the unamended Act 709 text separately.
- **Whether the Class of Data Users Order 2013's reference to "a company registered under the
  Companies Act 1965"** still captures a company now incorporated under the Companies Act 2016
  (which superseded the 1965 Act) was not independently confirmed against the Interpretation
  Acts 1948/1967 savings provision. This is very likely "yes" as a matter of ordinary Malaysian
  statutory-interpretation practice, but I did not fetch that provision's text in this session.
- **Whether "accountancy" in Schedule item 9(a)(iii)** is read by JPDP to include the kind of
  bookkeeping/management-accounting/tax-adjacent work BELCORT performs, as distinct from
  chartered public-practice accountancy narrowly defined. A widely-cited secondary source (an MIA
  FAQ page) reportedly states that firms offering *solely* taxation or company-secretarial
  services need not register — but I could not fetch that page directly (`mia.org.my` returned
  HTTP 403 to WebFetch), so I am not treating it as a verified quote, and in any case it would not
  cover BELCORT, which performs general accountancy, not solely tax/CoSec work.
- **No JPDP guideline setting a small-business or headcount threshold for the DPO duty** was
  located in this session. The Act's own text (§2.4) carries none. A supplementary DPO-specific
  guideline may exist with practical criteria not reviewed here — worth a follow-up search before
  the owner's DPO appointment is finalized.
- **OpenAI's "no training on API data by default" claim** is sourced from secondary
  (search-engine-summarized) reporting citing `openai.com/business-data` and
  `openai.com/enterprise-privacy`; WebFetch could not retrieve either page directly in this
  session (HTTP 403 Forbidden from openai.com to the fetch tool). It is not quote-verified here.
  Document 1 (the OpenAI DPA brief) should re-attempt this from a live session or the executed
  agreement itself.
- **Which exact OpenAI agreement governs BELCORT's usage today** (the plain self-serve API DPA
  quoted in §5 vs. a negotiated Enterprise agreement) was not confirmed in this session.
- **`bank_matching`'s exact purpose semantics and admissible-document rules** are as stated in the
  owner's 2026-08-22 ruling (`docs/adr/0074-the-track-a-sitting.md`, TA-P3) but the purpose does not yet exist
  as a migrated DB constant as of this writing; the analysis above treats it as approved-but-
  pending, not live.

## 10. Verification log (independent citation re-check, 2026-08-22)

Every legal/vendor claim carrying a citation in this memo was re-fetched from its cited source
on 2026-08-22 (the primary-law and Guideline PDFs via direct document fetch, since the live
`pdp.gov.my`/`cdn.openai.com` URLs stream as scanned/compressed PDFs that a URL-fetch summarizer
cannot read reliably — the same PDFs were downloaded and read directly to get verbatim text).
Internal repo citations (migrations, ADR text, digest laws) were checked against the live files.

| # | Claim | Source | Verdict |
|---|---|---|---|
| 1 | §2.1 — Act A1727 clause 12 (s.129 amendment) verbatim text | Act A1727 official PDF, `pdp.gov.my`, clause 12 | **CONFIRMED** — verbatim match, including the ellipsis-elided (c)(ii)–(iii) sub-clauses |
| 2 | §2.1 — Royal Assent 9 Oct 2024 / gazetted 17 Oct 2024 | Act A1727 PDF, p.2 | **CONFIRMED** — exact match |
| 3 | §2.1 — commencement "(b) 1 April 2025 ... sections 2,3,4,5,8,10,12" | P.U.(B) 522/2024 PDF | **CONFIRMED** — exact match |
| 4 | §2.2 — Guideline 3/2025 §4.1–4.2 (all seven s.129(3) bases) verbatim | Guideline 3/2025 PDF, `pdp.gov.my` | **CONFIRMED** — exact verbatim match, incl. sub-clauses 4.2.1–4.2.7 |
| 5 | §2.3 — Guideline §5.6 (TIA 3-year validity) | Guideline 3/2025 PDF §5.6 | **CONFIRMED** |
| 6 | §2.3 — Guideline §5.4.4–5.4.5 (DPO/breach-notice TIA factors) | Guideline 3/2025 PDF §5.4.4–5.4.5 | **CONFIRMED** — exact match |
| 7 | §2.4 — new s.12A (DPO duty) verbatim + "no small-firm carve-out" reading | Act A1727 PDF, clause 6 | **CONFIRMED** — text verbatim; the "no carve-out" reading is a fair plain-text inference |
| 8 | §2.4 — commencement 1 June 2025 (clause 6) | P.U.(B) 522/2024 PDF, para (c) | **CONFIRMED** |
| 9 | §2.5 — new s.12B (breach notification) verbatim, incl. RM250,000/2-year penalty | Act A1727 PDF, clause 6 | **CONFIRMED** — exact match |
| 10 | §2.6 — new s.5(1A) verbatim + RM1,000,000/3-year penalty raise, clause 4 commenced 1 April 2025 | Act A1727 PDF, clause 4; P.U.(B) 522/2024 | **CONFIRMED** |
| 11 | §2.6 (original) — "clause 5 commenced 1 June 2025" | P.U.(B) 522/2024 PDF, para (b) | **WRONG, FIXED IN PLACE** — clause 5 is in the 1 April 2025 list (paragraph (b): "sections 2, 3, 4, 5, 8, 10 and 12"), not the 1 June 2025 list (paragraph (c): "sections 6 and 9"). Corrected above. |
| 12 | §3 — Class of Data Users Order 2013, Schedule item 9(a) verbatim ("accountancy") | P.U.(A) 336/2013 PDF, `pdp.gov.my` | **CONFIRMED** — exact verbatim match; gazette date 14 Nov 2013 also confirmed |
| 13 | §5 — OpenAI DPA §1.1, 2.5, 2.7, 2.10 verbatim | `cdn.openai.com/pdf/openai-data-processing-addendum.pdf` (v.010126) | **CONFIRMED** — exact verbatim match on all four quoted sections |
| 14 | §5 — DPA §4's SCC/UK-Addendum machinery covers only EEA/Swiss/UK data, silent on Malaysia | Same OpenAI DPA PDF, §4.1–4.2 | **CONFIRMED** — no other jurisdiction is named in §4 |
| 15 | §6 — Guideline §7.2–7.3 (consent notice must precede consent) | Guideline 3/2025 PDF §7.2–7.3 | **CONFIRMED** — exact match on the quoted fragment |
| 16 | §6 — Guideline §4.4 (Commissioner's investigation power) verbatim | Guideline 3/2025 PDF §4.4 | **CONFIRMED** — exact match |
| 17 | §5/§6 — ASEAN MCCs cite, Guideline §12.9.1 | Guideline 3/2025 PDF §12.9.1 | **CONFIRMED** — exact match |
| 18 | §7 — Guideline §16.2 record-keeping table (consent / contract-necessity rows) | Guideline 3/2025 PDF §16.2 | **CONFIRMED** — exact match |
| 19 | §4 — DB purpose CHECK history (`wiki_synthesis` → `+statement_extraction` → `+witness_extraction`) at the cited migration files/lines | `packages/db/migrations/0020_typed_consent.sql`, `0038_wave_c_b_bank.sql`, `0090_f_a1_walls.sql` | **CONFIRMED** — each purpose literal appears in the cited file |
| 20 | §4 — `bank_matching` not in any merged migration | `packages/db/migrations/*.sql` (repo-wide grep) | **CONFIRMED** — zero matches, consistent with "ruled but not shipped" |
| 21 | §4 — `egress.mjs` "a grant alone does not authorize" quote / digest law 58 | `packages/runtime/lib/egress.mjs`; `docs/adr/README.md` law 58 | **CONFIRMED** — exact phrase present in both |
| 22 | §4 — ADR-0072 ⑤ / OD-4 IC-copy-exclusion quote and "Vendor tracing stays OFF..." quote | `docs/adr/0072-the-f-a2-rulings-and-the-corpus-sitting.md` | **CONFIRMED** — both quotes exact, correct block label |
| 23 | §4 — ADR-0011 / digest law 57 / PRD §6.16 (tracing-off gate) | `docs/adr/0011-...md`; `docs/adr/README.md` law 57; `docs/product/PRD.md` §6.16 | **CONFIRMED** — all three exist and are consistent with the memo's paraphrase |
| 24 | §4, §6, §8 — the TA-P3 owner ruling | `docs/adr/0074-the-track-a-sitting.md` line 86 (TA-P3 — RULED: A) | **CONFIRMED after repoint** — the draft cited the orchestrator's session scratch ledger; the durable record is ADR-0074 (citation corrected 2026-08-22 by the orchestrator) |
| 25 | Header — Document 2 (client authorization letter template) is a companion draft | `docs/ops/legal/client-ai-authorization-letter-template.md` | **CONFIRMED** — the letter landed after this pass ran (same directory) |
| 26 | §9 (pre-existing, self-flagged items: pre-2025 s.129 text, Companies Act 1965→2016 succession, "accountancy" scope, DPO small-firm threshold, OpenAI training-opt-out page fetch, which OpenAI entity governs) | — | **Already correctly marked UNVERIFIED by the original drafter; left as-is** — no independent source was found in this pass that would let these be upgraded to CONFIRMED, and the existing framing (owner/lawyer to confirm) is the right one |

**Net verdict:** every externally-cited legal-text quote in this memo (Malaysian statute, JPDP
guideline, subsidiary legislation, OpenAI DPA) is verbatim-accurate against the primary source
as of 2026-08-22. One factual error was found and fixed in place (item 11). One load-bearing
internal citation could not be located and is flagged, not fabricated (item 24) — the memo's
§6 recommendation should be treated as resting on an unverified internal source until that is
resolved.

---
*Prepared by Clara's build agent, 2026-08-22, from sources fetched the same day (URLs and access
dates cited inline above) and from the repository state as of this session. Supersedes no prior
legal advice; creates none on its own.*
*Verified by a second Clara build-agent pass, 2026-08-22 — see §10, Verification log.*
