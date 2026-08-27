# P4 Mobbin grounding — signup · approval · invites · tiers references

*Grounding lane (`claude-sonnet-5`), 2026-08-28, dispatched from the 磨合 frontend train.
**Design-only, additive** — closes `p4-design-2026-08-27.md` §11 ("Mobbin grounding — UNMET,
and why"), where the design lane recorded the obligation as open because its own session's
Mobbin MCP call returned an unresolved OAuth URL. This session's MCP is authenticated and
reachable. This file does not redesign anything the P4 design ruled — it attaches real-world
references and concrete, vocabulary-mapped takeaways to the four journeys the design's §11
named as needing them, and flags the handful of places a reference surfaced something the
design doc doesn't yet resolve. Every flag is a recommendation for the owner/design lane, not
an amendment applied here.*

**Ground rule (per the ClaraBook handoff and `AGENTS.md` constraint 1): Mobbin informs flow
structure and interaction patterns only.** Clara's tokens, motion and copy philosophy are LAW —
`docs/design/PRODUCT_DESIGN.md`, the honest-state discipline in
`apps/web/components/common/state.tsx`, and the fail-closed/no-optimistic-UI rules in
`apps/web/AGENTS.md` override any pattern below where they collide. Every "maps to" line below
names an **existing** Clara component (`apps/web/components/ui/`, `apps/web/components/common/`)
— this lane introduced no new primitive.

**Method.** `mcp__mobbin__search_flows` / `search_screens`, platform `web`, deep mode, limit
2-3 per query, one query per concrete pattern rather than one broad query per flow (broad
queries returned tangential results — noted where that happened). Every screen/flow below was
visually inspected, not inferred from metadata.

---

## 1 · Self-serve signup ending in an approval-pending holding state

Maps to P4 design §4 A (signup) and §4 E (the holding state) — `docs/plan/active/p4-design-2026-08-27.md`.

**References.**
- [Airwallex — "We are reviewing your details"](https://mobbin.com/screens/5b2e67a8-ded8-496b-80f0-d2aa8ab4ae03) — a 3-step header (Sign up ✓ / Verification · in review / Activation · pending), one card with a title, one sentence naming the SLA ("1-3 business days"), a single "Return to Dashboard" action, and unrelated cross-sell content below the fold.
- [Stripe — "Update your business representative"](https://mobbin.com/screens/b24bf79e-1acc-4d99-9f38-b81aa68daaf8) — the same three-stage idea rendered as a right-rail "Task progress" tracker (Information submitted / In review / Completed) beside an expandable FAQ ("What happened and what do I need to do now?", "Why does Stripe need this?", "How long will the review take?").
- [OKX — "Reviewing"](https://mobbin.com/screens/56aafe11-2b76-4cc6-a2ba-102d35d3b0d1) — the minimal end of the spectrum: a centered icon, "Reviewing", one sentence ("This may take up to 24 hours. You'll be notified once the review is complete."), no card, no stepper, no action at all.
- [Amie — "Requesting for access" flow](https://mobbin.com/flows/6a8841de-f692-4bdc-8476-5e5e7f6e9081) — a multi-question qualification form ending on a plain confirmation screen: "thanks so much for answering our questions, we hope to give you access to Amie soon", with a single "back to amie.so" link.
- Rejected as off-target: [Kajabi's onboarding flow](https://mobbin.com/flows/8fe9c347-0e57-442a-8bde-53c5db4c1d2d) surfaced on the broad query but its terminal screen ("Your waitlist is ready!") is the Kajabi *customer* building a waitlist feature for *their own* audience — not Kajabi gating access to itself. Not cited as a pattern.

**Takeaways → Clara vocabulary.**

1. **Every reference keeps the holding screen to one honest sentence plus, at most, a static
   status label — never a fabricated progress bar.** Stripe's and Airwallex's "steps" are just
   two states (submitted, in review) dressed as three; OKX skips the stepper entirely. §4 E's
   holding route has exactly three renderings (pending / rejected-with-reason /
   invite-expected), not graduated progress, so **do not build a stepper widget** — render the
   state as a `StateBanner` (`apps/web/components/common/state.tsx`) with `tone="info"` for
   pending, `tone="warning"` for rejected (carrying the DB's own reason via the `code`/children
   slots, verbatim, per the no-fake-control rule), inside a `Card`/`CardHeader`/`CardTitle` from
   `apps/web/components/ui/card.tsx` — the same shape `InviteAcceptForm` already uses for its
   own pre-session states.
2. **OKX's "up to 24 hours" and Stripe's "1-3 business days" are commitments those products can
   back with an SLA their own systems enforce.** Clara's approval queue has no SLA — it is a
   single BELCORT operator ruling manually (§4 B, §5 ask 8). **Do not adopt an ETA sentence.**
   The honest Clara-native copy is closer to Amie's register: state what is true (a request was
   received, an operator will rule on it) without promising a duration the product cannot
   guarantee — this is the same "no model-generated numeral enters a durable artifact" discipline
   (`AGENTS.md` constraint 2) extended to a fabricated time estimate.
3. **The single return action matters, but "Return to Dashboard" doesn't exist for Clara's
   holding state** — a no-firm session has no dashboard to return to (`jwt_firm()` is NULL).
   §4 E already names the one action that must stay reachable: logout (exempted from
   `requireFirmScope()` "by necessity"). Map Airwallex's single-CTA idiom to a single
   secondary-styled `Button` (`variant="outline"`, matching the entry-surface treatment other
   P2 forms use) reading "Log out", not a fabricated "back to dashboard".
4. **Airwallex's cross-sell block below the review card is the clearest anti-pattern to name
   explicitly.** §4 E's holding route is fail-closed with a two-item exemption list (logout,
   the mail courier) — nothing else should render on it. No "explore Clara while you wait"
   content belongs on this screen; the reference is useful precisely as the shape to avoid.
5. **Amie's qualification-question flow (the multi-step form before the holding screen) does
   not map to Clara's signup at all** — §4 A's signup is one screen (firm name · principal name
   · email · password), not a multi-step interview, and the design gives no basis to add one.
   Cited only for its terminal-screen copy register, not its structure.

---

## 2 · Operator approval queue (approve/reject with reasons)

Maps to P4 design §4 B and §5 ask 8 — `docs/plan/active/p4-design-2026-08-27.md`.

**References.**
- [Aboard — "Approvals"](https://mobbin.com/screens/9ce069a2-2cbe-4c94-a7f5-b57050e50ca0) — the cleanest shape: one table (Employee · Type · Status · Next approver · Requested by · Requested), a colored status pill (amber "Pending", green "Approved"), no bulk controls, no filter bar.
- [Deel — "Action required"](https://mobbin.com/screens/ebede796-0ca0-408a-bf05-630420732e1f) — a dense queue (71 rows) with a filter toolbar (Status/Categories/Submitted date/Transaction date/Transaction type), per-row inline ✓/✗ icon buttons, **and a bulk "Approve all your pending (71)" / "Deny all your pending (71)" menu**.
- [Miro — "Access requests"](https://mobbin.com/screens/05e59db8-5f5a-4f08-ae23-292fd64fe663) — a narrow table (Name · Team · Requester · Date · Actions), per-row inline ✓/✗ buttons, an "UPGRADE" badge gating a second tab (`Request management`) — that second tab is a paywall notice, not a pattern to copy.
- [Dribbble — "Decline project request?"](https://mobbin.com/screens/24740592-4952-4237-8a45-05fc65d530a0) — a reject modal with a **pre-focused, required** reason textarea and a two-button footer (Cancel / Confirm, `Confirm` styled as the primary act).
- [Docusign — "Decline to sign"](https://mobbin.com/screens/e9164b60-801f-4221-9013-d0f396766a42) — the same modal shape with a 0/500 character counter on the reason field.
- [Braintrust — "Decline offer"](https://mobbin.com/screens/134fc0e0-1333-46b1-8a6c-3b8e64b3a6f5) — the counter-example: "You can give a reason for declining, but you don't have to" — reason is explicitly optional.

**Takeaways → Clara vocabulary.**

1. **Table shape.** Aboard's five columns (subject · context · status · date · a name) map
   directly onto what `firm_registration_requests` + the applicant's firm name would carry —
   render with `apps/web/components/ui/table.tsx`, a `Badge` (`variant="secondary"` for pending,
   `variant="outline"` for a resolved state should the queue ever show history) for the status
   column, and `SectionHeader` level 2 ("Pending registrations") from
   `apps/web/components/common/section-header.tsx` as the page's section title under
   `PageHeader`/`PageShell` (`apps/web/components/common/page-shell.tsx`).
2. **Row-level approve, dialog-gated reject.** Miro's and Deel's inline ✓/✗ per row is the right
   shape for approve (a single `callDoor` to `approve_firm_registration`, no confirmation
   needed — §4 B: approval is a direct, receipted act) but reject needs the reason capture
   Dribbble and Docusign show: open `apps/web/components/ui/dialog.tsx` with a
   `Textarea` (`apps/web/components/ui/textarea.tsx`) bound to `reject_firm_registration`'s
   reason argument, footer `Button variant="outline"` (Cancel) + `Button variant="destructive"`
   (Reject).
3. **Reason required, not optional — flag for the design/owner.** The design text (§4 B:
   "Rejection is a first-class verb carrying a reason, never a silent deletion") establishes the
   verb *carries* a reason but doesn't say the UI must refuse an empty one. Dribbble's Confirm
   reads as gated on non-empty text; Braintrust's is explicitly optional. **Recommend Dribbble's
   pattern** — disable Confirm until the textarea is non-empty — because the reason is the one
   thing the rejected applicant sees in the holding state (§4 E), and an empty receipted reason
   gives them nothing actionable. This is a UI-only gate (the DB door itself is the wall on
   authority, not on reason content) so it costs nothing to add and nothing to revisit later.
4. **Bulk approve/deny (Deel) is an anti-pattern here — flag, do not build.** Deel's queue is
   payroll line items at volume; Clara's is `_create_firm_core` extractions — each row **mints a
   firm and opens its onboarding plan** (§4 B). Batching that decision risks admitting a firm
   without individual review, and the console's own gating (`owner+` AND `is_operator`, at most
   one operator firm ever, §5 ask 8) already caps who reaches this screen and how often. No
   filter toolbar either, for the same reason — Deel's filter bar answers "find my 71 items";
   Clara's queue is not expected to reach that volume, and a toolbar with nothing to filter is
   a control with no reason to exist (the fake-control rule again, one level up from a button).
5. **Empty-queue state — none of the three table references show one** (all three screenshots
   happened to have live rows). This is a genuine gap in what Mobbin returned, not a design
   choice to adopt from a reference. Fall back to the house pattern already documented in
   `apps/web/components/common/state.tsx`: `EmptyState` — plain muted prose, no icon, no
   illustration — "No pending registrations." This is the existing idiom, not a new one.

---

## 3 · Members & roles with an email-keyed invite dialog

Maps to P4 design §4 C and §4 D, §5 asks 3/5/6 — `docs/plan/active/p4-design-2026-08-27.md`.

**References.**
- [Tailscale — "Invite external user" dialog](https://mobbin.com/screens/a2762887-659d-4f40-b59a-4047509c8ed7) — email input + role `Select` (Admin/Network admin/IT admin/Auditor/Billing admin/Member, current selection check-marked), tab switch between "Invite via email" and "Copy invite link", helper text: "You can use commas to separate multiple emails."
- [TheyDo — "Users"](https://mobbin.com/screens/d7dd74d6-e34a-4d93-9208-ec3cc1fbe69f) — seat-usage counters (Admins/Contributors/Viewers/All users) above an inline invite row; the role dropdown shows a **one-line description per option** ("Organization Admin — Can change billing, settings and view/edit content").
- [Height — "Users"](https://mobbin.com/screens/6b473891-4205-4d25-a1c8-2b51fb32e851) — three separate tables (Invited, Guests, Members) with a per-row "Actions" dropdown, and a confirm dialog on remove: "Remove the invitation for saralee.mobbin@gmail.com? Cancel / Remove."
- [Upwork — "Pending invites"](https://mobbin.com/screens/25a18f7c-828b-4770-b348-bd545f693458) — a dedicated Invitations sub-tab; each row shows the invited email, team, and role **badges** with a "+1" overflow, actions in a trailing "..." menu.
- [Krea AI — "Pending Invites (1)"](https://mobbin.com/screens/bb421ef5-0798-47d7-a355-95524bd944ba) — a section (not a tab) inside one Team page; each row: email, an Email Status badge ("Delivered"), then flat inline actions — "Cancel" and "Copy link" — no overflow menu.
- [Midday — "Members" / "Pending Invitations"](https://mobbin.com/screens/478a5a79-2f93-4be7-b3aa-71b0bbff3473) — sub-tab split between Team Members and Pending Invitations; each pending row is prefixed "Pending Invitation" over the email, role shown as plain text, actions in a "..." menu.

**Takeaways → Clara vocabulary.**

1. **Section, not tab, for roster vs. pending invites.** Height, Upwork and Midday all hide one
   list behind a tab; Krea AI stacks both as sections on one page. §4 D's own text puts "the
   roster, the pending-invite list, role change, remove" on one /admin/members screen, and the
   P4 battery plan (§7, journey D: "roster + dialog in both scans") expects both to render
   together for the a11y/token scans to see them without a second tab-panel assertion. **Map to
   Krea AI's shape**: two stacked sections under one `PageHeader`, each headed by
   `SectionHeader` level 2 ("Members", "Pending invites"), both `Table`-rendered, not tabs.
2. **Role select needs inline descriptions — TheyDo's pattern, not Tailscale's bare list.**
   Clara's four roles (`viewer 0 < bookkeeper 1 < admin 2 < owner 3`, §2) are domain-specific in
   a way "Admin/Member/Viewer" isn't — "bookkeeper" has no equivalent in a generic SaaS ladder.
   Map to `apps/web/components/ui/select.tsx` inside the invite `Dialog`, one `SelectItem` per
   role, each carrying a short description string (through next-intl, not hardcoded) the way
   TheyDo's options do, rather than Tailscale's bare role-name list.
3. **A "Delivered" badge (Krea AI) cannot be built as designed — flag for the design/build
   lane.** `clara.firm_invites`' columns per §5 ask 3 are `(firm, email, role, token_hash,
   expires_at, invited_by, status)` — there is no delivery-receipt column, because the mail step
   is a server-only courier that calls the Supabase service key *after* the DB write succeeds
   (§4 C) — the DB never learns whether the email actually sent. **Do not fabricate a
   "Delivered" badge**; the only badge Clara can render honestly is the invite's own `status`
   (pending/consumed/revoked/expired, whatever the DB enum turns out to be) — the same
   "no model-generated state enters a durable artifact" discipline as takeaway 3 in §2 above,
   applied to a status pixel instead of a number.
4. **Revoke as a confirm dialog, Height's copy pattern.** Unlike most Clara governed acts,
   `revoke_invite` has no DB-side "are you sure" refusal to lean on (contrast the last-owner
   wall in §4 D, which the UI deliberately does NOT pre-empt because the DB's own refusal is the
   safety net) — revoke is closer to irreversible with nothing else catching a misclick. Map to
   a small `Dialog` echoing Height's exact copy shape ("Revoke the invitation for {email}?"),
   `Button variant="outline"` (Cancel) + `Button variant="destructive"` (Revoke).
5. **No "..." overflow menu — flag a component gap.** Upwork and Midday both put row actions
   behind a dropdown menu trigger; `apps/web/components/ui/` has no dropdown-menu primitive
   today (checked: badge/button/card/command/dialog/input-group/input/label/select/separator/
   table/textarea only). Introducing one is a net-new shadcn primitive this design doc never
   asked for. **Map to Krea AI's flatter pattern instead** — inline text/icon `Button`s
   ("Revoke", "Copy link") per row, no overflow menu. If a later lane wants the menu, that's a
   `shadcn` MCP `add` and its own review, not something to fold into P4 quietly.
6. **Comma-separated multi-email invite (Tailscale) does not match the backend ask — flag,
   do not build.** §5 ask 3's `invite_member(email, role, op_key)` signature takes one email.
   Building an input that accepts "a,b,c@x.com" would either silently only use the first address
   or require a client-side loop the design never specified (and `accept_invite`'s wall is
   per-token, per-email anyway — §4 C). The dialog issues one invite per submit; multi-invite is
   a backend-ask change, not a frontend embellishment.

---

## 4 · Read-only plan/tier display (operator-assigned, no self-serve upgrade)

Maps to P4 design §4 F and owner question 5/6 — `docs/plan/active/p4-design-2026-08-27.md`.
**This is the flag most worth surfacing**, so it leads the takeaways rather than closing them.

**References.**
- [Asana — "Billing"](https://mobbin.com/screens/ab6256f5-ea84-4f4d-8363-4dd62419a2ce) — a "Plan details" card (name + "2 days remaining in trial", no button) sitting beside a separate "Timesheets and Budgets" card whose only action is a text link, "Contact sales to upgrade" — and a third card, "Contact support", also link-only. Nothing on the page is a self-serve control.
- [Qatalog — "Manage plan"](https://mobbin.com/screens/bfb3ec41-2d77-4e7a-9c97-c2aa1759e49f) — current tier (Pro) rendered with an "Active" button that is **visually disabled** (greyed, `Active` label, no click affordance shown), beside an Enterprise tier whose only action is "Book a call" — closer to Clara's shape than a typical picker, but still a two-column comparison layout.
- Anti-patterns, cited to name what NOT to copy: [Later — "Subscription"](https://mobbin.com/screens/7a38dd0f-5e0f-4214-bd08-33cd45bc0030) (a live "Reactivate Plan" / "Change Plan" button pair), [Contractbook — "Billing"](https://mobbin.com/screens/cda6caf3-5872-4142-9a7e-cedfc0e06ee0) (a per-feature ✓/✗ checklist gating capabilities by tier, plus a "Manage plan" button), [Outseta — "Plan"](https://mobbin.com/screens/596d632e-0283-4fe0-9dbd-1143906bbfeb) (a "Restore plan" button), [Supabase — "Billing"](https://mobbin.com/screens/98eeca6e-afae-4d62-9193-f49022b56cfd) (a usage-cap warning banner wired to a "spend cap" toggle — a usage brake with a self-serve override).

**Takeaways → Clara vocabulary.**

1. **The flag: Mobbin's B2B billing category is dominated by self-serve plan-pickers, and none
   of the six references cleanly match Clara's posture** — operator-assigned tier (owner
   question 5, recommended operator-only in beta), no capability gating by tier (§9, laws
   76/78/81), no usage caps or brakes of any kind (§9, explicit — "an included allowance is a
   billing figure, not an enforcement input"). Later's buttons, Contractbook's feature
   checklist, Outseta's restore action, and Supabase's spend-cap toggle are each an
   *actionable* control Clara's design forbids outright. **Asana's split — a read-only "Plan
   details" card plus a separate, inert "Contact support"/"contact sales" card — is the closest
   available shape**, because Asana frames the change-mechanism as a human channel, not a
   button, which is exactly what an operator-only beta needs. Recommend the build lane use
   Asana's *pairing* (two small `Card`s) over adapting Qatalog's disabled-button single card,
   since a visually-disabled "Active" button still reads as a control that almost works — the
   fake-control problem in miniature — where a plain link/text pointing at "contact BELCORT"
   carries no such ambiguity.
2. **Map to Clara components:** `Card`/`CardHeader`/`CardTitle` (tier display name, from
   `clara.firm_tiers.display`, ask 9) + `CardDescription` (what it includes) for the plan card;
   `SectionHeader` level 3 ("This month's usage") for a metering block sourced only from
   `get_llm_usage_summary` (ask 11, admin+ floor) under hard constraint 2 — the DB owns the
   number, never a client-computed rollup. No `Button` anywhere on this page unless the "contact
   operator" card needs one styled `variant="outline"` for a mailto/support link — never a
   `variant="default"` primary action, which would read as "do the thing" on a page with nothing
   to do.
3. **No reference shows Clara's specific "pending price" idiom, because none of these six
   products are pre-pricing** — expected divergence, not a gap. §9 already mandates every
   currency amount render through a named placeholder component ("the amount is pending"),
   never a real figure, `RM0`, or an em-dash. None of the references needed to solve that
   problem, so none demonstrate it; the design's own rule stands unmodified.
4. **Contractbook's feature checklist is the sharpest anti-pattern to name for the build lane
   specifically**, because it's the most tempting thing to copy — a checklist ("✓ AI Import,
   ✓ Automations, ✗ API access, ✗ Zapier access") reads as good, legible design and is exactly
   the capability-gating-by-tier shape laws 76/78/81 forbid (migration 0105 exists to delete a
   cap built this way once, per §5's note). If a tier's included-features list is shown at all,
   it must be prose describing what the tier covers for billing purposes, never a per-capability
   checkmark grid a later lane could mistake for — or literally wire into — a gate.

---

## Flags for the P4 design / owner — not applied here

Recorded so the design lane or the owner can rule on them before the affected build lane starts;
nothing in this file changes `p4-design-2026-08-27.md` or its annexes.

1. **§4 B reject-reason: recommend requiring non-empty text**, UI-gated (Confirm disabled until
   filled), matching the Dribbble pattern over Braintrust's optional one — see §2 takeaway 3
   above. The design's own text is silent on required-vs-optional.
2. **§4 B: recommend explicitly ruling out bulk approve/reject and a filter toolbar for v1** —
   Deel's pattern doesn't fit a queue gated to one operator firm making individually-receipted
   `_create_firm_core` decisions. See §2 takeaway 4.
3. **§5 ask 3 / `firm_invites_visible`: no delivery-status column exists**, so a "Delivered"
   badge (Krea AI's pattern) cannot be built honestly against the current ask — only invite
   lifecycle `status` can render. Flagged in case a later ask wants real delivery telemetry;
   nothing to change in P4 as designed. See §3 takeaway 3.
4. **§5 ask 3 is single-email per call** — flagging so no build lane adds a comma-separated
   multi-invite input (Tailscale's pattern) against a signature that doesn't support it. See §3
   takeaway 6.
5. **Component gap: no dropdown/overflow-menu primitive in `apps/web/components/ui/` yet.**
   Recommend inline per-row action buttons (Revoke, Copy link) for the invite list rather than
   introducing one mid-P4. See §3 takeaway 5.
6. **§4 F / owner question 5: recommend the Asana two-card pairing** (read-only Plan details +
   an inert Contact-support/contact-operator card) over a single disabled-button plan card, for
   the fake-control reason in §4 takeaway 1.
7. **`.mcp.json` does not yet carry a `mobbin` server entry** (checked this session — only
   `codebase-memory-mcp` and `shadcn` are registered). The original P4 design's §11 recorded
   that R5 already approved adding it, "doing that in the same sitting makes this reproducible
   for every later lane" — that addition did not happen in this lane (this session's Mobbin
   access came from the dispatching session's own MCP config, not a repo-committed one) and
   remains open for whoever holds the credential/command to add it.

---

## Companions

`docs/plan/active/p4-design-2026-08-27.md` (design of record, ruling document — §11 is what
this file closes) · its annexes `p4-design-2026-08-27-annex.md` (evidence, doors) and
`p4-design-2026-08-27-annex-2.md` (frontend execution, routes, gates, battery).
