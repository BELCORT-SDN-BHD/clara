# Client authorization + disclosure letter — TEMPLATE (EN · BM · 中文)

> ## ⚠ DRAFT FOR THE OWNER'S REVIEW AND SIGNATURE — NOT LEGAL ADVICE
>
> **Drafted by the Clara agent, not by a lawyer.** I am not admitted to practise in Malaysia and this is not
> legal advice. Nothing here goes to a client until **Tao (tools@belcort.com)** has read it and a **Malaysian
> legal adviser** has confirmed the clauses in §8. Every legal and vendor statement is cited to an official
> source **fetched 2026-08-22**; product statements cite this repo.
>
> **C6 gate:** the real-data egress flag stays **OFF** until this letter is signed per client, the OpenAI DPA
> is executed in BELCORT's own OpenAI organisation, and the cross-border basis memo is on file (ADR-0074 /
> TA-P3; `docs/plan/active/wave-f-contract.md:294`). Test data is unaffected (ADR-060, DATA-scoped).
> **Companion documents in this folder:** the OpenAI DPA brief + acceptance steps, and the PDPA cross-border
> basis memo. This is the *client-facing* one of the three.

## 1 · Why this letter exists — two independent requirements

Sending a client's books to an AI processor outside the firm needs **two** permissions: professional (MIA)
and statutory (PDPA). A DPA with the vendor satisfies **neither** — it regulates the processor, it does not
confer the client's authority (ADR-011; digest law 57).

### 1.1 MIA — disclosure outside the firm needs the client's authority

*Source, accessed 2026-08-22:* **MIA By-Laws (On Professional Ethics, Conduct and Practice)**, updated
5 Nov 2024, effective 15 Dec 2024 (Subsection 114 amended 26 Sept 2024 via MIA Circular No. 23/2024) —
<https://mia.org.my/wp-content/uploads/2025/07/By-Laws-updated-Nov2024-%E2%80%93-Effective-15-December-2024.pdf>
(index <https://mia.org.my/by-laws/>). **R114.2** — "Subject to paragraph R114.3, a professional accountant
shall not: (a) Disclose confidential information acquired in the course of professional and business
relationships;" **R114.3** — "As an exception to paragraph R114.2, a professional accountant may disclose or
use confidential information where: (a) There is a legal or professional duty or right to do so; or **(b)
This is authorized by the client** or any person with the authority to permit disclosure or use of the
confidential information and this is not prohibited by law or regulation." **R114.1(d)** — "Take reasonable
steps to ensure that personnel under the accountant's control, **and individuals from whom advice and
assistance are obtained**, comply with the accountant's duty of confidentiality" → why the DPA must exist
*alongside* the client's authority.

**Reading taken:** R114.3(b) is the door this letter opens. **It does not say "specific"** — the older
IESBA-derived phrase "proper and specific authority" is *not* in the Nov-2024 MIA text, so the
one-named-purpose-per-class discipline here is a prudential choice **plus a PDPA requirement**, not a
verbatim MIA phrase. → §8 item 1.

### 1.2 PDPA 2010 (Act 709) — notice, consent, cross-border

*Sources (accessed 2026-08-22):* **Act 709** —
<https://lom.agc.gov.my/ilims/upload/portal/akta/outputaktap/Act%20709%20ori.pdf> · **Act A1727** (Amendment
Act 2024) — <https://www.pdp.gov.my/ppdpv1/wp-content/uploads/2024/11/Act-A1727.pdf> · **Commencement
P.U. (B) 522**, gazetted 24 Dec 2024 —
<https://www.pdp.gov.my/ppdpv1/wp-content/uploads/2024/12/PENETAPAN-TARIKH-PERMULAAN-KUAT-KUASA.pdf>:
"**1 April 2025** as the date on which sections 2, 3, 4, 5, 8, 10 and **12** of the Act come into operation"
(A1727 s.12 = the s.129 amendment; s.2 = "data user"→"**data controller**"); "**1 June 2025** … sections 6
and 9" (new s.12A DPO, s.12B breach notification, s.43A portability).

| Provision | Verbatim (what binds this letter) |
|---|---|
| **s.6(1)(a), 6(3)** | "process personal data about a data subject unless the data subject has given his consent"; and "(a) … processed for a lawful purpose directly related to an activity of the data user; (b) the processing … is necessary for or directly related to that purpose; and (c) the personal data is adequate but not excessive in relation to that purpose." |
| **s.7(1)** | written notice of (a) that data is processed + description; (b) "the purposes for which the personal data is being or is to be collected and further processed"; (c) source; (d) access/correction rights + contact; (e) "the class of third parties to whom the data user discloses or may disclose the personal data"; (f) means of limiting processing; (g) obligatory or voluntary; (h) consequences of not supplying |
| **s.7(2)(c)(ii), 7(3)** | notice given "before the data user— … (ii) discloses the personal data to a third party."; and "A notice under subsection (1) shall be **in the national and English languages**, and the individual shall be provided with a clear and readily accessible means to exercise his choice …" |
| **s.129(2)** *(as amended, in force 1 Apr 2025)* | "A data controller may transfer any personal data of a data subject to [any place outside Malaysia] if— (a) there is in that place in force any law which is substantially similar to this Act; or (b) that place ensures an adequate level of protection … at least equivalent to the level of protection afforded by this Act." *(old s.129(1) Minister-whitelist: **deleted**)* |
| **s.129(3)(a),(f)** | "Notwithstanding subsection [(2)] … (a) the data subject has given his consent to the transfer; … (f) the data user has taken all reasonable precautions and exercised all due diligence to ensure that the personal data will not in that place be processed in any manner which, if that place is Malaysia, would be a contravention of this Act" |

