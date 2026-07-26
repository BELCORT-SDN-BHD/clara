# Vision-alignment audit — are we on the AI-Agentic / AI-OS path? (2026-07-27)

Owner-requested, pre-Wave-B-close. Every number below was measured on **live** during this
audit, not recalled. Pinned: 21 migrations · runtime v29 · `main` `e4eef2e`.

Companion question answered here too: how does Clara's per-client KB compare to the
**LLM Wiki v2** architecture (gist `rohitg00/2067ab416f…`, the Karpathy-pattern extension) —
relevant because PRD §6a defines Clara's wiki as *"Gate-1 B — Karpathy two-layer"* and
REBUILD-PLAN Wave B says *"redesigned per the Karpathy direction"*. Same lineage, honest diff.

---

## 1. The KB, against LLM Wiki v2

| LLM Wiki v2 mechanism | Clara | Evidence |
|---|---|---|
| Raw sources → wiki pages | **HAS, proven live** | 4 documents filed this session each produced a source page in seconds |
| Event-driven updates | **HAS, stronger** | Not hooks — a durable event-spine projection (`WIKI_PROJECTION_EVENT_TYPES`) with checkpoints and dead-letter lanes |
| Typed entities + relationships | **HALF** | Entities live in the relational schema (counterparties + aliases, accounts, rules). The wiki's own graph (`wiki_page_refs`, five ref kinds) exists as schema — **0 rows**. The graph is flat |
| Supersession (keep old claims, mark stale) | **HAS** | Page version chains; `wiki.page_canonicalized` preserves preimages; rules retire-not-delete |
| Confidence decay (Ebbinghaus) | **REJECTED, deliberately** | Hard 12-month expiry + human re-signature instead. The gist's own comment thread argues decay corrupts institutional memory and numeric confidence is falsely precise — for accounting, Clara sides with the critics |
| Auto-resolved contradictions | **REJECTED, deliberately** | Contradictions become lint findings for a human (Gate L's machinery); never auto-resolved |
| Hybrid search (BM25 + vector + graph) | **MISSING — the real gap** | Zero embeddings anywhere. Retrieval is deterministic context-pack assembly. The gist warns single-index breaks ~200 pages; RPR is at 44 |
| Memory tiers (working/episodic/semantic/procedural) | **GOVERNED EQUIVALENT** | sightings (episodic) → ≥3 floor → autopost-rule proposal (procedural), consolidated only through a **human signature**, never automatically |
| Permissions / governance | **FAR STRONGER** | No authority fn reads wiki (W2 audit, negative-tested); agent role zero EXECUTE; model synthesis DARK behind typed consent + owner activation (0020); every page states *"informs professional judgement; it never decides"* |

The failure modes the gist's critics flag — hallucinated auto-ingest corrupting the wiki,
conjectures solidifying into facts, auto-resolution destroying research signals — are the
exact ones Clara's architecture refuses **structurally**. The two genuine gaps are
retrieval-at-scale and the unpopulated refs graph. Both are growth items, not direction errors.

## 2. Is Wave A/B "hardcoded and manual"? — measured

Three decision layers, each alive on production:

| layer | decides | live count |
|---|---|---|
| **LLM** | document kind; account coding in chat; when to ask a human | `classify_document` ×11 — incl. 0.98 (GL), 0.97 (receipt), and an honest 0.22 hold on a 51-page bundle |
| **Deterministic rules** | rule-matched coding hints; seeding parse; XML arithmetic | `record_rule_resolution` ×**37** — the matcher lane is active |
| **DB structure** | every figure, tie, authority | six CLR23 refusals in one ceremony this week |

Human-operated today, split honestly:

- **By LAW** (PRD §2: Clara *"never silently acts on high-stakes items and can never satisfy
  a human sign-off"*): approve (×32), rule signing, attribution confirm (×13 of 29 candidates).
- **By GAP** (recorded, pre-Wave-C fix): the autonomous half has never run —
  `wake_draft_entry` **0**, `get_context_pack` **0**, autodraft **0 drafts / 55 sweeps**
  (Tier-A: Azure confidence 0/29 ≥ 0.95). All 33 drafts to date carried human session authority.

The LLM-Wiki-v2 gist notes conservative variants run automation *"only after human handoff"* —
Clara **is** that conservative variant, deliberately: prove the supervised loop first (done,
three exact-to-the-sen gates), then ramp autonomy measured by Phase 5 §6's auto-post-precision
gate.

## 3. Document types: fixed taxonomy, flexible handling

- **17 kinds**, pinned by a DB CHECK — a new kind is a migration.
- Within a kind, **layout-free**: LLM classify + Azure layout; bytes-sniffed routing
  (PDF/image→OCR; XML→local MyInvois parse, zero egress; XLSX/CSV/DOCX→structured_parse);
  filename/mime never gate.
- Evidence this week: three never-seen layouts handled correctly, including the honest
  low-confidence hold.

## 4. The operating envelope (user supplies → Clara does)

```
drop file → intake (hash/scan/store)          auto
          → OCR + layout                      auto
          → attribution                       auto-PROPOSED (29) · human confirms (13)  [LAW]
          → classification                    auto (≥0.8 sets kind; below → human)
          → facts extraction                  auto
          → coding draft                      Clara drafts in chat; matcher hints (×37)
          → approve → post                    HUMAN, always                              [LAW]
          → AR/AP + sightings + wiki ingest   auto, same transaction / spine
          → KB growth                         auto (pages in seconds; sightings on
                                              approval; 12 knowledge pages from seeding)
```

The single should-be-auto-but-isn't segment: sweep → autodraft → bounded autopost, blocked by
one measured condition (vendor self-reported confidence).

## 5. Autopost: fully built, never operated — and already fueled

| verb | exists | ever called |
|---|---|---|
| `propose_autopost_rule` — **human-lane** (`_human_ctx(bookkeeper)`) | 0015, CoR 0016 | **0** |
| `sign_autopost_rule` — ADMIN = the posting authority | ✓ | **0** |
| `execute_rule_post` — bounded: cap>0, direction, window count, hard expiry, high-stakes refusal | ✓ | **0** |
| `retire_autopost_rule` | ✓ | 0 |

`coding_rules.rule_type` distinguishes **`vendor_account`** (coding hint — informs, never
posts; 6 signed live this week) from **`autopost`** (posting authority; **0 rows ever**).

**Fuel already exists:** 5 (counterparty, account, side) pairs on live meet the ≥3
human-approved-sighting floor today (max 6). The first production autopost is **operating
work, not building work**: propose one, ADMIN signs, the next matching routine draft posts
within bounds — reachable even before the Tier-A fix, since `execute_rule_post` acts on
drafts from any lane.

## 6. OWNER PROPOSAL EXAMINED — seed autopost rules at onboarding from prior records?

Proposal (2026-07-27): (a) propose autopost rules during onboarding from the client's
management-account / prior-GL data, using repetition counts; (b) allow the user to plant a
rule manually via chat.

**(a) is refused by the owner's own ratified law — WB-R2: *"no autopost rules from seeding,
ever."*** The reason is evidence class, not caution:

- A prior GL proves what the **old system's bookkeeper** did. A sighting proves a human **in
  this firm watched Clara code this pair and approved it** — three distinct, unreversed,
  non-rule-produced approvals. Posting authority derives from verified in-system behaviour,
  never from another system's claims.
- The audit-grade framing: to *"who authorized automatic posting, on what evidence?"*,
  "3 in-system approvals + an admin signature, timestamped and replayable" survives an MIA
  file review. "The old GL showed this vendor 9 times" does not — nobody in the firm verified
  those nine, and B-12 found real gaps and date discrepancies in exactly that GL corpus.
- This week's ceremony demonstrated even **identity** from a GL is weak evidence (6/12 ticks
  refused — a GL prints no registration numbers). Amount-bearing authority from the same
  source would be weaker still. And management accounts specifically are the weakest form —
  Bee Creative's prints no account codes and no Dr/Cr at all.

**The intent behind (a) — shorten the runway to autonomy — is already served, by design:**
seeding mints `vendor_account` hints, so Clara's drafts arrive **pre-coded correctly from day
one**; each approval of those drafts mints a sighting; at three, the proposal unlocks. The
ramp is: correct drafts immediately → autonomy after three verifications. On RPR the ramp has
already completed for 5 pairs.

**(b) already exists and is the designed path.** `propose_autopost_rule` is a human-lane verb
at the bookkeeper floor — the user (or chat acting in the user's session) can propose today;
an ADMIN signs; bounds apply. What chat can never do is skip the floor: `CLR27
insufficient_evidence` is structural, direction-aware, alias-canonical, and excludes
rule-posted outputs (rules never breed from their own output). OCR-sales class is
deliberately harsher: ≥6 sightings across ≥6 distinct documents spanning ≥60 days.

## 7. Verdict against the North Star

PRD §0: *"AI-native Agentic Accounting OS… the agent is the brain that orchestrates; the DB
is the single source of truth and the only mutator of numbers… cut manual labour by 99%+ with
zero unattributable entries."*

| pillar | state |
|---|---|
| DB owns every number; agent orchestrates | structural, re-proven this week | 
| Event-driven state layer | live, checkpointed |
| Zero unattributable entries | structural (`assert_client_resolved` ≥0.95) |
| Karpathy two-layer KB | growing real knowledge as of this week |
| Conversational super-UI | proven three times to the sen |
| **99%+ labour cut** | **supervised loop proven; autonomous loop 0 production evidence** |
| Proactive OS surface | Wave G, per plan |

**On the path — with one honest delta.** The direction, layering and governance are right,
and deliberately sequenced (supervised first, autonomy gated on corroboration quality). The
autonomy promise currently has zero production evidence, the plan itself knows it (Phase 5
§6 gates on auto-post precision), and the pre-Wave-C corroboration fix plus the
first-autopost operating act are the two shortest steps that change that.
