// ticket 890 — the shared draft rule, read as one contract across all four counterparty door dialogs.
//
// THE RULE, written down once (AddCounterpartyAliasDialog's own header, because the four used to
// differ): a refusal SURVIVES — the human's typed values stay in the fields and the refusal
// renders inside the dialog, because a refusal is asking them to change the thing they typed. A
// SUCCESS DISCARDS the draft — the next open never re-offers a fact that is already recorded. A
// dialog whose fields are the party's CURRENT values (never a new fact) RE-SEEDS them on every
// open, so an abandoned draft (typed, then Escaped or Cancelled) is not silently re-offered, and a
// value corrected a moment ago shows as corrected without waiting for a reload.
//
// SetCounterpartyIdentifiersDialog is already celled for this rule
// (counterparty-identity-correct.test.tsx — "a CANCELLED correction leaves no draft behind" /
// "a REFUSED correction keeps the dialog open with the typed draft intact"). This file adds the
// other three, so the four read as one contract:
//   1. AddCounterpartyAliasDialog — a NEW fact: refusal survives, success discards.
//   2. RetireCounterpartyAliasDialog — no fields at all: a refusal still leaves THIS alias's own
//      dialog open (with the refusal rendered) rather than silently discarding the pending act,
//      and a success writes exactly once against the alias the human actually opened.
//   3. RenameCounterpartyDialog — a CURRENT value, like the identifiers dialog: re-seeds on open,
//      survives a refusal. ticket 890 found it wired to NEITHER (no `refusal` prop, no `onOpened`
//      callback) — its single field never cleared an abandoned draft. This cell pins the fix.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, textOf, clickButton, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { CounterpartyIdentityPanel } from "./counterparty-identity-panel";
import { CounterpartyHygienePanel } from "./counterparty-hygiene-panel";

enableDomInspection();

// A door dialog PORTALS onto document.body (counterparty-identity-correct.test.tsx's own idiom):
// every cell below mounts the container into the body and walks from there, driving controls
// through `clickButton` / `setFieldValue` — delegated dispatch never reaches a portal, so a plain
// fireEvent would click nothing and pass.
type Node = {
  tagName?: string;
  childNodes?: Node[];
  id?: string;
  value?: string;
  disabled?: boolean;
  getAttribute?: (name: string) => string | null;
};
function findIn(root: Node, predicate: (n: Node) => boolean): Node | null {
  if (predicate(root)) return root;
  for (const c of root.childNodes ?? []) {
    const found = findIn(c, predicate);
    if (found) return found;
  }
  return null;
}
function docBody(): Node & { appendChild: (c: unknown) => void } {
  return (globalThis as unknown as { document: { body: Node & { appendChild: (c: unknown) => void } } }).document.body;
}

/** The dialog's own footer (`data-slot="dialog-footer"`) carries Cancel and Confirm at equal
 *  weight — RenameCounterpartyDialog's trigger and confirm share the EXACT SAME label ("Rename"),
 *  so a plain "find a button whose text is X" is ambiguous the moment the dialog is open. Scoping
 *  to the footer is unambiguous regardless of label overlap, and is the same disambiguation this
 *  train's `confirmButton` helpers already rely on for the other three dialogs. */
function footerButtonWithText(body: Node, text: string): Node | null {
  const footer = findIn(body, (n) => n.getAttribute?.("data-slot") === "dialog-footer");
  if (!footer) return null;
  return findIn(footer, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === text);
}

/** The dialog's OWN content (`data-slot="dialog-content"`), scoped away from the panel's page-level
 *  persistent banner (`{read.error ? <ErrorMessage .../> : null}`, counterparty-identity-panel.tsx)
 *  — which renders the SAME refusal text outside every dialog, so a plain `textOf(body)` match
 *  would pass whether or not THIS dialog's own `refusal` prop is wired at all. A vacuity probe
 *  caught exactly that (see the retire-alias cell below): stripping RetireCounterpartyAliasDialog's
 *  `refusal` prop left the body-wide assertion green because the page banner still carried the
 *  words. Scoping to the dialog's own content is what actually pins the dialog-level plumbing. */