**PDP Regulations 2013 [P.U. (A) 335]** —
<https://www.pdp.gov.my/ppdpv1/wp-content/uploads/2024/06/PERATURAN-PERLINDUGAN-DATA-PERIBADI-2013.pdf> —
**reg. 3(1)** consent must be obtained "**in any form that such consent can be recorded and maintained
properly** by the data user"; **reg. 3(2)** where the form "also concerns another matter, the requirement to
obtain consent shall be presented **distinguishable in its appearance** from such other matter"; **reg.
3(5)** "The burden of proof for consent … shall lie on the data user." → why the authorization is a
**standalone letter**, not an engagement-letter clause.

### 1.3 PDPD guidance — notice language and cross-border

**PDP Guidelines No. 3/2025 — Cross Border Personal Data Transfer**, v1.0, issued **29 April 2025** — <https://www.pdp.gov.my/ppdpv1/wp-content/uploads/2025/08/GP_CBPDT_EN-1.pdf> (accessed 2026-08-22): **¶4.3** "the data controller shall **through its personal data protection notice or such other written notice inform data subject about the transfer**" · **¶7.2** the notice must contain "(a) the class of third parties to whom the data is transferred to; and (b) **the purpose of the transfer**" · **¶7.3** "The consent must be **recorded and maintained** in accordance with the requirements of the Personal Data Protection Regulations."

**PDPD, "Guidance on the Preparation of Personal Data Protection Notices"** — <https://www.pdp.gov.my/ppdpv1/en/akta/guidance-on-the-preparation-of-personal-data-protection-notices/> (accessed 2026-08-22): under s.7 "this notice is a **mandatory element that must be provided by data users who process personal data, regardless of the type, form and size of the business**." *(Landing page only — see §10.)*

### 1.4 The named AI processor (all accessed 2026-08-22)

**OpenAI DPA** — <https://openai.com/policies/data-processing-addendum/> — the live page and the PDF it links (`openai-data-processing-addendum.pdf`, footer "v.010126") both show **"Effective: January 1, 2026"**; **no "Updated" date is displayed on the page** — a corrected re-read on 2026-08-22 found no "Updated: December 1, 2025" text at that URL, so the earlier draft's claim of that phrase is withdrawn as unverified. §1.1 "**OpenAI acts as a Data Processor on the Customer's behalf**". §3.1 "Customer represents, warrants and covenants that it has provided **all necessary notices**, and has and shall maintain … **all necessary rights, consents and authorizations** …". Contracting entity for a Malaysian customer: **OpenAI OpCo, LLC, 1455 3rd Street, San Francisco, CA 94158**, USA. Sub-processors: <https://platform.openai.com/subprocessors>. §4 covers **only** EEA/Swiss and UK transfers — the DPA contains **no** Malaysia-specific transfer mechanism.

**"Data controls in the OpenAI platform"** — <https://developers.openai.com/api/docs/guides/your-data> — "As of March 1, 2023, data sent to the OpenAI API is **not used to train or improve OpenAI models** (unless you explicitly opt in …)" · "By default, **abuse monitoring logs** are generated for all API feature usage and **retained for up to 30 days**, unless longer retention is required by law …" · Zero Data Retention / Modified Abuse Monitoring and per-project **data residency** are approval-gated ("Contact our sales team to see if you're eligible"). **Enterprise privacy** — <https://openai.com/enterprise-privacy/> — "By default, we do not use your business data for training our models."

## 2 · The purpose list — one named purpose per processing class

TA-P3 (ADR-0074): **one processing class = one named purpose; the client signs ONCE with the list complete.**
The keys below are the literal DB values, so paper and `clara.client_egress_purpose_consents.purpose` share
one vocabulary.

| Purpose key | Letter wording | What actually leaves the firm | Repo anchor |
|---|---|---|---|
| `witness_extraction` | Document extraction / witness reads | The filed document image **and** OCR-derived text — two authorizations, one per channel | `packages/db/migrations/0090_f_a1_walls.sql:704`; `packages/runtime/lib/egress.mjs` |
| `wiki_synthesis` | Knowledge synthesis (advisory page) | Counterparty/context text; **no document attached** (`document_sha256` NULL) | `packages/db/migrations/0020_typed_consent.sql:153,262` |
| `statement_extraction` | Bank-statement extraction | Only the **pdf/image** second reader egresses; csv/ofx never egresses; reader-1 re-reads stored geometry and never egresses | `0090_f_a1_walls.sql:704`; `egress.mjs` |
| `bank_matching` | Bank matching | Transaction lines; **no document attached** | `docs/plan/active/bank-agency-design.md` §3.7 + `bank-agency-annexes-4-surfaces.md` Annex E — **designed, not yet migrated** |
| *(key not yet minted)* | Document classification & attribution | Enough of a document to say what it is and whose it is | TA-P3 — "`classify`'s live ungoverned egress is brought under the document-processing purpose" (`wave-f-contract.md:294`) |

