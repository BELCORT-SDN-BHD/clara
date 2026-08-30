# P4 work orders — the shared preamble, plus P4-1 … P4-5 and P4-D

*Companion to [`fe-train-plan-2026-08-30.md`](fe-train-plan-2026-08-30.md) (the shape and the
reasoning) and [`fe-train-plan-2026-08-30-orders-p6.md`](fe-train-plan-2026-08-30-orders-p6.md).
Each order below is self-contained per `.claude/rules/handoffs.md` — files, commands, acceptance —
and inherits §0 verbatim. **Nothing here is a session-local pointer:** every resume path names a
file, a document or a command.*

---

## 0 · THE SHARED PREAMBLE — every P4 order inherits this in full

### 0.1 Read first, in this order

`AGENTS.md` (the fourteen hard constraints — they outrank this order) · `apps/web/AGENTS.md` (the
house laws: `getRows`/`callDoor`, the blessed `sessionTokenAccessor` singleton, verbatim
`DoorRefusal`, no optimistic UI, next-intl for every string, semantic tokens only, and the **two
dialog-testing laws**) · `apps/web/README.md` · [`fe-train-plan-2026-08-30.md`](fe-train-plan-2026-08-30.md)
§1 and §2 · [`p4-design-2026-08-27.md`](p4-design-2026-08-27.md) (the design of record; **where it
and this order disagree, the design governs**) · [`p4-design-2026-08-27-annex-2.md`](p4-design-2026-08-27-annex-2.md)
§E/§F/§G · [`p4-mobbin-grounding-2026-08-28.md`](p4-mobbin-grounding-2026-08-28.md) (your order
names its section) · the ruling ledgers your order cites.

### 0.2 Ground before you build

Query the codebase graph (`codebase-memory-mcp` — `search_graph` / `query_graph`) before grepping.
Then **rung 0: census your doors at the LIVE body, never at a migration's first `CREATE`.** Two of
P4's doors were replaced after the migration that introduced them — `invite_member`'s live body is
**`0147:372`**, not `0141:348`, and `create_firm`'s is **`0147:497`**. Record, per door: the exact
argument names and types · the return shape · every refusal code it can raise · the grant a firm
session actually holds. A census that disagrees with §1.3 of the plan is a **scope note reported to
the lead**, not a redesign, and not something you work around.

### 0.3 Mechanics

Own worktree, own branch: `git -C C:\Users\zhant\Desktop\clara-rebuild worktree add
.claude\worktrees\<lane> -b <branch> origin/main`. Junction the main checkout's `node_modules` at
the worktree root (`cmd /c mklink /J <wt>\node_modules C:\Users\zhant\Desktop\clara-rebuild\node_modules`).
Remove a junction with `rmdir` **only** — never a recursive delete through one. **No rig and no
docker for P4-1…P4-5** (they touch no migration); **P4-D needs one**, assigned by the lead.