function dialogContentText(body: Node): string {
  const content = findIn(body, (n) => n.getAttribute?.("data-slot") === "dialog-content");
  return content ? textOf(content as never) : "";
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function withMockedEnv(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  configureSessionTokenSource(async () => "tok");
  return run().finally(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    resetSessionTokenSource();
  });
}

type H = Awaited<ReturnType<typeof renderComponent>>;
type Seen = { fn: string; body: Record<string, unknown> }[];

// =====================================================================================
// Cells 1 and 2 — AddCounterpartyAliasDialog and RetireCounterpartyAliasDialog, both
// mounted through CounterpartyIdentityPanel, whose `refusal` wiring for both already
// exists (counterparty-identity-panel.tsx:289-303 for add-alias, :134-139 for retire).
// =====================================================================================

const IDENTITY_BASE = {
  client_id: "c1",
  as_of: "2026-09-20T10:00:00",
  current: {
    id: "cp1", kind: "vendor", name: "Acme Sdn Bhd", name_normalized: "acmesdnbhd",
    registration_no: "201801012345", registration_normalized: "201801012345", tin: "C123",
    payment_terms_days: 30, merged_into: null, retired_at: null, canonical_id: "cp1",
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-02-01T00:00:00Z",
  },
  identifier_revisions: [],
  merges: [],
  conflicts: [],
};

const LIVE_ALIAS = {
  id: "al1", alias_display: "Acme Trading", origin: "trade_name", retired_at: null,
  created_by: "u1", created_by_name: "Aisyah", recorded_via: "human_ui",
  created_at: "2026-01-05T00:00:00Z", recorded_basis: null,
  source: { document_id: null, extraction_id: null, region_id: null, field_path: null },
};

