# ClaraBook conformance pass — 2026-09-02 (third pass, FS-9, P6's entry gate)

*Run to answer FS-9's mandate (`docs/plan/active/frontend-sprint-handoff-2026-08-31-orders.md`
§FS-9, 裁-9): re-read the clarabook-frontend design authority as the parity reference for every
built surface in `apps/web`, and record every deviation by ruling, never absorb it. This is the
THIRD conformance pass, after `codex-frontend-handoff-errata-2026-08-27.md` (integration staleness)
and `clarabook-resource-audit-2026-08-28.md` (design-resource consumption). The 2026-09-02
pre-pause checkpoint scan pre-ran FS-9 as a 17-lane read-only scan (111 agents), each finding put
through a second, refute-first adversarial verification pass before being trusted. This document
synthesizes that scan's three design/integration lanes — `design-tokens-components`,
`design-ia-prototype-parity`, `integration-contract-law` — plus the two prior passes and the
2026-09-02 owner-ruling ledger.*

**Pinned tree:** `origin/main` moved `1e4a275b` (the scan's pin, #484) → `944cb586` (#495,
money-parser comma hardening) as measured at authoring time. **Design authority:** the
`clarabook-frontend` repo at commit `a7709883` (PR #1 merged; short form `a770988` appears in the
2026-08-27 errata for the brand-guideline package specifically — same lineage). **Method:** every
scan finding below carries its own `file:line` evidence; every MATERIAL/BLOCKER finding was then
independently re-derived by a second reader in refute-first mode (attempting to disprove it before
accepting it) — a finding is **CONFIRMED** only when that second pass could not refute it
(`verdict.refuted: false`, using `verdict.corrected_claim` where the pass narrowed or corrected the
original wording), and **REFUTED** findings are demoted to Appendix §6. NIT/INFO-severity findings
did not go through the second pass; they are cited here as directly-measured facts on their own
grep/read evidence, not as adversarially-confirmed claims.

> **AUTHORING NOTE (resolved at filing, 2026-09-02).** This pass was commissioned the same
> morning the owner ruled 裁-115…128, and the lane correctly refused to treat those citations as
> verified because the ledger entries were not yet on any branch it could read (they were authored
> on harness/checkpoint-truing-2026-09-02 while the lane ran). The ledger section — `docs/plan/active/mohe-grill-rulings-2026-09-02.md`
> §"The 2026-09-02 checkpoint sitting" — lands in the SAME PR as this record, so every 裁-116 /
> 裁-117 / 裁-128 citation below now resolves; the lane's inline markers were
> removed by the orchestrator at filing and nothing else in the lane's text was changed. The lane's
> refusal is the correct behaviour under review law 2 and is recorded here as a positive control.

---

## §1 · CONSUMED — holds, measured

