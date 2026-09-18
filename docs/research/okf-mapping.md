# OKF v0.2 → Clara KB mapping, counterparty-identity design, and export shape

Wayfinder research ticket #584 (map #573). Decided context (not re-litigated here): the KB is
OKF-shaped — typed frontmatter the DB reads at posting time (client facts **and** counterparty
identity: normalized name / registration number / bank payer id / invoice-number prefix →
`counterparty_id`) plus a prose body only the model reads; `vendor_identity_bindings` +
`counterparty_aliases` merge into that typed layer; agent proposes identities, auto-live after the
first successful post; a `verified[]` layer is added; per-client OKF export is wanted.

Sources read in full: `okf/SPEC.md` v0.2 (raw,
`raw.githubusercontent.com/GoogleCloudPlatform/knowledge-catalog/main/okf/SPEC.md`, 1006 lines),
the `okf/bundles/acme_retail` sample bundle (index.md, log.md, `metrics/revenue.md`,
`tables/orders.md`, `policies/revenue-recognition.md`, `computations/revenue-ytd.md` — the actual
files, not just the spec's inline snippets), the Google Cloud blog post ("How the Open Knowledge
Format can improve data sharing"), and Karpathy's LLM-wiki gist (raw,
`gist.githubusercontent.com/karpathy/442a6bf555914893e9891c11519de94f/raw`). Clara citations are
`file:line` against this worktree.

---

## 1. OKF v0.2, field by field (quoted)

**Terminology.** "**Knowledge Bundle**...: A self-contained, hierarchical collection of knowledge
documents. The unit of distribution." "**Concept**: A single unit of knowledge within a bundle,
represented as one markdown document." "**Concept ID**: The path of the concept's file within the
bundle, with the `.md` suffix removed." (SPEC.md:73-80)

**Frontmatter (required/recommended):**

- `type` — "the only always-required key; a concept carrying just `type` is fully conformant."
  "Type values are **not** registered centrally." (SPEC.md:177-188)
- `title`, `description`, `resource` (canonical URI of the underlying asset), `tags` — all
  recommended, all optional (SPEC.md:190-199)
- **Provenance** `sources[]`: `{id, resource, title, author, usage_count, last_modified}` +
  sibling `usage_window: {from, to}`. "`resource`: REQUIRED within an entry." "`id`: ... SHOULD be
  present when the body cites the source." Credibility signals are "objective, per-source facts...
  OKF records the signals, not a verdict." (SPEC.md:287-334) Per-claim attribution is a markdown
  **footnote** keyed to `sources[].id`, not a body citations list: "Labels are keyed rather than
  positional... because agents constantly rewrite these documents." (SPEC.md:350-364)
- **Trust** `generated: {by, at}` (by REQUIRED within the block) and `verified: [{by, at}]` — "who
  *wrote* a concept need not be who *confirmed* it." A bare mapping is a one-element list.
  (SPEC.md:366-399) Trust tiers: no `verified` ⇒ unverified; non-`human:` actors only ⇒
  machine-confirmed; a `human:<id>` actor ⇒ human-reviewed. (SPEC.md:401-410)
- **Lifecycle** `status: draft|stable|deprecated` (default `stable`, SPEC.md:412-422) and
  `stale_after` — "An absolute instant... A concept is stale when `now >= stale_after`... not a
  relative TTL." (SPEC.md:424-433)
- **Attested Computation** fields (type-specific, v0.2's headline addition): `runtime` (REQUIRED
  for this type), `parameters: [{name, type, required}]`, `computation` (path, alternative to an
  inline body fence), `executor: {resource, receipt}`, `attester: {resource}`. "Attestation
  confirms a single *run* produced the value the sanctioned way... not stored in the bundle."
  (SPEC.md:556-670, 721-732)
- **Actor convention**: `<producer>/<version>` for agents (e.g. `reference_agent/gemini-2.5-pro`),
  `human:<id>`, `process:<id>`. "Consumers that classify trust key off the `human:` prefix, so
  producers MUST use it." (SPEC.md:489-501)

**Body conventions.** "There are no required body sections." Conventional headings: `# Schema`,
`# Examples`, `# Computation`. (SPEC.md:209-222)

