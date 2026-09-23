import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ACTIVITY_CLIENTS } from "./activity-mock.mjs";
import { signIn } from "./helpers";
import { WORK_LIST_CLIENTS } from "./work-list-mock.mjs";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const E2E_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * THE SHARED CLIENT REGISTER, READ FROM THE FIXTURE ITSELF (#619's population cell).
 *
 * This cell asserted a LITERAL FOUR rows. `serve-built.mjs`'s `clients` array is the ONE
 * unfiltered register every walk shares, and it GROWS: #632 appended two, #641 appended three and
 * #633 appended one, so the literal was stale by three before this wave and by four after it —
 * red on `origin/main` for reasons nowhere in any of those diffs (#625's own report and its
 * adversarial review both recorded it and both correctly ruled it out of their scope).
 * `origin/main` has since re-typed that literal as SEVEN (#816); this derivation supersedes it,
 * and it is the ONE population assertion this cell carries — a second literal beside it would go
 * stale again on the next lane that appends.
 *
 * A HARD-CODED COUNT CANNOT PROVE THIS CELL'S OWN TITLE. "Exactly this firm's own clients" is a
 * claim about the register, so the expectation is derived from the register: the literal rows in
 * that array plus the rows of every lane export it splices. The isolation half below is what
 * carries the "no sibling lane's client leaks in" weight — a lane that ANSWERED the unfiltered
 * read instead of appending to it would show up as a row this derivation never named, and the
 * count assertion fires on it.
 */
const SPREAD_FIXTURES: Record<string, ReadonlyArray<{ name: string }>> = {
  ACTIVITY_CLIENTS,
  WORK_LIST_CLIENTS,
};

function sharedRegisterNames(): string[] {
  const source = readFileSync(join(E2E_DIR, "serve-built.mjs"), "utf8");
  const block = /\nconst clients = \[\n([\s\S]*?)\n\];\n/.exec(source);
  if (block === null) {
    throw new Error("serve-built.mjs no longer declares `const clients = [ … ];` — this cell reads that array as the shared register");
  }
  const body = block[1]!;
  const names = [...body.matchAll(/name:\s*"([^"]+)"/g)].map((m) => m[1]!);
  for (const spread of body.matchAll(/\.\.\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
    const rows = SPREAD_FIXTURES[spread[1]!];
    if (rows === undefined) {
      throw new Error(`the shared register splices ${spread[1]}, which this cell cannot resolve — import that lane's export and add it to SPREAD_FIXTURES above`);
    }
    names.push(...rows.map((row) => row.name));
  }
  return names;
}

test("operator owner sees the full sidebar and reaches Members in two navigation clicks", async ({ page }) => {
  await signIn(page, "owner@example.test");
  const nav = page.getByRole("navigation", { name: "Main" });

  await expect(nav.getByRole("link", { name: "Home", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Clients", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Work", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Activity", exact: true })).toBeVisible();
  // #615 — the operator support destination is firm-altitude and owner+operator-floored, so THIS
  // persona (and only this one) is offered it; the bookkeeper cell below drives the absence.
  await expect(nav.getByRole("link", { name: "Operator", exact: true })).toBeVisible();
  // "Needs you" is no longer a sidebar destination of its own — #614 folded it
  // into Work as a saved view (/work?view=needs-you), reached from Work's own
  // view strip rather than from a second sidebar row.
  await expect(nav.getByRole("link", { name: "Needs you", exact: true })).toHaveCount(0);

  await nav.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
  // The settings sections are cards on the hub, not sidebar rows — the
  // sidebar's Settings entry is one destination, and its sections are the
  // CONTENTS of that destination (components/settings/settings-hub.tsx).
  // Asserted on each card's own `<h2>`, not the wrapping `<Link>` — the link's
  // accessible name is its whole card (title AND description concatenated),
  // and several descriptions say "firm" in passing, which would make a
  // substring match on the link's name ambiguous for the "Firm settings"
  // section. "Firm" -> "Firm settings", "Compliance" -> "Compliance
  // register", "Registrations" -> "Firm registrations": the card label now
  // reads exactly what the destination's own `<h1>` says (pinned below for
  // "Firm settings"). "Members" is unchanged.
  const heading = (name: string) => page.getByRole("heading", { name, exact: true, level: 2 });
  await expect(heading("Members")).toBeVisible();
  // #615 — "Firm registrations" is no longer a settings card: the queue moved to /operator.
  await expect(heading("Firm registrations")).toHaveCount(0);
  await expect(heading("Compliance register")).toBeVisible();
  await expect(heading("Vendor identity bindings")).toBeVisible();
  await expect(heading("Firm settings")).toBeVisible();

  // Clicking anywhere inside the card's `<Link>` navigates — the heading is a
  // descendant of it, and a click there bubbles to the anchor exactly as a
  // click anywhere else in the card would.
  await heading("Members").click();
  await expect(page).toHaveURL(/\/settings\/members$/);
  await expect(page.getByRole("heading", { name: "Members", level: 1 })).toBeVisible();

  await nav.getByRole("link", { name: "Home", exact: true }).click();
  await page.keyboard.press("Control+K");
  await page.getByPlaceholder("Search or ask Clara…").fill("members");
  await expect(page.getByRole("option", { name: "Members", exact: true })).toBeVisible();
  await page.getByRole("option", { name: "Members", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/members$/);
});

test("bookkeeper sidebar shows viewer/bookkeeper reads and hides admin- and owner-only destinations", async ({ page }) => {
  await signIn(page, "bookkeeper@example.test");
  const nav = page.getByRole("navigation", { name: "Main" });

  // #614 retired the "Admin"/"Firm" rank-shaped rename outright (E-7 / 裁-187's
  // predecessor problem) — the destination is "Settings" at every rank, so
  // neither retired label may resurface for a bookkeeper or for anyone else.
  await expect(nav.getByRole("link", { name: "Settings", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Firm", exact: true })).toHaveCount(0);
  // #615 — ABSENT, not disabled: a bookkeeper is below the owner floor AND outside the operator
  // conjunct, and a greyed row would still assert the destination exists.
  await expect(nav.getByRole("link", { name: "Operator", exact: true })).toHaveCount(0);

  await nav.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  // Asserted on each card's own `<h2>` — see the operator-owner test above
  // for why the wrapping `<Link>`'s own accessible name is not the right
  // subject here. "Firm" -> "Firm settings", "Compliance" ->
  // "Compliance register", "Registrations" -> "Firm registrations" — the
  // same rename the operator-owner test above documents.
  const sectionHeading = (name: string) => page.getByRole("heading", { name, exact: true, level: 2 });
  await expect(sectionHeading("Compliance register")).toBeVisible();
  await expect(sectionHeading("Vendor identity bindings")).toBeVisible();
  await expect(sectionHeading("Firm settings")).toBeVisible();
  await expect(sectionHeading("Members")).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// E-7 / CB-AE2E-014 / CB-AE2E-033 — a bookkeeper's DOM and accessibility tree
// carry NO control their rank cannot use.
//
// Asserted BY ROLE and BY TEXT, deliberately both. A role query answers "is
// there a button the assistive tree exposes"; a text query answers "is the
// STRING anywhere on the page". A control rendered as a non-button, or a label
// left behind in a disabled span, would slip past one of the two.
// ---------------------------------------------------------------------------

test("a bookkeeper reaches /settings/members by URL and is offered NO role menu and NO invite trigger", async ({ page }) => {
  await signIn(page, "bookkeeper@example.test");
  await page.goto("/settings/members");
  // The ROSTER read is bookkeeper+, so the page is not empty — which is what
  // makes every absence below a finding rather than a blank screen.
  await expect(page.getByRole("heading", { name: "Everyone with access", level: 2 })).toBeVisible();
  await expect(page.getByText("E2E Bookkeeper")).toBeVisible();

  await expect(page.getByRole("button", { name: /^Actions for / })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Invite someone", exact: true })).toHaveCount(0);
  await expect(page.getByText("Admin or owner can invite someone")).toHaveCount(0);
  await expect(page.getByText("Remove from firm")).toHaveCount(0);

  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, "/settings/members as a bookkeeper").toEqual([]);
});

test("an owner IS offered the role menu on the same page — the gate shapes by rank, it does not delete the control", async ({ page }) => {
  await signIn(page, "owner@example.test");
  await page.goto("/settings/members");
  await expect(page.getByRole("button", { name: /^Actions for / })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Invite someone", exact: true })).toBeVisible();

  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, "/settings/members as an owner").toEqual([]);
});

test("the high-stakes threshold control is GONE from /settings/firm for every rank (裁-187)", async ({ page }) => {
  for (const email of ["owner@example.test", "bookkeeper@example.test"]) {
    await signIn(page, email);
    await page.goto("/settings/firm");
    await expect(page.getByRole("heading", { name: "Firm settings", level: 1 })).toBeVisible();
    // BY ROLE and BY TEXT — 裁-187 retired the verb and its control outright,
    // so neither a live trigger nor a leftover label may survive anywhere.
    await expect(page.getByRole("button", { name: "Change threshold", exact: true })).toHaveCount(0);
    await expect(page.getByText("Change threshold")).toHaveCount(0);
    await expect(page.getByText(/the amount above which a posting needs a second person's approval/)).toHaveCount(0);
    // …and the page says what replaced it, rather than going silent — but only
    // as much as is TRUE in the pre-裁-188 window. `_approve_entry_core` (LIVE,
    // 0016:1425-1443) still raises CLR05 on a solo high-stakes approval, so the
    // page names the retirement of the CONTROL and the survival of the WALL.
    await expect(page.getByText(/Change-threshold control is retired/)).toBeVisible();
    await expect(page.getByText(/still refuses a solo approval on a high-stakes entry/)).toBeVisible();

    const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(result.violations, `/settings/firm as ${email}`).toEqual([]);
    await page.context().clearCookies();
  }
});

// #921 [0273]: migration 0273 revoked clara_authenticated's EXECUTE on
// propose_vendor_identity_binding and sign_vendor_identity_binding OUTRIGHT, for every rank — D6
// keeps only historical receipts (list/get) and the ability to close an in-flight LIVE binding
// (revoke). Unlike the threshold control above (a rank-shaped retirement), this one is
// UNCONDITIONAL: an owner, who used to clear both the propose AND the sign floor, is asserted
// identically to a bookkeeper. `page.route` stubs `list_vendor_bindings`/`get_vendor_binding`
// the same way the E-3/E-2 block below stubs its own reads — the shared mock never carried this
// RPC (the panel is client-scoped and no walk drove it before this cell).
test("the vendor-bindings panel offers NO propose or sign control at any rank — the doors are revoked, not merely rank-gated", async ({ page }) => {
  const bindingRow = {
    binding_id: "22222222-2222-4222-8222-222222222222",
    counterparty_id: "33333333-3333-4333-8333-333333333333",
    counterparty_name: "Example Supplier Sdn Bhd",
    status: "live",
    f1_vendor_name_norm: "example supplier sdn bhd",
    f2_invoice_prefix: "INV-E",
    registration_at_signing: "202401011111",
    signed_by: "44444444-4444-4444-8444-444444444444",
    signed_at: "2026-01-02T00:00:00Z",
    expires_at: "2026-12-31T00:00:00Z",
    evidence_count: 3,
    resolution_count: 1,
    divergence_documents: 0,
  };
  await page.route("**/e2e-supabase/rest/v1/rpc/list_vendor_bindings", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([bindingRow]) }));

  for (const email of ["owner@example.test", "bookkeeper@example.test"]) {
    await signIn(page, email);
    await page.goto("/settings/vendor-bindings");
    await expect(page.getByRole("heading", { name: "Vendor identity bindings", level: 1 })).toBeVisible();
    await page.getByLabel("Client").selectOption({ label: "Rome Properties" });
    // exact: true — the row's own fingerprint line ALSO carries this name, lowercased, inside
    // `Vendor name "example supplier sdn bhd" · invoice prefix …`, and Playwright's getByText is
    // a case-insensitive substring match by default, so the un-exact query hits both.
    await expect(page.getByText("Example Supplier Sdn Bhd", { exact: true })).toBeVisible();

    // BY ROLE and BY TEXT, both personas — #921's own retirement, not a rank floor.
    await expect(page.getByRole("button", { name: "Propose binding", exact: true })).toHaveCount(0);
    await expect(page.getByText("Propose binding")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Sign", exact: true })).toHaveCount(0);
    await expect(page.getByText("Sign this vendor identity binding")).toHaveCount(0);
    // D6 keeps the ability to close an in-flight LIVE binding — Revoke stays offered.
    await expect(page.getByRole("button", { name: "Revoke", exact: true })).toBeVisible();

    const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(result.violations, `/settings/vendor-bindings as ${email}`).toEqual([]);
    await page.context().clearCookies();
  }
});

// ---------------------------------------------------------------------------
// E-3 / E-2 — the two surfaces the owner reported as contentless.
//
// Both fixtures are installed with `page.route` rather than by editing
// `e2e/serve-built.mjs`: the shared mock is a merge surface every lane in this
// sprint touches, and a spec that carries its own rows cannot collide with one.
// ---------------------------------------------------------------------------

const CLIENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/** One `open_question` row carrying every column the row now renders. */
function reviewQueueEnvelope(agedSince: string) {
  return {
    watermark: "w1",
    counts: {
      ready: 0, needs_review: 0, needs_you: 1, open_drafts: 0,
      open_questions: 1, open_tasks: 0, compliance_watches: 0, lint_findings: 0,
    },
    sweep: { open_run: false, last_finalized_at: null, last_ack_at: null },
    rows: [{
      row_kind: "open_question", section: "needs_you", client_id: CLIENT_ID, counterparty_id: null,
      filing_id: null, entry_id: null, question_id: "11111111-1111-4111-8111-111111111111",
      task_id: null, document_id: null, lane: "needs_you", auto: true, rule_backed: true,
      high_stakes: false, aged_since: agedSince, amount_cents: null, period: null,
      question_text: "Which account should this bank fee post to?",
      created_at: agedSince, id: "11111111-1111-4111-8111-111111111111",
      coding_kind: null, watch_id: null, tier: null, finding_id: null, asset_id: null,
      advance_id: null, client_name: null, batch_ids: null, open_proposal_count: null,
    }],
    next_cursor: null,
  };
}

test("a Needs-you row answers WHAT, WHY, NEXT and WHEN on the built app", async ({ page }) => {
  const sixDaysAgo = new Date(Date.now() - 6 * 86_400_000 - 60_000).toISOString();
  await page.route("**/e2e-supabase/rest/v1/rpc/list_review_queue", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(reviewQueueEnvelope(sixDaysAgo)) }));
  // The two 0137 gap reads NeedsYouGaps performs. The shared mock does not
  // answer them (this page had no walk before), so they are stubbed empty here
  // rather than left to 404 into an error banner that would drown the row.
  for (const relation of ["firm_open_questions_visible", "client_identifier_promotions_visible"]) {
    await page.route(`**/e2e-supabase/rest/v1/${relation}**`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  }

  await signIn(page, "owner@example.test");
  // #614: the cross-client review queue is no longer its own route — it is
  // Work's saved "Needs you" view (lib/navigation/legacy-routes.ts redirects
  // the old /needs-you here).
  await page.goto("/work?view=needs-you");

  // WHAT — the client's own NAME, merged from the register (`clients` in the
  // shared mock: CLIENT_A is "Rome Properties"). Before this train the
  // cross-client queue never named the client at all. The row's own rendering
  // is unchanged by #614 (components/firm/needs-you-row.tsx) — only the route
  // it lives on moved.
  await expect(page.getByText(/Client: ?Rome Properties/)).toBeVisible();
  await expect(page.getByText("Open question").first()).toBeVisible();
  // WHY — the derived sentence and the two flag chips.
  await expect(page.getByText("Clara could not settle this on its own, so it is waiting on a person.")).toBeVisible();
  await expect(page.getByText("Clara raised this unattended")).toBeVisible();
  await expect(page.getByText("A saved coding rule already matched")).toBeVisible();
  // NEXT — the owning-tab link, named as the action it is.
  await expect(page.getByText("Next:")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the documents tab" })).toBeVisible();
  // WHEN — the age, never a deadline this queue does not have.
  await expect(page.getByText("Waiting 6 days")).toBeVisible();

  // The sweep panel now sits BELOW the queue, leads with a definition, and no
  // longer points at a message nothing produces.
  await expect(page.getByText(/A sweep is one unattended pass/)).toBeVisible();
  await expect(page.getByText(/never produced by the agent runtime/)).toBeVisible();
  await expect(page.getByText("acknowledge the run there")).toHaveCount(0);

  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, "/work?view=needs-you").toEqual([]);
});

// #614: the agent-task queue (and its "Details" drawer) moved from /activity
// to /work — /activity is an audit trail of what already happened again, and
// the live queue of what is running now lives where the rest of "what is
// open" lives. See lib/navigation/tree.ts's own header and
// app/(firm)/activity/page.tsx / app/(firm)/work/page.tsx for the split.
//
// #632 TRUED: this cell used to prove "no agent-task panel" by checking the
// OLD placeholder page's own copy ("Everything that happened" / "has not been
// connected") — a proxy that was true only because the real feed did not
// exist yet. CB-AE2E-018 is discharged now (the real feed replaces that
// NotBuiltNote entirely), so the positive evidence this cell rests on is the
// REAL page's own heading and empty-state copy; the negative claims this cell
// actually exists for (no agent-task panel, no Details drawer) are unchanged
// and still asserted below.
test("/activity is an audit trail again — no agent-task panel, no Details button", async ({ page }) => {
  await page.route("**/e2e-supabase/rest/v1/agent_receipts_visible**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route("**/e2e-supabase/rest/v1/rpc/list_activity", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rows: [], next_cursor: null, truncated: false }) }));

  await signIn(page, "owner@example.test");
  await page.goto("/activity");

  // The real, unified feed (#632) — an h1, not the old placeholder's h2.
  await expect(page.getByRole("heading", { name: "Activity", level: 1 })).toBeVisible();
  await expect(page.getByText("No activity has been recorded for this firm yet.")).toBeVisible();

  // THE RETIRED ENTRY: the drawer and its trigger are gone from THIS page —
  // BY ROLE and BY TEXT, so neither a live trigger nor a leftover label may
  // survive here.
  await expect(page.getByRole("button", { name: "Details", exact: true })).toHaveCount(0);
  await expect(page.getByText("Agent task detail")).toHaveCount(0);

  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, "/activity").toEqual([]);
});

test("/work opens the agent-task drawer and logs NO MISSING_MESSAGE", async ({ page }) => {
  const consoleText: string[] = [];
  page.on("console", (msg) => consoleText.push(msg.text()));

  await page.route("**/e2e-supabase/rest/v1/agent_tasks_visible**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{
        id: "3f2a1b8c-0000-4000-8000-000000000001",
        kind: "autodraft", status: "running", client_id: CLIENT_ID,
        error_code: "timeout",
        created_at: "2026-09-01T02:00:00Z", updated_at: "2026-09-02T03:30:00Z",
        cancelled_by: null, cancelled_at: null,
        session_id: "5e551011-0000-4000-8000-000000000003",
        created_by: "11111111-0000-4000-8000-000000000004",
      }]),
    }));
  await page.route("**/e2e-supabase/rest/v1/agent_receipts_visible**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route("**/e2e-supabase/rest/v1/rpc/list_review_queue", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        watermark: "w2",
        counts: { ready: 0, needs_review: 0, needs_you: 0, open_drafts: 0, open_questions: 0, open_tasks: 0, compliance_watches: 0, lint_findings: 0 },
        sweep: { open_run: false, last_finalized_at: null, last_ack_at: null },
        rows: [],
        next_cursor: null,
      }),
    }));

  await signIn(page, "owner@example.test");
  await page.goto("/work");

  // THE DRAWER. Discriminating: its fields must be absent before the click.
  await expect(page.getByText("Agent task detail")).toHaveCount(0);
  await page.getByRole("button", { name: "Details", exact: true }).click();
  await expect(page.getByText("Agent task detail")).toBeVisible();
  await expect(page.getByText(/ran past its time limit and was stopped/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the client" })).toBeVisible();
  await expect(page.getByText(/no read joins a task id to the receipts/)).toBeVisible();

  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, "/work with the task drawer open").toEqual([]);

  // Escape, not a click on "Close": `DialogContent` ships its own icon-only
  // dismiss whose accessible name is ALSO "Close", so a role+name click is a
  // strict-mode violation between the footer button and the corner X (measured
  // — this is what the first run of this walk failed on). Escape drives the
  // dialog's real dismiss path and needs no disambiguation.
  await page.keyboard.press("Escape");
  await expect(page.getByText("Agent task detail")).toHaveCount(0);

  // H-25: the walk that minted this saw MISSING_MESSAGE four times on this
  // page, all from `CodingQuestionsSignals.agentTasks.loading`.
  const missing = consoleText.filter((line) => /MISSING_MESSAGE/.test(line));
  expect(missing, `console MISSING_MESSAGE on /work:\n${missing.join("\n")}`).toEqual([]);

  // POSITIVE CONTROL for the collector itself. A console assertion that has
  // never been SEEN to catch anything is an assumption — this proves the
  // listener above really does observe this page's console.
  await page.evaluate(() => console.log("MISSING_MESSAGE probe: the collector is live"));
  await expect
    .poll(() => consoleText.filter((line) => /MISSING_MESSAGE/.test(line)).length)
    .toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// #619 (AC2) — the client register is a NAMED, scoped table: population, isolation from a
// sibling lane's own fixtures, and an honest empty state. `client-register-list.tsx`'s
// `DataTableCard` had no `label` before this ticket (the journals table was the only one of
// ~twenty call sites that did) — a screen reader announced it as an unnamed table two
// landmarks under the page's own <h1>, which is exactly the gap 裁-190's own header names.
// ---------------------------------------------------------------------------

test("the client register is a named table whose population is EXACTLY this firm's own clients — no sibling lane's client leaks in", async ({ page }) => {
  await signIn(page, "owner@example.test");
  await page.goto("/clients");

  // NAMED — a screen reader announces this table by what it holds, not as an anonymous
  // region two landmarks under the page's own <h1> (which reads "Clients" too, so a scoped
  // selector is the only way to tell the table from the page).
  const table = page.getByRole("table", { name: "Clients" });
  await expect(table).toBeVisible();

  // POPULATION — exactly the shared mock's own unfiltered register (`serve-built.mjs`'s `clients`
  // array), derived from that array rather than counted here: its own two literal rows plus every
  // lane export it splices. No more and no fewer, whichever lane appended last.
  const register = sharedRegisterNames();
  expect(
    register.length,
    "the derivation read no rows out of serve-built.mjs's shared register — the assertions below would be vacuous",
  ).toBeGreaterThan(3);
  await expect(table.locator("tbody tr")).toHaveCount(register.length);
  for (const name of register) {
    await expect(table.getByRole("link", { name, exact: true })).toBeVisible();
  }

  // ISOLATION — every OTHER lane mock's own client exists only behind that lane's own
  // ID-SCOPED handler (`e2e-fixture-ownership.test.ts`'s N4/N5 rule: the UNFILTERED
  // `/rest/v1/clients` read is the register every walk shares, and a lane fixture that
  // answered it would replace this one). None of these names was ever spliced into the
  // shared register, so none may appear on the ONE page that reads it unfiltered.
  await expect(page.getByText("L7 CLOSE FIXTURE")).toHaveCount(0);
  await expect(page.getByText("PENANG SPICE TRADING")).toHaveCount(0);
  await expect(page.getByText("ROME PUBLIC ADVISORY")).toHaveCount(0);

  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, "/clients, populated").toEqual([]);
});

test("an empty firm's client register shows the labelled empty state, never an empty table", async ({ page }) => {
  await page.route("**/e2e-supabase/rest/v1/clients**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));

  await signIn(page, "owner@example.test");
  await page.goto("/clients");

  await expect(page.getByText("No clients are visible to this firm yet.")).toBeVisible();
  await expect(page.getByRole("table", { name: "Clients" })).toHaveCount(0);

  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, "/clients, empty firm").toEqual([]);
});