| Item | Evidence | Citation |
|---|---|---|
| Raw-colour value ban | 0 violations across `apps/web/app/**`, `apps/web/components/**` (17 hits, all comments/PR numbers) | `eslint.config.mjs:192`; DS-16 |
| Tailwind-default-palette ban | 0 violations, same scope | DS-16 |
| Brand fonts | byte-identical to reference (`sha256sum` match on all 3 `.ttf`) | DS-20 |
| Light-theme-only / desktop-first | 0 real `dark:` variants (3 hits are all inside one strip-comment); no distinct mobile layout, graceful `sm:` stacking only | `apps/web/components/ui/dropdown-menu.tsx:14`; DS-20 |
| Zero perpetual animation | 0 animate-spin/pulse/bounce/ping/infinite hits | DS-20 |
| Token contrast gate | 38 pairs at filing, all PASS, tightest 4.64:1 (muted-foreground on identity-canvas). **Re-measured 2026-09-03: 55 pairs** (`grep -c '^  { id: "' apps/web/scripts/check-token-contrast.mjs`) — count the file, not this line; the P6-3/P6-6 trains added pairs, not removed any | `apps/web/scripts/check-token-contrast.mjs`; DS-17 |
| next-intl coverage | 185 of 221 non-test `.tsx` under components/ import next-intl | DS-08 instrument |
| Two-level IA (Q3) | firm altitude / client altitude skeleton built and correctly cited | `mohe-grill-rulings-2026-08-27.md:29-31`; IA-13 (CONFIRMED) |
| Client switch as a security event, at the PAGE level | `<div key={clientId}>` unmount/remount in `ClientScopeProvider` genuinely clears page-scoped state on a client-to-client navigation | `apps/web/components/client-scope-provider.tsx:10-14,66`; IA-02 (CONFIRMED) — **the Clara rail does NOT inherit this; see §3** |
| All 26 part kinds render | catalog's own count: "24 render-branch entries + the 2 STATUS_RESOLVER_TYPES … = 26 total, matching the live `ClaraPart` union … exactly"; unknown parts fail closed at compile time (`AllCovered`/`NoExtra`) AND at runtime (visible fallback, never a silent drop) | `apps/web/lib/parts/catalog.ts:24-30,257-260`; `apps/web/components/parts/PartRenderer.tsx:235-246`; IC-11 (CONFIRMED) |
| Door layer not bypassed | 0 `.rpc(`/`.from(` calls anywhere in `apps/web`; transport status classified before CLR parsing; a `DoorRefusal` is rethrown verbatim, never retried | `apps/web/lib/wire.ts:158-177,274,295`; `apps/web/lib/doors.ts:114`; IC-10 (CONFIRMED) |
| Credential wall | 3 `NEXT_PUBLIC_` names only, none a secret; `SUPABASE_SERVICE_ROLE_KEY` lives in exactly one non-test file reachable only by the server-only invite route; the bundled public key's CLASS is gated pre-build | `apps/web/lib/members/invite-mail.ts:47`; `apps/web/scripts/check-public-key.mjs`; IC-09 (CONFIRMED) |
| Fourth-entrance census (#477) still holds | 0 `"use server"` files anywhere; both rosters (special-file, use-server) genuinely empty, not vacuously so | `apps/web/tests/firm-scope-fourth-entrance.test.ts:249,416`; IC-11 (CONFIRMED) |

**Ruled deviations cited correctly in code** (each is a deliberate departure from the design
authority, marked at its own site, not silently absorbed):

- **Q2 — rail-first + thread escalation** — the prototype's Clara-as-modal `<Sheet>` (<1200px) is
  absent from `apps/web` by ruling, not by omission. `mohe-grill-rulings-2026-08-27.md:22-28`; IA-13.
- **Q3 — data library folds into documents/knowledge** — cited in the page header itself.
  `apps/web/app/(firm)/clients/[clientId]/knowledge/page.tsx:7-8`; IA-13, IA-14.
- **Q5 — i18n, three layers; English-first for beta, all strings still route through next-intl.**
  `mohe-grill-rulings-2026-08-27.md:45-48`; IA-13.
- **R7 — in-thread interview supersedes the wizard-page shape.** The wizard routes
  (`/onboarding/*`, `/opening`, `/seeding`) have no `apps/web` counterpart; the in-thread runner is
  built (`InterviewRunCard.tsx`, `OnboardingChecklistCard.tsx`, FS-5 #483). `mohe-grill-rulings-2026-08-27-evening.md:58`; IA-13.
- **裁-95 — mobile corridor out of beta.** `mohe-grill-rulings-2026-09-01.md:7`; IA-13.
- **R3/裁-1 — the shadcn translucent focus ring supersedes contract §9's static 2px outline** (the
  MECHANISM change, not yet the final alpha value — see §3). `apps/web/app/globals.css:217` ("FOCUS
  TREATMENT — RULED 2026-08-27 evening (R3), RECUT STILL OWED"); IA-13.
- **裁-2 4a — the identity-canvas white-card treatment, entry pages only.**
  `apps/web/app/(entry)/layout.tsx:23`; IA-13.
- **The token recuts toward the contract doc, not either executable reference.** `apps/web/app/globals.css`
  carries five self-declared "PORT DRIFT, CONFORMED (contract §N)" comments (radius scale ratios→literals,
  a `--text-xl` override, motion 120/180/240→120/160/200 + a new `--ease-out`, the global
  reduced-motion duration-zeroing removed for per-utility arms, five new `@utility` rules) — every
  one moves TOWARD 01-TOKEN-CONTRACT.md and AWAY from both the design-system reference and the g6
  prototype, which independently agree with each other and disagree with the contract. None of the
  five carries a 裁/R/Q number (see §4). `apps/web/app/globals.css:96-118,129,217-372`; DS-15.

---

## §2 · DIVERGED BY RULING

| Deviation | What changed | Ruling |
|---|---|---|
| Q2 — rail-first, no modal Sheet | Prototype's `<Sheet>` (<1200px) rejected as a modal; rail + escalation adopted instead | `mohe-grill-rulings-2026-08-27.md:22-28` |
| Q3 — data-library fold | Prototype's folder/breadcrumb/records-table/move-dialog/saved-view library folds into a flat `client_facts` register under documents/knowledge — **residual named**: the fold delivers NONE of the library's actual capabilities (no folders, no move, no saved views); this is a recorded diminishment, not a completed port | `mohe-grill-rulings-2026-08-27.md:28-36`; IA-14 |
| Q5 — i18n, three layers | UI chrome English-first for beta; all strings still route through next-intl from day one | `mohe-grill-rulings-2026-08-27.md:45-48` |
| R7 — in-thread onboarding | Wizard-page shape replaced by an escalated Clara thread | `mohe-grill-rulings-2026-08-27-evening.md:58` |
| 裁-95 — mobile out of beta | Q6 mobile corridor deferred | `mohe-grill-rulings-2026-09-01.md:7` |
| R3 — focus ring, shadcn ring supersedes contract §9's outline | Mechanism ruled; **the specific alpha value (70%) is NOT the ruling's own target yet — see §3, this is a mechanism-only divergence** | `mohe-grill-rulings-2026-08-27-evening.md:25-33`; 裁-1, `mohe-grill-rulings-2026-08-28.md:12-18` |
| 裁-64③ — ring-offset mechanism ruled | Superseding treatment ruled; build still owed (§3) | `mohe-grill-rulings-2026-08-30.md:206` |
| 裁-2 4c — `--input` recut ruled | Superseding value ruled; build still owed (§3) | `mohe-grill-rulings-2026-08-28.md` (裁-2 4c) |
| **裁-117 — one-thread-per-altitude ruled as the beta shape** | **RE-MEASURED 2026-09-03: 裁-117 now resolves** at `mohe-grill-rulings-2026-09-02.md:91`, disposing of IA-06's open question (the reduction from HANDOFF §2's "persistent, parallel threads" to one thread per altitude). At scan time IA-06 explicitly found this an **unrecorded narrowing**, not a ruled one, and flagged a sharper mechanism than the original finding stated: `listSessions` resolves to the NEWEST VISIBLE session (own + every firm-shared thread), so a colleague sharing a newer thread silently re-points the rail and the user's own scrollback becomes unreachable — a confidentiality-flavoured surprise, not just a missing switcher. **The re-point hazard still needs a fix regardless of the ruling** (scope `find` to `created_by === self`) — this truing did not re-verify whether that fix has landed. | `mohe-grill-rulings-2026-09-02.md:91` |
| **裁-137 — the wordmark renders lowercase glyphs (contract §8); the name in prose is ClaraBook (R1)** | The design authority's own lockup renders lowercase glyphs ("clarabook") while its prose says "ClaraBook" — contract §8 governs the WORDMARK (the glyphs), R1 (the ClaraBook brand adoption) governs the NAME (text). Ruled: both — wordmark lowercase per §8, every prose occurrence ClaraBook per R1. Zero code change; recorded in #514's PR body as diverged-by-ruling-resolved — this record did not carry its half until now. Live: `apps/web/components/entry/brand-lockup.tsx:133` applies `lowercase` as a CSS text-transform (DOM text and accessible name stay "ClaraBook") against the authority's `g5-design-system/docs/README.md:47` ("use the exact lowercase brand name `clarabook` in user-facing copy") | mohe-grill-rulings-2026-09-02-pm.md (裁-137, landing in #520); `apps/web/components/entry/brand-lockup.tsx:133` |

---

## §3 · OWED

**RE-MEASURED 2026-09-03 @ `dfe9406c` (repo tip at truing time).** Every row below was filed
2026-09-02 against the tip of that day; several are now DONE. Marks added inline; unmarked rows
are unchanged and still open.

Each row: file:line · the contract row it fails · the train that owns it · the gating ruling.

### P6-3 — the four ruled-but-unbuilt token/a11y debts — **DONE, #515**

| Item | File:line | Contract row | Gating ruling |
|---|---|---|---|
| Focus ring still 50% alpha, not the ruled 70% | **DONE #515** — the class ring-ring/50 is 0 in production source (the one remaining hit, `apps/web/test/keyboardWalk.test.ts:87`, is a planted DS-05 fixture, not a live class); ring-ring/70 is live across the ring utilities (`apps/web/app/globals.css`) | R3/裁-1 target alpha | `mohe-grill-rulings-2026-08-28.md:12-18` (裁-1) |
| `ring-offset` unbuilt | **DONE #515** — the classes ring-offset-2/ring-offset-background are live at `apps/web/components/ui/button.tsx:35`, asserted by `apps/web/tests/focus-ring-contract.test.ts` and the `a11y-finish-walk.spec.ts` browser leg | 裁-64③ | `mohe-grill-rulings-2026-08-30.md:206` |
| `--input` unchanged | **DONE #515** — `apps/web/app/globals.css:304` now `--input: #8b8981;` | 裁-2 4c | `mohe-grill-rulings-2026-08-28.md` |
| WCAG 2.2 target-size (2.5.8) gate unbuilt | **DONE #515** — `apps/web/test/a11yRules.ts` enforces the floor read from `--target-min` (`globals.css:382`, 24px), reasoned `data-target-size-exception` escape, mutant panel at `a11yRules.test.ts:158-276`; built-app leg `apps/web/e2e/a11y-finish-walk.spec.ts` | 裁-13 | `mohe-grill-rulings-2026-08-28.md:190-196` |

All four: `docs/plan/active/fe-train-plan-2026-08-30-orders-p6.md:136-215` (P6-3 ②); DS-17.

### Today's a11y adds — found this pass, no prior record before today

| Item | File:line | Severity/status | Gating |
|---|---|---|---|
| Dropdown menu animates under `prefers-reduced-motion` | **DONE #515** — every `data-[side=…]`/zoom transform on `dropdown-menu.tsx` now gated `motion-safe:` | CONFIRMED, live blast radius = one dropdown on /admin/members | candidate (DS-01) |
| No skip link | **DONE #515** — `apps/web/components/common/skip-link.tsx` now exists, wired into `app/(firm)/layout.tsx` | CONFIRMED but downgraded — belongs beside 裁-13 as P6-polish, not gating | no (DS-02) |
| `aria-busy` never rendered | **DONE #515** — `role="status"` on `LoadingState` (deliberately WITHOUT `aria-busy`, reasoned in its own header) + real `aria-busy` on the two PERSISTENT regions, `ClaraThreadView.tsx:193` and `InterviewRunCard.tsx:284` | CONFIRMED, dropped port (the authority's own screens implement it) | candidate (DS-03) |
| Nested live regions | **DONE #515** — the live region moved DOWN off the scroll container (`ClaraThreadView.tsx:126-140,189-193`): it now wraps only the transcript, so `OnboardingChecklistCard`/`InterviewRunCard`'s own `role="log"` are siblings, not descendants | CONFIRMED, corrected and strengthened | candidate (DS-04) |
| `drafts-queue-panel.tsx:114`'s focus halo | **DONE #515** — the ring is `focus-visible:ring-ring/70` now (part of the global R3 alpha recut), not the 50%-alpha halo the gate blessed | CONFIRMED, and the gate that should catch it blesses it instead | yes-by-ruling (DS-05, R3/裁-1) |
| Per-field validation association unbuilt | **PARTIALLY DONE — re-measured 2026-09-03: 2 rendered `aria-invalid={…}` sites, not 1 or 12** (`money-input.tsx:113`, `ArtifactRow.tsx:174`; the 12 the raw grep found includes `has-[…aria-invalid=true…]` CSS variant selectors in `input-group.tsx`, not renders). **Dominant unaddressed pattern is still the silent disabled Confirm button** — 68 `confirmDisabled=` sites as of this measurement (was ~63) — not a styled-but-unannounced field; form-level errors DO announce correctly via `StateBanner`'s `role="alert"` | CONFIRMED and corrected | candidate (DS-09) |

### P6-4 / task #14 — the float-hook money parsers, corrected and narrowed — **the three named files GONE, #505**

**Re-measured 2026-09-03:** the three files named below no longer exist (`git ls-files` = 0 hits for
all three paths); the consolidation shipped as `apps/web/components/common/money-input.tsx`,
which delegates parsing to a shared `parseMoneyInput` helper rather than each field's own
`Math.round(Number(sanitized) * 100)`. This truing does not re-verify whether the exponent-notation
and 3-decimal-truncation edge cases below are closed by the new parser — only that the named
files and their ad hoc parsing are gone. The original finding follows, for the record:

`apps/web/components/journals/use-amount-input.ts:42`, `staff-advance-money-input.tsx:37`,
`close-money-input.tsx:37` — `Math.round(Number(sanitized) * 100)`. **Refuted at BLOCKER severity**
(see §6): all three fields are `<Input type="number">`, so a browser's own value-sanitization
already empties non-numeric input for 3 of 4 originally-claimed bad rows (comma-grouped, hex). What
survives is narrower but real: `"1e3"` (exponent notation passes HTML's valid-float grammar and
books RM1,000.00 from a field displaying "1e3") and 3-decimal truncation (`"12.345"` → 1235 cents
silently, where the house parser returns `null`). Feeds 9 live consumer files. `docs/plan/active/fe-train-plan-2026-08-30-orders-p6.md`
(the P6 "ONE shared signed money input" consolidation item); PROGRESS-503.md:58,100-101; IC-01.

### P6-5 (+ the COA checklist apply button, 裁-128)

No finding in the three scanned lanes (`design-tokens-components`, `design-ia-prototype-parity`,
`integration-contract-law`) covers the COA checklist apply button — it is outside this pass's
scanned surface, which cites 裁-128 as gating it into beta. **Re-measured 2026-09-03: 裁-128 now
resolves** at `mohe-grill-rulings-2026-09-02.md:225` (the AUTHORING NOTE above already covers
this — the ruling landed in the same PR as this record, on branch harness/checkpoint-truing-2026-09-02,
after this section's citation was first written).

Separately confirmed for P6-5: **⌘K cannot reach a client from firm altitude** — `CLIENT_ROUTES`
render only when the URL already resolves a `clientId`; no row indexes client names, so ⌘K is not
"one way in, from anywhere" for the client register. 裁-37 governs the "Do" half into P6-5;
the firm-altitude client-reachability half is unordered anywhere. `apps/web/lib/command/routes.ts:150`;
`mohe-grill-rulings-2026-08-29.md:256`; IA-15.

### P6-6 — identity, 4/4 owed (not 3/4) — **DONE, #514**

**Re-measured 2026-09-03: all four items shipped.** `apps/web/public` now holds 7 tracked files
including both brand PNGs (`apps/web/public/brand/clara/clara-quiet-clerk-neutral-v1.0.png`,
`apps/web/public/brand/logo/clarabook-ledger-fold-brand-ink-v1.0.png`); `apps/web/messages/en.json` carries 13 `ClaraBook`
strings (`git grep -c`); `invite-mail.ts:154-158` now reads "on ClaraBook"/"invited to ClaraBook"
(no more "on Clara"); and item ④'s entry-face finish is complete — `app/(entry)/layout.tsx`
renders `<BrandLockup />` (`apps/web/components/entry/brand-lockup.tsx`), not just the structural scope.
The original finding follows, for the record:

`apps/web` ships **zero** Ledger Fold or mascot implementation by construction-path measurement (0
`<svg>`, 0 tracked image files under `apps/`, no next/image component use, public/ holds only
3 fonts + 2 licenses) — brand-lockup.tsx says so in-source. The ClaraBook copy pass has never
started in the message catalog (`git log -S "ClaraBook" -- apps/web/messages/` = 0 commits): 7
`en.json` strings put the AGENT's name in the PLATFORM's slot (lines 3, 4, 21, 33, 247, 1335, 1344)
while 56 of 63 "Clara" occurrences correctly name the agent. **The pass must also reach the invite
email** — `apps/web/lib/members/invite-mail.ts:153,156` hardcode "on Clara"/"invited to Clara" into
copy a beta user actually receives. Item ④ (the entry-face finish) is ALSO owed, not done: the
order reads "taken from structural (P4-3) to **finished**" and only the structural half exists
(`apps/web/app/(entry)/layout.tsx:42` is correctly scoped, but unfinished). 裁-14, R1, 裁-3(c),
`fe-train-plan-2026-08-30-orders-p6.md:299-325`; PROGRESS-503.md:58,104,220; IA-08.

### task #15 — the Clara rail inset, rail state bleed, and thread re-point (all confirmed, all strengthened)

- **Rail inset — DONE, #507.** Re-measured 2026-09-03: `ClaraRail.tsx:62` is now
  `sticky top-0 flex h-dvh w-80 shrink-0` (not `fixed`), and `<RailMount />`
  (`apps/web/app/(firm)/layout.tsx:105`) is now INSIDE the layout's flex row
  (`className="relative flex min-h-dvh bg-background"`, opened at `:69`) as a sibling of the main
  content div — flex reflow is now structurally possible. The original finding follows, for the
  record: `ClaraRail.tsx:61` is `fixed … w-80` with no responsive prefix, `railOpen: true`
  by default, occluding 320px of every firm-altitude page on first paint — and it is structurally
  deeper than "no gutter": `<RailMount />` (`apps/web/app/(firm)/layout.tsx:75`) sits OUTSIDE the
  layout's flex row entirely (opened at `:63`), so no flex reflow is possible even in principle, and
  the occlusion is baked into the SSR'd HTML (`useClaraThread.ts:19-23` passes the same function as
  both client snapshot and `getServerSnapshot`). No test renders the rail at all. `mohe-grill-rulings-2026-09-01-pm.md:371-373`
  (owner task #15); PROGRESS-503.md:100-102; IA-01.
- **Rail state bleed on client switch.** `RailMount` mounts above `ClientScopeProvider`; `ClaraThreadView`
  carries no `key`. Confirmed and strengthened to THREE leaking surfaces, not one: the composer
  draft, one render of client A's transcript under client B's URL, AND (new) the module-level
  `claraThreadStore` retains client A's fully hydrated messages for the tab's lifetime — `.reset()`
  has zero production callers — so keying `<ClaraThreadView>` alone (the original suggested fix)
  stops the draft/view leak but a bookmarked or repeated A→B→A path still repaints A's transcript
  instantly. `apps/web/components/clara/ClaraThreadView.tsx:44`; `apps/web/lib/clara/threadStore.ts:59,169`;
  `mohe-grill-rulings-2026-08-27.md:35` (Q3); IA-02.
- **Client/thread mismatch on the escalated route.** `/clients/<B>/clara/<A's thread>` mounts client
  B's LIVE, mutating onboarding action surface (`OnboardingChecklistCard`, `bootstrapClientPlan`,
  `commitClientOnboarding`) beside client A's transcript — an action-surface bleed, not mere display.
  Proven NOT to cross a firm boundary (`packages/runtime/lib/authz.mjs:180-192` gates on `firm_id`
  only). In-repo precedent for the fix already exists: `components/parts/V16Cards.tsx:102`.
  `apps/web/app/(full)/clients/[clientId]/clara/[threadId]/page.tsx:19,22`; IA-10.
- **Thread re-point hazard** (ties to §2's 裁-117 flag): `listSessions` resolves to the newest
  VISIBLE session including firm-shared ones, so any colleague sharing a newer thread silently
  re-points a user's rail to it. `apps/web/lib/clara/useActiveThread.ts:28`; IA-06.

### task #16 — nav wiring + the reverse-direction nav gate

/admin/members — the built P4-4 RBAC roster/invite surface — is reachable only by typing the URL:
absent from `firm-nav.tsx`'s 5-entry sidebar, admin/page.tsx's 3 sub-links, `FIRM_ROUTES`' 8 ids,
and every i18n nav label. `routes.test.ts`'s 4 assertions are all manifest→tree, so an orphan page
passes green. **Corrected: this is not a new discovery** — it is already recorded
(PROGRESS-503.md:102, "P4-6 nav wiring + the reverse-direction nav gate (alignment gap #4)"),
already owned by the merged, unstarted, now-unblocked work order P4-6
(`fe-train-plan-2026-08-30-orders-p4.md:447`), and already named beta-gating by the owner on
2026-09-01 (`mohe-grill-rulings-2026-09-01-pm.md:372-373`, task #16), one day before this scan. A
reverse-direction test precedent already exists in-repo: `apps/web/tests/firm-scope-surfaces.test.ts`.
`apps/web/lib/command/routes.ts:71-146`; IA-03.

### Client-name chrome

The client workspace never names the client — no breadcrumb anywhere in `apps/web`, no client
switcher, and the record block renders only status/created-at (`loadClientById` selects `name` and
nothing renders it). The only identifier on screen is the UUID in the URL. This regresses a salvage
item the prior-build audit already priced (`docs/audit/02-salvage-manifest.md:295`, "a breadcrumb
client switcher"). One narrow exception found: `OnboardingChecklistCard.tsx:279,317` renders the
client's name inside a confirm-dialog description, but only for an onboarding-state client with an
open plan. `apps/web/components/firm/client-workspace-overview.tsx:53-58`; `apps/web/lib/firm/reads.ts:128`;
HANDOFF.md:223 (clarabook-frontend); IA-05.

### Error boundaries — **DONE, #507**

**Re-measured 2026-09-03:** `error.tsx` now exists at three route-group roots —
`app/(entry)/error.tsx`, `app/(firm)/error.tsx`, `app/(full)/error.tsx`. The original finding
follows, for the record:

No `error.tsx`, `global-error.tsx`, or `loading.tsx` at any level, and no hand-rolled React error
boundary anywhere in the package either (0 hits for `componentDidCatch`/`getDerivedStateFromError`/
`ErrorBoundary`). **Corrected: not a blank page** — a thrown render falls to Next 16.3.3's built-in
500 page, which is unstyled and off-brand but not empty. `apps/web/app/not-found.tsx` is the only
special file present. `docs/plan/active/checkout-gate-design-part3.md:274-277` independently
corroborates the roster (5 layouts + not-found, no error/loading). HANDOFF.md §9's review checklist
("Empty, loading, error, permission, offline, and stale-revision states remain visible") is the
cleanest binding text. IA-07.

### Password recovery — **DONE, #507**

**Re-measured 2026-09-03:** the full flow now exists — `apps/web/components/entry/password-recovery-form.tsx`
(`resetPasswordForEmail` → the /auth/recover route), `password-reset-form.tsx` + `password-reset-route.tsx`,
`app/(entry)/forgot-password/page.tsx`, and `login-form.tsx:167` links `/forgot-password`. The
original finding follows, for the record:

No `resetPasswordForEmail` call anywhere in the repo's history across all 377 refs; no recovery arm
in the confirm route (hardcodes `verifyOtp({ type: "signup" })`); no entry in the proxy's
`PUBLIC_PATH_PREFIXES`; no recovery link on the login form (its only href is `/signup`); no
reset-password template or redirect URL in the Wave-G Supabase checklist. **Corrected/narrowed:**
of the prototype's five system-access faces, session-expired and access-loading DO have functional
counterparts (the proxy's unauthenticated redirect to `/login`; ordinary loading states) — the
material residue is password recovery specifically, under 裁-57 (a PAID self-serve beta) and a
12-char+HIBP password policy that raises forget-probability. `apps/web/components/login-form.tsx`;
`docs/ops/wave-g-setup-checklist.md:43-49`; IA-09.

### Control-height §5.2 ruling still needed

Button ships 24/28/32/36px (default 32px) and Input ships a single 32px height, where
`01-TOKEN-CONTRACT.md:142-144` specifies --control-sm/md/lg = 32/36/40px. **Corrected: this is
NOT apps/web's authoring error** — the design system's own reference `button.tsx`/`input.tsx` are
byte-identical to apps/web's, and the design system's own `globals.css` declares no `--control-*`
tokens either, so §5.2 was never implemented in EITHER repo. The 2026-08-28 resource audit read
§5.2 but extracted only its `--target-min` row (which became 裁-13), never the `--control-*` rows —
this is a genuine gap in that audit, not a re-finding. Needs an owner decision on which artifact is
authoritative before any cva re-map, since re-mapping apps/web alone would desynchronize it from the
port it came from. Note: the 13 `size="xs"` buttons sit exactly on the SC 2.5.8 target-size floor
with zero headroom — 裁-13's gate goes green on them, not red. `apps/web/components/ui/button.tsx:30-40`;
`clarabook-frontend g5-design-system/docs/01-TOKEN-CONTRACT.md:142-144`; DS-07.

---

## §4 · Violations found this pass with no prior record

*(before today's claimed rulings closed some of them — flagged where the
brief attributes closure to a ruling number this document could not locate; listed here so a reader
sees what this pass added on top of the two prior audits.)*

- Dropdown menu reduced-motion guard missing (DS-01) — added 2026-09-01 by #455, after both prior audits.
- Skip link absent (DS-02).
- `aria-busy` never rendered (DS-03).
- Nested live regions, InterviewRunCard's the sharper instance (DS-04).
- `drafts-queue-panel.tsx`'s halo-only focus indicator, and the gate that blesses it (DS-05) — partially recorded (the census, not this file's specific gap).
- Per-field validation association unbuilt (DS-09).
- /admin/members orphan route — **exception: this one IS already recorded**, PROGRESS-503.md:102 and task #16 (IA-03); listed here only because the finding initially miscited it as unrecorded.
- Client workspace never names the client (IA-05).
- No error boundaries at any route-family level (IA-07).
- Password recovery entirely absent, in code and in Supabase config (IA-09).
- Client/thread URL mismatch on the escalation route (IA-10).
- The token recuts toward the contract doc carry no 裁/R/Q number, only self-declared "PORT DRIFT,
  CONFORMED" comments (DS-15) — a governance-hygiene gap, not a defect in the values themselves.
- Control-height §5.2 divergence, upstream-inherited (DS-07) — a gap in the 2026-08-28 audit, not previously flagged anywhere.

---

## §5 · FS-9 acceptance lines

**DONE, #514 — re-measured 2026-09-03.** All three lines below were "NOT DONE" at filing
(2026-09-02); #514 shipped all three the same day. Status column left as filed, for the record.

| Line | Status |
|---|---|
| Ledger Fold ported | **DONE #514.** `apps/web/public/brand/logo/clarabook-ledger-fold-brand-ink-v1.0.png` is tracked. ~~NOT DONE. 0 `<svg>`, 0 tracked image assets under `apps/`, public/ holds fonts only.~~ |
| Mascot ported | **DONE #514.** `apps/web/public/brand/clara/clara-quiet-clerk-neutral-v1.0.png` is tracked. ~~NOT DONE. Same construction-path measurement as Ledger Fold; 0 hits.~~ |
| ClaraBook copy pass | **DONE #514.** 13 `"ClaraBook"` strings in `apps/web/messages/en.json`; `invite-mail.ts:154-158` reads "on ClaraBook"/"invited to ClaraBook". ~~NOT DONE. 0 commits ever touching "ClaraBook" in apps/web/messages/; the platform-slot census (7 en.json strings + the invite-email subject/body) has never been swept.~~ |

All three: IA-08 (CONFIRMED, corrected to 4/4 owed including item ④'s finish).

---

## §6 · Refuted at verification (appendix)

- **DS-06 (radius rungs "one rung high across the whole scale").** Refuted: the defect is a
  COLLAPSE at the top of the scale (Card and Dialog both render 10px, erasing the contract's own
  8/10 distinction), not a uniform lift — 4 of 8 button sizes are already correct via an arbitrary
  Tailwind value that wins on merge order. Already named at merge in commit `2333fced`'s own body
  ("named for the brand sitting rather than changed here") but never entered any ledger. No gating.
- **IA-04 (no settings surface at any altitude).** Refuted, downgraded to NIT: 3 of 9 prototype
  sections have counterparts (/admin/members covers both members+rbac), the firm-settings root is
  ruled into `/admin` (Q3), the client-settings absence is a recorded reasoned decision (OQ-7,
  `port-wave-plan-2026-08-28-part2.md:413-416`), an honest placeholder note exists in `en.json:158`,
  and PR #489 already builds /admin/settings (CI green, opus CLEAR, armed BEHIND). No gating.
- **IC-01 (float-hook money parsers, BLOCKER).** Refuted at BLOCKER; downgraded — see §3 P6-4.
  `type="number"` sanitization closes 3 of the original 4 bad-input rows in a real browser; the
  0-default for `""` is the file's own DOCUMENTED design decision for unsigned line inputs, not an
  unremarked defect. Real residue: exponent notation and sub-cent truncation only.
  MEDIUM/HIGH, not BLOCKER; candidate, not yes-by-ruling.
- **IC-04 (Skills/MCP PR-body line, 9/12 non-compliant).** Refuted on its numbers: the mandate took
  effect 2026-08-31 (not -08-30 as the lane bound it), was honored for ~8.5 hours (8 genuine
  compliance lines, six of them outside the apps/web filter the lane used), then collapsed to zero —
  a sharper failure shape than a flat 25%. Not beta-gating; no security/money/data-loss/cutover-acceptance surface.
- **IC-05 (InterviewRunCard cancel re-read).** Refuted: the card's own 3-second poll re-reads
  `/state` unconditionally within the exact non-terminal window the cancel door renders in, and a
  sticky-refusal mechanism (proven by a shipped test) already provides `preserveErrorOnSuccess`
  semantics by a different route. Only a narrow parent-checklist staleness residual survives
  (self-heals in the dominant sub-case). LOW, not MATERIAL; no gating.
- **IC-06 (correction wizard never re-reads).** Refuted: `callDoor` throws on both refusal and
  transport failure, and both state setters sit downstream of the `await` — a failed act paints
  NOTHING, so the claimed failure scenario cannot occur by construction. Read-set disjointness means
  the missing reload would today repaint a byte-identical panel (the write relations are outside
  `loadDocumentDetail`'s read set). LOW, latent-fragility only; no gating.

---

## §7 · Could not verify

- The composited focus-halo contrast figures (2.245–2.363:1) are quoted from
  `fe-train-plan-2026-08-30-orders-p6.md` and the P4 design annexes, not independently recomputed —
  the token-contrast gate's own `PAIR_SPECS` has no composited focus row.
- Whether `a11yRules.ts` / `keyboardWalk.ts` / the estate test suites actually pass on the pinned
  tree — every claim about a gate is a claim about its SOURCE and rule inventory, not an executed run
  (the lanes are read-only, no builds or test runs permitted).
- Whether the `@utility` motion rules and the `--text-xl` override compile as intended under
  Tailwind v4.3.3 — needs a build.
- Rendered control geometry (heights, target sizes) — read off class strings, not a browser.
- A prototype-vs-`apps/web` component-BEHAVIOUR diff — the g6 prototype's src/ was cloned but not
  diffed component-by-component; parity claims here are structural (routes/components/props/copy),
  none visual.
- Whether the runtime API's RLS boundary would refuse a cross-client `getMessages` call for IA-10 —
  proven as a display mismatch only; the cross-client-data-read half belongs to the security lane.
- The exact perceptible duration of IA-02's one-commit stale-transcript window — mechanism proven by
  code reading (a passive `useEffect` running after paint), no browser run performed.
- Whether an owner ruling outside the searched ledgers (08-26 through 09-01-pm, plus the ADR digest)
  covers the settings family, password recovery, or one-thread-per-altitude — a ruling recorded only
  in a chat transcript or memory would not appear to any of these instruments.
- The numbering source for "alignment gap #2/#4" and "beta-gating tasks #14/#15/#16" — both are USED
  in PROGRESS-503.md and the 09-01-pm ledger without an enumerated list defining them anywhere.
- Whether the built browser bundle genuinely contains no service credential — source-level wall and
  the `check-public-key.mjs` wiring were verified; `next build` was not run in this lane.
- Whether `share_chat_session`'s SQL predicates behave as read against a live DB for the IA-06
  re-point hazard — the two predicates were read, not executed.
- ~~Whether 裁-116, 裁-117, and 裁-128 exist anywhere outside the ledger files this pass could reach
  (see the Authoring Note) — this is the single largest unresolved item in this document.~~
  **RESOLVED, per the Authoring Note: all three now resolve** in
  `mohe-grill-rulings-2026-09-02.md` (裁-116 `:77`, 裁-117 `:91`, 裁-128 `:225`) — the ledger
  section landed in the same PR as this record, as the Authoring Note anticipated.