function identityMock(
  seen: Seen,
  aliases: unknown[],
  opts: { refuseAdd?: boolean; refuseRetireFirst?: boolean } = {},
): typeof fetch {
  // ticket 890's own lesson: refusing every attempt for good (rather than gating on attempt count, the
  // way `hygieneMock`'s `refuseFirst` below does) drives a cell's OWN "the door eventually
  // accepts" retry into a real, permanent mismatch — and `assert.equal(<a DOM node>, null, …)`
  // failing for real here hangs the whole process (Node's assertion-diff formatter choking on the
  // stub tree's own React-fiber-carrying node object, not a defect in the dialog). Gating on the
  // attempt count, exactly like the rename mock below, is what keeps a retry cell an actual retry.
  let retireAttempts = 0;
  return (async (u: RequestInfo | URL, init?: RequestInit) => {
    const url = String(u);
    const rpc = /\/rest\/v1\/rpc\/([a-z_]+)/.exec(url);
    if (rpc) {
      const fn = rpc[1] ?? "";
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      seen.push({ fn, body });
      if (fn === "get_counterparty_identity") return jsonResponse({ ...IDENTITY_BASE, aliases });
      if (fn === "add_counterparty_alias") {
        if (opts.refuseAdd) {
          return jsonResponse({
            code: "CLR23", message: "an alias with that name already exists for this party",
            details: JSON.stringify({ reason: "alias_collision" }), hint: null,
          }, 400);
        }
        return jsonResponse({ alias_id: "al2", counterparty_id: "cp1" });
      }
      if (fn === "retire_counterparty_alias") {
        retireAttempts += 1;
        if (retireAttempts === 1 && opts.refuseRetireFirst) {
          return jsonResponse({
            code: "CLR23", message: "this alias was already retired",
            details: JSON.stringify({ reason: "already_retired" }), hint: null,
          }, 400);
        }
        return jsonResponse({ alias_id: "al1", status: "retired" });
      }
      throw new Error(`unexpected rpc: ${fn}`);
    }
    if (url.includes("/rest/v1/documents")) return jsonResponse([]);
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
}

function IdentityApp() {
  return createElement(NextIntlClientProvider, {
    locale: "en", messages,
    children: createElement(CounterpartyIdentityPanel, { clientId: "c1", counterpartyId: "cp1" }),
  });
}

async function mountedIdentity(): Promise<{ h: H; body: ReturnType<typeof docBody> }> {
  const h = await renderComponent(IdentityApp());
  const body = docBody();
  body.appendChild(h.container);
  for (let i = 0; i < 8; i++) await h.settle();
  return { h, body };
}

test("ticket 890 cell: AddCounterpartyAliasDialog — a REFUSED confirm leaves the typed alias, origin and basis intact, and a SUCCESSFUL one leaves no draft on the next open", async () => {
  const seen: Seen = [];
  await withMockedEnv(identityMock(seen, [], { refuseAdd: true }), async () => {
    const { h, body } = await mountedIdentity();
    try {
      const trigger = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Add alias");
      assert.ok(trigger, "the Add-alias trigger exists");
      await h.act(async () => { await clickButton(trigger as never); });
      for (let i = 0; i < 4; i++) await h.settle();

      await h.act(() => { setFieldValue(findIn(body, (n) => n.id === "cp-alias-name") as never, "Acme Retail"); });
      // ORIGIN IS DRIVEN OFF ITS DEFAULT, deliberately. AddCounterpartyAliasDialog's success
      // branch resets all three together (`if (ok) { setAlias(""); setOrigin("trade_name");
      // setBasis(""); }`) and origin's default IS "trade_name" — so a mutant that reset origin
      // unconditionally, on refusal as well as on success, would leave this cell green if it
      // only ever typed the two text fields. "former_name" is a value the default cannot hide.
      await h.act(() => {
        setFieldValue(findIn(body, (n) => n.id === "cp-alias-origin") as never, "former_name");
      });
      await h.act(() => {
        setFieldValue(findIn(body, (n) => n.id === "cp-alias-basis") as never, "seen on the delivery order");
      });
      for (let i = 0; i < 2; i++) await h.settle();

      const confirm = footerButtonWithText(body, "Add");
      assert.ok(confirm, "the Add confirm control renders");
      await h.act(async () => { await clickButton(confirm as never); });
      for (let i = 0; i < 8; i++) await h.settle();

      const nameField = findIn(body, (n) => n.id === "cp-alias-name");
      assert.ok(nameField, "ticket 890: a REFUSED add-alias keeps the dialog open");
      assert.equal(nameField.value, "Acme Retail", "ticket 890: the typed alias survives the refusal");
      assert.equal(
        (findIn(body, (n) => n.id === "cp-alias-basis") as Node).value,
        "seen on the delivery order",
        "ticket 890: the typed basis survives the refusal too",
      );
      // ORIGIN IS READ THROUGH THE DOOR, not off the control — MEASURED, not assumed. NativeSelect
      // renders a real `<select>`, and in this harness react-dom never writes `.value` back onto a
      // `<select>` node: the only thing that ever set it was `setFieldValue` itself, so
      // `select.value === "former_name"` stays green even under the exact mutant this assertion
      // exists to catch (`setOrigin("trade_name")` hoisted OUT of the `if (ok)` branch, so a
      // refusal resets origin too). Ran that mutant: 3/3 still passed. The two text fields above
      // are genuine — react-dom does assign `.value` on an `<input>` — but origin has to be asked
      // for where the component's own state is observable: the NEXT attempt's arguments. A second
      // confirm (the human retries without changing anything) must still carry "former_name".
      const firstWrite = seen.filter((w) => w.fn === "add_counterparty_alias");
      assert.equal(firstWrite.length, 1, "exactly one refused attempt so far");
      assert.equal(firstWrite[0]?.body.p_origin, "former_name",
        "the refused attempt carried the chosen origin, not the default");
      assert.equal(firstWrite[0]?.body.p_basis, "seen on the delivery order");

      const retry = footerButtonWithText(body, "Add");
      assert.ok(retry, "the Add confirm control is still there to retry");
      await h.act(async () => { await clickButton(retry as never); });
      for (let i = 0; i < 8; i++) await h.settle();
      const retried = seen.filter((w) => w.fn === "add_counterparty_alias");
      assert.equal(retried.length, 2, "the retry is its own governed call");
      assert.equal(retried[1]?.body.p_origin, "former_name",
        "ticket 890: the chosen origin survives the refusal too — the AC names alias, origin AND basis");
      assert.equal(retried[1]?.body.p_alias, "Acme Retail",
        "…and the retry is still about the alias the human typed");
      assert.equal(retried[1]?.body.p_basis, "seen on the delivery order",
        "…with the basis they stated");
      // Scoped to the DIALOG's own content (not `textOf(body)`) — the panel's page-level standing
      // banner renders the identical text outside every dialog, so a body-wide match would pass
      // whether or not AddCounterpartyAliasDialog's own `refusal` prop is wired at all.
      const dialogText = dialogContentText(body);
      assert.match(dialogText, /already exists for this party/, "the refusal renders verbatim INSIDE the dialog");
      assert.match(dialogText, /CLR23/);
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });

  // The SUCCESS half of the same cell — a fresh mount, this time the door accepts.
  const seenOk: Seen = [];
  await withMockedEnv(identityMock(seenOk, []), async () => {
    const { h, body } = await mountedIdentity();
    try {
      const trigger = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Add alias");
      await h.act(async () => { await clickButton(trigger as never); });
      for (let i = 0; i < 4; i++) await h.settle();
      await h.act(() => { setFieldValue(findIn(body, (n) => n.id === "cp-alias-name") as never, "Acme Retail"); });
      // All THREE fields are driven off their defaults here too, so the success half proves the
      // whole draft is discarded rather than just the one text field the earlier cut checked.
      await h.act(() => {
        setFieldValue(findIn(body, (n) => n.id === "cp-alias-origin") as never, "former_name");
      });
      await h.act(() => {
        setFieldValue(findIn(body, (n) => n.id === "cp-alias-basis") as never, "seen on the delivery order");
      });
      for (let i = 0; i < 2; i++) await h.settle();
      const confirm = footerButtonWithText(body, "Add");
      await h.act(async () => { await clickButton(confirm as never); });
      for (let i = 0; i < 8; i++) await h.settle();

      assert.equal(footerButtonWithText(body, "Add"), null, "the dialog closed on success");

      const reopenTrigger = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Add alias");
      await h.act(async () => { await clickButton(reopenTrigger as never); });
      for (let i = 0; i < 4; i++) await h.settle();
      const reopened = findIn(body, (n) => n.id === "cp-alias-name");
      assert.ok(reopened, "the dialog reopens");
      assert.equal(reopened.value, "", "ticket 890: a SUCCESSFUL add-alias leaves no draft on the next open");
      assert.equal(
        (findIn(body, (n) => n.id === "cp-alias-basis") as Node).value,
        "",
        "ticket 890: the typed basis is discarded too",
      );
      // ORIGIN IS READ THROUGH THE DOOR here too, for the reason the refusal half records: this
      // harness never reflects React's state onto a `<select>`'s `.value`, so reading the
      // reopened control would pass for the wrong reason. The discard is proven where it IS
      // observable — a second add, with ONLY the name typed, must carry the DEFAULT origin,
      // which it cannot if the dialog is still holding the previous "former_name".
      await h.act(() => { setFieldValue(findIn(body, (n) => n.id === "cp-alias-name") as never, "Acme Wholesale"); });
      for (let i = 0; i < 2; i++) await h.settle();
      const secondConfirm = footerButtonWithText(body, "Add");
      assert.ok(secondConfirm, "the Add confirm control renders on the second open");
      await h.act(async () => { await clickButton(secondConfirm as never); });
      for (let i = 0; i < 8; i++) await h.settle();

      const writes = seenOk.filter((s) => s.fn === "add_counterparty_alias");
      assert.equal(writes.length, 2, "one governed call per confirm, never a batch and never a double-fire");
      assert.equal(writes[0]?.body.p_origin, "former_name",
        "the first, accepted call carried the CHOSEN origin — so the reset below is a discard, not a value the door never saw");
      assert.equal(writes[0]?.body.p_basis, "seen on the delivery order");
      assert.equal(writes[1]?.body.p_origin, "trade_name",
        "ticket 890: the chosen origin is discarded too — the second add carries the default again");
      assert.equal(writes[1]?.body.p_basis, null,
        "ticket 890: the typed basis is discarded too — the second add states no basis");
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});

test("ticket 890 cell: RetireCounterpartyAliasDialog — a REFUSED retirement keeps this alias's own dialog open with the refusal rendered, and an accepted one writes exactly once", async () => {
  const seen: Seen = [];
  await withMockedEnv(identityMock(seen, [LIVE_ALIAS], { refuseRetireFirst: true }), async () => {
    const { h, body } = await mountedIdentity();
    try {
      const trigger = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Retire");
      assert.ok(trigger, "the alias's own Retire trigger renders");
      await h.act(async () => { await clickButton(trigger as never); });
      for (let i = 0; i < 4; i++) await h.settle();

      let confirm = footerButtonWithText(body, "Retire alias");
      assert.ok(confirm, "the Retire-alias confirm control renders");
      await h.act(async () => { await clickButton(confirm as never); });
      for (let i = 0; i < 8; i++) await h.settle();

      confirm = footerButtonWithText(body, "Retire alias");
      assert.ok(confirm, "ticket 890: a REFUSED retirement keeps the dialog open");
      // Scoped to the DIALOG's own content — see dialogContentText's own header: the panel's
      // page-level banner renders the identical text outside every dialog, so a body-wide match
      // would pass whether or not RetireCounterpartyAliasDialog's own `refusal` prop is wired at
      // all (a vacuity probe caught exactly that with the unscoped assertion this replaces).
      const dialogText = dialogContentText(body);
      assert.match(dialogText, /already retired/, "the refusal renders verbatim INSIDE the dialog");
      assert.match(dialogText, /CLR23/);
      assert.match(dialogText, /Acme Trading/, "the dialog is still targeting THIS alias, not some other one");

      // Retry — this time the door accepts.
      await h.act(async () => { await clickButton(confirm as never); });
      for (let i = 0; i < 8; i++) await h.settle();
      assert.equal(footerButtonWithText(body, "Retire alias"), null, "the dialog closed on success");

      const writes = seen.filter((s) => s.fn === "retire_counterparty_alias");
      assert.equal(writes.length, 2, "one refused attempt, one that succeeded");
      for (const w of writes) assert.equal(w.body.p_alias, "al1", "every attempt targeted the SAME alias id");
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});

// =====================================================================================
// Cell 3 — RenameCounterpartyDialog, mounted through CounterpartyHygienePanel (its only
// caller). ticket 890's fix.
// =====================================================================================

const VENDOR_BASE = {
  firm_id: "f1", client_id: "c1", kind: "vendor",
  registration_no: null, tin: null, payment_terms_days: null,
  merged_into: null, retired_at: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
};

function hygieneMock(row: { id: string; name: string }, seen: Seen, opts: { refuseFirst?: boolean } = {}): typeof fetch {
  let currentName = row.name;
  let renameAttempts = 0;
  return (async (u: RequestInfo | URL, init?: RequestInit) => {
    const url = String(u);
    if (url.includes("/rest/v1/counterparties")) {
      const m = /kind=eq\.(\w+)/.exec(url);
      const kind = m?.[1] ?? "";
      if (kind === "vendor") {
        return jsonResponse([{ ...VENDOR_BASE, id: row.id, name: currentName, name_normalized: currentName.toLowerCase() }]);
      }
      return jsonResponse([]);
    }
    const rpc = /\/rest\/v1\/rpc\/([a-z_]+)/.exec(url);
    if (rpc) {
      const fn = rpc[1] ?? "";
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      seen.push({ fn, body });
      if (fn === "rename_counterparty") {
        renameAttempts += 1;
        if (renameAttempts === 1 && opts.refuseFirst) {
          return jsonResponse({
            code: "CLR23", message: "the new name collides with an existing identity or alias",
            details: JSON.stringify({ reason: "alias_collision" }), hint: null,
          }, 400);
        }
        currentName = String(body.p_new_name);
        return jsonResponse({ counterparty_id: row.id, name: currentName });
      }
      throw new Error(`unexpected rpc: ${fn}`);
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
}

function HygieneApp() {
  return createElement(NextIntlClientProvider, {
    locale: "en", messages,
    children: createElement(CounterpartyHygienePanel, { clientId: "c1" }),
  });
}

async function mountedHygiene(): Promise<{ h: H; body: ReturnType<typeof docBody> }> {
  const h = await renderComponent(HygieneApp());
  const body = docBody();
  body.appendChild(h.container);
  for (let i = 0; i < 8; i++) await h.settle();
  return { h, body };
}

async function openRename(h: H, body: Node): Promise<void> {
  const trigger = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Rename");
  assert.ok(trigger, "the Rename trigger renders");
  await h.act(async () => { await clickButton(trigger as never); });
  for (let i = 0; i < 6; i++) await h.settle();
}

test("ticket 890 cell: RenameCounterpartyDialog re-seeds its field on open and survives a refusal", async () => {
  const seen: Seen = [];
  await withMockedEnv(hygieneMock({ id: "v1", name: "Old Name Sdn Bhd" }, seen, { refuseFirst: true }), async () => {
    const { h, body } = await mountedHygiene();
    try {
      // 1. Open — the field is seeded with the CURRENT name.
      await openRename(h, body);
      let field = findIn(body, (n) => n.id === "cp-rename-name");
      assert.ok(field, "the rename dialog opens");
      assert.equal(field.value, "Old Name Sdn Bhd");

      // 2. Type a draft, then CANCEL — never submitted.
      await h.act(() => { setFieldValue(field as never, "Abandoned Draft Sdn Bhd"); });
      for (let i = 0; i < 2; i++) await h.settle();
      const cancel = footerButtonWithText(body, "Cancel");
      assert.ok(cancel, "Cancel sits beside Rename in the footer");
      await h.act(async () => { await clickButton(cancel as never); });
      for (let i = 0; i < 6; i++) await h.settle();

      // 3. Reopen — ticket 890: the abandoned draft must be GONE; the CURRENT name is what shows.
      await openRename(h, body);
      field = findIn(body, (n) => n.id === "cp-rename-name");
      assert.ok(field, "the dialog reopens");
      assert.equal(field.value, "Old Name Sdn Bhd", "ticket 890: re-seeded from the live prop, not the abandoned draft");

      // 4. Type a real rename and confirm — the door refuses it.
      await h.act(() => { setFieldValue(field as never, "New Name Sdn Bhd"); });
      for (let i = 0; i < 2; i++) await h.settle();
      let confirm = footerButtonWithText(body, "Rename");
      assert.ok(confirm, "the confirm control renders in the footer");
      await h.act(async () => { await clickButton(confirm as never); });
      for (let i = 0; i < 8; i++) await h.settle();

      field = findIn(body, (n) => n.id === "cp-rename-name");
      assert.ok(field, "ticket 890: a REFUSED rename keeps the dialog open");
      assert.equal(field.value, "New Name Sdn Bhd", "ticket 890: the typed name survives the refusal");
      // Scoped to the DIALOG's own content — see dialogContentText's own header: the panel's
      // page-level banner (counterparty-hygiene-panel.tsx's `{err && <StateBanner>…}`) renders the
      // identical text outside every dialog, so a body-wide match would pass whether or not
      // RenameCounterpartyDialog's own `refusal` prop is wired at all — exactly the wiring ticket 890
      // adds.
      const dialogText = dialogContentText(body);
      assert.match(dialogText, /collides with an existing identity or alias/, "the refusal renders verbatim inside the dialog");
      assert.match(dialogText, /CLR23/);

      // 5. Confirm again — this time the door accepts.
      confirm = footerButtonWithText(body, "Rename");
      assert.ok(confirm);
      await h.act(async () => { await clickButton(confirm as never); });
      for (let i = 0; i < 8; i++) await h.settle();
      assert.equal(footerButtonWithText(body, "Rename"), null, "the dialog closed on success");

      const writes = seen.filter((s) => s.fn === "rename_counterparty");
      assert.equal(writes.length, 2, "one refused attempt, one that succeeded — never a silent retry");
      assert.equal(writes[0]!.body.p_new_name, "New Name Sdn Bhd");
      assert.equal(writes[1]!.body.p_new_name, "New Name Sdn Bhd");
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});
