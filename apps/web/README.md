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
| Client | `/clients/:clientId` (its Home board opens on the Work attention band — Works waiting on a person, queued/running, and finished in the last seven `Asia/Kuala_Lumpur` calendar dates — each count a link into that client's own Work list, narrowed as closely as that list's own axes allow (the recent-success drilldown is the same week over a different subject, which the tile discloses; see below); the close section reserves the readiness slot with a "measured by #677" note rather than estimating it) plus `/work`, `/documents`, `/accounting`, `/knowledge` (+`/:recordId`; #644, and `/knowledge/parties/:counterpartyId` — one counterparty's identity, its source, its correction history and its merge lineage; #647), `/reports`, and the accounting workbenches `/journals`, `/bank`, `/registers`, `/close`, `/tax`, plus `/plans` (+`/new`, `/:planId`, `/:planId/revise`; #640), `/accounting/adjustments` (+`/new`; #643) and `/registers/assets/:assetId` (#639 — one fixed asset's own address: its acquisition, its source and value, the depreciation particulars it may still be waiting on, the schedule they produce and its correction history; the register LIST stays at `/registers?tab=fixedAssets`) | The client workspace and its accounting workbenches |
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

The browser reads allowed tables and views through [`lib/read.ts`](lib/read.ts) and calls governed Postgres functions through [`lib/doors.ts`](lib/doors.ts). Runtime requests go through the same-origin `/api/runtime/*` proxy. Firm scope is established by [`app/(firm)/layout.tsx`](app/%28firm%29/layout.tsx), which also renders the one navigation surface — sidebar, scope switcher and breadcrumb — from the registry in [`lib/navigation/tree.ts`](lib/navigation/tree.ts); client scope is activated by [`app/(firm)/clients/[clientId]/layout.tsx`](app/%28firm%29/clients/%5BclientId%5D/layout.tsx), which renders no chrome of its own and publishes the client's name to that shell. UI code renders database amounts and refusals as returned and re-reads authoritative state after governed writes.

The interface uses `next-intl` with a static English locale, semantic tokens from [`app/globals.css`](app/globals.css), local Source Sans 3 and Source Serif 4 assets, and shadcn/Base UI primitives. The beta is light-theme only.

Some routes intentionally show an unavailable or not-built state where a product capability is incomplete. Delivery scope and ordering belong in GitHub specs and implementation issues; do not infer completeness from the presence of a page or button.

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
  than live-looking-and-inert. 0204 raises at this arity and never returns it as a success, so the
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
  pays four (the masked intake view, this client's filings, the unassigned set and
  `caller_context`) and keeps the last three as a derivation; each tick re-reads the
  masked view alone through `refreshIntakeReceipts` and rebuilds the rows against that
  derivation, and the full four are paid again exactly once, on the tick where the batch
  settles. Until fix round 1 the tick re-ran the whole derivation — up to four reads a
  tick under the caller's own JWT, the heaviest of them a SECURITY INVOKER RPC.
- *Filed to this client* — unchanged.

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
