# Clara — the beta data-processing consent text

> **STATUS: BETA PLACEHOLDER — pending the owner's lawyer (裁-90).** The owner delegated this
> drafting and pre-approved it sight-unseen for beta, under three binding constraints: the consent
> is a **plain, visible step** at signup (no dark patterns); it **may not gate or alter any product
> or agentic functionality** beyond the ruled signup gate itself; and it is a **placeholder** — at
> the official-launch sitting the owner and his lawyer finalise the real text and the agent swaps
> it. Ruling: [`docs/plan/active/mohe-grill-rulings-2026-08-31.md`](../../plan/active/mohe-grill-rulings-2026-08-31.md) §裁-90.
> This file is **not legal advice** and has not been reviewed by a Malaysian lawyer.
>
> **THE SWAP IS A VERSION BUMP, NEVER A SCHEMA CHANGE.** A replacement text publishes as a **new
> row** in `clara.dpa_documents` — stamp the current row's `effective_to`, insert the new
> `version` / `body` / `body_sha256` / `source_path` / `effective_from`. The table is append-only
> and its one permitted UPDATE is that first `effective_to` stamp; old bytes can never be rewritten
> or deleted. Existing `dpa_signatures` and `checkout_intents` keep their old version pins, so
> in-flight signups are unaffected (§4 below).
>
> **THE BYTE-IDENTITY LAW.** The body seeded into `clara.dpa_documents` **must be byte-identical to
> the canonical body section of this file**. The seeded row's `source_path` names this file as the
> body's provenance, while the table's CHECK recomputes `sha256(convert_to(body,'UTF8'))` from the
> **stored** bytes — so the digest can never disagree with the row, and a file that drifts from the
> row silently falsifies the provenance claim instead of failing anything. Nothing in the database
> can catch that drift; only this law and a reader can. *(This is the byte-identity NIT raised by
> the #478 reviewer, written down here as the law it asks for.)*
>
> **Extraction rule (mechanical, so "byte-identical" is checkable).** A canonical body is the
> content of the fenced block between its `clara-dpa-body:begin` and `clara-dpa-body:end` marker
> comments, **excluding** the two marker lines, **excluding** the two fence lines, and **excluding**
> the final newline that precedes the closing fence. UTF-8, LF line endings, no BOM. §2 records the
> resulting sha256 for v1 and §3 for the proposed v2; §2 also gives the one-line command that
> reproduces both from this file.

## 1 · What this file is

Clara's signup asks a subscribing Malaysian accounting firm to agree to a short data-processing
text before it can open a checkout intent. The DB stores each version of that text immutably, and
the signature evidence binds the exact bytes the firm saw, not merely the version's spelling.

This file carries three things: the **v1 body that is seeded today** (a conspicuous placeholder),
the **proposed v2 body** — the real bilingual beta consent text drafted under 裁-90 — and the
**swap note** for the lawyer at launch.

The three inputs the v2 draft is built from, all in this directory:

- [`pdpa-cross-border-transfer-basis-memo.md`](pdpa-cross-border-transfer-basis-memo.md) — the
  post-2025 s.129 regime (the Minister's whitelist is deleted; s.129(3)'s seven bases are each
  self-standing) and §6's recommended basis: **consent, s.129(3)(a)**, reinforced by **contractual
  necessity, s.129(3)(b)** — explicitly *not* an unassessed s.129(2) "adequate protection" claim.
- [`openai-dpa-brief.md`](openai-dpa-brief.md) — OpenAI is a processor; API data is not used for
  training; inputs and outputs are retained up to 30 days for abuse monitoring; the SCC/UK-Addendum
  machinery in that DPA does not cover a Malaysian exporter.
- [`client-ai-authorization-letter-template.md`](client-ai-authorization-letter-template.md) — the
  firm↔its-own-client letter (EN · BM · 中文). **A different document with a different job**: it is
  how *a firm's client* authorises disclosure outside the firm under MIA By-Law R114.3(b). The
  signup text below does **not** replace it, and says so in its own words (paragraph 7).

What the product actually does with the data — the boundary the text must not overclaim past — is
[`docs/product/PRD.md`](../../product/PRD.md) §6: the DB owns every authoritative number and the
agent only orchestrates; documents and books data are processed and their OCR/vision reads egress
to an AI provider; accounting history is append-only and corrections are reversals, not deletions;
identity-card and passport images are excluded from ingestion entirely; vendor trace export ships
OFF.

## 2 · v1 — the seeded beta placeholder

This is the body currently seeded by
[`packages/db/migrations/0158_checkout_gate_c1_dpa.sql`](../../../packages/db/migrations/0158_checkout_gate_c1_dpa.sql)
(PR #478, **merged 2026-09-01**), under version key `clara-beta-2026-08-a`, with
`effective_from` `2026-08-31 00:00:00+08` and `source_path` naming this file. Quoted
**verbatim**: one line, no trailing newline (the SQL literal's doubled apostrophes are
un-escaped here, which is what the stored bytes are):

<!-- clara-dpa-body:begin version=v1 seeded=yes -->
```text
This is Clara's beta data-processing agreement, pending review by the owner's lawyer before launch.
```
<!-- clara-dpa-body:end version=v1 seeded=yes -->

sha256 of those bytes: `6d1c97a5cf8a22994b12dcb1b113c53bc2b1edb282f5c1237ff1ef12c679c7b3` (99 bytes).

**Byte-identity proven, not asserted.** The same digest was computed independently from the
migration's own SQL literal — `git show origin/main:packages/db/migrations/0158_checkout_gate_c1_dpa.sql`
piped through a reader that un-escapes the doubled apostrophes — and it matches this file's block
exactly. **Re-derived independently again 2026-09-03, from merged main:** 99 bytes,
`6d1c97a5…c679c7b3`, byte-identical. The proof command works today only because the branch
survives — that is luck, not law, now that the migration is merged; whoever re-seeds or
supersedes this row should repeat the comparison rather than eyeball the text.

Reproduce both digests from this file, from the repo root:

````sh
node -e 'const F = "```";
const s = require("fs").readFileSync("docs/ops/legal/clara-beta-dpa.md", "utf8");
const re = new RegExp("clara-dpa-body:begin ([^>]*?) -->\n" + F + "[a-z]*\n(.*?)\n" + F + "\n<!-- clara-dpa-body:end", "gs");
for (const m of s.matchAll(re))
  console.log(require("crypto").createHash("sha256").update(m[2], "utf8").digest("hex"), m[1].trim());'
````

It prints one line per canonical body. Run it as written: `F` spells the fence so this block cannot
close itself, the pattern's newlines are real newlines instead of `\n` escapes, and the `s` flag
stands in for what `[\s\S]` would do. That is deliberate — a shell can eat those backslash escapes on
the way to node, and when it does the command prints **nothing at all** rather than failing. Expected
output today:

```text
6d1c97a5cf8a22994b12dcb1b113c53bc2b1edb282f5c1237ff1ef12c679c7b3 version=v1 seeded=yes
b458ab023799259e28e7550eededd401163c11742509568d960ac5d982c94067 version=v2 seeded=no
```

The migration seeds the row and re-reads it in a fail-closed tail; the digest is derived by the
database from the body it stored, never supplied by the caller:

```sql
-- packages/db/migrations/0158_checkout_gate_c1_dpa.sql (PR #478; number claimed at merge)
insert into clara.dpa_documents(version,body,body_sha256,source_path,effective_from)
values ('clara-beta-2026-08-a', '…the body above…',
        sha256(convert_to('…the body above…','UTF8')),
        'docs/ops/legal/clara-beta-dpa.md', timestamptz '2026-08-31 00:00:00+08');
```

**v1 is honest but thin.** It tells a signing firm that a beta placeholder is what it is agreeing
to, and nothing else — it names no processing, no provider, no transfer, no right. It is adequate
as a mechanism seed and inadequate as a consent. §3 is the replacement.

## 3 · PROPOSED v2 — the bilingual beta consent text

**PROPOSED. NOT SEEDED. NOT IN FORCE.** These bytes enter the database only through a future
version-bump migration (§4), which must copy them byte-identically per the law in the header. The
body deliberately carries **no version key and no date** — the row's `version` and `effective_from`
columns own those, so the same bytes can be seeded under whatever version key the migration claims.

Drafting constraints honoured: plain language; short enough to actually be read at a signup step;
English and Bahasa Malaysia in one body (s.7(3) PDPA makes BM + English the statutory pair, the
same practice the client letter template follows); every claim traceable to what the product does;
no dark pattern, no pre-ticked shortcut, no buried surprise; and the two least flattering facts —
that Clara itself is hosted outside Malaysia, and that anything uploaded may be read by the AI
providers — stated plainly and early rather than implied.

<!-- clara-dpa-body:begin version=v2 seeded=no -->
```text
# Clara — data processing consent (beta)

**Beta text.** BELCORT drafted this version. Our lawyer's reviewed version will replace it, and we will show you the new version and ask you to agree again before it applies to you.

**1. Who we are.** Clara is operated by BELCORT SDN BHD ("Clara", "we", "us"), a company incorporated in Malaysia. "You" means the accounting firm signing up and the people in your firm who use Clara.

**2. Who is responsible for what.** Your books stay yours. Under the Personal Data Protection Act 2010 ("PDPA") your firm remains the data controller for your own and your clients' personal data; we act as your data processor and process that data only to run Clara for you, on your instructions. The providers named in paragraphs 4 and 5 act as our processors in turn.

**3. What we process.** What you put into Clara or ask Clara to work on: source documents (invoices, bills, receipts, bank statements, letters, contracts and similar records), the text read out of them, transaction lines, counterparty names, and the accounting records Clara keeps for you — including any personal data of individuals inside them, such as a director's, employee's, supplier's or customer's name, contact details or bank account details. We also process your Clara users' own account details (name, email address) and a record of what each user did in the system.

**4. Where Clara runs.** Clara itself is hosted outside Malaysia: its database runs on Supabase in the ap-southeast-1 (Singapore) region, the agent runtime runs on Fly.io in Singapore, and the web application is served over Cloudflare's network. We will name the current hosting providers on request.

**5. AI processing outside Malaysia.** Clara reads documents and drafts work using AI services that run outside Malaysia. Today those are OpenAI OpCo, LLC (United States) for AI reading and reasoning, and Microsoft Azure Document Intelligence (Southeast Asia region) for turning document images into text. They process your data as our processors under written data-processing terms; they do not use it to train their models; OpenAI may hold what is sent to it for up to 30 days for abuse monitoring before deleting it, unless the law requires longer. Paragraphs 4 and 5 are transfers of personal data outside Malaysia under section 129 of the PDPA: your agreement below is the consent for those transfers, and separately they are necessary for us to perform the service you are buying. If we change the providers we use, we will tell you.

**6. Assume anything you upload may be read by them.** For the purposes above, treat every document and every record you put into Clara as something the providers in paragraph 5 may read. Please do not upload identity-card (MyKad) or passport copies — Clara does not send them to AI providers and we do not want them in the system.

**7. Your own clients still need their own authorization.** Agreeing here covers your firm's own data and your firm's instructions to us. It does not, by itself, give you the authority to send your clients' confidential information outside your firm. For that, each client must authorize the disclosure (MIA By-Laws paragraph R114.3(b)), be given PDPA notice, and consent to the transfer outside Malaysia. We provide a template letter; obtaining it, and keeping the signed original, is your firm's responsibility.

**8. What we do not do.** We do not sell your data. We do not disclose it to anyone other than the providers in paragraphs 4 and 5 and anyone you instruct us to. We do not let it be used to train AI models. We do not export Clara's internal run traces to any outside vendor.

**9. Keeping it, deleting it, and your rights.** We keep your data while your account is open, and after it closes only for as long as our agreement with you or Malaysian law requires. You may ask us for a copy of the personal data we hold about you, ask us to correct it, ask us to limit how it is used, ask us to delete your firm's data, and withdraw this consent — write to tools@belcort.com. You may also complain to the Personal Data Protection Commissioner. Two limits we would rather you heard from us: (a) accounting records in Clara are append-only by design, so a correction is recorded as a reversal rather than an erasure and the audit history is kept; (b) your card and billing details are handled by Stripe and are not stored by us — our database keeps only the reconciliation fields (payment and session identifiers, amount, currency, status, timestamps) — so a request about those details goes to Stripe, under Stripe's own retention.

**10. Beta.** Clara is in beta. Features and this text may change. When a new version of this text is published we will show it to you and ask you to agree again; the version you agree to today stays recorded against your signup, with the date and the exact text you saw.

**11. What you are agreeing to.** By clicking "I agree" you confirm that you have read this text, that you are authorised to agree on behalf of your firm, and that you consent to BELCORT SDN BHD processing your firm's and your clients' data as described above, including the transfers outside Malaysia in paragraphs 4 and 5. You may withdraw at any time by writing to tools@belcort.com; withdrawal stops further processing going forward and ends your use of Clara, and it does not undo what was lawfully done before it.

---

# Clara — persetujuan pemprosesan data (beta)

**Teks beta.** BELCORT menyediakan versi ini. Versi yang disemak oleh peguam kami akan menggantikannya, dan kami akan menunjukkan versi baharu itu dan meminta persetujuan tuan sekali lagi sebelum ia terpakai.

**1. Siapa kami.** Clara dikendalikan oleh BELCORT SDN BHD ("Clara", "kami"), sebuah syarikat yang diperbadankan di Malaysia. "Tuan" bermaksud firma perakaunan yang mendaftar dan warga firma tuan yang menggunakan Clara.

**2. Siapa bertanggungjawab atas apa.** Rekod tuan kekal milik tuan. Di bawah Akta Perlindungan Data Peribadi 2010 ("APDP"), firma tuan kekal sebagai pengawal data bagi data peribadi tuan sendiri dan data peribadi pelanggan tuan; kami bertindak sebagai pemproses data tuan dan memproses data itu semata-mata untuk menjalankan Clara bagi tuan, mengikut arahan tuan. Pembekal yang dinamakan dalam perenggan 4 dan 5 pula bertindak sebagai pemproses kami.

**3. Apa yang kami proses.** Apa yang tuan masukkan ke dalam Clara atau minta Clara kerjakan: dokumen sumber (invois, bil, resit, penyata bank, surat, kontrak dan rekod seumpamanya), teks yang dibaca daripada dokumen itu, baris transaksi, nama pihak berurusan, dan rekod perakaunan yang Clara simpan untuk tuan — termasuk apa-apa data peribadi individu di dalamnya, seperti nama, butiran perhubungan atau butiran akaun bank seseorang pengarah, pekerja, pembekal atau pelanggan. Kami juga memproses butiran akaun pengguna Clara tuan (nama, alamat emel) dan rekod tindakan setiap pengguna dalam sistem.

**4. Di mana Clara berjalan.** Clara sendiri dihoskan di luar Malaysia: pangkalan datanya berjalan di Supabase dalam rantau ap-southeast-1 (Singapura), proses ejennya berjalan di Fly.io di Singapura, dan aplikasi webnya disampaikan melalui rangkaian Cloudflare. Kami akan menamakan pembekal hos semasa apabila diminta.

**5. Pemprosesan AI di luar Malaysia.** Clara membaca dokumen dan merangka kerja menggunakan perkhidmatan AI yang beroperasi di luar Malaysia. Pada masa ini: OpenAI OpCo, LLC (Amerika Syarikat) bagi bacaan dan penaakulan AI, dan Microsoft Azure Document Intelligence (rantau Asia Tenggara) bagi menukar imej dokumen menjadi teks. Mereka memproses data tuan sebagai pemproses kami di bawah terma pemprosesan data bertulis; mereka tidak menggunakannya untuk melatih model mereka; OpenAI boleh menyimpan apa yang dihantar kepadanya sehingga 30 hari bagi pemantauan penyalahgunaan sebelum memadamkannya, melainkan undang-undang menghendaki tempoh yang lebih lama. Perenggan 4 dan 5 ialah pemindahan data peribadi ke luar Malaysia di bawah seksyen 129 APDP: persetujuan tuan di bawah ialah asas bagi pemindahan itu, dan secara berasingan pemindahan itu perlu bagi kami melaksanakan perkhidmatan yang tuan beli. Jika kami menukar pembekal, kami akan memberitahu tuan.

**6. Anggap apa-apa yang tuan muat naik boleh dibaca oleh mereka.** Bagi tujuan di atas, anggaplah setiap dokumen dan setiap rekod yang tuan masukkan ke dalam Clara sebagai sesuatu yang boleh dibaca oleh pembekal dalam perenggan 5. Sila jangan muat naik salinan kad pengenalan (MyKad) atau pasport — Clara tidak menghantarnya kepada pembekal AI dan kami tidak mahu ia berada dalam sistem.

**7. Pelanggan tuan tetap memerlukan kebenaran mereka sendiri.** Persetujuan di sini meliputi data firma tuan sendiri dan arahan firma tuan kepada kami. Ia tidak dengan sendirinya memberi tuan kuasa untuk menghantar maklumat sulit pelanggan tuan ke luar firma tuan. Untuk itu, setiap pelanggan mesti membenarkan penzahiran tersebut (By-Laws MIA, perenggan R114.3(b)), diberi notis APDP, dan bersetuju dengan pemindahan ke luar Malaysia. Kami menyediakan templat surat; memperoleh surat itu, dan menyimpan yang asal bertandatangan, adalah tanggungjawab firma tuan.

**8. Apa yang kami tidak lakukan.** Kami tidak menjual data tuan. Kami tidak menzahirkannya kepada sesiapa selain pembekal dalam perenggan 4 dan 5 serta sesiapa yang tuan arahkan. Kami tidak membenarkannya digunakan untuk melatih model AI. Kami tidak mengeksport jejak (trace) dalaman Clara kepada mana-mana vendor luar.

**9. Penyimpanan, pemadaman, dan hak tuan.** Kami menyimpan data tuan selagi akaun tuan dibuka, dan selepas ia ditutup hanya selama tempoh yang dikehendaki oleh perjanjian kami dengan tuan atau undang-undang Malaysia. Tuan boleh memohon salinan data peribadi yang kami pegang tentang tuan, memohon pembetulannya, memohon supaya penggunaannya dihadkan, memohon supaya data firma tuan dipadamkan, dan menarik balik persetujuan ini — tulis kepada tools@belcort.com. Tuan juga boleh mengadu kepada Pesuruhjaya Perlindungan Data Peribadi. Dua batasan yang lebih baik tuan dengar daripada kami: (a) rekod perakaunan dalam Clara adalah tambah-sahaja (append-only) secara reka bentuk, jadi pembetulan dicatatkan sebagai pembalikan dan bukan penghapusan, dan sejarah audit dikekalkan; (b) butiran kad dan pengebilan tuan dikendalikan oleh Stripe dan tidak disimpan oleh kami — pangkalan data kami hanya menyimpan medan penyesuaian (pengecam pembayaran dan sesi, amaun, mata wang, status, cap masa) — jadi permohonan mengenai butiran itu hendaklah dikemukakan kepada Stripe, tertakluk kepada tempoh simpanan Stripe sendiri.

**10. Beta.** Clara berada dalam peringkat beta. Ciri-cirinya dan teks ini mungkin berubah. Apabila versi baharu teks ini diterbitkan, kami akan menunjukkannya kepada tuan dan meminta persetujuan tuan sekali lagi; versi yang tuan persetujui hari ini kekal direkodkan pada pendaftaran tuan, bersama tarikh dan teks tepat yang tuan lihat.

**11. Apa yang tuan persetujui.** Dengan mengklik "Saya setuju", tuan mengesahkan bahawa tuan telah membaca teks ini, bahawa tuan diberi kuasa untuk bersetuju bagi pihak firma tuan, dan bahawa tuan bersetuju dengan pemprosesan data firma tuan dan data pelanggan tuan oleh BELCORT SDN BHD sebagaimana diterangkan di atas, termasuk pemindahan ke luar Malaysia dalam perenggan 4 dan 5. Tuan boleh menarik balik pada bila-bila masa dengan menulis kepada tools@belcort.com; penarikan balik menghentikan pemprosesan selanjutnya pada masa hadapan dan menamatkan penggunaan Clara oleh tuan, dan ia tidak membatalkan apa-apa yang telah dilakukan secara sah sebelum itu.
```
<!-- clara-dpa-body:end version=v2 seeded=no -->

sha256 of those bytes: `b458ab023799259e28e7550eededd401163c11742509568d960ac5d982c94067` (11,626 bytes,
53 lines). **This digest is a drift anchor for the draft, not a database fact** — no row carries it
today. Edit one byte of the body above and it changes; a version-bump migration that seeds these
bytes will make the database recompute the same value from what it stored.

### 3a · Where each paragraph's claim comes from (so a reviewer can falsify it)

| ¶ | Claim | Grounded in |
|---|---|---|
| 2 | firm = data controller, BELCORT = its processor | PDPA memo §2.1 (Act A1727 renames "data user" → "data controller"); OpenAI brief §1.1's controller/processor chain |
| 3 | the data classes listed | client letter ¶3's class list; PRD §6 invariant 5 (document is truth, OCR is a claim about it) |
| 4 | Supabase ap-southeast-1 · Fly `sin` · Cloudflare | `docs/ARCHITECTURE.md` "Hosts" — a real cross-border fact the customer-facing pack had not yet stated anywhere |
| 5 | OpenAI (US) + Azure DI (SE Asia); no training; 30-day abuse-monitoring retention | OpenAI brief §1.2, §1.3, §2.1 — `@ai-sdk/openai` is the only LLM vendor in the runtime today, and Azure Document Intelligence is the OCR engine at region `southeast-asia` |
| 5 | s.129(3)(a) consent + s.129(3)(b) contractual necessity, and **no** s.129(2) adequacy claim | PDPA memo §2.2 (the seven self-standing bases) and §6 (bases 1 and 2 recommended; §6.4 says do not rely on s.129(2) without a TIA) |
| 6 | "assume anything you upload may be read" | The honest floor. The named-purpose egress gate is real (PRD §6 invariant 16; digest law 58 — typed consent **plus** a separate owner activation, re-checked at dispatch), but the OpenAI brief §2.3 records that `classify`'s egress was still ungoverned when it was written. The text therefore states the worst case rather than claiming a gate that does not yet cover every lane. |
| 6 | MyKad/passport never sent | OpenAI brief §2.1 "Never sent, by design"; ADR-0072 ⑤ excludes IC copies from ingestion entirely |
| 7 | the client's own authorization is still required | client letter §1.1 (MIA R114.3(b)); PDPA memo §6.1 — and PRD §6 invariant 16's own words: a DPA regulates the processor but does not by itself confer authority to disclose client information outside the firm |
| 8 | no training, no vendor trace export | OpenAI brief §1.2 and §2.4; PRD §6 invariant 16; ADR-0011 / digest law 57 |
| 9 | append-only accounting history, corrections are reversals | PRD §6 invariant 8 ("Reverse-not-delete") — the reason the text does **not** promise erasure of posted records |
| 9 | card/billing details stay with Stripe; the DB keeps only reconciliation fields | 裁-91 — the webhook verifier projects and discards; `customer_details` and every other personal field stay Stripe-side |
| 10 | version shown, agreed again, and the exact text recorded | the C-1 storage shape: immutable `dpa_documents` versions plus `dpa_signatures` binding `(dpa_version, body_sha256)` |

### 3b · What the draft deliberately does NOT say

- **No adequacy claim.** It never asserts that the United States or Singapore offers protection
  equivalent to Act 709. That is s.129(2) territory and needs a Transfer Impact Assessment nobody
  has commissioned (memo §2.3, §6.4).
- **No erasure promise it cannot keep.** It offers deletion of the firm's data and then names the
  two real limits — append-only accounting history, and Stripe-side payment data — instead of
  promising a right the product's own invariants defeat.
- **No claim that every AI read sits behind the client-consent gate.** See the ¶6 row above.
- **No DPO named, no registration number, no company address, no retention period in years.** Each
  is a fact only the owner can supply, and inventing one would be worse than leaving the lawyer to
  fill it in (memo §8 items 1–3 are still open: JPDP registration, the s.12A DPO appointment and
  notification, and the breach-notification runbook).
- **No fill-in-the-blank placeholders inside the body.** A signing customer would see them. The one
  contact address in the body, `tools@belcort.com`, is the owner contact of record in `AGENTS.md`;
  the lawyer's version should replace it with the firm's data-protection contact once a DPO exists.
- **No pre-ticked box, no "by continuing you agree", no consent bundled into another action.** The
  agreement sentence (¶11) names the click, and the click does one thing.

## 4 · How the swap works at launch — a note for the lawyer

The text you finalise replaces the one below it **without a database schema change and without
disturbing anyone who has already signed**. Mechanically, at the launch sitting:

1. **Paste the final text into §3 of this file**, replacing the proposed v2 body between its
   `clara-dpa-body` markers. This file is the body's provenance of record.
2. **Publish it as a new version.** One migration, two statements, one transaction: stamp the
   current row's `effective_to` with the moment the new text takes effect, then insert the new row
   (`version`, `body`, `body_sha256`, `source_path`, `effective_from`). The body must be pasted
   byte-identically from step 1 — the database recomputes the digest from the bytes it stores, so a
   mismatch between file and row is silent, not caught.
3. **Nothing else changes.** `dpa_documents` is append-only: the old row's bytes stay readable
   forever, and the only UPDATE the table permits is that first `effective_to` stamp. A partial
   unique index admits exactly one row with `effective_to` NULL, so there is always exactly one
   current version and never two.
4. **In-flight signups keep the version they saw.** The M8 mid-flow pin means a checkout intent
   records the `dpa_version` that was current when it opened, and the signature evidence binds
   `(dpa_version, body_sha256)` — the exact bytes, not just the version's name. A firm that started
   signing up ten minutes before the swap completes against the old version; the new text applies to
   the next signup, and to existing firms only when they are shown it and agree again (¶10 of the
   text promises exactly that, so re-consent is a promise the swap must honour, not an option).
5. **What re-consent needs, if you want existing firms moved onto the new text.** A second signature
   row per firm against the new version. The storage already permits it — signatures are unique per
   `(user_id, dpa_version)`, so one user can hold one signature per version, and the history of what
   each firm agreed to, and when, survives intact.

Open items the memo leaves for you and the owner, which this text does not close: BELCORT's JPDP
data-controller registration, the s.12A Data Protection Officer appointment and notification, the
s.12B breach-notification runbook, whether to commission a Transfer Impact Assessment for the US
transfer, and confirmation of which OpenAI agreement BELCORT actually operates under.