**Link semantics.** Standard markdown links; bundle-relative absolute (`/tables/x.md`, recommended)
or relative. "A link from concept A to concept B asserts a *relationship*. The specific kind...
is conveyed by the surrounding prose, not by the link itself." "Consumers MUST tolerate broken
links." (SPEC.md:437-466)

**Bundle layout.** A directory tree; only two reserved filenames at any level: `index.md`
("Directory listing... support progressive disclosure") and `log.md` ("chronological history...
newest first"). (SPEC.md:109-149, 505-552) The **real** `acme_retail` sample bundle (fetched, not
just the spec's toy example) is organized as `index.md`, `log.md`,
`tables/`, `metrics/`, `computations/`, `policies/`, `skills/`, `attesters/`, `viz.html` — i.e.
domain-chosen subdirectories, not a fixed taxonomy, exactly as SPEC.md:111-113 promises ("producers
organize concepts however makes sense"). A bundle-root `index.md` MAY carry `okf_version: "0.2"` —
"the only place frontmatter is permitted in an `index.md`." (SPEC.md:776-778)

**Maintenance flow.** Not in SPEC.md (out of scope there); from the blog post and the gist. Blog:
"Teams curate content and manage it like code" and quotes Karpathy on agents doing the bookkeeping.
Gist, directly: three operations — **Ingest** ("the LLM reads the source... writes a summary page
in the wiki, updates the index, updates relevant entity and concept pages... appends an entry to
the log"), **Query** ("good answers can be filed back into the wiki as new pages"), **Lint**
("periodically, ask the LLM to health-check the wiki. Look for: contradictions between pages, stale
claims that newer sources have superseded, orphan pages with no inbound links...").
(karpathy-gist:37-41) These three are, almost by name, Clara's `record_wiki_source_ingest`
(0017:2228-2285) / `publish_wiki_page_version` (0017:2188-2226), the model-synthesis lane
(`wiki-projection.mjs`), and `run_client_lint`'s contradiction/stale/orphan checks
(0017:4715-4785) — see §2.

**"No copied state" principle** (load-bearing for §3's answer). Gist: "**Raw sources** — your
curated collection of source documents... These are immutable — the LLM reads from them but never
modifies them. This is your source of truth." "**The wiki**... You read it; the LLM writes it."
(karpathy-gist:29-31) The wiki is a *synthesis and index* layer over sources that stay
authoritative; it must never become a second, driftable copy of what the source already says.

---

## 2. Field-by-field mapping to Clara

Legend: **present** (equivalent exists) · **present+** (present, and structurally stronger than
OKF's plain string/whole-document field) · **missing** (no analog today) · **conflict** (Clara's
model actively diverges from OKF's stated non-goal).

| OKF field | Clara equivalent | Status | Evidence |
|---|---|---|---|
| `type` | `wiki_pages.page_kind` | present+/narrower | `0017_wave_b.sql:827-829` — closed 6-value enum (`profile,counterparty,treatment,recurring_pattern,open_question,period_context`) vs OKF's open string. Typed and validated, but not producer-extensible the way OKF's `type` is. |
| Concept ID / `id` | `wiki_pages.slug` | present+ | `0017:826` (regex-checked), unique per client (`uq_wiki_pages_client_slug`, `0017:839`) — OKF's concept ID is just a file path with no uniqueness enforcement beyond the filesystem. |
| `title` | `wiki_pages.title` | present | `0017:830` |
| `description` | — | **missing** | No one-line-summary column anywhere on `wiki_pages`/`wiki_page_versions`; `list_wiki_pages` does not project one (`0017:2420-2425`). Directly blocks the OKF-shaped pack index (§5). |
| `resource` | `wiki_pages.counterparty_id` (for `page_kind='counterparty'`) | present+ | `0017:831,843-845` — an FK'd UUID into `clara.counterparties(id,firm_id,client_id)`, not a URI string; referential integrity instead of a promise. |
| `tags` | — | **missing** | No column. |
| `sources[]` (`resource`) | `wiki_page_citations.document_id/entry_id/counterparty_id` | present+ | `0017:891-924` — FK'd to real rows, and validated **live-filed to this client** at write time (`0017:2113-2127`), not a bare string. OKF's `resource` is unverifiable by the format itself. |
| `sources[].id` (footnote join key) | — | **missing** | `wiki_page_citations.detail` is free-form jsonb (`subject_key`, `source_at` are lint-internal keys, `0017:4735-4784`); there is no stable per-citation `id` a page body could footnote against. |
| `sources[]` credibility signals (`author`, `usage_count`, `last_modified`) | — | **missing** | No usage tracking anywhere in the wiki tables. |
| `usage_window` | — | **missing** | Same. |
| `generated: {by, at}` | `wiki_page_versions.synthesis/engine_id/created_at` + `wiki_log.actor_kind/actor` | present+ | `0017:869-872,882-883` (synthesis `deterministic`\|`model`, `engine_id` e.g. `clara-wiki-synth:gpt-5.6-terra` per `wiki-projection.mjs:136`) plus a **separate, append-only** `wiki_log` row per action with `actor_kind` (`runtime`\|`human`) and an FK'd `actor` (`0017:967-982`) — richer than one overwritable frontmatter pair: an immutable per-action audit trail instead of a single mutable field. |
| `verified: [{by, at}]` | — | **missing** (ticket's own gap) | No verification table/column exists on `wiki_pages`/`wiki_page_versions` today. This is exactly the layer the decided context calls out as "to be added." |
| `status: draft\|stable\|deprecated` | `wiki_pages.state` (`active`\|`retired`) **+** `wiki_page_versions.state` (`uploaded`\|`verified`\|`published`\|`superseded`) | present+/split | `0017:833-834,867-868`. OKF's one field is split across two: page-level active/retired (≈ stable/deprecated) and version-level lifecycle (≈ draft→stable transition machinery), with superseded versions kept forever (`0017:2128-2131` per `0019_wiki_boundary.sql:103-104` commentary) rather than overwritten. |
| `stale_after` (producer-declared absolute instant) | — | **missing**, different mechanism instead | Clara computes staleness from provenance events rather than storing a self-declared expiry: `wiki_page_citations.stale_at/stale_reason` (`0019_wiki_boundary.sql:111-121`), written by `mark_wiki_citations_stale` when a cited document's filing retires (`0019:732-839`), surfaced as `has_stale_sources` on `get_wiki_page`/`list_wiki_pages`/the pack (`0019:977-1069`), plus `run_client_lint`'s `stale_claim` finding for citations superseded by a newer same-subject fact (`0017:4759-4785`). Stronger for provenance-driven staleness (can't be forgotten), but there is no way today for a producer to say "this policy note is only valid through 2026-12-31" the way OKF's field allows for manually-authored concepts (e.g. a treatment note tied to a tax-year policy). |
| `type: Attested Computation` (+ `runtime`/`parameters`/`computation`/`executor`/`attester`) | — | **missing**, arguably out of scope | Clara has no "sanctioned computation + receipt + attester" pattern in the wiki layer — but Clara's actual computations (aging, opening-seed deltas, etc.) are governed SQL functions with their own tests, not agent-composable queries a KB page would sanction. Not a gap worth closing now; flagged for completeness. |
| Cross-links (untyped markdown edges) | `wiki_page_refs` | present+ | `0017:926-965` — a **typed** enum (`wiki_page,counterparty,document,entry,account`), each variant FK'd and mutually exclusive by CHECK (`0017:953-964`), in a queryable table rather than parsed out of prose. Powers `run_client_lint`'s orphan-page check directly: `wp.state='active' and not exists(select 1 from wiki_page_refs...)` (`0017:4719-4722`) — impossible to compute from OKF's format without a markdown-link parser. |
| `index.md` | `list_wiki_pages(client)` | present+/different form | `0017:2404-2430`, plus `0019` adds `has_stale_sources` (`0019:999-1014`) — a queryable RPC, not a static file; missing `description` per-page (same gap as above). |
| `log.md` | `wiki_log` | present+ | `0017:967-982` — `action` enum (`ingest,publish,supersede,retire,lint_pass,hold,release`, `+mark_stale` added `0019_wiki_boundary.sql:166-168`), `actor_kind`/`actor`, `detail` jsonb, `created_at`. Structured and machine-queryable vs. OKF's hand-parseable-but-prose file; near-zero-transform to render as an OKF `log.md` (§4). |
| `references/` convention (mirror external material into the bundle) | — | **conflict, deliberately** | Clara's citations point at the **live authoritative row** (`document_id` → `clara.documents`) rather than mirroring/copying the file into the KB. This is the gist's own "raw sources stay immutable, the wiki never duplicates them" principle (karpathy-gist:29-31), implemented via FK instead of a directory convention — a case where Clara's approach is *more* aligned with the pattern's spirit than OKF's own convention. |
| Actor convention (`<producer>/<version>`, `human:<id>`, `process:<id>`) | `engine_id` text + `wiki_log.actor_kind`/`actor` | present+ | `engine_id` already matches the `<producer>/<version>` shape verbatim (`clara-wiki-synth:gpt-5.6-terra`, `wiki-projection.mjs:135-136`); `actor_kind='runtime'` covers the `process:` case loosely, `actor` is an FK'd `users.id` rather than a free-text `human:<id>` string. |
| No schema registry ("no central authority", SPEC.md:11) | `client_fact_keys` catalog | **conflict, deliberately** | `0055_client_facts_trio.sql:347-353` is exactly a small central registry (`fact_key`, `validated_against`, `allowed_values`) that `record_client_fact` validates against and refuses unknown/unvalidated keys for (`0055:574-606`). This is a **documented, intentional** divergence — Clara's client-facts layer needs a closed, auditable vocabulary (statutory fields like `entity_type`/`msic`) more than it needs OKF's format-level openness; keep it, but recognize it's not "OKF as specified." |

**Identity tables specifically** (feeding §3):

- `clara.client_identifiers` (0007_document_pipeline.sql:223-234): `kind` ∈
  `{tin,ssm,bank_account}`, `value_normalized`, non-unique match index — this identifies the
  **client's own firm**, not a counterparty; template for the `kind` enum shape but not itself
  the table to extend.
- `clara.client_aliases` (0007:239-254): normalized alias + retire lifecycle — the direct
  ancestor pattern for `counterparty_aliases`.
- `clara.counterparty_aliases` (0011_daily_loop.sql:651-672): `alias_normalized`/`alias_display`,
  `origin` ∈ `{former_name,trade_name,human}`, one-live-name-per-client unique index
  (`0011:669-670`). **Read at posting** inside `_resolve_counterparty` via a `LEFT JOIN` cascade —
  registration match first, then name+alias with a registration-conflict guard, then
  unregistered name/alias last (`0011:1335-1424`, alias join at `1386-1421`). This is the direct
  ancestor of the read predicate in §3.
- `clara.vendor_identity_bindings` + `vendor_identity_binding_evidence`
  (0028_vendor_identity_binding.sql:53-111): `status` ∈
  `{proposed,live,revoked,declined,expired}`, `f1_vendor_name_norm`, `f2_invoice_prefix` (≥6
  chars), `registration_at_signing`, `content_hash`, `expires_at` (≤12 months), one-live-per-
  `(client,counterparty)` (`0028:84-86`); evidence trio FK'd to `entry_id`/`document_id`/
  `facts_extraction_id`/`ocr_extraction_id` (`0028:88-111`). Read predicate
  `_resolve_vendor_binding` (`0028:328-456`) matches F1 (name) + F3 (registration/name via
  `_binding_f3_holds`) among **live, unexpired** bindings, then requires F2 (invoice-id prefix)
  to disambiguate — `unresolved`/`ambiguous`/`bound` outcomes exactly mirroring
  `_resolve_counterparty`'s shape. This — plus a **human-signing** step (`signed_by`/`signed_at`)
  the decided context explicitly wants replaced with "auto-live after first successful post" — is
  what §3 supersedes.

---

## 3. Counterparty-identity frontmatter design

### Fields

Four typed key kinds, matching the decided context exactly:

| `key_kind` | source | normalization |
|---|---|---|
| `name_normalized` | vendor/customer display name | same normalizer as `counterparty_aliases.alias_normalized` (`lower(regexp_replace(display,'[^a-zA-Z0-9]','','g'))`, `0011:667`) |
| `registration_number` | SSM/company registration | same normalizer as `counterparties.registration_normalized` (used throughout `0011`) |
| `bank_payer_id` | bank statement payer/payee id | new normalizer (strip whitespace/case-fold; no existing Clara precedent — the closest is `client_identifiers.kind='bank_account'`, `0007:227`, which is client-side, not counterparty-side) |
| `invoice_prefix` | invoice-number prefix | `f2_invoice_prefix`'s existing ≥6-char floor (`0028:61`), matched with `starts_with()` exactly as `_resolve_vendor_binding` does today (`0028:447-448`) |

### Scope and uniqueness

**Per client, not per firm.** Every existing counterparty-identity table in Clara scopes by the
composite `(id, firm_id, client_id)` — `counterparty_aliases`
(`fk_counterparty_aliases_counterparty`, `0011:663-665`), `vendor_identity_bindings`
(`fk_vib_counterparty`, `0028:75-77`) — because a "vendor" is a relationship one specific client's
books have, not a firm-wide entity; the same real-world supplier known to two different clients of
one firm gets two independent `counterparties` rows today and must get two independent identity
rows. One live identity key per `(client_id, key_kind, key_value_normalized)`, mirroring
`uq_counterparty_aliases_live_name` (`0011:669-670`) and `uq_vib_one_live` (`0028:84-86`).

### SQL sketch

```sql
create table clara.counterparty_identities (
  id                     uuid primary key default gen_random_uuid(),
  firm_id                uuid not null,
  client_id              uuid not null,
  counterparty_id        uuid not null,
  key_kind               text not null check (key_kind in
    ('name_normalized','registration_number','bank_payer_id','invoice_prefix')),
  key_value_normalized   text not null check (btrim(key_value_normalized) <> ''),
  status                 text not null default 'proposed'
    check (status in ('proposed','live','revoked','superseded')),
  proposed_by_kind       text not null check (proposed_by_kind in ('runtime','human')),
  proposed_by            uuid references clara.users(id),
  proposed_at            timestamptz not null default now(),
  -- "auto-live after the first successful post": stamped atomically by the posting core, not
  -- by a separate signing door (unlike vendor_identity_bindings.signed_by/signed_at, 0028:67-68).
  live_at                timestamptz,
  live_evidence_entry_id uuid,
  revoked_at             timestamptz,
  revoked_by             uuid references clara.users(id),
  revoke_reason          text,
  superseded_by          uuid references clara.counterparty_identities(id)
    deferrable initially deferred,
  wiki_page_id           uuid,   -- the counterparty KB page this row's frontmatter belongs to
  constraint ck_ci_live_pair check ((status='live') = (live_at is not null)),
  constraint ck_ci_revoked_pair check ((status='revoked') = (revoked_at is not null)),
  constraint fk_ci_counterparty foreign key (counterparty_id, firm_id, client_id)
    references clara.counterparties(id, firm_id, client_id),
  constraint fk_ci_entry foreign key (live_evidence_entry_id, firm_id, client_id)
    references clara.journal_entries(id, firm_id, client_id),
  constraint fk_ci_wiki_page foreign key (wiki_page_id, firm_id, client_id)
    references clara.wiki_pages(id, firm_id, client_id)
);

create unique index uq_counterparty_identities_live
  on clara.counterparty_identities(client_id, key_kind, key_value_normalized)
  where status = 'live';
```

Deterministic read predicate at posting, in the shape of `_resolve_vendor_binding`
(`0028:328-456`) merged with `_resolve_counterparty`'s cascade (`0011:1335-1424`) — strongest key
first:

```sql
create function clara._resolve_counterparty_identity(
    p_client uuid, p_key_kind text, p_key_value_normalized text) returns jsonb
  language sql stable security definer set search_path = clara, pg_temp as $$
  select case count(*)
    when 0 then jsonb_build_object('outcome','unresolved')
    when 1 then jsonb_build_object('outcome','bound',
      'counterparty_id', (array_agg(counterparty_id))[1])
    else jsonb_build_object('outcome','ambiguous')  -- defense-in-depth; the unique index
                                                      -- above should make this unreachable
  end
  from clara.counterparty_identities
  where client_id = p_client and status = 'live'
    and key_kind = p_key_kind and key_value_normalized = p_key_value_normalized;
$$;
```

A caller (the attribution matcher) tries `registration_number`, then `bank_payer_id`, then
`invoice_prefix` (via `starts_with`, not equality — the one key that is a **prefix** match, exactly
as F2 works today), then `name_normalized` last — the same strength ordering
`_resolve_counterparty` already encodes for registration-vs-name (`0011:1375-1421`). This table +
function together **replace** `_resolve_vendor_binding` (`0028:328-456`) and the
`counterparty_aliases` `LEFT JOIN` lane inside `_resolve_counterparty` (`0011:1386-1421,1401-1421`)
— both become one typed table with one read predicate instead of two separate mechanisms with two
separate trust models (a human-signed binding vs. an unsigned alias).

### "Agent proposes → auto-live after first successful post"

- A `record_counterparty_identity_proposal(...)` door inserts `status='proposed'` — cheap,
  agent-callable, no posting required, no `live_evidence_entry_id`.
- Promotion is **not** a second door the agent calls (that would reintroduce
  `vendor_identity_bindings`' separate signing ceremony the decided context wants gone). It is a
  side effect **inside** the existing posting core: the first successful post whose attribution
  resolved through a `proposed` identity row flips that row to `status='live'`, stamps
  `live_at`/`live_evidence_entry_id` in the **same transaction** as the post — matching Clara's
  "one verb, one call, one moment" discipline (explicit in `0055_client_facts_trio.sql:405-406`'s
  own commentary on why the supersession stamp is one act) and the wiki writers' own pattern of
  appending their log/event atomically with the state change (`0017:2169-2174`,
  `2216-2225`).
- Evidence is the entry itself (`live_evidence_entry_id`), not a separate evidence trio — simpler
  than `vendor_identity_binding_evidence`'s four-way FK (`0028:88-111`) because there is no
  separate "signing" act to evidence; the post *is* the confirming act.
- **Open for product**: if an agent proposes two keys for the same counterparty in one batch (e.g.
  name + registration together) and a single entry's attribution matches on more than one key, does
  promotion cover all keys atomically or only the one that matched? Flagged in Implications.

### What the KB page body must NOT contain

Per the gist's own principle — raw sources "are immutable... This is your source of truth" and the
wiki is what "you read"; "the LLM writes it" (karpathy-gist:29-31) — the counterparty page's prose
must never **restate** the registration number, bank payer id, or invoice prefix as free text: once
`counterparty_identities` exists, those values live in a typed, DB-read table, and a prose copy is
a second, driftable source of truth with no sync mechanism (each republish is a whole new immutable
version, `0017:2090-2095`; nothing re-derives prose from the typed row). This is also exactly
Clara's own existing contract for wiki content — the context-pack wiki block is already stamped
`'basis','clara_maintained_advisory_notes','permitted_use','inform_never_decide'`
(`0017_wave_b.sql:5067-5068`) — so "no copied state" is a natural extension of a rule Clara already
enforces for *decisions*, applied here to *identity facts* too. The body should narrate judgement
("this vendor invoices through two related entities; treat as one economic counterparty") and
**cite** the identity row via `wiki_page_citations`, never repeat its value inline.

---

## 4. Export design

One bundle per client, using the **real** OKF bundle shape observed in `acme_retail` (not just the
spec's inline toy example): `index.md`, `log.md`, and subdirectories by `page_kind` — `profile/`,
`counterparty/`, `treatment/`, `recurring_pattern/`, `open_question/`, `period_context/` (Clara's
own enum, `0017:827-829`) — each holding one `.md` file per live `wiki_pages` row.

**Per-page frontmatter**, generated (not hand-written) from Clara's tables:

- `type`: the `page_kind`, title-cased.
- `title`, and `id`/filename: `wiki_pages.slug`.
- `status`: `wiki_pages.state='active'` → `stable`, `'retired'` → `deprecated`.
- `generated: {by, at}`: `by` = `wiki_page_versions.engine_id` when synthesis is `'model'`, else
  `'human:' || recorded_by` from the originating `wiki_log` row; `at` = `version.created_at`.
- `verified`: omitted until Clara ships its own `verified[]` layer (§2 — currently absent). OKF
  explicitly allows this: "consumers MUST NOT reject a concept for missing any optional family"
  (SPEC.md:749-750).
- `sources`: one entry per `wiki_page_citations` row — `id` = citation id, `resource` = a
  redacted synthetic URI (see redaction below), `title` from the cited document/entry, `author`
  = `'process:clara-wiki-projection'` or the recording human, `last_modified` = citation
  `created_at`.
- Non-standard extension key `x_stale: {marked_at, reason}` when any citation's `stale_at` is set
  — reusing the `has_stale_sources` computation `0019` already added to every read path
  (`0019_wiki_boundary.sql:977-994`). OKF permits arbitrary producer keys (SPEC.md:205-207); this
  is **not** `stale_after`, because Clara's staleness is event-derived, not producer-declared (§2).

**Manifest**: bundle-root `index.md` with `okf_version: "0.2"` frontmatter (the one place OKF
allows it, SPEC.md:776-778) plus Clara extension keys `x_clara_source_event_seq`,
`x_exported_at`; body enumerates pages by `page_kind` heading, generated from `list_wiki_pages`
(`0017:2404-2430`). `log.md` renders `wiki_log` rows for that client (`0017:967-982`) as
date-grouped, bold-leading-word entries — this is close to a direct transform, since `wiki_log` is
already append-only and chronological.

**Import elsewhere**: an OKF bundle is portable ("just markdown... just files", per the blog), but
Clara's citations are FK'd UUIDs meaningless outside the exporting install. Re-importing into a
*different* Clara tenant should go through the existing deterministic ingest path
(`record_wiki_source_ingest`, `0017:2228-2285`), re-resolving each citation's identifiers
(`client_identifiers`/`counterparty_identities`) against the new tenant's own rows and **refusing**
(never fabricating) any citation that can't be re-resolved — consistent with the "provenance is
never fabricated" discipline already documented in `wiki-projection.mjs:12` (F-M12). A non-Clara
OKF-aware consumer reads the exported bundle as-is; that's the whole point of the format.

**Redaction:**

- **Consent evidence** — already impossible to leak: `document_kind='consent_evidence'` is
  hard-refused as a citation at publish time (`CLR28`, `0017:2122-2126`) and as an ingest source
  (`0017:2252-2254`). The export inherits this invariant for free; no extra export-time filter
  needed.
- **Other clients** — every wiki table is `client_id`-scoped with composite FKs
  (`0017:841-842`, `875-878`, etc.); export must filter strictly on the target `client_id`, and
  raw `firm_id`/internal UUIDs must not appear in the exported files — replace with an opaque
  per-export alias, since a bare UUID leaving Clara's RLS boundary is a firm-identifying token the
  receiving party has no legitimate use for.
- **Stale-but-real citations** — a citation whose `stale_at` was set by a wrong-client correction
  (`0019`'s `document.filing_retired` lane, `0019_wiki_boundary.sql:613-618`) may point at material
  the client no longer has active custody of. Surface `x_stale` (inform, per §7's own
  inform-never-decide posture) rather than silently dropping it, but never include the underlying
  document's bytes or storage key — only a redacted `resource` reference — unless the firm
  explicitly opts into bundling raw source content.

---

## 5. Retrieval design

**Pack index shape**: `(slug, title, type, updated_at, has_stale_sources, one-line summary)` maps
almost directly onto `list_wiki_pages(client)` (`0017:2404-2430`), which already returns
`slug, page_kind (type), title, updated_at`, and — after `0019` — `has_stale_sources`
(`0019_wiki_boundary.sql:999-1014`). The **one** missing field is the one-line summary, which is
the same gap as OKF's `description` (§2). Recommend an explicit, publish-time-required `summary`
column on `wiki_pages` (mirroring how `title` is already threaded through every publish call,
`0017:2065-2067`) rather than deriving it from the first line of content — Clara's publish path
already enforces required-at-write invariants (citation count, byte budget, `0017:2025-2034`); a
required summary keeps that discipline instead of a best-effort heuristic.

**`get_wiki_page(slug)` tool**: this is **already built** — `clara.get_wiki_page(p_client, p_slug)`
(`0017:2374-2402`) returns `{page, version, citations, refs}`, plus `has_stale_sources` after
`0019` (`0019:977-994`). The only work is exposing the existing RPC as a named agent tool; no new
DB surface is needed.

**Sizing against the 40-page / 12288-byte budget named in the ticket**: these are Clara's live
config, not aspirational numbers — `clara.wiki_budgets` seeds exactly
`max_pages_per_client=40`, `max_page_bytes=8192`, `pack_max_pages=6`, `pack_max_bytes=12288`
(`0017_wave_b.sql:815-819`). The context-pack wiki block (`0017:5029-5066`) already implements a
byte-budgeted ranked window: priority by `page_kind`
(`profile→period_context→treatment→recurring_pattern→counterparty→other`), then `updated_at desc`,
admitted via a running-sum window function capped at `pack_max_bytes`. Retrieval sizing is a
**solved problem** in the DB layer; an agent-facing pack index should reuse this exact ranking
rather than inventing a new one. Note `pack_max_pages=6` ≪ `max_pages_per_client=40` — the *index*
(`list_wiki_pages`, up to 40 rows) is a browsable superset; the *pack* (6 pages / 12288 bytes) is
what's proactively injected; `get_wiki_page(slug)` is how the agent reaches the ~34 pages the pack
didn't include.

---

## 6. What Clara has that OKF lacks — recommend keeping all of it

- **RLS / tenant isolation.** Every wiki table composite-FKs `(id, firm_id, client_id)`; OKF has no
  access-control concept at all — "no schema registry, no central authority" (SPEC.md:11) extends
  to no authorization model either. Keep: RLS gates what's even *eligible* to become an export.
- **Immutable versions with append-only supersession.** `wiki_page_versions` never updates content
  — only `state` transitions `uploaded→verified→published→superseded` (`0017:857-884`); superseded
  rows are kept forever. OKF has no versioning model beyond "use git." Keep: this is what makes
  `run_client_lint`'s contradiction/stale checks possible — they compare only currently-published
  versions and can trust what "superseded" means (`0017:4730-4785`).
- **FK'd citations vs. URI strings.** `wiki_page_citations` resolve to real, live-filed rows
  (`0017:2113-2127`); OKF's `sources[].resource` is an unverifiable string. Keep internally; export
  *down* to OKF's looser shape on purpose (§4), never import/store that way.
- **Consent-gated synthesis.** The two-phase prepare/consume egress dispatch
  (`wiki-projection.mjs:264-313`) gates model-authored pages on a live, revocable consent with a
  hard linearization point. OKF has no consent concept — an agent with write access just writes.
  Keep: required for Malaysian client data; this is product law, not polish.
- **Apply-time "law 73" scans.** A gate, bound, or floor (e.g. `_approve_entry_core`) may
  structurally never read the wiki or pack — enforced by a static `prosrc` scan at every migration
  apply that fails the build if an authority function so much as *names* a wiki-capability token
  (`0106_f_a2_posting_core.sql:2292-2306`, echoing `0019_wiki_boundary.sql`'s own tail scan,
  `0019:1364-1379`). OKF has nothing resembling this — an Attested Computation's `attester` could
  in principle be trusted with a real decision; nothing in the format prevents it. Keep, and treat
  it as the reason the counterparty-identity design in §3 reads at posting through a **typed
  table + SQL function**, never through the wiki page body — the body stays outside every gate,
  permanently.

---

## Implications

1. `counterparty_identities` (§3) is a genuinely new table; it does not extend
   `vendor_identity_bindings` or `counterparty_aliases` in place — both are superseded and should
   be migrated/dropped in a follow-up, not left running in parallel with a third mechanism.
2. Auto-live-on-first-post needs one product decision before implementation: when one proposal
   batch carries multiple key kinds for the same counterparty, does the first matching post
   promote all of that counterparty's `proposed` keys, or only the one key that matched? Affects
   whether promotion is per-row or per-counterparty-batch.
3. `verified[]` (OKF's trust layer) is confirmed absent from the wiki tables today (§2) — it is a
   real gap, not just an OKF-shaped nice-to-have, since Clara has no way to record "a human
   confirmed this KB page is still right" independent of who wrote it.
4. `description`/`summary` is the one field blocking a faithful OKF-shaped pack index (§5) — cheap
   to add (one column, enforced at publish like `title` already is), low risk, high leverage.
5. Export redaction (§4) is mostly free: consent-evidence exclusion is already structural
   (`CLR28`). The remaining work is UUID-to-opaque-alias mapping and deciding whether to bundle raw
   source bytes at all (recommend: never, by default).
6. `stale_after` (producer-declared) and Clara's event-derived `stale_at` are **not** the same
   mechanism and should not be conflated in the export frontmatter — keep them as separate keys
   (`stale_after` reserved for a future human-set expiry; `x_stale` for the existing computed flag).
7. The read predicate in §3 should be reviewed against the same lock-ordering discipline
   `0019_wiki_boundary.sql` had to retrofit for the stale-marker writer (client-row-before-page-row,
   `0019:764-796`) before it ships, since it will be called from the posting core's hot path.