**Deliberately excluded:** **regulatory lookups are identity-free and are NOT disclosures** (no name,
registration number or document leaves — TA-P3) · **vendor tracing is OFF** (ADR-011; digest law 57 "Vendor
trace export ships OFF"; ADR-0072 "Vendor tracing stays OFF for the whole run") · **the firm-level narrow
purpose** is signed by **BELCORT**, not the client — it covers only the two client-less moments
(pre-attribution reads, onboarding-interview documents), is walled to an attribution verdict or form
suggestion (never an accounting fact), works from a closed admissible-document list, and **refuses
IC/passport** (`wave-f-contract.md:287-298`); ¶3 of the letter *discloses* it, it does not grant it.

**How consent behaves** (digest law 58): a signature alone authorises nothing. The signed letter is filed as
the `evidence_document_id`; a **separate owner activation** switches the purpose on; **every dispatch
re-checks both records at the boundary** (`prepare_egress_dispatch` / `consume_egress_dispatch`). Withdrawal
is structural — revoke and no live consent row exists, so the next dispatch refuses by construction.

## 3 · How to use this template

Fill every `[…]`. **Never delete a purpose row** — leave an unavailable purpose listed and un-ticked; it can be added later via §7. Print **all three languages in one document**, in this order: s.7(3) makes **BM + English the statutory pair**, 中文 is a courtesy. The client's **authorised signatory** signs (director, or written delegated authority); both parties sign, and the client keeps one original. **Scan the signed original into Clara** as the consent's `evidence_document_id` (the column is `NOT NULL` — no document, no consent). Only then may the owner **activate** each purpose. Two acts, by design.

## 4 · THE LETTER — ENGLISH

> **[BELCORT SDN BHD letterhead — company no., address, tel, email]**

**Date:** [date] · **To:** [Client legal name] ([Company/Business Registration No.]) ·
**Attention:** [Name, designation]

**AUTHORIZATION TO DISCLOSE CLIENT INFORMATION TO AN ARTIFICIAL-INTELLIGENCE PROCESSOR, AND NOTICE
UNDER THE PERSONAL DATA PROTECTION ACT 2010**

Dear [Name],

**1. Why we are writing.** BELCORT SDN BHD ("**the Firm**", "we") uses an AI-assisted accounting
system to help prepare and check your accounting records. Parts of that system send your documents
and records to an AI service provider outside the Firm and outside Malaysia. Under the **MIA By-Laws
(On Professional Ethics, Conduct and Practice), paragraph R114.3(b)**, we may only disclose your
confidential information outside the Firm where this is authorized by you. Under the **Personal Data
Protection Act 2010 ("PDPA")** we must also give you notice and, for the personal data of
individuals, obtain consent to transfer that data outside Malaysia. This letter does both. **Please
read it before signing — it is separate from your engagement letter on purpose.**

**2. Who processes your information.** **Data controller / your accountants:** BELCORT SDN BHD,
[address], [company no.]; contact for this letter and all data questions: [name, designation, email,
telephone]. **AI processor:** **OpenAI OpCo, LLC**, 1455 3rd Street, San Francisco, CA 94158, United
States of America, acting as our data processor under the OpenAI Data Processing Addendum; OpenAI may
use its own sub-processors, listed at <https://platform.openai.com/subprocessors>. **Class of third
parties:** AI and cloud service providers engaged by the Firm as processors. We do not sell your
information and we disclose it to no other third party under this letter.

**3. What information may be sent.** Only what the named purpose in paragraph 4 needs: source
documents you give us (invoices, bills, receipts, bank statements, contracts and similar records),
text read out of those documents, transaction lines, and counterparty names — including any
**personal data of individuals** appearing in them, such as a director's, employee's, supplier's or
customer's name, contact details or bank account details. It also includes documents we receive
**before** we have identified whose they are, and documents you give us at an onboarding interview:
those are read under a separate **firm-level narrow authorization** limited to deciding **whose
document it is** or **which form applies**, never to produce an accounting figure, and only for a
**closed list** of document types (SSM/ROB certificate, SST certificate, bank statement or bank
letter, LHDN correspondence, engagement letter). **We do not send identity-card (MyKad) or passport
images to the AI processor at all.**

**4. The purposes — please tick each purpose you authorize.** Each is separate; a purpose you do not
tick will not run for your file.

| ✔ | Purpose | What it does |
|---|---|---|
| ☐ | **Document extraction / witness reads** | Two independent AI reads of the same document, so the figures we post are cross-checked rather than trusted once. |
| ☐ | **Knowledge synthesis** | Maintains an advisory summary page about your business. No document attached — text only. |
| ☐ | **Bank-statement extraction** | Reads a PDF or image bank statement into transaction lines. Statements given as CSV/OFX are read entirely inside our own system and are **not** sent anywhere. |
| ☐ | **Bank matching** | Matches bank transactions to your recorded entries. No document attached. |
| ☐ | **Document classification & attribution** | Decides what a document is and which of your files it belongs to. |

**Not included and not authorized by this letter:** we will not use your information to train any AI
model; we will not send our internal system traces to the AI provider; and lookups of public
regulatory sources (LHDN, SSM, BNM and similar) are made **without** your name, registration number
or documents, so nothing of yours leaves the Firm for those.

**5. Transfer outside Malaysia.** The AI processor is located in the **United States of America** and
may process your information there or in other countries where its sub-processors operate. This is a
transfer under **section 129 of the PDPA**. Your consent below is the basis for that transfer for
personal data (s.129(3)(a)); independently of your consent we have taken all reasonable precautions
and exercised due diligence, including a written data-processing addendum with the AI processor
(s.129(3)(f)).

**6. How your information is handled at the AI processor.** As published by the provider and accessed
on 2026-08-22: data sent to the OpenAI API is **not used to train or improve OpenAI models**; the
provider may retain API inputs and outputs for **up to 30 days** for abuse monitoring unless a longer
period is required by law; it processes the data only on our documented instructions and must return
or delete it at our instruction when our agreement ends.

**7. Retention at the Firm.** We keep your documents, the extracted records and this authorization for
the period required by Malaysian law and by our engagement letter with you — [insert the retention
period stated in the engagement letter] — and then dispose of them securely. Records of consent and of
each disclosure are kept as long as the underlying records are kept.

**8. Your rights.** Under the PDPA you (and any individual whose personal data we hold) may request
**access** to that personal data, request its **correction**, **limit** how it is processed, and
**withdraw** consent. Requests, enquiries and complaints go to [name, designation, email, telephone];
you may also complain to the Personal Data Protection Commissioner. Supplying this information is
**voluntary**; if you do not authorize a purpose above we will still act for you, but that part of the
work will be done manually, which may take longer and may cost more.

**9. Withdrawal.** You may withdraw this authorization, in whole or for any single purpose, at any time
by written notice to the contact in paragraph 8. Withdrawal takes effect on our receipt and stops all
further sending for that purpose; it does not affect anything already lawfully done, and does not
remove records we must keep by law.

**10. Your confirmation.** By signing you confirm that: (a) you are authorized to give this authority
on behalf of the company; (b) you authorize the disclosures in paragraph 4 that you have ticked, for
the purposes stated and no others; (c) you consent to the transfer of personal data outside Malaysia
as described in paragraph 5; and (d) where personal data of your directors, employees, customers or
suppliers is included, **you have given those individuals the notice required by section 7 of the PDPA
and obtained any consent required from them**, or you authorize us to do so on your behalf.

Yours faithfully,

| **For and on behalf of BELCORT SDN BHD** | **Accepted by [Client legal name]** |
|---|---|
| Signature: ______________ · Name: [ ] | Signature: ______________ · Name: [ ] |
| Designation: [ ] · Date: [ ] | Designation: [ ] · Company No.: [ ] · Company stamp · Date: [ ] |

## 5 · SURAT — BAHASA MALAYSIA

> **[Kepala surat BELCORT SDN BHD — no. syarikat, alamat, tel, emel]**

**Tarikh:** [tarikh] · **Kepada:** [Nama sah pelanggan] ([No. Pendaftaran Syarikat/Perniagaan]) ·
**Untuk perhatian:** [Nama, jawatan]

**KEBENARAN UNTUK MENZAHIRKAN MAKLUMAT PELANGGAN KEPADA PEMPROSES KECERDASAN BUATAN, DAN NOTIS DI
BAWAH AKTA PERLINDUNGAN DATA PERIBADI 2010**

Tuan/Puan,

**1. Tujuan surat ini.** BELCORT SDN BHD ("**Firma**", "kami") menggunakan sistem perakaunan
berbantukan kecerdasan buatan (AI) untuk membantu menyediakan dan menyemak rekod perakaunan tuan.
Sebahagian daripada sistem itu menghantar dokumen dan rekod tuan kepada pembekal perkhidmatan AI di
luar Firma dan di luar Malaysia. Menurut **By-Laws MIA (On Professional Ethics, Conduct and Practice),
perenggan R114.3(b)**, kami hanya boleh menzahirkan maklumat sulit tuan di luar Firma jika dibenarkan
oleh tuan. Menurut **Akta Perlindungan Data Peribadi 2010 ("APDP")**, kami juga wajib memberi notis
dan, bagi data peribadi individu, memperoleh persetujuan untuk pemindahan data itu ke luar Malaysia.
Surat ini memenuhi kedua-duanya. **Sila baca sebelum menandatangani — surat ini sengaja diasingkan
daripada surat pelantikan tuan.**

**2. Siapa yang memproses maklumat tuan.** **Pengawal data / akauntan tuan:** BELCORT SDN BHD,
[alamat], [no. syarikat]; hubungan bagi surat ini dan semua pertanyaan data: [nama, jawatan, emel,
telefon]. **Pemproses AI:** **OpenAI OpCo, LLC**, 1455 3rd Street, San Francisco, CA 94158, Amerika
Syarikat, bertindak sebagai pemproses data kami di bawah OpenAI Data Processing Addendum; OpenAI boleh
menggunakan sub-pemprosesnya sendiri, disenaraikan di <https://platform.openai.com/subprocessors>.
**Kelas pihak ketiga:** pembekal perkhidmatan AI dan awan yang dilantik oleh Firma sebagai pemproses.
Kami tidak menjual maklumat tuan dan tidak menzahirkannya kepada mana-mana pihak ketiga lain di bawah
surat ini.

**3. Maklumat yang mungkin dihantar.** Hanya apa yang diperlukan oleh tujuan bernama dalam perenggan 4:
dokumen sumber yang tuan berikan (invois, bil, resit, penyata bank, kontrak dan rekod seumpamanya),
teks yang dibaca daripada dokumen itu, baris transaksi, dan nama pihak berurusan — termasuk apa-apa
**data peribadi individu** yang terkandung di dalamnya, contohnya nama, butiran perhubungan atau
butiran akaun bank seorang pengarah, pekerja, pembekal atau pelanggan. Ia juga termasuk dokumen yang
kami terima **sebelum** kami mengenal pasti pemiliknya, dan dokumen yang tuan berikan semasa temu bual
pendaftaran: dokumen itu dibaca di bawah **kebenaran sempit peringkat firma** yang berasingan, terhad
kepada menentukan **milik siapa dokumen itu** atau **borang mana yang berkenaan**, tidak sekali-kali
untuk menghasilkan angka perakaunan, dan hanya bagi **senarai tertutup** jenis dokumen (sijil SSM/ROB,
sijil SST, penyata bank atau surat bank, surat-menyurat LHDN, surat pelantikan). **Kami langsung tidak
menghantar imej kad pengenalan (MyKad) atau pasport kepada pemproses AI.**

**4. Tujuan — sila tandakan setiap tujuan yang tuan benarkan.** Setiap tujuan adalah berasingan; tujuan
yang tidak ditandakan tidak akan dijalankan bagi fail tuan.

| ✔ | Tujuan | Apa yang dilakukan |
|---|---|---|
| ☐ | **Pengekstrakan dokumen / bacaan saksi** | Dua bacaan AI bebas ke atas dokumen yang sama, supaya angka yang kami catatkan disemak silang, bukan dipercayai sekali baca. |
| ☐ | **Sintesis pengetahuan** | Menyelenggara halaman ringkasan nasihat tentang perniagaan tuan. Tiada dokumen dilampirkan — teks sahaja. |
| ☐ | **Pengekstrakan penyata bank** | Membaca penyata bank PDF atau imej menjadi baris transaksi. Penyata dalam bentuk CSV/OFX dibaca sepenuhnya di dalam sistem kami sendiri dan **tidak** dihantar ke mana-mana. |
| ☐ | **Padanan bank** | Memadankan transaksi bank dengan catatan tuan. Tiada dokumen dilampirkan. |
| ☐ | **Pengelasan & pengaitan dokumen** | Menentukan jenis sesuatu dokumen dan fail tuan yang mana ia tergolong. |

**Tidak termasuk dan tidak dibenarkan oleh surat ini:** kami tidak akan menggunakan maklumat tuan untuk
melatih mana-mana model AI; kami tidak menghantar jejak (trace) dalaman sistem kami kepada pembekal AI;
dan carian sumber kawal selia awam (LHDN, SSM, BNM dan seumpamanya) dibuat **tanpa** nama, nombor
pendaftaran atau dokumen tuan, jadi tiada apa-apa milik tuan keluar dari Firma bagi tujuan itu.

**5. Pemindahan ke luar Malaysia.** Pemproses AI berada di **Amerika Syarikat** dan mungkin memproses
maklumat tuan di sana atau di negara lain tempat sub-pemprosesnya beroperasi. Ini ialah pemindahan di
bawah **seksyen 129 APDP**. Persetujuan tuan di bawah ialah asas pemindahan itu bagi data peribadi
(s.129(3)(a)); secara berasingan daripada persetujuan tuan, kami telah mengambil segala langkah
berjaga-jaga yang munasabah dan melaksanakan usaha wajar, termasuk addendum pemprosesan data bertulis
dengan pemproses AI (s.129(3)(f)).

**6. Pengendalian maklumat di pihak pemproses AI.** Sebagaimana diterbitkan oleh pembekal dan dicapai
pada 2026-08-22: data yang dihantar ke API OpenAI **tidak digunakan untuk melatih atau menambah baik
model OpenAI**; pembekal boleh menyimpan input dan output API sehingga **30 hari** bagi pemantauan
penyalahgunaan melainkan tempoh lebih lama dikehendaki undang-undang; pembekal memproses data hanya
mengikut arahan bertulis kami dan mesti memulangkan atau memadamkannya atas arahan kami apabila
perjanjian kami tamat.

**7. Tempoh simpanan di Firma.** Kami menyimpan dokumen tuan, rekod yang diekstrak dan kebenaran ini
selama tempoh yang dikehendaki oleh undang-undang Malaysia dan surat pelantikan kami dengan tuan —
[masukkan tempoh simpanan dalam surat pelantikan] — dan kemudian melupuskannya dengan selamat. Rekod
persetujuan dan setiap penzahiran disimpan selama rekod asas itu disimpan.

**8. Hak tuan.** Di bawah APDP, tuan (dan mana-mana individu yang data peribadinya kami pegang) boleh
memohon **akses** kepada data peribadi itu, memohon **pembetulan**, **menghadkan** cara ia diproses,
dan **menarik balik** persetujuan. Permohonan, pertanyaan dan aduan hendaklah dikemukakan kepada [nama,
jawatan, emel, telefon]; tuan juga boleh mengadu kepada Pesuruhjaya Perlindungan Data Peribadi.
Pemberian maklumat ini adalah **sukarela**; jika tuan tidak membenarkan mana-mana tujuan di atas, kami
tetap bertindak untuk tuan, tetapi bahagian kerja itu akan dilakukan secara manual, yang mungkin
mengambil masa lebih lama dan berkos lebih tinggi.

**9. Penarikan balik.** Tuan boleh menarik balik kebenaran ini, secara keseluruhan atau bagi mana-mana
tujuan tunggal, pada bila-bila masa melalui notis bertulis kepada hubungan di perenggan 8. Penarikan
balik berkuat kuasa apabila kami menerimanya dan menghentikan semua penghantaran selanjutnya bagi
tujuan itu; ia tidak menjejaskan apa-apa yang telah dilakukan secara sah, dan tidak menghapuskan rekod
yang wajib kami simpan di sisi undang-undang.

**10. Pengesahan tuan.** Dengan menandatangani, tuan mengesahkan bahawa: (a) tuan diberi kuasa
memberikan kebenaran ini bagi pihak syarikat; (b) tuan membenarkan penzahiran dalam perenggan 4 yang
telah tuan tandakan, bagi tujuan yang dinyatakan sahaja; (c) tuan bersetuju dengan pemindahan data
peribadi ke luar Malaysia sebagaimana diterangkan dalam perenggan 5; dan (d) jika data peribadi
pengarah, pekerja, pelanggan atau pembekal tuan termasuk di dalamnya, **tuan telah memberikan notis
yang dikehendaki oleh seksyen 7 APDP kepada individu tersebut dan memperoleh apa-apa persetujuan yang
diperlukan daripada mereka**, atau tuan membenarkan kami berbuat demikian bagi pihak tuan.

Yang benar,

| **Bagi pihak BELCORT SDN BHD** | **Diterima oleh [Nama sah pelanggan]** |
|---|---|
| Tandatangan: ______________ · Nama: [ ] | Tandatangan: ______________ · Nama: [ ] |
| Jawatan: [ ] · Tarikh: [ ] | Jawatan: [ ] · No. Syarikat: [ ] · Cop syarikat · Tarikh: [ ] |

## 6 · 授权书 — 中文（译文，仅供参考）

> **[BELCORT SDN BHD 信头 — 公司编号、地址、电话、电邮]**

**日期：**[日期] · **致：**[客户法定名称]（[公司/商业注册编号]） · **收件人：**[姓名、职位]

**关于向人工智能处理方披露客户资料之授权，及《2010年个人资料保护法令》项下之通知**

敬启者：

**1. 本函目的。** BELCORT SDN BHD（"**本行**"、"我们"）使用人工智能（AI）辅助的会计系统，协助编制及复核
贵公司的会计记录。该系统的部分环节会将贵公司的文件与记录发送予本行以外、且位于马来西亚境外的 AI 服务
供应商。根据**马来西亚会计师公会（MIA）《职业道德、行为与执业附则》第 R114.3(b) 段**，本行只有在获得贵
公司授权的情况下，方可向本行以外披露贵公司的保密资料。根据**《2010年个人资料保护法令》（"PDPA"）**，
本行亦须发出通知，并就个人资料的境外传输取得同意。本函同时履行上述两项要求。**请于签署前详阅——本函
特意与委聘书分开签署。**

**2. 谁处理贵公司的资料。** **资料控制者／贵公司的会计师：** BELCORT SDN BHD，[地址]，[公司编号]；本函
及一切资料事宜之联络人：[姓名、职位、电邮、电话]。**AI 处理方：** **OpenAI OpCo, LLC**，1455 3rd
Street, San Francisco, CA 94158, 美国，依据 OpenAI Data Processing Addendum 作为本行的资料处理方；
OpenAI 可使用其自身的次级处理方，名单见 <https://platform.openai.com/subprocessors>。**第三方类别：**
本行委聘为处理方的 AI 与云端服务供应商。本行不出售贵公司资料，亦不依本函向任何其他第三方披露。

**3. 可能发送的资料。** 仅限第 4 段所列具名用途所需者：贵公司提供的原始凭证（发票、账单、收据、银行月
结单、合约及类似记录）、从该等文件读取的文字、交易明细行，以及往来方名称——包括其中出现的**个人资料**，
例如董事、员工、供应商或客户的姓名、联络方式或银行账户资料。亦包括本行在**尚未确认归属**之前收到的文件，
以及贵公司于开户面谈时提供的文件：该等文件依另一项**行所层级的窄用途授权**读取，仅用于判断**文件属于
谁**或**适用哪一表格**，绝不用于产生会计数字，且仅限**封闭清单**内的文件类型（SSM/ROB 证书、SST 证书、
银行月结单或银行函件、内陆税收局（LHDN）来往函件、委聘书）。**本行绝不会将身份证（MyKad）或护照影像
发送予 AI 处理方。**

**4. 用途——请在贵公司授权的每一项用途前打勾。** 各用途彼此独立；未打勾的用途不会在贵公司档案上运行。

| ✔ | 用途 | 说明 |
|---|---|---|
| ☐ | **文件提取／双读见证** | 对同一份文件进行两次独立的 AI 读取，使入账数字经交叉核对，而非一次读取即予采信。 |
| ☐ | **知识综合** | 维护一份关于贵公司业务的顾问摘要页。不附带文件，仅传送文字。 |
| ☐ | **银行月结单提取** | 将 PDF 或影像格式的银行月结单读取为交易明细行。以 CSV/OFX 提供的月结单完全在本行自有系统内读取，**不会**发送至任何外部。 |
| ☐ | **银行配对** | 将银行交易与贵公司的账目记录配对。不附带文件。 |
| ☐ | **文件分类与归属** | 判断文件为何种文件，以及应归入贵公司哪一档案。 |

**不包括、亦不在本函授权范围内：** 本行不会以贵公司资料训练任何 AI 模型；不会将本行系统的内部运行轨迹
（trace）发送予 AI 供应商；查询公开监管资料来源（LHDN、SSM、BNM 等）时**不含**贵公司名称、注册编号或
文件，故此类查询并无任何贵公司资料离开本行。

**5. 境外传输。** AI 处理方位于**美国**，并可能在当地或其次级处理方所在的其他国家处理贵公司资料。此构成
**PDPA 第 129 条**项下的传输。就个人资料而言，贵公司于下方的同意即为该传输的依据（第 129(3)(a) 条）；
此外，本行亦已采取一切合理防范措施并履行应尽的审慎义务，包括与 AI 处理方订立书面资料处理附录
（第 129(3)(f) 条）。

**6. AI 处理方对资料的处理方式。** 依供应商公布（查阅日期 2026-08-22）：发送至 OpenAI API 的资料**不会
用于训练或改进 OpenAI 模型**；供应商可为滥用监控而保留 API 输入与输出**最多 30 天**，除非法律要求更长
期限；供应商仅依本行的书面指示处理资料，并须于双方协议终止时依本行指示返还或删除。

**7. 本行的保存期限。** 本行按马来西亚法律及本行与贵公司委聘书所要求的期限——[填入委聘书所载保存期限]
——保存贵公司文件、提取所得记录及本授权书，期满后安全销毁。同意记录及每次披露的记录，保存期限与其所
对应的基础记录相同。

**8. 贵公司的权利。** 依 PDPA，贵公司（及本行持有其个人资料的任何个人）可要求**查阅**该个人资料、要求
**更正**、**限制**其处理方式，并**撤回**同意。相关要求、查询与投诉请提交予[姓名、职位、电邮、电话]；贵
公司亦可向个人资料保护专员投诉。提供上述资料属**自愿**；若贵公司不授权上述任何用途，本行仍将继续为贵
公司服务，惟该部分工作将改以人工处理，耗时可能较长、费用可能较高。

**9. 撤回。** 贵公司可随时以书面通知第 8 段联络人，全部或就任何单一用途撤回本授权。撤回自本行收到时生
效，并即时停止该用途的一切后续发送；撤回不影响此前已合法完成的处理，亦不消除本行依法必须保存的记录。

**10. 贵公司的确认。** 签署即表示贵公司确认：(a) 签署人有权代表公司作出本授权；(b) 贵公司授权第 4 段中
已打勾的披露，仅限所述用途；(c) 贵公司同意如第 5 段所述将个人资料传输至马来西亚境外；及 (d) 若其中包含
贵公司董事、员工、客户或供应商的个人资料，**贵公司已向该等个人发出 PDPA 第 7 条所要求的通知并取得所需
同意**，或授权本行代为办理。

此致

| **BELCORT SDN BHD 代表** | **[客户法定名称] 确认接受** |
|---|---|
| 签署：______________ · 姓名：[ ] | 签署：______________ · 姓名：[ ] |
| 职位：[ ] · 日期：[ ] | 职位：[ ] · 公司编号：[ ] · 公司印章 · 日期：[ ] |

> **译文效力：** PDPA 第 7(3) 条规定通知须以**国语及英文**作出。本中文版为便利阅读之译本；如有歧义，
> 以马来文版及英文版为准。

## 7 · Supplementary-consent addendum — adding a purpose for an existing client

Use when a client has already signed §4 and a **new** purpose is added (TA-P3: the three existing
clients need exactly one supplementary line). File the scan as the **new** consent row's
`evidence_document_id` — a new consent record, never an edit of the old one.

**English —** *Supplementary authorization dated [date], supplementing our authorization letter dated
[date] between BELCORT SDN BHD and [Client legal name] ([Reg. No.]). All terms of that letter continue
to apply unchanged. In addition to the purposes already authorized, we hereby authorize BELCORT SDN
BHD to disclose our information to the AI processor named in that letter for the following further
purpose(s): **[purpose name(s) — use the exact wording from paragraph 4]**, on the same terms,
including the transfer outside Malaysia described in paragraph 5 and our right of withdrawal in
paragraph 9.*

**Bahasa Malaysia —** *Kebenaran tambahan bertarikh [tarikh], menambah surat kebenaran kami bertarikh
[tarikh] antara BELCORT SDN BHD dan [Nama sah pelanggan] ([No. Pendaftaran]). Semua terma surat
tersebut terus terpakai tanpa perubahan. Selain tujuan yang telah dibenarkan, kami dengan ini
membenarkan BELCORT SDN BHD menzahirkan maklumat kami kepada pemproses AI yang dinamakan dalam surat
tersebut bagi tujuan tambahan yang berikut: **[nama tujuan — guna perkataan tepat daripada perenggan
4]**, atas terma yang sama, termasuk pemindahan ke luar Malaysia dalam perenggan 5 dan hak menarik
balik dalam perenggan 9.*

**中文 —** *补充授权，日期 [日期]，用以补充 BELCORT SDN BHD 与 [客户法定名称]（[注册编号]）之间日期为
[日期] 的授权书。该授权书全部条款继续适用，不作变更。除已授权的用途外，本公司兹授权 BELCORT SDN BHD 就
下列新增用途向该授权书所指名的 AI 处理方披露本公司资料：**[用途名称——请沿用第 4 段的确切措辞]**，条款
相同，包括第 5 段所述的境外传输及第 9 段的撤回权。*

| **For BELCORT SDN BHD** | **[Client]** |
|---|---|
| Signature / Name / Designation / Date | Signature / Name / Designation / Company No. / Date |

## 8 · Wording a Malaysian lawyer must confirm

1. **The MIA specificity claim.** R114.3(b) says "authorized by the client", not "proper and specific
   authority". Is a tick-box list of named purposes the right standard — and would a general
   "AI-assisted processing" authority fail?
2. **Who the data subject is.** A company is not an individual, so the client entity is not a PDPA data
   subject. ¶10(d) pushes the s.7 notice duty for the client's own people onto the client — enforceable? And
   is BELCORT controller or processor for each data set?
3. **Third-party individuals.** Suppliers'/customers' staff inside the client's invoices sign nothing. Does
   s.6(2) (contract/legal obligation) or s.39/s.40 carry that processing, and should the letter say so?
4. **The s.129 basis pairing.** The letter relies on **both** s.129(3)(a) consent and s.129(3)(f) due
   diligence — right after 1 Apr 2025? And is a Transfer Impact Assessment (CBPDT §§5–6) expected for the USA?
5. **Language and governing version.** May 中文 ride as a courtesy with the "BM and English govern" note, and
   does that note itself weaken the s.7(3) notice?
6. **Voluntary/consequences wording (¶8), s.7(1)(g)–(h).** Is "manual, slower, possibly costlier" accurate
   and not coercive?
7. **Withdrawal vs. the engagement.** What may the Firm do if a client withdraws a purpose the fee basis
   assumed — and should the letter cross-refer to the engagement letter's fee terms?
8. **Sensitive personal data.** If a document carries health/criminal data (e.g. a medical claim receipt),
   s.40 requires **explicit** consent — is a separate explicit-consent line needed?
9. **Retention figure (¶7).** Which statutory period, and should it be stated as a number?
10. **Signatory authority.** Directors' resolution for a Sdn Bhd client, or signature under stamp?
11. **Firm-level narrow purpose (¶3).** Is *disclosing* it here enough, and is BELCORT's own signed narrow
    authority the right instrument for pre-attribution reads?

## 9 · What the owner must do

- [ ] **Read this draft end to end**; correct anything that misstates how BELCORT actually works.
- [ ] **Send §§4–8 to a Malaysian legal adviser** with the eleven questions in §8; record the answers here
      and re-date the file.
- [ ] **Execute the OpenAI DPA** in BELCORT's own OpenAI organisation (the "Execute Data Processing
      Agreement" link on <https://openai.com/policies/data-processing-addendum/>) — see the DPA brief in this
      folder. **Signature acts are the owner's, not the agent's.**
- [ ] **Decide on Zero Data Retention / Modified Abuse Monitoring / data residency** with OpenAI sales; if
      granted, update ¶6 in all three letters (the "30 days" sentence changes).
- [ ] **Insert the retention period** (¶7), the **contact person** (¶2/¶8) — all three languages — and
      **decide the purpose ticks per client**, including whether any client gets a partial list.
- [ ] **Sign and countersign** with ROME PROPERTIES · ROME SECRETARY · BEE CREATIVE SOLUTION; new purposes
      for existing signatories use §7.
- [ ] **Scan each signed original into Clara** as the consent's `evidence_document_id`, then **activate** each
      purpose separately (two acts by design; digest law 58).
- [ ] **Sign BELCORT's own firm-level narrow purpose** before F-A7a's pre-attribution door opens.
- [ ] **Only then** turn the real-data egress flag ON — keep it OFF until every box above is ticked.
- [ ] **Diarise a review** whenever a purpose key is added to the DB CHECK, or when OpenAI's DPA / data-usage
      pages change (both dated; this draft is pinned to 2026-08-22).

## 10 · Facts I could not verify
1. **The detailed PDPD notice guidance** — only the landing page of "Guidance on the Preparation of Personal Data Protection Notices" was quoted; the underlying 2022 PDF was not fetched, so any drafting rule inside it is unverified here.
2. **MIA guidance specific to AI or outsourcing** — none found; Appendix I ("Additional guidance on confidentiality for Subsection 114") covers seeking advice, court evidence and assistance to authorities only. Absence of a rule is not permission — confirm with MIA if in doubt.
3. **Whether the USA qualifies under s.129(2)(b)** — no adequacy assessment done, no PDPD list of adequate places found; the letter relies on s.129(3)(a)+(f), not adequacy. **No Transfer Impact Assessment** (CBPDT §§5–6) has been performed.
4. **Whether an OpenAI data-residency region covers Malaysia or ASEAN** — per-project residency exists but its region table could not be read in full and eligibility is sales-gated; ¶6 states the default only.
5. **`bank_matching` and the classification key are not yet in a migration** — `bank_matching` is designed (`bank-agency-design.md` §3.7; Annex E of `bank-agency-annexes-4-surfaces.md`; ships at the bank-agency train's PR-1c), the classification key is unnamed (TA-P3 says only "a document-processing purpose"). The letter lists both so the client signs once, but the DB cannot record those consents until the migrations land.
6. **Retention periods** — no statutory figure is asserted anywhere; ¶7 is a blank for the owner to fill.
7. **Translation quality** — the BM and 中文 texts are the agent's own, uncertified translations. A Malaysian lawyer (ideally with a certified translator) must confirm the BM text — s.7(3) makes it statutory, not a courtesy.

## 11 · Verification log (citation pass, 2026-08-22)
Every legal/vendor citation was re-fetched against its live source (or, where the host blocked automated fetch, its own CDN/gazette-mirrored PDF); internal citations were checked against the file at HEAD. **Two corrections were made in place** (rows 4 and 6); everything else is CONFIRMED as first drafted. §10 items 1–4, 6–7 were NOT independently re-verified — they stand as flagged, owner/lawyer to confirm.

| # | Claim | Source (re-fetched) | Verdict |
|---|---|---|---|
| 1 | MIA R114.1(d), R114.2(a), R114.3(a)/(b) quotes; Subsection 114 amended 26 Sept 2024 / effective 15 Dec 2024 via Circular No. 23/2024; "proper and specific authority" absent from the text | mia.org.my By-Laws PDF, footer "Updated: 5 November 2024" | **CONFIRMED** — all five points verbatim/exact |
| 2 | PDPA s.6(1)(a)/(3), s.7(1)(a)–(h), s.7(2)(c)(ii), s.7(3) · Act A1727 s.2 ("data user"→"data controller"), s.12 (rewrites s.129 — deletes old (1), rewrites (2)'s opening words, drops "or that serves the same purposes as this Act" from (2)(a)), s.6/s.9 (new s.12A DPO, s.12B breach, s.43A portability) · P.U. (B) 522 "1 April 2025 … ss. 2,3,4,5,8,10,12" / "1 June 2025 … ss. 6,9", gazetted 24 Dec 2024 · PDP Regulations 2013 reg. 3(1)/(2)/(5) · PDP Guidelines 3/2025 v1.0 issued 29 April 2025, ¶4.3/¶7.2/¶7.3 | Act 709, Act A1727, P.U. (B) 522, P.U. (A) 335, Guideline — all official PDFs | **CONFIRMED** — verbatim throughout; the amended s.129(2) quoted is the exact product of applying A1727's edits to the Act 709 original |
| 3 | PDPD "Guidance on Preparation of Notices" page = landing page only, no inline text | pdp.gov.my landing page | **CONFIRMED**; the 2022 PDF stays unfetched (§10 item 1) |
| 4 | OpenAI DPA §1.1, §3.1 quotes; §4 covers only EEA/Swiss (4.1) + UK (4.2), no Malaysia mechanism; contracting entity OpenAI OpCo, LLC, 1455 3rd Street, San Francisco, CA 94158; Sub-Processor List URL; "Effective: January 1, 2026" | `cdn.openai.com/pdf/openai-data-processing-addendum.pdf` + live page (footer "v.010126") | **CONFIRMED** — all verbatim/exact. **One correction:** the draft's "Updated: December 1, 2025" does NOT appear on the page (fetched twice) — clause removed from §1.4; the DPA's true last-revision date is unverified pending OpenAI publishing one |
| 5 | "As of March 1, 2023 … not used to train or improve"; "abuse monitoring … up to 30 days"; ZDR/Modified Abuse Monitoring/residency are sales-gated · "By default, we do not use your business data for training our models" | developers.openai.com/api/docs/guides/your-data (the former `platform.openai.com/docs/guides/your-data` 301-redirects here — §1.4 now cites the canonical URL) · openai.com/enterprise-privacy/ | **CONFIRMED** — verbatim |
| 6 | Internal: egress CHECK constraints/`document_sha256` rules, `evidence_document_id NOT NULL` (`0090_f_a1_walls.sql` ~L695–712; `0020_typed_consent.sql` ~L149–153, ~L261–262) · "`classify`'s live ungoverned egress is brought under the document-processing purpose", closed admissible-document list + IC/passport refusal (`wave-f-contract.md` ~L287–298) · ADR-011/digest law 57 "Vendor trace export ships OFF", ADR-0072 "Vendor tracing stays OFF for the whole run" (`docs/adr/README.md` L377; `docs/adr/0072-…md` L153) · `bank_matching` "designed, not yet migrated" | files at HEAD | **CONFIRMED** — verbatim. **One correction:** the `bank_matching` locator first cited `bank-agency-annexes-1-mechanics.md:305-313` (an unrelated CLR10 reason-code table); repointed to the design's §3.7 / Annex E of `bank-agency-annexes-4-surfaces.md` (the annex-1 line 251 "§E" cross-reference was itself stale and has been trued in the plan doc) |