> **MEASURED PRECONDITION — the main checkout cannot supply `apps/web`'s dependencies** (this lane,
> 2026-08-30). `apps/web/node_modules` does **not exist** in `C:\Users\zhant\Desktop\clara-rebuild`,
> and its store genuinely lacks the packages: `ls node_modules/.pnpm` there returns `next@15.5.20`
> (that is **apps/dashboard's** pin) and **zero** entries for `@base-ui/react`, `cmdk`, `next-intl`,
> `@opennextjs/cloudflare`, `wrangler` or `tw-animate-css`. The store being empty of them — rather
> than a link farm being missing over a populated store — is what says this was never installed
> here, not deleted. Several existing lane worktrees DO carry the full tree in their **own**
> `node_modules/.pnpm` (with `next@16.3.3`), so the frontend lanes have been installing per-worktree
> all along. **Consequence: the plain junction recipe will NOT let you run
> `pnpm --filter @clara/web typecheck|lint|test|build`.** Resolve it with the lead before you start
> — junction from a worktree that already has the tree, or get an explicit grant for a scoped
> install. **Do not silently skip the four verify commands**, and do not run a broad `pnpm install`
> against the main checkout on your own initiative (this host filled to 0 bytes twice this week).

Hooks you will hit: no shell file writes (`>`, `>>`, `sed -i`, `cp`, heredoc-to-file) — use
Write/Edit, and scripts via Write then `bash script.sh`; commit subject ≤ 72 chars; `git stash`
forbidden (WIP commits instead); never `git add -A`. **Push early and often** — the branch is the
only thing that survives a lane death. Trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

### 0.4 Verify — the same four commands for every order

```sh
pnpm --filter @clara/web typecheck
pnpm --filter @clara/web lint     # eslint (incl. the Q4 colour ban) + contrast + manifest + selftest
pnpm --filter @clara/web test     # scripts/run-tests.mjs over test/manifest.txt
pnpm --filter @clara/web build    # public-key class gate, then next build
```

**Every new test file MUST be added to `apps/web/test/manifest.txt`**, one path per line,
alphabetical by directory then name — Node 20 does not directory-scan, and
`apps/web/scripts/check-test-manifest.mjs` reds the build on an unenumerated file. **Report your test count
both ways**: the manifest's non-comment line count before and after, and the delta by NAME.

### 0.5 The instrument laws — each one cost a real defect

- **`h.fireEvent` silently no-ops on anything inside an OPEN dialog** (Base UI portals it onto
  `document.body`, outside the delegated-listener tree). Drive every dialog control with
  **`clickButton` from `apps/web/test/hookHarness.ts`** — the one shared instrument; it invokes the
  real handler on the real node and **throws** on a node whose live `disabled` is true, so you
  assert the gate and then act. **Never hand-roll a local copy.**
- **A click test must assert a DISCRIMINATING post-condition** — something true only *after* that
  click. A match that was already true before it is a vacuous green that survives deleting the very
  component the test exists to prove.
- **Loading, empty and error are three DISTINGUISHABLE states.** A spinner over a real 401 and an
  empty table over a failed read are both defects the Wave-A reviews caught by name.
- **RED-before for every wall.** For each refusal you render, write the mutant that makes the cell
  RED and record that you saw it red — an assertion that passes with the component deleted proves
  nothing (review law 2: absence is not evidence).

### 0.6 Design resources — your order NAMES the ones it used

Vendored in `.claude/skills/`: the eight Emil-family skills — **`emil-design-eng`**, **`animate`**,
**`review-animations`**, **`improve-animations`**, **`find-animation-opportunities`**,
**`animation-vocabulary`**, **`apple-design`**, **`ask-sonner`** — plus **`shadcn`**,
**`design-an-interface`**, **`codebase-design`** and **`tdd`**. Session skills: **`impeccable`**
(the per-surface acceptance lens) and **`frontend-design`**. MCP (`.mcp.json`): **`mobbin`**
(reference grounding) · **`shadcn`** (registry queries) · **`codebase-memory-mcp`**.
**Rule:** the report names which skills and which MCP queries the surface actually consumed. A
named-but-unused skill is a false claim; an unnamed-but-used one is unreproducible.

R4's two house state laws bind every new surface: **`StateBanner` over a Toast**, and **prose state
copy over skeletons** (`apps/web/components/common/state.tsx`).

### 0.7 The ladder and the report

build → rung-0 census → own suite green (all four commands) → RED-before proof per wall →
self-review against your order's acceptance list → **REPORT via `SendMessage` to `main`**. Your
plain final text is invisible to the lead. The report carries: tip sha · branch · files · the
rung-0 census table (door → live body → args → refusals → grant) · test counts control vs branch
**by name** · every new door call and its surface · which skills/MCP you consumed · open questions
with your recommendation · **what you could NOT verify and why**. The lead runs the independent
fresh-context review and the cross-model leg; you answer fold rounds on the same branch.

---

## P4-1 · The scope spine — `requireFirmScope()`, one implementation, three entrances

**Branch:** web/p4-1-scope-spine. **Size 0.6. Depends on: nothing. Everything else depends on it.**
**This is judgement logic on its face and takes review law 1's independent pass.**

**Why one file, three callers.** The (full) route group and the runtime API route are **SIBLINGS**
of the (firm) group, not children — a route group adds no URL segment and wraps nothing outside
itself. A check placed only in the firm layout leaves a no-membership session able to reach
/clara/:threadId and the runtime proxy, landing in exactly the NULL-`jwt_firm()` state this train
eliminates (design §4 E).

**Files** — proposed paths in a fence because the NEW ones do not exist yet:

```
apps/web/lib/require-firm-scope.ts           NEW   the ONE check
apps/web/lib/firm/caller-context.ts          NEW   the typed read + its wire-shape pin
apps/web/lib/registration/reads.ts           NEW   the SELF-scope request read
apps/web/app/(firm)/layout.tsx               EDIT  entrance 1 — redirect
apps/web/app/(full)/layout.tsx               EDIT  entrance 2 — redirect
apps/web/app/api/runtime/[...path]/route.ts  EDIT  entrance 3 — 403, never a redirect
apps/web/tests/require-firm-scope.test.ts    NEW   the battery
```

- **require-firm-scope** reads `clara.caller_context` via `getRows` (`0141:544`; self-scoped,
  **0 or 1 row**, columns `user_id, firm_id, firm_name, role, role_rank, is_operator`). It returns
  the context on exactly one row; **on zero rows AND on a failed read it takes the fail-closed
  branch** — both grant nothing.
- The two layouts redirect to /pending on that branch; **the API route returns 403**, because a
  redirect is not an answer to a data request.
- **registration/reads** projects `clara.firm_registration_requests_visible` (`0145:911`), SELF
  scope: `id, applicant, firm_name, note, status, decided_by, decided_at, reason, firm_id,
  created_at`. **`decided_by` is NULL outside the operator scope by design** — render its absence,
  never infer an operator.

**Two exemptions that must stay exempt, and their reasons written in-file** (an unexplained
exemption is what a later lane "fixes"): `apps/web/app/logout/route.ts` is exempt **by necessity**
— a session with no firm must still be able to log out, or the holding state strands exactly the
people it exists for. The invite Route Handler (P4-3's courier) is exempt **on principle** — it calls
`invite_member` as the caller and `_human_ctx(role_rank('admin'))` already raises `CLR04`, so **the
DB is the wall**; adding a scope check would be the courier pretending to be a guard. The rule both
imply: *a surface calls `requireFirmScope()` when it renders or returns firm-scoped data on its own
authority, and does not when a governed door is already the wall.*

**Tests** (in `apps/web/tests/`, both directions, per annex 2 §G): the scope-spine suite proves it
redirects on an **empty** read AND on a **failed** one, at all three entrances, with a **positive
control** that a real membership passes through; the API entrance returns **403**, asserted as a
status, not a redirect; the two exemptions are asserted as exemptions.

**Acceptance.** All four commands green · one implementation, three call sites (assert by reading
the tree, not by claim) · every fail-closed branch has a RED-before mutant · `decided_by`'s NULL
case rendered honestly · the two exemptions carry their reasons in the source.

---

## P4-2 · The entry group — signup, the holding page, invite-accept extended

**Branch:** web/p4-2-entry-group. **Size 1.0. Depends on P4-1 merged.**
**Mobbin grounding: [`p4-mobbin-grounding-2026-08-28.md`](p4-mobbin-grounding-2026-08-28.md) §1.**

**Files:**

```
apps/web/app/(entry)/layout.tsx             NEW    the identity-canvas ground + the white card
apps/web/app/(entry)/login/page.tsx         MOVED  from apps/web/app/login
apps/web/app/(entry)/invite/[token]/page.tsx MOVED from apps/web/app/invite/[token]
apps/web/app/(entry)/signup/page.tsx        NEW
apps/web/app/(entry)/pending/page.tsx       NEW    the FOURTH entry face (裁-2 4b)
apps/web/components/entry/*                 NEW    signup form, pending states, brand lockup
apps/web/lib/identity/doors.ts              NEW    claim_identity + request_firm_registration
apps/web/app/globals.css                    EDIT   the --color-identity-canvas bridge
apps/web/lib/supabase/proxy.ts              EDIT   /signup joins PUBLIC_PATH_PREFIXES (line 42)
```

The layout carries 裁-2 4a's treatment: **card edge by shadow, decorative border only** — never a
new meaning-bearing border, which would face the contrast gate.

**Route-group moves keep every URL byte-identical** (a group adds no segment), so /login and
/invite/:token are unchanged and `PUBLIC_PATH_PREFIXES` needs only /signup appended.
`apps/web/tests/proxy-matcher.test.ts`'s asserted set extends with it, **both ways** — /signup
resolves public and every other new route does not.

**The signup chain** (design §4 A), in order, each step's refusal rendered verbatim:
1. `supabase.auth.signUp` — **email confirmation required** (PRD §8's interim guardrail).
2. `clara.claim_identity(p_display_name text, p_op_key text)` (`0141:250`) — display name from the
   form; **the email comes from the JWT claim, never client input** (`_jwt_email()`, `0141:152`),
   otherwise a caller could claim another person's address. Refusals: `CLR04` agent identity /
   no actor / no verified email claim; `CLR10` missing name, identity already claimed with a
   different email, that email claimed by a different identity.
3. `clara.request_firm_registration(p_firm_name text, p_note text, p_op_key text)` (`0145:370`) →
   `{request_id, status}`. Refuses **`CLR09`** when the actor already belongs to a firm or already
   has an open request — this is the *"I am already staff elsewhere"* case, and it must refuse at
   REQUEST time with a legible message, never be discovered at approval time.
4. Land on `/pending`.

**The holding page** renders exactly three states from the SELF-scope read — pending ·
rejected-with-its-reason · invite-expected — and **nothing else**. From the Mobbin grounding: **no
stepper** (the references' "three steps" are two states dressed up) · **no ETA sentence** (Clara's
queue has no SLA a system enforces; a fabricated duration is constraint 2 extended to time) · **no
cross-sell block** (Airwallex's is the named anti-pattern) · **one action: "Log out"**, secondary
variant — there is no dashboard to return to when `jwt_firm()` is NULL.

**Invite-accept gains one step** and keeps everything P2 built: the click-gate, the hard-coded
`type: "invite"`, the subject-binding check and the `router.replace("/")`. After the password is
set, call `clara.accept_invite(p_token text, p_display_name text, p_op_key text)` (**live body
`0145:694`**) — one transaction through `_claim_identity_core` + `_add_member_core`. **The wall is
that the JWT's verified email equals the invite's email** (`CLR04` *"the signed-in email does not
match this invite"*); `CLR09` covers a non-open or expired invite. Render each verbatim.

**Tokens** (`globals.css`). Add the `--color-identity-canvas` bridge inside `@theme inline`. The
existing comment block above `:166` cites the token contract twice (§3.1, §3.3) and concludes the
grounding is a founder-approval item — **R2 + 裁-2 ARE that approval**: rewrite the comment so the
citation survives and only its conclusion inverts, dated, naming the ruling. **Deleting it would
erase why the question was open**, which is what makes the next reader re-litigate it.

**Contrast rows.** Add the **ten cream text pairs at threshold 4.5** (annex 1 §C.2 measured all ten
passing, tightest `muted-foreground` at 4.636). **Add NO composited focus rows** — the halo is
still at `/50` on this tip and P6-3 owns the 70% recut; a row at an alpha nothing renders asserts a
composition that does not ship (plan §6 OQ-7).

**Tests.** `signup-a11y` · `signup-keyboard` · `pending-a11y` · **`login-a11y` · `login-keyboard` ·
`invite-accept-a11y` · `invite-accept-keyboard`** — the last four register the two P2 surfaces that
**have never been in either scan** and sit squarely in this train's blast radius. Plus a
door-wrapper suite beside the new identity doors module (wire-shape pinning: exact verb name,
exact argument names, refusal passthrough) and the extended
`apps/web/tests/proxy-matcher.test.ts`.

**Acceptance.** All four commands green · every URL byte-identical after the moves (assert by
route, not by claim) · the three holding states distinguishable, each with a RED-before mutant ·
the email never sourced from form input · the four newly-registered scans green · the `globals.css`
comment rewritten, not deleted.

---

## P4-3 · Members, roles, invites — the roster, the role menu, the dialog, the courier

**Branch:** web/p4-3-members. **Size 1.0. Depends on P4-1 merged.**
**Mobbin grounding: §3.** **The courier is judgement logic and takes review law 1's pass.**

**Files:**

```
apps/web/app/(firm)/admin/members/page.tsx   NEW       the roster route
apps/web/components/admin/*                  NEW       roster table, role control, both dialogs
apps/web/lib/members/reads.ts                NEW       the two visible views
apps/web/lib/members/doors.ts                NEW       the five governed doors
apps/web/app/api/invite/route.ts             NEW       the server-only mail courier
apps/web/components/ui/dropdown-menu.tsx     VENDORED  the row-level role/remove menu
```

**Reads.** `clara.firm_members_visible` (`0141:512`) — `membership_id, user_id, display_name,
email, role, role_rank, status, created_at, removed_at`; **roster is bookkeeper+ and `email` is
NULL below admin+** (a floored column in one view, not two views). Render a null email as an
honest absence with the required rank named — **never a blank cell**, and never a client-side guess
at the caller's rank. `clara.firm_invites_visible` (`0141:532`) — admin+ only, never exposes
`token_hash`; **`status` is EFFECTIVE, computed live off `expires_at`**, so a dead invite reads
`expired` even though no row transitioned.

**Doors, at their LIVE bodies.** `invite_member(text,text,text)` → **`0147:372`** ·
`revoke_invite(uuid,text)` → `0141:466` · `set_member_role(uuid,text,text)` → `0145:592` ·
`remove_member(uuid,text)` → `0005:732` · `add_member(uuid,uuid,text,text)` → `0145:671`.

**Three walls rendered, never pre-empted.**
- **The last-owner wall.** `_tf_guard_last_owner` raises **`CLR09`** when the last non-agent active
  owner would be demoted or removed. **Let the click happen and render the refusal verbatim** —
  pre-disabling would be the UI guessing the DB's answer.
- **The role ceiling** (裁-22's in-tranche ruling). `set_member_role` and `invite_member` both raise
  **`CLR04`** *"cannot assign/invite to a role above your own rank"*, checked against the caller's
  own rank at four entrances. Render verbatim; do not filter the role list client-side to hide it.
- **Every act re-reads the roster.** No optimistic update, ever (`apps/web/AGENTS.md`).

**The courier's ordering is the whole point.** Sending email needs the Supabase service-role key,
which the browser must never hold. The Route Handler (1) verifies the caller's session, (2) calls
`invite_member` **as the caller** so the **DB** performs the authority check, and (3) **only on a
successful return** uses the service key to send. `invite_member` returns
`{invite_id, token_hash, expires_at, token}` — the **plaintext `token` is handed to this caller
exactly once, above persistence** (`0147:420-424`; 裁-16a put only the hash in `op_receipts.result`,
and a replay short-circuits at `_reserve_op` and never re-mints it). **The courier must not log,
persist or return the plaintext** — it goes into the mail body and nowhere else.

**Vendor DropdownMenu** via `pnpm dlx shadcn@latest add dropdown-menu` from `apps/web/`, **strip
every `dark:` class** (light-theme-only, Q4), and both gates pass in the same PR. **Do NOT vendor
RadioGroup** (design §4 F: with tier assignment operator-only, a chooser is a control that cannot
act). **Do NOT vendor Tabs** — `apps/web/components/common/section-tabs.tsx` covers the sections.
From the Mobbin grounding's anti-patterns: **no bulk approve/deny bar** (no plural door exists) and
**no "Delivered" badge** (the DB cannot back a delivery claim).

**Tests.** `members-a11y` · `members-keyboard` · `invite-dialog-a11y` · `invite-dialog-keyboard`
(the focus trap and the escape path are the two that matter) · a door-wrapper suite beside the new
members doors module · a courier suite in `apps/web/tests/` — **the negative is the one
worth writing: the courier sends NO mail when the door refused**, with a positive control proving
the send-observer would have fired.

**Acceptance.** All four commands green · the three walls asserted with RED-before mutants · the
masked email rendered as an absence with its rank named · the plaintext token confirmed absent from
every log, response body and store (grep the diff and say so) · DropdownMenu carries no `dark:`.

---

## P4-4 · The operator approval queue

**Branch:** web/p4-4-registrations. **Size 0.6. Depends on P4-1 merged.** **Mobbin grounding: §2.**

**Files:**

```
apps/web/app/(firm)/admin/registrations/page.tsx    NEW  the operator route
apps/web/components/admin/registrations-queue.tsx   NEW  the queue + approve/reject dialogs
apps/web/lib/registration/doors.ts                  NEW  extends P4-1's registration/reads.ts
```

**Authority.** `approve_firm_registration(uuid,text)` (`0145:766`) and
`reject_firm_registration(uuid,text,text)` (`0145:832`) both floor at **owner+ AND the caller's
firm carrying `is_operator`** — the `set_wake_source_enabled` pattern (`0133:288-291`). The floor
is **owner, not admin**, and it does not move: `0133`'s own comment calls owner rank *"necessary
but not sufficient"*. `uq_firms_one_operator` (`0133:274`) makes that **at most ONE firm in the
estate, ever**, so the console is single-tenant by construction.

**Surface shaping.** The whole surface is **hidden from nav** unless `caller_context.is_operator`
is true and `role_rank >= 3`. Hiding (not disabling) is correct here — it is a whole surface below
the caller's authority, and disabling would be a dead end (design §4 D).

**Approval creates the firm directly.** `_create_firm_core` (`0145:463`) passes the **applicant**
as the actor, not the caller; the admission token never reaches the applicant, so no bearer
credential goes through a browser. The core preserves everything the live `create_firm` body does,
**including opening the `onboarding_plans` firm-scope plan and returning `plan_id` alongside
`firm_id`** — a screen written against an older return shape would silently drop it.

**Rejection is a first-class verb carrying a reason** — required, never optional (the grounding's
own flag), never a silent deletion. The applicant reads that reason on `/pending` (P4-2).

**Named honestly: this console cannot be smoke-tested at this tip.** `clara.firms.is_operator`
exists and **zero firms carry it**; marking BELCORT is ruled onto the **Wave-G setup checklist, in
the same ceremony as 裁-40's four clock switches** (裁-43). That is correct fail-closed behaviour.
**The rung-5 live walk for this train is therefore DEFERRED to that ceremony** and the order says so
rather than claiming a walk it cannot run.

**Tests.** `registrations-a11y` · `registrations-keyboard` · a door-wrapper suite beside the new
registration doors module. The two positive controls that matter, per annex 2 §G:
**a non-operator owner is refused**, and **an
operator-firm admin is refused** — testing only the happy operator path leaves both halves of that
conjunction unproven.

**Acceptance.** All four commands green · both refusal directions proven · the reason field
required in the UI *and* the DB's own refusal rendered verbatim when it is not · `plan_id` consumed
or explicitly recorded as unused · the deferred rung-5 stated in the report, not omitted.

---

## P4-5 · Nav, ⌘K and the admin hub

**Branch:** web/p4-5-nav. **Size 0.3. Depends on P4-2, P4-3 and P4-4 merged.**

Rank-shape `apps/web/components/firm-nav.tsx` (hide below-rank surfaces; the operator console only
on the operator predicate) · turn `apps/web/app/(firm)/admin/page.tsx` from an honest empty state
into the **hub**, using the existing `apps/web/components/common/section-tabs.tsx` · add the new
rows to `apps/web/lib/command/routes.ts`. **The href-resolution gate already exists** —
`apps/web/lib/command/routes.test.ts` (lines 27, 46, 107) derives its oracle from the live app tree
with a vacuity control — so a wrong `href` or a stale `status` goes RED on its own. Add the rows
and let the gate prove them; do not hand-assert.

**Acceptance.** All four commands green · the routes suite passes with the new rows and its vacuity
control still meaningful · `firm-admin-pages-a11y.test.tsx` extended to the hub's new sections ·
nav shaping asserted at each of the four ranks.

---

## P4-D · The DB half P4's tranche carries — 裁-26 and 裁-36

**Branch:** db/p4-admission-and-antiabuse. **Size 0.7. Needs a rig (assigned by the lead).**
**This order does NOT start until its short design sitting closes — see plan §6 OQ-3.**

**Scope.** ① **裁-26** — bind admission tokens to an email **at issue**, so `create_firm`'s token
stops being a pure bearer credential (裁-16 hashed it at rest; it did not change *who* may present
it). ② **裁-36 ①** — the DPA e-signature at signup: **no signature, no firm**, a condition of
creation rather than a follow-up email. ③ **裁-36 ②** — the rate wall: **one firm per email, one
firm per IP per day**. ③ is declined as a *trial quota* by the same ruling — do not build one.

**The unresolved shape, and why this order waits.** `request_firm_registration` takes no IP
argument, and a client-supplied address is not a wall. The two honest shapes are (a) a server-only
Route Handler couriering the proxy-observed address into a new door argument — **the
recommendation**, because it keeps the DB the wall — or (b) the wall in the edge layer with the DB
keeping only the per-email half. **Authoring either before the sitting rules would be a guess
inside a security mechanism**, which constraint 14's operative clause forbids.

**Mechanics.** Author as `packages/db/migrations/UNNUMBERED_<stem>.sql`; **numbers are claimed at
MERGE by the lead**, never at authoring. `.claude/rules/db-migrations.md` and
`.claude/rules/db-tests.md` bind. **`create_firm`'s live body is `0147:497`** — chase it, do not
cite `0145:504`. The PR body **must name each new `clara_authenticated` door's frontend home** (the
裁-7 rule). Same-corpus pair rule: a failing-set diff is evidence only when both sides run the
BRANCH's test files and differ only in whether your migration is applied; diff by NAME both ways.

**Acceptance.** Rig suite green on a pristine replay · a RED-before cell per wall · the prestate
census records the live `create_firm` prosrc sha before and after · the D1 question answered
explicitly (does any live writer body move?) · each new door's frontend home named.
