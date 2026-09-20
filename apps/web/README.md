# `@clara/web`

ClaraBook's production web application. It is a Next.js 16 App Router app, runs on React 19, and is deployed to Cloudflare Workers through OpenNext. The current production origin is `https://app.clarabook.com`; `apps/web` is the active frontend.

Product vision, behavior and scope live in [`docs/PRD.md`](../../docs/PRD.md). System boundaries, deployment topology and accepted technical direction live in [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md). Dated delivery contracts, dependencies and implementation status live in [GitHub Issues](https://github.com/BELCORT-SDN-BHD/clara/issues). Keep this README focused on application setup and operating procedures.

## Application map

Route groups organize layouts without changing URLs.

| Area | Routes | Main surface |
|---|---|---|
| Entry | `/login`, `/signup`, `/auth/confirm`, `/forgot-password`, `/auth/recover/password`, `/invite/:token`, `/pending`, `/checkout/success` | Account creation, confirmation, recovery, invitation, legal acceptance, checkout, and the pre-firm holding state |
| Firm | `/`, `/clients`, `/work`, `/activity` | Firm home, client register, open work (`?view=needs-you` is the saved attention view), and the agent receipts feed |
| Settings | `/settings`, `/settings/account`, `/settings/firm`, `/settings/members`, `/settings/knowledge` (#654), `/settings/setup`, `/settings/compliance`, `/settings/vendor-bindings` | The caller's own account, plus capability-shaped firm administration. `/settings/knowledge` is the FIRM knowledge register: the rules that apply to every client with no record of its own, each with the authority its promotion recorded, the clients holding an exception, and the live Work citing the key. Viewer+ to read; promoting, correcting or withdrawing a firm rule is admin+ and the door rechecks it. Promotion itself starts on a client record (`/clients/:clientId/knowledge/:recordId`); **correction and withdrawal happen here**, because a firm rule has no client and therefore no record-detail route. An established client exception always survives both. `/settings/setup` (admin+; #648) is journey A5's resumable list of the facts the firm still owes about itself, read from `clara.get_firm_setup()` and written through the four `clara.*_firm_setup*` doors; it gates nothing else in the workspace |
| Operator | `/operator` | The BELCORT operator's support queue: firm registrations awaiting admission (owner of the firm that carries `is_operator`; #615, 0188 §2) |
| Client | `/clients/:clientId` (its Home board opens on the Work attention band — Works waiting on a person, queued/running, and finished in the last seven `Asia/Kuala_Lumpur` calendar dates — each count a link into that client's own Work list, narrowed as closely as that list's own axes allow (the recent-success drilldown is the same week over a different subject, which the tile discloses; see below); the close section reserves the readiness slot with a "measured by #677" note rather than estimating it) plus `/work`, `/documents`, `/accounting`, `/knowledge` (+`/:recordId`; #644, and `/knowledge/parties/:counterpartyId` — one counterparty's identity, its source, its correction history and its merge lineage; #647), `/reports`, and the accounting workbenches `/journals`, `/bank`, `/registers`, `/close`, `/tax`, plus `/plans` (+`/new`, `/:planId`, `/:planId/revise`; #640), `/accruals` (+`/new`, `/:accrualId`; #652), `/prepayments` (+`/new?entry=<id>`, `/:scheduleId`; #653), `/accounting/adjustments` (+`/new`; #643) and `/registers/assets/:assetId` (#639 — one fixed asset's own address: its acquisition, its source and value, the depreciation particulars it may still be waiting on, the schedule they produce and its correction history; the register LIST stays at `/registers?tab=fixedAssets`) and `/accounting/claims` (+`/new`; #638 — the staff expense claim register and its form; an employee payable lives HERE and never in the AR/AP aging tab, because `clara.open_items` is counterparty-keyed and an employee may not be a counterparty) | The client workspace and its accounting workbenches |
| Legacy | `/needs-you` → `/work?view=needs-you`; `/admin` → `/settings`; `/admin/members` → `/settings/members`; `/admin/settings` → `/settings/firm`; `/admin/compliance` → `/settings/compliance`; `/admin/vendor-bindings` → `/settings/vendor-bindings`; `/admin/registrations` → `/operator`; `/settings/registrations` → `/operator` (two rows, never chained — Next matches one rule per request; #615) | Temporary (307) redirects declared in [`lib/navigation/legacy-routes.ts`](lib/navigation/legacy-routes.ts) and wired through `next.config.ts` |
| Clara | `/clara/:threadId`, `/clients/:clientId/clara/:threadId` | Full-screen conversation; the docked rail is mounted once in the firm shell |
| Server routes | `/api/runtime/*`, `/api/invite`, `/api/build-info`, `/checkout`, `/checkout/cancel`, `/checkout/success/claim`, `/auth/confirm/verify`, `/auth/confirm/resend`, `/auth/recover`, `/logout` | Same-origin runtime proxy, mail courier, release provenance, and POST-only mutation boundaries |

The client Home board reads **per section**, deliberately: one failed read leaves every other
section's real numbers on screen. The Work attention band is two reads for three tiles — the
`active` and `recent success` facets come from `clara.get_client_work_pack` (bookkeeper floor),
while the "waiting on a person" tile RESTATES the `counts.work_questions` the page's existing
`clara.list_review_queue` envelope already carries (viewer floor), so a viewer keeps the number
this page has shown since #629 and sees the other two tiles say, in words, that Work records need
a bookkeeper role. The facets OVERLAP and are never summed; no total exists anywhere in that read.
Freshness is the pack's own `computed_at` — "read at …", never a claim about the database's
position, because no Work admission, claim, settle, completion, question or answer emits a domain
event in this estate. The band re-reads on a visible return and every 30 s while the tab is
visible, and says "update delayed" after the estate's one 60-second contract
([`lib/work/use-work-detail.ts`](lib/work/use-work-detail.ts)) with no successful read.

Each count opens the Work list narrowed by the axes that list actually HAS, and where a tile is
narrower than the list it opens, the tile says so in words rather than letting the number imply a
page it does not open. "Running now" opens `status=queued,running`; "retrying" is not a member of
`clara.list_accounting_work`'s status roster, so it stays a row LABEL and never becomes a filter.
"Finished recently" counts a committed `clara.operation_receipts` row inside the seven Malaysian
dates, while that door fences `p_since`/`p_until` on `clara.accounting_work.created_at` — when
the Work was STARTED — and carries no receipt-dated axis: the drilldown is therefore the same
seven dates over a DIFFERENT SUBJECT, which the tile discloses beside the count and
`packages/db/tests/client-work-pack.test.mjs` `p650.pack.recent_success_drilldown` measures in both
directions. When the window itself cannot be read the link carries no dates at all, and the tile
names that wider population instead of repeating the seven-day sentence.

`/accruals` is a TOP-LEVEL client segment beside `/plans` rather than a third view under `/accounting`, and the split is the same one #643 made: an accrual rides a `reversing_journal` accounting plan — it accrues on a due date and reverses on the first of the following period — while `/accounting/adjustments` records a movement a period's own facts establish, with no schedule and no future occurrence. One prefix for two unrelated lanes makes every later reader guess which one a row belongs to.

The browser reads allowed tables and views through [`lib/read.ts`](lib/read.ts) and calls governed Postgres functions through [`lib/doors.ts`](lib/doors.ts). Runtime requests go through the same-origin `/api/runtime/*` proxy. Firm scope is established by [`app/(firm)/layout.tsx`](app/%28firm%29/layout.tsx), which also renders the one navigation surface — sidebar, scope switcher and breadcrumb — from the registry in [`lib/navigation/tree.ts`](lib/navigation/tree.ts); client scope is activated by [`app/(firm)/clients/[clientId]/layout.tsx`](app/%28firm%29/clients/%5BclientId%5D/layout.tsx), which renders no chrome of its own and publishes the client's name to that shell. UI code renders database amounts and refusals as returned and re-reads authoritative state after governed writes.

The interface uses `next-intl` with a static English locale, semantic tokens from [`app/globals.css`](app/globals.css), local Source Sans 3 and Source Serif 4 assets, and shadcn/Base UI primitives. The beta is light-theme only.

Some of those primitives carry owner-ruled fixes that a plain `shadcn add` would silently overwrite; add components through `pnpm ui:add` and read the review step in [`components/ui/README.md`](components/ui/README.md) before changing what it protects (#772).

Some routes intentionally show an unavailable or not-built state where a product capability is incomplete. Delivery scope and ordering belong in GitHub specs and implementation issues; do not infer completeness from the presence of a page or button.

## The Clara transcript: live regions, scroll ownership and the intent key (#642)

**ONE log, N exclusive statuses, and nothing nested.** `ClaraThreadView` carries exactly one
`role="log"`, and it wraps the TRANSCRIPT and only the transcript — the welcome, the message
map and the provisional bubble. Everything that announces on its own is a SIBLING of it: the
onboarding checklist card, the clarify group, the live tool group, and the mutually exclusive
`role="status"` lines (stream status, stopped, a refused stop, lost sight of the run, access
revoked, a replayed send, a pre-send check). The last two keep their WORDS in every state and
carry `role="status"` only when no other line is speaking — a replayed send whose original run
is still streaming would otherwise announce twice for one press. That is `StateBanner`'s own
`silent` decision (#629 §5, one announcement owner): unannounced never means hidden. The
replayed line also retires with the turn it is about — the terminal `message` or a revocation —
not merely with the next press. That geometry is not style. A `role="log"` inside
a `role="log"` has no defined announcement order, and dropping `aria-live` does not fix it
because `role="log"` carries an implicit polite live region of its own. The statuses are
exclusive because one event must be one announcement.
`components/clara/thread-live-regions.test.tsx` and
`components/clara/thread-live-tool-states.test.tsx` both assert ZERO nested live regions, each
with a vacuity control proving the tree really does contain live regions — treat
`nested-live-region` as a gate, not a check.

**The transcript owns its own scroll, and nothing else's.** `lib/clara/useTranscriptScroll.ts`
holds the whole policy: a reader scrolled up stays put while content arrives (the "is the
reader following?" answer is sampled from their own scroll events, never recomputed after an
append — appending moves the bottom); a reader at the bottom follows instantly; a fresh attach
lands on the newest message, because reopening the rail is a new element with no history. Only
`scrollTop`/`scrollTo` on the ONE element it owns is ever written — `scrollIntoView` is
deliberately absent from the whole surface, because it scrolls every scrollable ancestor and
on the docked rail that means dragging the client's workspace behind it. The labelled
jump-to-latest is offered only while there is something below, is a real `<Button>` (so it is
in the tab order and has a word for a name, not an icon), and jumps instantly under
`prefers-reduced-motion` — the preference is read at the press, not captured at mount.

A smooth jump is CORRECTED until it lands. The animation targets the height it was given and
the content can grow underneath it (a card finishing its transition, another delta), so a
bounded correction re-measures the element and finishes the journey. The window that tells
"our own animation" from "the reader changed their mind" is the PENDING correction itself, not
a clock: the two expire together, so a trailing scroll event delivered at the deadline used to
publish "the reader has scrolled up" and make the correction bail — measured in the browser as
a transcript stranded 36px short. An arrival cancels the correction, so a reader who scrolls
away after the jump lands is never dragged back. The caller's revision is a JOIN of its five
content counts, never a sum: summed, the provisional bubble retiring in the same commit as the
first chunk arriving cancelled to zero and the append effect did not run at all.

Following a live turn costs the hook NO render of its own, and that is a measured contract
rather than a nicety. The append effect runs once per streamed delta; publishing `atBottom` /
`hasMoreBelow` on it unconditionally made React schedule a second render pass per token for
the ordinary case (a reader parked at the bottom), and the transcript census
`components/clara/thread-live-stream-stability.test.tsx` caught it at 401 commits for 200
deltas against a budget of 215 — that suite's own words for "a component updating itself".
Both flags are mirrored in refs and written only on a REAL transition.
`lib/clara/useTranscriptScroll.test.ts`'s `p642.web.scroll_render_budget` pins it at this
hook's seam: 25 appends must cost exactly 25 renders, all of them the caller's.

**The intent key is content-addressed, and memory-only on purpose.**
`lib/clara/intentKey.ts` derives the `turn_key` a send posts from the conversation, the
altitude, the conversation's POSITION, the trimmed text and the SORTED attachment document
ids. A retry of the same intent therefore reuses it — the composer keeps text and files on a
refused send, and a refused or lost send adds nothing to the persisted transcript, so both the
inputs and the position are identical by construction — and lands on
`clara.begin_chat_turn`'s replay branch
(`0006_runtime_core.sql:954-960`), which answers with the ORIGINAL task and `replayed: true`
on the 202. A CHANGED intent, including a changed attachment set, derives a new key, and that
half is the sharp one: the door returns from its replay branch BEFORE the user message is
inserted and never reads `p_user_parts`, so a same-key repost carrying a different invoice
would return the original task and drop the new file in silence while the screen said
"already accepted". THE POSITION IS WHY A REPEAT IS NOT A RETRY, and it was the review
round's blocker: addressed by content alone, every repeated utterance in a session — "yes",
"ok", "continue" — derived the FIRST one's key and was answered with the turn Clara had
already run, with no bubble, no task and no error, permanently, because the door's lookup has
no time or state bound over an append-only table. A sentence re-typed after a turn has SETTLED
sees a longer transcript and is admitted as the new instruction it is. Nothing persists the
key: appendix C rules out promising reload recovery from memory-only state, and content
addressing still makes the reload case work — a send that was never admitted leaves the
transcript exactly as it was, so the same sentence with the same files derives the same key
after a refresh. On `replayed: true` the
view says so once and draws NO provisional bubble, because the original user row is already in
the transcript.

**Live tool state is a fold, not a version cut.** The model's whole `fullStream` reaches the
browser verbatim (`packages/runtime/README.md` carries the measurement), so
`lib/clara/liveTools.ts` maps the chunks already on the wire onto four live states —
*preparing*, *running*, *done*, *failed* — plus *refused* for a tool that ran and declined in
its own typed vocabulary. A step never walks backwards (the reattach replays from index 0),
and `failed` outranks the other two terminals, so a step that returned and then threw reads
*failed* rather than keeping the first terminal that arrived. It registers NO new part kind. There is no *queued* state and there
cannot be one without a new frozen `chatTurn` body: nothing on the stream reports admission,
and *preparing* (the model streaming a tool's arguments) is not *queued*. Every chip's label is
a next-intl lookup over a measured list of tool tokens with the raw token as the fallback
(`lib/clara/toolLabel.ts`); a source link belongs on a result card, never on a chip.
## Firm home: its URL state and its refresh contract (#659)

`/` is the firm's PORTFOLIO now, not only a dispatcher. It carries four query parameters —
`?status=&attention=&q=&cursor=` — parsed in exactly ONE place,
[`lib/firm/portfolio-url-state.ts`](lib/firm/portfolio-url-state.ts), and read by the board through
`useSearchParams`. `app/(firm)/page.tsx` deliberately reads none of them on the server: nothing on
this route appears or disappears with the portfolio's filter, so a second parse there would be a
duplicated contract bought for nothing (contrast `app/(firm)/work/page.tsx`, which does read
`?view=` on the server because the running-agent-task panel genuinely does not belong on the
attention view).

`status`, `attention` (`needs_you` | `active` | `failed` | `caught_up`) and `q` are BROWSER-side
narrowings over the page the door returned — `clara.get_firm_portfolio_pack` takes no filter
argument at all — which is why the Empty state can tell "nothing matches this view" from "this firm
has no clients". A malformed value degrades to its empty default and issues no request. `cursor` is
the door's own opaque keyset cursor, passed through as typed: its grammar (`lower(name)|uuid`,
base64) belongs to the door, and a browser that re-derived it would be a second spelling of a
contract this build does not own. **Any filter change drops the cursor**, because a cursor is a
fence into ONE ordered result set.

**The refresh contract lives in [`lib/firm/use-firm-portfolio.ts`](lib/firm/use-firm-portfolio.ts),
which COMPOSES `useReviewQueue` rather than editing it.** Four surfaces share that hook and neither
it nor `use-async-read.ts` registers a listener; adding one there would change three other surfaces'
request profile. So this hook owns the pack read and the listeners, and calls the shared hook's own
`reload` after each of its reads, so the needs-you chips are never older than the table beside them.
Four triggers: `focus` and `visibilitychange` (which double as the live permission recheck), a 30 s
while-visible interval (the compensation for a missed event — the estate emits no Work lifecycle
domain event, the only `pg_notify` channels are server-side, and this app holds no realtime
subscription), a page change, and `CLIENT_RECORD_CHANGED`. The 60-second delayed face is
`WORK_STALE_AFTER_MS`, IMPORTED from `lib/work/use-work-detail.ts` rather than restated. A denial
clears the rows and the read instant; a transport failure keeps them, dated.

Two consequences worth stating plainly. **The board renders no money at all** — the firm's home
shows counts, never client amounts — and that prohibition is enforced by the door's own `prosrc`
tail assertion, by `lib/firm/portfolio-pack.ts` having no field to put one in, and by
`components/firm/firm-home/firm-portfolio.test.tsx` asserting the rendered board contains none. And
**the creation control is mounted BESIDE the portfolio's state machine, never inside its
zero-client branch** ([`components/firm/add-client-control.tsx`](components/firm/add-client-control.tsx),
extracted from the client register so both pages mount the same one): its whole draft is memory-only
React state, and a control hung off the empty branch would be remounted — and silently emptied — by
the first of those four re-reads that returns a row.

Recent activity on this page reads `clara.list_activity` (not `clara.list_firm_timeline`) so it can
render WHO did each thing through the one shared actor cell. Both doors floor at bookkeeper, so the
swap moves no permission. `clara.list_activity`'s kind ladder misfiles several event families under
`documents` (#861); that is named on the surface and is not corrected in the browser.

## The document detail's three routed views (#646)

`/clients/:clientId/documents` keeps ONE route and TWO query parameters:
`?document=<uuid>` selects the document (#719/#624's published contract, unchanged) and
`?tab=original|facts|accounting` selects which of its three adjacent views is showing. The default
view writes **no** `tab` parameter at all, so every `?document=` link already sent still opens the
same address it always did; a tab switch is a `router.replace`, so Back returns to the list rather
than walking backwards through every view a person glanced at. The parser and the fold live in
[`lib/documents/url-state.ts`](lib/documents/url-state.ts), and an unrecognised view name reads as
Original rather than as an error — there is nothing to "not find".

| View | What it holds |
|---|---|
| `original` | The page image with its lazy region overlay (opening it fetches the full bytes and, for a PDF, a pdf.js chunk — so it stays behind its own toggle), the typed facts read-only, and the filing history |
| `facts` | The typed facts with a per-row **Revise** control, and the current source version the next revision must quote |
| `accounting` | The journal entries standing on this document, the live `entry_evidence_links` claim read directly, and what is standing on the document's reading — knowledge records, open questions and parked Work questions |

A **source revision** (`clara.revise_document_fact`) appends a new version of the document's typed
facts and leaves the reading it replaced readable; it never edits a region in place. Recording one
changes **nothing** that is already posted — the correction band states "source revision accepted"
and "accounting impact pending" as two separate, persistent rows, and links the ticket that owns the
second (accounting-linked-correction, #676). Clara does not re-assess dependent knowledge
automatically: the accounting view lists what stands on the old reading so a person can decide, and
the automatic engine is accepted-but-deferred (#658/#663).

The document-kind change is its own exported dialog
([`components/documents/document-kind-dialog.tsx`](components/documents/document-kind-dialog.tsx)),
so the firm intake surface mounts the same control rather than copying a second kind-change form.

## Creating a client, and the two facts the commit does not write

The client register's **Add client** control reuses ⌘K's own dispatch rather than minting a second
call site. Confirm asks `clara.client_identity_candidates` before it reaches
`clara.begin_client_onboarding`, and the answer decides what happens next — the three arities the
owner ruled on 2026-09-15:

- **0** — nothing in the firm answers to that name. The same click goes straight on to the door.
- **1** — the candidate is **shown**, with a real link to the record and the reason it matched, and
  Confirm re-enables only once a person ticks "this is a different business". The database does not
  refuse at this arity and must not be made to: its own predicate is `count(*) > 1`, so one
  same-family party has never been "ambiguous" anywhere in this estate. The acknowledgement is the
  only wall here, and it lives in the face.
- **2 or more** — the **database** refuses, CLR10 `name_family_collision`, and the refusal renders
  verbatim with its code beside the same candidate list — which the refusal itself carries, so the
  face never issues a second read of the fact it is reporting. **And a belt, labelled as one**: if
  that read ever *answered* an arity of 2 or more instead of refusing it, Confirm is shut rather
  than live-looking-and-inert. 0219 raises at this arity and never returns it as a success, so the
  state is unreachable through the live door; the cell that holds the belt honest drives a mock
  door to answer it (`add-client-candidates.test.tsx`).

Editing the name retires the check, the acknowledgement and the refusal; it never clears the typed
text. **There is no client-side duplicate rule and there must not be one**: the family predicate may
not be granted to any application role (a live census in migration 0103 raises on any such grant),
which is why the browser is given a definer wrapper and never the predicate.

**The wall is the READ, not the birth door.** A caller that never asks can still call
`begin_client_onboarding` and a client is born — a named residual, kept honest by
`packages/db/tests/client-onboarding-identity.test.mjs`'s `p649.identity.direct_birth_residual`.

**⌘K is a SECOND entrance to that door, and it does not ask.** `DO_ACTIONS`'
`beginClientOnboarding` (`lib/command/do-actions.ts`) is dispatched straight from the palette
(`components/command/command-palette.tsx`), with no `client_identity_candidates` read anywhere in
that path — `agentic-finish-walk.spec.ts`'s 裁-37 arm proves it green, dispatching with zero
identity reads in the whole run. So the arities above are the register control's wall, not the
product's: the same name typed into the palette is born unchecked. That is a **named residual**,
not a claim, and it is a face-level sibling of the birth-door one above — closing it means giving
the palette an arity-1 acknowledgement of its own (a design, not a one-liner), or moving the wall
into the door, which needs the new birth verb the residual above describes.

**Committing an onboarding plan writes neither Knowledge nor the client's own record.** Two
separate, named acts follow it at the same call site, and they are treated differently on purpose:

1. `promote_plan_answers_to_knowledge` is a **projection** and its failure is deliberately
   swallowed — a failed Knowledge write must not present itself as a failed commit, and the act is
   safe to repeat.
2. `settle_client_onboarding_facts` writes the client's **own financial-year end** and its failure
   is **shown**. Above all CLR38 `fy_end_locked_by_annual_cadence`: a live ANNUAL adjustment
   template or depreciation authority means the year end did not move, and a refused financial-year
   write presented as a settled onboarding is the worst outcome this journey can produce.

The financial-year **day** is asked, never derived (owner ruling D7). The interview asks only a
month; `clara.clients` admits a year end only as a month and a day together. The commit dialog's
field offers month end as a **button that names the day it will fill** and never as a default —
deriving it would invent an accounting fact on a professional's record. Leaving both boxes blank is
a real choice: the settle door is then not called at all, and the dialog says so, rather than
manufacturing a `fy_end_day_required` refusal for a value nobody gave.

## Membership: invitation, joining, role change and removal

Two floors, both enforced by the database and only SHAPED by the interface. The roster
(`clara.firm_members_visible`) is published from **bookkeeper** upward, with the email column
nulled below admin; the invitation list (`clara.firm_invites_visible`) is published from **admin**
upward, so it correctly reads empty for a bookkeeper. `/settings/members` renders them as two
stacked sections, each stating its own floor, rather than one merged table — a merged table would
show a bookkeeper a list whose invite rows are structurally absent with nothing saying so.

A control a caller's rank cannot use is **not rendered** (裁-187). That is affordance shaping, not
a wall: `clara._human_ctx(clara.role_rank('admin'))` still refuses CLR04 for anyone reaching a door
another way, and the last-owner trigger (`clara._tf_guard_last_owner`) is never pre-empted — the
click happens and the database's own sentence renders verbatim. Every act re-reads the roster, the
invitations **and** the caller's own context, so a caller demoted mid-session loses the role menu
and the Invite entry on the next authoritative response, refused acts included.

**Issuing an invitation goes through `POST /api/invite`, not the browser.**
`clara.invite_member` hands its caller the plaintext token exactly once, above persistence, and
sending the mail needs a service-role key; neither may reach a browser. The route calls the door as
the caller — so the authority check runs against the real person — and the plaintext goes into the
mail body and nowhere else. Its failures are TEN typed courier codes, rendered under their own
title so they are never mistaken for the database's words: `no_session`, `cross_origin`,
`invalid_request`, `unsupported_address`, `not_permitted`, `mail_not_configured`,
`recipient_has_account`, `mail_unavailable`, `mail_failed`, `transport` — plus a governed
`DoorRefusal` relayed verbatim when the door itself refused. `mail_failed` is the one that creates
something: the invitation exists and its link is unrecoverable, so the copy sends the admin to
revoke it.

**There is no resend door, by design.** The plaintext token is never stored (裁-16a) so no link can
be re-sent, and `clara.invite_member` refuses a second pending invitation for the same address
(CLR10, `0147:399`). Revoke, then invite again — the old link stops working immediately, and the
UI says so. A compound "revoke and re-invite" control is deliberately absent too: it would be three
steps across two transactions and one external mail provider, with no compensation, and a half
failure would leave an admin with neither a pending invitation nor a working link.

**There is no per-firm seat limit, by design.** The estate's only capacity is the estate-wide
Admission capacity on new FIRMS, which the in-firm invitation path never reaches; per-firm seats
are deferred product scope (`docs/PRD.md:126`). No capacity control appears anywhere on this
surface, and the absence is stated in the copy rather than left as a silence.

**Accepting an invitation** (`/invite/:token`) runs Supabase's `verifyOtp` with a hard-coded
`type: "invite"`, reads the result fail-closed, then — **before the password fields render** —
calls `clara.preview_invite` so the invited person can see which firm and which role they are
about to join. The rule that step follows: **a definite negative blocks; an indefinite read
degrades.** A revoked, expired or already-accepted invitation gets its own face and no password
form; the door's single refusal gets ONE face worded to name neither an unknown token nor a wrong
address, because the database deliberately cannot tell those apart (no existence oracle); a
transport failure or an unreadable answer renders the password form with the preview block absent
and one honest line, because `clara.accept_invite` re-checks every one of those facts inside its
own transaction and a reader that could not read is not a verdict. A settled acceptance ends on a
JOINED stage naming the firm and the accepted role, with an explicit control to enter the
workspace — the journey never navigates on its own.

Pre-authentication preview is a NAMED RESIDUAL: `clara.preview_invite` is granted to
`clara_authenticated` only and this estate declares no `anon` role, so showing an invitation to a
signed-out visitor needs a server route holding a service key, which is a separate ticket.

A SECOND NAMED RESIDUAL, in the other direction: the preview reproduces two of `clara.accept_invite`'s
three walls, not three. The acceptance door also re-checks the ISSUER's *current* rank, so an
invitation whose issuer has since been demoted — or who has left the firm at all — previews as
pending, the password form renders, and the refusal arrives at the last step in the database's own
words ("re-issue by an owner"), relayed verbatim. The admin roster is blind in exactly the same
place, because `clara.firm_invites_visible` does not carry the issuer's rank either; closing it means
a fifth effective status on both, which is a ticket of its own. See `packages/db/README.md`'s 0224
note; the divergence is pinned by `packages/db/tests/preview-invite.test.mjs`
(`p625.preview.issuer_rank`).

## Close and bank operating order

Prepare and reconcile the books before beginning a financial-year close. For an ongoing client with brought-forward balances, record an evidenced opening position in this order:

1. `create_opening_seed` with the real tie document.
2. `record_opening_target` for each target total.
3. `draft_opening_item` for the supported opening entries.
4. `approve_opening_seed` against the current onboarding-plan revision and the approval evidence the door requires.

Then load statements covering the relevant financial year, resolve or explicitly acknowledge outstanding lines, and complete each bank reconciliation. A partial-year statement set can correctly report missing months. Do not treat a zero-statement result as proof of coverage; explicit coverage evidence is part of the [refresh spec's close acceptance](https://github.com/BELCORT-SDN-BHD/clara/issues/612). If reconciliation reports `recon_opening_mismatch`, correct the opening position from evidence and run the checks again. Do not invent a brought-forward balance to make the difference zero.

Complete bank settlements and other financial-year writes before `begin_close`. Beginning close changes the year to `closing` and rejects writers into that year until the close is finalized or abandoned; an attempted settlement in the period is refused and rolls back. The approved Q-03 role simplification is still pending, so some current approval paths can also require a second checker or written attestation. Follow the refusal returned by the door rather than assuming the intended future role model is already active.

## Local setup

Install from the repository root and copy [`.env.example`](.env.example) to the gitignored `.env.local`. Values prefixed with `NEXT_PUBLIC_` are compiled into the browser bundle and must be public. Keep service credentials in server-only variables.

The minimum local configuration is:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
CLARA_RUNTIME_URL=
CLARA_PUBLIC_ORIGINS=
```

Signup, invitations, auth-wall confirmation, and checkout require the additional server-only variables documented in `.env.example`. `NEXT_PUBLIC_CLARA_RUNTIME_URL` is intentionally unsupported; browser traffic uses the same-origin proxy.

Run commands from the repository root:

```sh
pnpm install
pnpm --filter @clara/web dev
pnpm --filter @clara/web typecheck
pnpm --filter @clara/web lint
pnpm --filter @clara/web test
pnpm --filter @clara/web build
pnpm --filter @clara/web e2e
```

`test` runs the Node/tsx files listed in [`test/manifest.txt`](test/manifest.txt); the lint command verifies that the manifest and message catalog are complete. `e2e` builds the production app and runs the mock-backed Playwright suite in Chromium. Its fixtures and limits are documented in [`e2e/README.md`](e2e/README.md). Real Postgres/runtime walks are documented in [`e2e/live-stack/README.md`](e2e/live-stack/README.md).

`build` first checks that `NEXT_PUBLIC_SUPABASE_ANON_KEY` is a publishable or positively identified
anon key. This package declares Node 22 through `devEngines.runtime`; `pnpm install` downloads
the exact runtime pinned in the lockfile, and package scripts/`pnpm exec` use it automatically.
This also satisfies Wrangler and OpenNext's Node requirement; the repository's default toolchain,
CI and the backend runtime image are on the same Node 22 line. Use pnpm to invoke web tools so
they receive the package runtime.

## Cloudflare deployment

Wrangler is Cloudflare's official CLI and is pinned in this package. Use the workspace binary
through `pnpm --dir apps/web exec wrangler` from the repository root. OpenNext prepares this
Next.js app for Workers; Wrangler uploads versions and controls promotion/rollback.

The project configures the official `cloudflare-api` and `mobbin` remote MCP servers in
`.mcp.json` and `.codex/config.toml`. Cloudflare provides documentation search and scoped API
access for account inspection and operations; Mobbin provides product-design reference search.
Authenticate each agent client through the provider's OAuth flow. For Codex CLI, run
`codex mcp login cloudflare-api` and `codex mcp login mobbin`; OAuth credentials stay in the
client's credential store. In Claude Code, approve the project servers and authenticate them
through `/mcp`. Mobbin MCP requires a Pro, Team, or Enterprise plan.
Wrangler has a separate login: use `pnpm --dir apps/web exec wrangler login`, then
`pnpm --dir apps/web exec wrangler whoami` to verify the selected account. The API MCP complements
the local build/release chain; it cannot
compile this checkout. Avoid adding redundant product-specific MCP servers until a concrete need
requires them.
See [Cloudflare MCP](https://github.com/cloudflare/mcp) and
[Wrangler](https://developers.cloudflare.com/workers/wrangler/).

[`wrangler.jsonc`](wrangler.jsonc) names the `clara-web` Worker and holds non-secret runtime variables. Production currently expects these six Worker secrets:

- `CLARA_AUTH_WALL_SERVICE_TOKEN`
- `CLARA_RATE_WALL_PEPPER`
- `INVITE_MAIL_FROM`
- `RESEND_API_KEY`
- `STRIPE_SECRET_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Build the Cloudflare bundle in Linux with a Linux-native `pnpm install`; it provisions this
package's Node runtime. Do not reuse this Windows checkout's `node_modules` from WSL because
`workerd` is platform-specific. Local Wrangler account/version commands also work on Windows.

Before a deployment, record the currently promoted version and the secret names:

```sh
pnpm --dir apps/web exec wrangler deployments list --name clara-web
pnpm --dir apps/web exec wrangler secret list --name clara-web
```

In a clean Linux clone at the exact commit to deploy, install with the frozen lockfile. Supply only the two public Supabase values and `CLARA_BUILD_SHA` at build time, then build the Worker:

```sh
pnpm install --frozen-lockfile
pnpm --filter @clara/web cf:build
```

Upload a version, inspect it, and verify that all six secret names are attached before promotion:

```sh
pnpm --dir apps/web exec wrangler versions upload
pnpm --dir apps/web exec wrangler versions view <new-version-id>
pnpm --dir apps/web exec wrangler versions deploy <new-version-id>@100% --yes
pnpm --dir apps/web exec wrangler deployments list --name clara-web
```

After promotion, verify `/login`, `/favicon.ico`, `/icon.png`, the authenticated route smoke, and one behavior that differs from the previous version. `/api/build-info` reports the web commit and the runtime origin paired with it; verify runtime and database versions through their own release checks.

Rollback is a version promotion, using the version recorded before the change:

```sh
pnpm --dir apps/web exec wrangler rollback <previous-version-id>
```

Rollback immediately sends all traffic to the selected version. It does not restore R2 objects,
database state or deleted resources. See [Cloudflare rollbacks](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).

Do not use `wrangler versions list` to decide what is live; it shows version history without traffic percentages.

## The documents surfaces (#633)

**Two entrances, one transport.** `lib/documents/intake.ts` carries every upload —
the client documents tab, the Clara composer's attach affordance and the interview
card all share it. Since #633 it has TWO bodies behind one contract: an
`XMLHttpRequest` one when a caller asks for real byte progress (`fetch` has no
upload-progress event in any shipping browser), and the original `fetch` one
otherwise. Both classify failures through the same `kindForStatus` taxonomy; the XHR
body additionally detects a FOLLOWED redirect through `responseURL`, because XHR has
no manual-redirect mode and a session that expired mid-upload would otherwise arrive
as a 200 carrying a login page.

**Upload is adopted automatically. "Start processing again" is recovery, not a gate.**
Nothing on these surfaces asks a person to begin processing a file they have already
uploaded: the runtime's facts-gate and autodraft consumers admit the work themselves
(`packages/runtime/plugins/startWorld.ts:476` and `:390`). `clara.request_autodraft`
is the per-filing RECOVERY act #614 made it, and it stays where #614 put it — on the
filing's own history, not on the queue.

**Three regions on the client tab.**
- *Uploads* (`components/documents/upload-panel.tsx`) — this browser session's queue,
  as a Data Table with real byte progress, honest processing-task counts, and three
  distinct controls: Cancel stops the transfer and keeps the row, Retry runs it
  again, Remove takes it off the list. None of them cancels an accepted Work; that is
  a governed act on another object, reached by a link from the document's detail.
- *Recent uploads* (`components/documents/intake-receipts.tsx`) — the DURABLE record,
  re-read at mount so a reload recovers it, and re-read by a hard-bounded settle-poll
  (`lib/documents/use-settle-poll.ts`) while any row can still change. The predicate
  is "filed to this client, or mine and unattributed" — never "my uploads", because
  `clara.document_intakes` has no client column. **A tick costs ONE read.** The mount
  pays FOUR calls in two phases (`lib/documents/receipts.ts`'s `loadIntakeReceipts`,
  #876): the masked intake view, the unassigned set and `caller_context` in one
  `Promise.all`, then — sequenced AFTER it, because the bounded set cannot be known
  before the intake rows are — a filings read BOUNDED to exactly those intake rows'
  document ids (`document_filings?document_id=in.(…)`, `reads.ts`'s
  `listActiveFilingsForDocuments`), never the client's whole active-filing set. That
  fourth call replaced the pre-#876 shape (`document_filings?client_id=eq.<id>&select=
  document_id` inside the same `Promise.all` — ONE column, the client's ENTIRE
  active-filing set — to answer a question about a handful of intake rows); the
  honest tradeoff is one extra serial round trip per mount and a nine-column
  projection (`FILING_COLS`, same columns #876 asks for: "same projected columns"),
  in exchange for a result bounded to the intake rows' own document ids instead of
  the client's whole active-filing set — narrower in ROWS, wider in COLUMNS, not
  simply "narrower". Each tick re-reads the masked
  view alone through `refreshIntakeReceipts` and rebuilds the rows against the kept
  derivation (filings included), and the full mount sequence is paid again exactly
  once, on the tick where the batch settles. Until fix round 1 (#633) the tick re-ran
  the whole derivation — up to four reads a tick under the caller's own JWT, the
  heaviest of them a SECURITY INVOKER RPC.
- *Filed to this client* — unchanged.

**The document-detail panel's own settle poll (#904)** is a SECOND, independent
`useSettlePoll` (`components/documents/document-detail.tsx`), covering a filed
document's own extraction/OCR tasks rather than the pre-filing queue above: it runs
while any `document_processing_tasks_visible` row for the open document is
`queued`/`held_egress`/`running`. **A tick costs ONE read**, same law as the receipts
poll above: `onTick` calls `listProcessingTasksForDocument` alone (`lib/documents/
intake.ts`) and keeps the result as a local override until the panel's own full
`reload()` runs again — NOT the panel's whole-bundle reload (fix round, L07-02; the
first cut re-ran all five-or-six of `loadDocumentDetail`'s reads every tick, the exact
per-tick cost fix round 1 removed from the sibling receipts poll). Bounded by the same
`maxTicks`/backoff/hidden-tab pause as the receipts poll, and independent of it: the
two settle polls never share a tick. When the tick ceiling is hit with a task still
non-terminal, `DocumentMetadata`'s extraction-tasks section renders the same visible
end the receipts list renders when IT exhausts (`extractionTasksExhausted` + a manual
Refresh, wired to the panel's full `reload()`) — fix round, L07-A02; the first cut
discarded `useSettlePoll`'s `exhausted` return value, so a long-running task's panel
went stale with no signal at all after roughly 142s.

**The firm's unassigned sources** live at `/documents`
(`components/firm/documents/unassigned-sources.tsx`), over the already-granted
`clara.list_unassigned_documents`. Each document is asked about ONCE — one act per row,
and the row leaves the population on the next settled read because the DB's own predicate
stops matching it. What the DOOR guarantees is narrower than that and is stated where it
matters (the leaf's header, `packages/db/tests/unassigned-intake-reuse.test.mjs`): a
repeat to the SAME client is refused CLR10 in the estate's own words, but a second
attribution to a DIFFERENT client is ACCEPTED and leaves two live filings — which 0123's
classify gate then refuses as `document_processing_multi_client`. The nav floor is
`viewer` because that is what the READ admits (measured on a rig persona); the
attribution act's own higher floor arrives as the DB's refusal on the row rather than
as an empty page. The Clara composer's firm-altitude refusal is unchanged — this leaf
is the destination it was already pointing at.

## #655 — `/clients/:clientId/accounting/invoices/new`

The C1/C3/C6 direct entry point for a trade invoice: a client sales invoice or a supplier bill, and
the signed AR/AP open item it births. It is a **route and not a Dialog**, and a **sibling address**
of `…/accounting/journal/new`, `…/accounting/adjustments/new` and `…/accounting/claims/new`
rather than a tab on any of them — the four admit different operations through different doors, and
a stable URL is what makes the draft recoverable at all.

**The state ladder**, each with its own cell or walk leg: *loading* (a skeleton fitted to the form,
carrying `aria-busy` and a readable name — never a placeholder zero) · *successful-empty* (a client
with no counterparties of that kind says so) · *no-results* (the party search keeps the query and
offers Clear, and never offers to CREATE a party — 2026-09-15 D11) · *partial-stale* (the party read
degrades INDEPENDENTLY of the chart read and names which half is missing) · *invalid-saving* (the
error sits beside its control, focus moves to the first invalid one in DOCUMENT order, and every
keystroke survives) · *denied* (a viewer typing the address reaches the form's own denied state,
never a blank) · *failed* (a `StateBanner` carrying the door's own words AND its code, with the one
next action that exists — **never a toast**) · *cancelled-recovery* (a lost answer is re-sent under
the SAME intent key exactly once, and the second answer is authoritative).

**The basis half is the composer's, reused.** The lines are `JournalDraftLine`s, validated by
`lib/work/journal-basis.ts`'s own `validateJournalDraft` and rendered by the shipped
`JournalBasisFields` — one set of rules about money in this app, not a second. The grid gets its
OWN labelled horizontal viewport, so 320 px scrolls the GRID rather than the page.

**The due date is never computed here.** The form carries what the document STATES;
`clara.admit_trade_invoice_work` derives `stated → counterparty_terms → absent` (only it holds the
party's agreed terms, and it adds them to the DOCUMENT date — DECISIONS §6.2.0 R-A) and the 202
hands the derived basis back, which is what the success banner renders.
`lib/work/trade-invoice.ts` has no path that produces `counterparty_terms` at all.

**Nothing installs a primitive.** Combobox and Popover are uninstalled; the party picker is a text
filter over the counterparty reads the registers already use, and `party_ambiguous`'s candidates
render INLINE as a choice.

**AC5's mutual links**: ONE block on the Work detail, from `clara.get_trade_invoice` — the kind,
the party, the two dates, the reference and, once posted, the entry, the open item and its
outstanding. The other half was already built and needed nothing:
`components/journals/journal-entry-row.tsx` already renders a back-link to the Work from
`clara.list_entry_links`' `work_id`.
## #657 — the /bank Matching tab, and the two laws it changed

**`/bank`'s six-way sub-nav is URL as truth.** `?tab=` addresses the strip (`accounts`,
`statements`, `matching`, `exceptions`, `reconciliation`, `agency`) and `?line=` addresses the
Matching tab's detail pane, copied verbatim from `components/registers/registers-workbench.tsx`'s
shape — a `TABS` tuple, an `isTab` guard, `useSearchParams` and `router.replace`. Before #657 the
strip was in-page `useState`, whose own comment called that "a deliberate simplification", so a
reload or a shared link could not reach the Matching tab at all. **No new route and no
`lib/navigation/tree.ts` row**: `/bank` is still ONE segment, and `?tab=` is a query.
`router.replace` creates no history entry — the house's existing behaviour on the registers
workbench, and the right answer for a sub-nav, where a tab is a view of one page rather than a
place. **A multi-selection stays OUT of the URL**: a selection set is a draft, not an address.

**ONE DECISION, ONE KEY, on `match_bank_line` only** (`lib/bank/match-opkey.ts`). Its operation
key is DERIVED from the intent tuple `{client, sorted line ids, sorted entry ids, cents, ack
flag}` — the same tuple `clara._reserve_op` hashes server-side — plus each selected entry's
WORLD GENERATION, so "same intent ⇒ same key" is a property of the DATA rather than of a
component's lifecycle, and there is no state to reset. The renewal rule is written out in full in
that module's header; the short form is: the key renews on an intentional human act that changes
WHAT is being submitted, or on a change to the WORLD it is deciding about, and on nothing else.

The generation is `<count>:<newest match_id>:<newest status>` off the candidate row's own
`match_history` (which migration 0226 put on the wire). Without it, `match → unmatch → resubmit
the identical selection` — an ordinary re-decision — hashed to the FIRST key, and `_reserve_op`,
which knows nothing about whether the match its stored result describes is still live, replayed
the dead match's receipt: a persistent "no new cash entry was created" block naming a match the
database had recorded as `unmatched`, beside a line that never left the unmatched report. An
unmatch flips that newest history row, so the re-decision hashes differently; a lost response, a
reload and a re-render write nothing and leave it byte-identical. It is KEY MATERIAL ONLY and
never reaches the wire body. Its residual: the generation is only as fresh as the read it came
from, so a concurrent unmatch between the last candidate read and the submit can still reach the
replay; the surface re-reads after every act, which is a mitigation, not a proof.

This deliberately DIFFERS from the house posture, which is left alone: `lib/members/doors.ts`
mints a fresh uuid per call on purpose, and `work-cancel-dialog.tsx`'s `useDecisionKey` mints one
per OPEN DIALOG. Both are right for a decision whose identity lives in a component's lifecycle. A
bank match's does not — the surface reloads unconditionally after every act, failed or not, so a
second press after a lost response is a re-render away from the first, and with a per-call uuid
the database saw two operations and refused the second with `already_matched`: a refusal for
something that had already succeeded. The other three verbs in `match-doors.ts` keep the uuid.

**A refusal now preserves the draft** — the typed cents, the ticked rows and the ack flag — so a
human changes one thing and resubmits. Retyping an amount you already typed is how a human ends
up typing a different one, and an unchanged draft resubmits as the SAME operation.

**MEASURED, and why there is no Combobox** (AC13). `pnpm --filter @clara/web ui:add combobox
--dry-run` REFUSES on this project: the payload would overwrite `components/ui/button.tsx`, which
is on `scripts/protected-components.json` because it carries owner-ruled fixes. `ui:add popover
--dry-run` exits non-zero inside the shadcn CLI itself on this project's `base-nova` style with
`"registries": {}`. Overriding the guard with `CLARA_UI_ADD_OVERWRITE=1` would clobber an owner
ruling to buy a picker, so the candidate surface uses a search field over a `Table` instead —
AC13's own named fallback — and #657 changes neither `apps/web/package.json` nor the lockfile.
## The depreciation surfaces (#651)

**The period is the database's, so the two date inputs are gone.** `fa-depreciation-runs-panel.tsx`
used to ask a person to type a period start and end; the only lawful pair was the one
`clara.depreciation_run_due` had already chosen, and anything else was refused. The dialog now opens
on `clara.preview_depreciation_run` (`components/registers/fa-run-preview.tsx`) and shows what the
next run WOULD do before anything is written: the period the register chose, the per-asset amounts,
both general-ledger legs, every skipped asset with its reason in words, whether the run will post or
wait for approval, and any period the oracle skipped for a closed financial year. Confirm runs it.

**Every skip reason was MEASURED, and an unknown one degrades rather than vanishing.** The five the
database can emit are `incomplete`, `not_in_service`, `fully_depreciated`, `none_method` and
`disposal_draft_outstanding` — the fifth is written by `clara._fa_compute_charges` itself and the
per-asset function can never return it. A reason outside that map renders as its VERBATIM code
beside a neutral sentence; it is never dropped and never guessed. The skipped list may collapse only
when every reason is benign: a row skipped for incomplete particulars renders the list OPEN, because
it is work somebody still owes.

**One decision, one key — on every FA door, not only the run.** These wrappers used to mint
`crypto.randomUUID()` inside themselves, so "the response was lost, click again" answered the retry
with a refusal instead of the receipt it had already earned. `lib/registers/depreciation.ts`'
`useDepreciationDecisionKey` mints one key per OPEN DECISION, keyed on the intent tuple, and holds
it until the decision changes or ends — on `components/work/work-cancel-dialog.tsx:95`'s shape. The
tuples are `depreciationIntent` (client, period start, period end), `authorityIntent` (the act, the
authority, the value being decided) and `reviseIntent` (every value the revision door is asked to
write, particulars key-sorted). **Signing is where a person actually meets this**: the sign door's
replay identity is {client, authority}, so a second key reaches 0227's `authority_already_live` arm
and refuses. `completeFixedAssetParticulars` and `disposeFixedAsset` still mint their own key —
#639's original shape, untouched by this branch and carried as a follow-up.

**Five readings of one asset, addressable.** `fixed-asset-detail.tsx`' tab id lives in `?tab=`, so a
pasted link lands on the reading it names and Back leaves the page rather than walking five tabs.
The fifth tab is new: *Policy & effective revisions* renders the `lineage` array as a revision
timeline — one row per generation with its effective date, its particulars, its change class and the
reason for it — because "this asset's estimate has never been revised" and "depreciation particulars
are not filled in yet" are different facts and a merged section can show only one of them. A
generation minted before migration 0227 carries no class and reads as NOT RECORDED, never as an
accounting claim this surface invented. *History* gains the immutable charge ledger from the
`charges` array, each row linking the journal entry it posted; an unwound charge is struck through
beside the row that unwound it rather than removed. Both arrays have been returned by
`clara.get_fixed_asset` since 0041 and this app had never read either.

**A revision now says what kind of change it is.** The revise dialog
(`components/registers/fa-row-actions.tsx`) carries a change-class control and a required reason.
`estimate` is the only selectable value; `policy` and `error` render as VISIBLY DISABLED options
carrying the rule in words and naming the ticket that owns the retrospective-restatement lane, so a
person learns the rule instead of wondering where it went. Both typed values survive a refusal, and
a typed CLR37 refusal renders verbatim with its code.

**Signing names the instruction it executes.** `fa-authority-ceremony.tsx` gains the instruction
reference — the Work or chat task the instruction lives in — and renders the resolution refusals
verbatim with their codes. `depreciation-authority-panel.tsx` shows the resolved reference as a link
and the authority window's floor, with the honest sentence that anything earlier is reached only by
an explicit catch-up a person performs.
## #656 — the opening basis gets a source, and the books say so

Three separate places made the document half of the opening lane unreachable from a browser, and
all three had to be fixed for any of them to matter.

- **`CreateOpeningSeedDialog` sent `tieDocumentId: null` unconditionally**, so no basis could ever
  be bound to a document. It now offers this client's ACTIVE VERIFIED filings of the two kinds
  `clara.create_opening_seed` admits — never `prior_gl`, which is CLR02 today — and sends BOTH the
  id and the sha, because the door's XOR guard refuses one without the other. "No document — I will
  key the balances" stays an EXPLICIT second choice with its own words, never an empty first row a
  person falls into. Both new inputs are `Field`s in one `FieldGroup`, and the pre-`Field` as-of
  input moved into the same group so the dialog does not carry two compositions. The rest of the
  opening dialogs keep theirs; a whole-lane retrofit is #900's shape.
- **The workbench rendered NOTHING for a tied basis** — the keyed panel mounts only when there is no
  tie document — so a basis bound to a document showed four tie gates over targets nobody could see.
  `OpeningTargetDocumentPanel` is its sibling: line key, the label AS PRINTED, account, debit,
  credit and provenance (the document, its sha-12 and the region id the target cites). An unmapped
  row renders as an ACTION, never a dash.
- **Nothing called the runtime.** `OpeningParseAction` + `lib/registers/opening-source.ts` post to
  `/api/runtime/opening/parse-targets` through the same-origin proxy, with the house runtime-wire
  discipline. It is a PLAIN action: AC5 forbids a second ritual for the document read, and the
  ceremony this lane has is `approve_opening_seed`'s distinct-checker door.

**The outcome is persistent, never a toast.** A refusal here names rows on a page a professional has
to go and find — the producer's whole value is that it says which lines it could not read — and a
message that fades cannot carry that. Every branch of the route's contract renders with the
database's own words: the named 422 VERBATIM with its counts and failing rows,
`no_opening_tb_lines` as the honest keyed-fallback signal rather than an error, a 403 as denied
(naming the restriction, offering no fake retry).

**The coverage footer is not the tie.** Mapped/unmapped counts and cents live in the target panel,
labelled as coverage, with no percentage — and deliberately OUTSIDE `OpeningDryrunStrip`, whose own
law is that it mints no numeral and re-derives no tie. C-25's defect was exactly a coverage figure
worn as a tie figure, and `opening-dryrun-unchanged.test.tsx` re-measures that the totals did not
resurrect it.

**…and on a document-sourced basis the unmapped row STATES a fact rather than printing a zero**
(fix-round, review finding A10). `unmappedCount` is structurally always 0 there — two database
walls make every parsed target source-exact and chart-present — so "Not yet mapped: 0 line(s),
Dr 0.00 / Cr 0.00" renders a CONSTANT as if it were a measurement, and a reader who does not know
that reads it as "everything is mapped": C-25's defect one layer down. When every target is
document-sourced (`isDocumentSourcedBasis`) the footer keeps the term and says why there is no
count; a basis carrying a KEYED row keeps the numeric count, because there `unmapped_labels` is a
real state a person can act on.

**What the browser leg found that no component cell could (fix round).** Six of the walk's seven
legs shipped as `test.fixme`; running them one at a time surfaced three app defects on this very
surface. (1) The settled read outcome was UNMOUNTED by the reload that follows a successful read —
`DataState` renders its LoadingState instead of children and every `act()` flips `loading`, so the
banner that AC5 requires to be persistent vanished at the moment of success; fixed with
`opening-register.tsx`'s own `hasSeedsData` precedent inside `opening-seed-workbench.tsx`. (2) The
document panel was mounted with `documentName={null}`, so every provenance cell read the sha twice
("Document 65a6f1e2d3c4 (sha 65a6f1e2d3c4)") and the footer had a hole where the filename belongs;
the workbench now reads the tie document's name in a SEPARATE read whose failure costs only the
name. (3) `OpeningDryrunStrip` rendered its refusal token at `opacity-70`, taking `text-warning` on
`bg-warning-muted` to 3.33:1 — below WCAG AA for 12px text, and invisible to
`scripts/check-token-contrast.mjs`, which reads only the tokens in globals.css. A component cell
mounts one component with nothing re-reading around it; only the built page in a browser has the
reload, the second read and the real colours.

**A refusal by the READER is a warning, not the keyed invitation.** A 422 whose reason is the
producer's own sentence ("trial balance does not balance: DR … vs CR …") is not
`no_opening_tb_lines`, so `isKeyedFallback` is false and the face renders the warning branch with
the reason verbatim — never "key the balances instead" over a document the reader has just found
internally inconsistent.

**C3's seam.** `ENTRY_SELECT` now reads `is_opening_balance`, and an opening entry carries a badge
linking back to `?tab=opening`. An approved opening item posts an ordinary entry with
`origin='manual'` (0017:3375-3384), so before this the client's own books showed their opening
position and a journal typed this morning under the same word.
## The durable batch card vs the live upload queue (#636)

Two components on one surface answer two different questions, and conflating them is the defect
`intake-receipts.tsx:5-10` was written to close.

- `upload-panel.tsx` is the LIVE transfer view: what THIS browser is doing right now. It carries
  the only legitimate `Progress` on the tab — a MEASURED byte transfer, with `value={null}` for the
  unmeasurable case.
- `intake-batch-card.tsx` is the DURABLE parent: what the firm's books know happened. Every number
  and every row is read back through `clara.get_intake_batch`, so it survives a reload, a new tab
  and a different device.

**NO `Progress` AND NO PERCENTAGE ON THE CARD, IN ANY STATE.** The door supplies no denominator
(0229 asserts it in its own tail); appendix D item 44 permits `Progress` only for a known
numerator/denominator and says "Indeterminate agent Work keeps its durable named state instead";
`work-detail.tsx:6-12` already forbids one for a single Work. The card renders labelled facet counts
with their coverage word. The five facets OVERLAP — a member can be admitted AND waiting — so they
legitimately exceed the member count and are never summed.

**THE CAPACITY COPY SAYS 08:00, NEVER "MIDNIGHT" AND NEVER "TOMORROW".** The daily document window
is `date_trunc('day', now() at time zone 'utc')` (0007:1644), whose boundary is 08:00
`Asia/Kuala_Lumpur` — MEASURED on a migrated rig. The card renders the DOOR's own
`resets_at_local`, so the string cannot drift from the wall it describes, and
`lib/documents/batch-url-state.test.ts` fails if either word is ever written into the catalogue.

**NO NEW ROUTE AND NO NAVIGATION LEAF.** The batch is `?batch=<uuid>` URL state on the two
Documents leaves that already exist, on `lib/documents/url-state.ts`'s own idiom: `router.push` to
open so Back closes, `router.replace` when the page was loaded directly at it, every other
parameter preserved, and a malformed id answered as not-found rather than folded into "nothing is
open".

**THE TWO MOUNTS DIFFER ONLY BY `clientId`.** `components/firm/documents/unassigned-sources.tsx`
mounts the same card with `clientId={null}`; `documents-workbench.tsx` mounts it with the real
client's id. Nothing gates Cancel on either mount — the rows carry navigation, not acts, so there was
never a second job for a read-only flag to do, and Stop is reachable on both for the same reason a
person looking at a firm-wide board is exactly the person who needs to stop a batch.
A TERMINAL batch offers no Stop on either mount — an affordance that could only refuse.

**THE STOP DIALOG COUNTS WHAT IS STILL ARRIVING, NOT ONLY WHAT IS RUNNING.** `get_intake_batch`
returns `pending_members` (members with no Work yet whose intake is still arriving or whose document
is still being read), and the dialog says so. Without it, a batch stopped during ingest — the moment
a hundred-file batch is most likely to be stopped — read "0 operations are still running" while a
hundred were.

**A STOP THAT CANNOT FINISH SAYS SO.** When the door answers `cancel_blocked`, the card renders a
banner naming the reason and the remedy instead of showing "stopping" for ever. Today the one value
is `canceller_not_active`: the fan-out must re-issue with the stored actor, so if that person leaves
the firm, the remaining children cannot be stopped under that decision.

**ONE CONFIRM, ONE GOVERNED CALL.** `intake-batch-cancel-dialog.tsx` performs exactly one
`POST /api/runtime/intake/batches/:id/cancel`; the fan-out — one `clara.cancel_accounting_work` per
live child — is the server's. One op key per open decision, minted with `work-cancel-dialog.tsx`'s
`useDecisionKey` idiom copied with its source named.
## #658 — knowledge freshness, who read a record, and "your basis changed"

**C13 register** (`components/registers/knowledge-panel.tsx`). The version line now prints the
`knowledge_version` AND the Kuala Lumpur `as_of` date the view was computed for — a version with
no as-of is half an answer, because the in-effect marks below it are computed against a day. The
date comes from the one business-date law (`lib/business-date.ts`), never the browser's raw
clock. A record whose effective window does not cover that day is MARKED (`Not in effect on
<date>`, a WORD with a title, never a colour alone) and STILL RENDERED: silently dropping a rule
is how a reader comes to believe a client has no policy when it has one that stopped applying.
Both facts come from fields `clara.list_client_knowledge` already returns, so there is no new
door, no recut and no human grant on any pack (#783). The four existing faces are unmoved.

**C13 record detail** (`components/registers/knowledge-record-reads.tsx`). "Work that read this
record", below the revision timeline — the timeline is what the record IS, this is who consumed
it. It reads `clara.list_work_knowledge_reads_for_record`, which `DECISIONS.md:83` mandates
because the relation is FORCE-RLS with no app-role SELECT. It is READ-ONLY (the Work is a link,
never an act), CAPPED at the door's 100 with an exact `hidden_count`, and it carries its OWN
state ladder because this read fails independently of the two the page already makes: a denied
reads-read leaves the revision timeline readable beside it, and an EMPTY list says "no Work has
recorded a read of this record" — never "this record is unused", and never as an error.

**B3 Work detail** (`components/work/work-knowledge-block.tsx`, mounted in ONE line inside the
Sources tab). What this run read: the face word, the version, the period, the key set and the
per-tier counts, from ONE `clara.work_knowledge_drift` read. `observed_revisions` is rendered
for the first time inside the EXISTING `work-diagnostics.tsx` rows — a second
`get_work_execution_trace` read on one page would double the request and split the honesty story
across two components.

**The drift banner has TWO wordings, because the door distinguishes them**, and it renders on
the Work AND on `components/work/work-question-form.tsx`:

- `relevant: true` → "a record this Work read has changed: <keys>", naming only the
  INTERSECTION of what moved with what was read.
- `relevant: null` (the observed version came from an execution trace, so no read-set exists) →
  "this client's knowledge changed after this Work last read it; which records it read was not
  recorded." **Never a confident "unrelated"**: the absence of a record is not evidence of
  absence.

**IT NEVER CLEARS A TYPED ANSWER.** The banner is additive — no draft is discarded, no field is
reset, nothing is disabled — and `components/work/work-question-drift-banner.test.tsx` holds
that with a drift that resolves only after the person has typed.

**ONE FACT, ONE READ, ONE STORY — and the coalescer is where that is enforced.** The Sources
block and the question form are two independent consumers of the same drift fact, and the form
renders once per PENDING question card, so a Work detail could spend `1 + N` identical door calls
and — worse — let the block and the banner disagree when a capture lands between two reads.
`lib/work/knowledge.ts` therefore holds an **in-flight coalescer** keyed by `(work id, resolved
session accessor)`: consumers that mount in the same tick share one request and one answer. The
fix is NOT a prop drilled down from `work-detail.tsx`, because the same form is also mounted by
the Clara chat lane (`components/parts/WorkCards.tsx`) and by Needs-you
(`components/firm/work-question-affordance.tsx`), where there is no owner to drill from. It is a
coalescer and **not a cache**: an entry lives only while its request is in flight, so the block's
"re-read" button still makes a real call, a caller that brings its own `AbortSignal` keeps its own
request (one component's unmount must not abort another's read), and two different accessors are
two auth contexts that never share an answer. `lib/work/knowledge.test.ts` holds all four.
## #660 — the client home's money band

`lib/dashboard/financial-pack.ts` IS THE ENVELOPE MODULE, and it is exported as one on purpose:
#669's receivable/payable tiles are a later ticket over the SAME door and the SAME parser, so they
inherit the hydration rules rather than re-deriving them. Two rules carry the whole file:

- **Unknown is not zero.** A figure this build could not read is `{status:'unknown',
  valueCents:null}`. "This client's cash is zero" and "I could not find out what this client's cash
  is" are different sentences; a `?? 0` anywhere in that module would be the bug.
- **A number never arrives without its period.** A figure group missing ANY of its ten envelope
  fields hydrates as `unknown`, not as a number with a hole in it — an amount whose interval the
  reader cannot see is an unanswerable claim rather than a smaller truth.
- **A comparison the door WITHHELD is said, not skipped.** `comparison.available:false` (with its
  `reason`) is what the door sends for a period before this client's books begin; the face renders
  the sentence rather than an amount, because "against RM 0.00" for a month-end the same read calls
  unknown is a fabricated zero one line below the headline.
- **The composition lives in the figure group it is about**, with its own `compositionTotal` /
  `compositionTruncated` beside the entry level's pair, so a table cut at the door's 50-account cap
  says "Showing 50 of 61 accounts" instead of quietly summing to less than the figure above it.

NO CENTS ARITHMETIC HAPPENS IN THE BROWSER, and two source-reading cells keep it that way
(`financial-pack.test.ts`, `period.test.ts`). Every delta, percentage, cap and series point is
computed in `clara.get_client_financial_pack` (0232), once, so the browser, a later report and
#669's tiles cannot disagree about what "down 12%" means.

**ONE SECTION, ONE READ, FOUR FACES — and that satisfies the board's law rather than breaking it.**
`client-workspace-overview.tsx:16-19` says every SECTION reads for itself, because a board that
blanks on a single failure reads as "this client has nothing outstanding". Cash, profit and the two
trends are not four sections: they are four faces of ONE envelope that are only true together —
they share a period, a definition version and a SOURCE WATERMARK, which four reads could not
guarantee. So the money band is one section with one hook instance, and a failure there darkens
exactly that band.

**THE ADDRESS IS THE ONLY SOURCE OF TRUTH FOR THE PERIOD.** `?period=YYYY-MM` names a whole natural
month and its absence means month-to-date; the route reads it on the SERVER (`journals/page.tsx`'s
own precedent) and the selector `router.push`es — push, not replace — so Back restores the period a
reader came from. A malformed value falls back to month-to-date and the face SAYS so, because
silently rewriting an address would let a reader screenshot one month under another month's label.

**COMMIT-EVENT INVALIDATION IS A NAMED RESIDUAL, NOT AN OMISSION.** `lib/command/bus.ts` carries
exactly two events (`clara:focus-rail`, `clara:client-record-changed`) and NEITHER is a posting or
an approval — there is no commit event in this app to subscribe to. Rather than promise a freshness
this build cannot deliver, the band's footer says what it actually does: these figures refresh at
most every 30 seconds while the tab is open, and here is the last successful read. The 60-second
"delayed" rule is IMPORTED from `lib/work/use-work-detail.ts` (C77.12: one contract, one owner,
extended by reference rather than copied), and a source-reading cell refuses a second literal.

### Recharts, and the table that is never a fallback

`recharts@3.8.0` and `components/ui/chart.tsx` arrived through `pnpm --filter @clara/web ui:add
chart` and its guard's own resolution. The payload also names `components/ui/card.tsx` as an
OVERWRITE and the guard does not block it (`scripts/protected-components.json` holds only
`button.tsx` and `pagination.tsx`), so the overwrite was refused at the CLI's own per-file prompt
and `card.tsx` is byte-identical
(`sha256 d8113cbf964f8d1aadf2649d2944d8bbc6e3cfd49d36746f76868cbc4dde3cfe`, unchanged).

**The readable table is ALWAYS in the DOM**, beside the chart and not instead of it. Appendix D
admits a chart only "for a defined time series or comparison … plus a readable value/table
disclosure", and a disclosure that renders only when something fails is not one. The chart is
`aria-hidden` because the table IS those rows, and announcing both would read the same six numbers
twice. At 640px and below the chart is out and the table is the whole disclosure — which is exactly
why it could never be failure-only. `prefers-reduced-motion` disables the animation at the source
(`isAnimationActive` is off), so it is never started rather than started and overridden.

`components/ui/chart.tsx` imports `cn` from `@/lib/utils` like the other 25 files under
`components/ui/`. The registry's generated file imported it from the `cn` npm package instead,
which would have put a SECOND class-merging engine (and the only caret-ranged dependency in
`apps/web`) into one design system, where a single Tailwind conflict could resolve two ways on one
page; the package was dropped and the import re-pointed. Nothing else in the generated file was
hand-edited.

`packages/reporting-render/lib/chart.mjs` is the FROZEN PDF chart runtime. It is never referenced,
never imported and shares no code with this; nothing here hand-rolls a second SVG chart.
## `/settings/firm` — the firm's commercial destination (#635)

This is where a firm reads its own legal, commercial and model-usage state. Five cards over
migration 0233's three governed reads, on the one existing address — there is no new route, so
`tests/firm-scope-fourth-entrance.test.ts` and `tests/firm-scope-surfaces.test.ts` stay green
(verified, not assumed), and the page still makes exactly ZERO extra `requireFirmScope()` calls: the
identity card reads the scope the layout already provided.

**ACCEPTING A NEW LEGAL VERSION HERE IS THE ONLY REMEDY IN THE PRODUCT** for a withdrawn derived
model-egress authority. `clara._accounting_work_egress_live` (0195:875) requires ONE active OWNER
holding acceptances of BOTH currently published legal kinds; a newer publication withdraws that the
moment it lands (0195:890-892), with no sweep and no second switch. Until this page, the sentence
`WorkDetail.egressNotAuthorized.body` shows a person standing in front of blocked Work — "an owner
must accept the current versions" — had no destination: the only accept surface was `(entry)`'s
signup stage, which a signed-in owner never sees again. `components/firm-admin/accept-legal-dialog.tsx`
is that destination, and it imports `lib/registration/legal-reads.ts` and `legal-doors.ts`
UNCHANGED rather than forking them, so the op-key, verbatim-digest and stale-re-read properties are
the same ones the signup journey already proves.

**THE COPY IS CHOSEN BY THE PLATFORM'S LEGAL ENFORCEMENT MODE (#1008, migration 0234).** The
standing read now carries `enforcement_mode` — `prompt` (the beta, and 0234's landing value) or
`enforce` (0195's rule). `standing_live` is UNCHANGED and still false whenever an agreement is
outstanding, in both modes, because that is the fact the card needs in order to ASK; what changes is
the sentence underneath it. Under `enforce` it is today's consequence sentence, byte for byte
(`FirmSettings.legalNotLiveBody`). Under `prompt` it is `FirmSettings.legalNotLivePromptBody` —
"Please accept the current versions of both agreements. During the beta this does not stop Clara
working on your clients' books" — because under `prompt` the derived basis IS live on any real
acceptance the firm's active owner holds, and saying otherwise would be the estate telling a firm
its work is switched off when it is not (the owner's ruling of 2026-09-20). The accept control is
offered identically in both modes. `decodeLegalEnforcementMode` in
[lib/firm/commercial-reads.ts](lib/firm/commercial-reads.ts) reads an ABSENT or unreadable mode as
`enforce`: a build deployed ahead of the migration then renders exactly what its database is
actually enforcing. It is a default and never a requirement, so an unknown mode cannot drop a read
the three required scalars would otherwise have carried. There is NO control here for flipping the
mode — that is the operator firm owner's door (`clara.set_legal_enforcement_mode`) and it has no
web surface yet.

**What this page deliberately does not have**, each because the estate cannot honestly offer it:
no price while `billing_plans.amounts_ruled` is false (the flag is the render condition, so an
owner ruling shows a figure with no code change); no "Manage billing" control at any rank (nothing
in this estate can change a firm's commercial arrangement — `billing_plans` has no door, and
`firm_registration_payments` is written only by the Stripe webhook lane); no editor for the
processing caps (`clara.firm_document_limits` has no human writer at all, 0196:36-40); no seat
count; no chart; and no firm identity fact — the registered name, registration number and address
live on `/settings/setup`, which this page links to and owns none of.

**Revocation is focus-driven, not push-driven, and not a poll.** `FirmSettingsPanel` re-issues both
governed reads on `visibilitychange`→visible and on window `focus`, and a CLR04 REPLACES the view:
the `denied` state has no `data` field, so a live demotion cannot leave a stale plan or payment
behind a disabled control. It does NOT re-read `clara.caller_context` to notice the demotion — that
is the child-side re-read P4-6 rules out, and it would make the surface trust a mirrored rank
instead of the wall. NAMED RESIDUAL: a tab that is never refocused and never navigated keeps its
last payload until one of those happens; closing that needs a server-push channel this estate does
not have.

**The accept control is gated on the CALLER's own acceptance, not on the firm's.**
`standing_live` needs ONE active owner holding BOTH current acceptances, so two owners holding the
two halves is a state where every kind reads `firm_accepted: true` and standing is still false
(`p635.db.legal_standing_two_people` asserts exactly that). A control gated on `!firm_accepted`
disappeared in precisely that state, leaving the firm with no in-app remedy at all. The gate is
`can_accept_for_firm && !standing_live && status = 'published' && my_accepted_version <> version`:
a control for the owner who can actually move the wall, and none while standing is live. The hint
everyone else reads names the MOST RECENT acceptance on record — not "whoever sorts first accepted
the previous ones", which is false whenever one kind's acceptance is still current.

**An answer carries the month it is an answer for.** The window label, the CSV's provenance header
and the download filename follow the period the instant it changes; the rows follow the door, which
is a round trip later. So `FirmSettingsPanel` stamps the month onto the usage answer and the card
renders nothing until the two agree — otherwise the provenance header that exists so a spreadsheet
cannot lose the window would state a window its rows did not come from.

**An unreadable read is never an empty one.** `loadFirmAiUsage` THROWS when the payload is not a
table (the two sibling reads already did), so a refusal-shaped body reaches the card as a failure
with a retry rather than as "No model calls in this period." Rows the build cannot decode are still
dropped — a silently zeroed row is worse — but the COUNT comes back, the card says so beside the
money column, and the CSV carries it, exactly as `unpriced_calls` is carried. Likewise, a firm with
NO current billing plan (`uq_billing_plans_current`, 0163:207, permits zero) reads "No plan is
current for this firm" and keeps its payment line, invoice explanation and capacity numbers, rather
than dropping the whole answer behind a transport failure.

**The model-usage window is UTC, and the page says so.** `clara.get_llm_usage_summary` filters rows
by `(created_at at time zone 'utc')::date` (0110:750), so the month the card labels is a UTC month
and not an `Asia/Kuala_Lumpur` one. `lib/firm/usage-period.ts` derives the bounds the way the door
does and the card prints them. The CSV is client-side only — no route, no door, no byte path — and
its first two lines carry the firm, that exact window and the currency, so a spreadsheet cannot lose
the unit or the timezone the screen carried.

