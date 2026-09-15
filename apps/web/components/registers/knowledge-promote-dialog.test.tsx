// #654 — PROMOTE, the estate's first manual knowledge-capture UI at any scope
// (`clara.capture_knowledge` has had zero callers since 0192 shipped it). Driven
// through the real component against a mocked PostgREST: `KnowledgePromoteDialog`,
// the house door-dialog wrapper, `promoteKnowledgeToFirm` and `useAsyncRead` are
// all REAL; the wire is fake.
//
// THESE CELLS ARE THE PRODUCT CLAIMS #654 MAKES ABOUT THIS ACT:
//   1. the reason is AUTHORED here and required — the confirm cannot fire without
//      it, and it is never pre-filled from the client record's own basis;
//   2. below the admin floor the control is ABSENT and an explanation stands in
//      its place — 裁-187: never offer a control that can only refuse;
//   3. a key the catalog does not admit at firm scope is explained as a fact about
//      one client, not as a permission problem;
//   4. the door is reached with a FRESH op_key, firm scope, no source pins and the
//      typed effective window;
//   5. the effective-FROM default is the DATABASE's Kuala Lumpur date (`as_of`),
//      never `new Date()` in the browser;
//   6. a CLR refusal renders verbatim with its code INSIDE the dialog, and the
//      values the human typed survive it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import messages from "../../messages/en.json";
import { clickButton, renderComponent, setFieldValue, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { KnowledgePromoteDialog, canPromoteToFirm, parseAppliesWhen } from "./knowledge-promote-dialog";
import type { KnowledgeRecordRow } from "../../lib/registers/knowledge";

enableDomInspection();

const CLIENT = "11111111-1111-4111-8111-111111111111";

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

type Node = { tagName?: string; childNodes?: Node[] };
function findIn(root: Node, predicate: (n: Node) => boolean): Node | null {
  if (predicate(root)) return root;
  for (const c of root.childNodes ?? []) {
    const found = findIn(c, predicate);
    if (found) return found;
  }
  return null;
}
function findAllIn(root: Node, predicate: (n: Node) => boolean): Node[] {
  const out: Node[] = [];
  if (predicate(root)) out.push(root);
  for (const c of root.childNodes ?? []) out.push(...findAllIn(c, predicate));
  return out;
}
const attr = (n: Node, key: string): string =>
  String((n as { getAttribute?: (k: string) => string | null }).getAttribute?.(key) ?? "");

function record(over: Partial<KnowledgeRecordRow> = {}): KnowledgeRecordRow {
  return {
    record_id: "rec-1",
    revision_id: "rev-1",
    revision_n: 1,
    scope_kind: "client",
    client_id: CLIENT,
    knowledge_key: "default_currency",
    kind: "assertion",
    value: "MYR",
    applies_when: {},
    applies_when_digest: "d0",
    effective_from: null,
    effective_to: null,
    source_kind: "user_statement",
    trust: "asserted",
    source: { document_id: null, extraction_id: null, region_id: null, field_path: null, work_id: null },
    // THE CLIENT'S OWN NARRATIVE. Cell kp.01 asserts this string never reaches the
    // reason field: a firm rule stands on the firm's own words.
    basis: "the client told us on the phone they present in ringgit",
    asserted_by: "u-1",
    asserted_by_name: "Aisyah Rahman",
    recorded_via: "human_ui",
    recorded_at: "2026-09-12T02:00:00Z",
    knowledge_version: "7",
    revision_kind: "capture",
    revision_reason: null,
    supersedes_id: null,
    superseded_by: null,
    superseded_at: null,
    state: "live",
    editable: true,
    correctable: true,
    ...over,
  };
}

const CALLER = (rank: number) => [{
  user_id: "99999999-9999-4999-8999-999999999999",
  firm_id: "88888888-8888-4888-8888-888888888888",
  firm_name: "Rig Firm",
  role: rank >= 3 ? "owner" : rank >= 2 ? "admin" : rank >= 1 ? "bookkeeper" : "viewer",
  role_rank: rank,
  is_operator: false,
}];

const APPLICABILITY = (over: Record<string, unknown> = {}) => ({
  client_id: CLIENT,
  knowledge_key: "default_currency",
  as_of: "2026-09-16",
  knowledge_version: "7",
  key: {
    knowledge_key: "default_currency",
    kind: "assertion",
    value_shape: "string",
    validated_against: "enum:CURRENCIES_V1",
    allowed_values: ["MYR", "USD"],
    description: "The default presentation currency.",
    authority_bearing: false,
    firm_defaultable: true,
    firm_defaultable_reason: "The presentation currency the firm uses unless a client says otherwise.",
  },
  applicabilities: [],
  exception_count: 2,
  live_work: [],
  ...over,
});

function App(rec: KnowledgeRecordRow = record()) {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(KnowledgePromoteDialog, { clientId: CLIENT, record: rec }),
  });
}

type Posted = { url: string; body: Record<string, unknown> };

function wire(opts: {
  rank: number;
  applicability?: Record<string, unknown>;
  posts?: Posted[];
  promoteStatus?: number;
  promoteBody?: unknown;
}): typeof fetch {
  return (async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/rest/v1/caller_context")) return jsonResponse(CALLER(opts.rank));
    if (u.includes("/rpc/get_knowledge_applicability")) {
      return jsonResponse(APPLICABILITY(opts.applicability ?? {}));
    }
    if (u.includes("/rpc/capture_knowledge")) {
      opts.posts?.push({ url: u, body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown> });
      if (opts.promoteStatus && opts.promoteStatus >= 400) {
        return jsonResponse(opts.promoteBody, opts.promoteStatus);
      }
      return jsonResponse({ status: "captured", record_id: "frec-1", revision_id: "frev-1", knowledge_key: "default_currency" });
    }
    throw new Error(`unexpected fetch: ${u}`);
  }) as typeof fetch;
}

const bodyOf = () =>
  (globalThis as unknown as { document: { body: Node & { appendChild: (c: unknown) => void } } }).document.body;

async function open(h: Awaited<ReturnType<typeof renderComponent>>): Promise<void> {
  const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).trim() === "Promote to firm default");
  assert.ok(trigger, "the promote trigger must render for an admin on an eligible key");
  await h.fireEvent(trigger!, "click");
  for (let i = 0; i < 6; i++) await h.settle();
}

// =============================================================================
// 0 — the two pure seams
// =============================================================================

test("kp.00 applies_when parses `name = value` per line and REFUSES rather than coercing", () => {
  assert.deepEqual(parseAppliesWhen(""), { ok: true, value: {} });
  assert.deepEqual(parseAppliesWhen("segment = digital"), { ok: true, value: { segment: "digital" } });
  assert.deepEqual(
    parseAppliesWhen("segment = digital\n  entity = sdn_bhd  "),
    { ok: true, value: { segment: "digital", entity: "sdn_bhd" } },
  );
  assert.deepEqual(parseAppliesWhen("segment digital"), { ok: false });
  assert.deepEqual(parseAppliesWhen("= digital"), { ok: false });
  assert.deepEqual(parseAppliesWhen("segment ="), { ok: false });
});

test("kp.01 the admin floor is fail-closed on a null or unknown rank", () => {
  assert.equal(canPromoteToFirm(null), false);
  assert.equal(canPromoteToFirm(undefined), false);
  assert.equal(canPromoteToFirm(0), false, "viewer");
  assert.equal(canPromoteToFirm(1), false, "bookkeeper");
  assert.equal(canPromoteToFirm(2), true, "admin");
  assert.equal(canPromoteToFirm(3), true, "owner");
});

// =============================================================================
// 1 — who may see the control at all
// =============================================================================

test("kp.02 below the admin floor the trigger is ABSENT and an explanation stands in its place", async () => {
  await withMockedEnv(wire({ rank: 1 }), async () => {
    const h = await renderComponent(App());
    try {
      for (let i = 0; i < 6; i++) await h.settle();
      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).trim() === "Promote to firm default");
      assert.equal(trigger, null, "a bookkeeper must not be offered a control that can only refuse");
      assert.match(h.text(), /Administrator access required/);
      assert.match(h.text(), /administrator or owner of this firm can promote/,
        "the denial must say who CAN do it, not merely that this person cannot");
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});

test("kp.03 an INELIGIBLE key is explained as a fact about one client, never as a permission problem", async () => {
  await withMockedEnv(
    wire({
      rank: 2,
      applicability: { key: { ...APPLICABILITY().key, knowledge_key: "msic", firm_defaultable: false, firm_defaultable_reason: null } },
    }),
    async () => {
      const h = await renderComponent(App(record({ knowledge_key: "msic", value: "47211" })));
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        assert.equal(
          h.find((n) => n.tagName === "BUTTON" && textOf(n).trim() === "Promote to firm default"),
          null, "an ineligible key offers no promote control");
        assert.match(h.text(), /cannot be a firm default/);
        assert.match(h.text(), /fact about one client/);
        assert.doesNotMatch(h.text(), /Administrator access required/,
          "ineligibility is not a permission problem and must not borrow its words");
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});

test("kp.04 a firm rule that already covers this applicability is explained, with a route to it", async () => {
  await withMockedEnv(
    wire({
      rank: 2,
      applicability: {
        applicabilities: [{
          applies_when: {},
          applies_when_digest: "d0",
          firm_rule: record({ scope_kind: "firm", client_id: null, record_id: "frec-1" }),
          client_exception: record(),
          in_force: "client_exception",
          reason: "client_exception_shadows_firm_default",
          in_effect_today: true,
        }],
      },
    }),
    async () => {
      const h = await renderComponent(App());
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        assert.equal(
          h.find((n) => n.tagName === "BUTTON" && textOf(n).trim() === "Promote to firm default"),
          null, "a second firm rule at one applicability would meet uq_knowledge_live — do not offer it");
        assert.match(h.text(), /already covers these conditions/);
        const link = h.find((n) => n.tagName === "A" && attr(n, "href") === "/settings/knowledge");
        assert.ok(link, "the explanation must route to the register that holds the existing rule");
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});

// =============================================================================
// 2 — the act
// =============================================================================

test("kp.05 the reason is required, is NEVER pre-filled from the client record, and the effective-from default is the DB's Kuala Lumpur date", async () => {
  await withMockedEnv(wire({ rank: 2 }), async () => {
    const h = await renderComponent(App());
    bodyOf().appendChild(h.container);
    try {
      for (let i = 0; i < 6; i++) await h.settle();
      await open(h);

      const reasonBox = findIn(bodyOf(), (n) => n.tagName === "TEXTAREA" && attr(n, "id") === "knowledge-promote-reason");
      assert.ok(reasonBox, "the reason field must be revealed by the dialog");
      assert.equal((reasonBox as unknown as { value: string }).value, "",
        "the reason starts EMPTY — the client's own basis is that client's narrative");
      assert.doesNotMatch(
        textOf(bodyOf() as never),
        /told us on the phone/,
        "the client record's basis text must not appear anywhere in this dialog");

      const from = findIn(bodyOf(), (n) => n.tagName === "INPUT" && attr(n, "id") === "knowledge-promote-from");
      assert.ok(from, "the effective-from field must render");
      assert.equal((from as unknown as { value: string }).value, "2026-09-16",
        "the default effective date is the as_of the DATABASE computed in Asia/Kuala_Lumpur");

      const confirm = findIn(bodyOf(), (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Record firm default");
      assert.ok(confirm, "the dialog's confirm control must render");
      assert.equal((confirm as unknown as { disabled: boolean }).disabled, true,
        "with no reason written the act cannot fire");

      assert.match(textOf(bodyOf() as never), /Client exceptions survive this/,
        "the dialog states persistently what promotion does to clients that already recorded their own value");
      assert.match(textOf(bodyOf() as never), /2 client\(s\) already hold an exception/,
        "…and how many hold one today, measured rather than reassuring");
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});

test("kp.06 confirming reaches clara.capture_knowledge at FIRM scope, with a fresh op_key, no source pins and the typed window", async () => {
  const posts: Posted[] = [];
  await withMockedEnv(wire({ rank: 2, posts }), async () => {
    const h = await renderComponent(App());
    bodyOf().appendChild(h.container);
    try {
      for (let i = 0; i < 6; i++) await h.settle();
      await open(h);

      const reasonBox = findIn(bodyOf(), (n) => n.tagName === "TEXTAREA" && attr(n, "id") === "knowledge-promote-reason");
      await h.act(() => { setFieldValue(reasonBox as never, "Partner meeting 2026-09-16: ringgit unless a client says otherwise"); });
      const applies = findIn(bodyOf(), (n) => n.tagName === "TEXTAREA" && attr(n, "id") === "knowledge-promote-applies");
      await h.act(() => { setFieldValue(applies as never, "segment = smp"); });
      const to = findIn(bodyOf(), (n) => n.tagName === "INPUT" && attr(n, "id") === "knowledge-promote-to");
      await h.act(() => { setFieldValue(to as never, "2027-09-30"); });
      for (let i = 0; i < 3; i++) await h.settle();

      const confirm = findIn(bodyOf(), (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Record firm default");
      assert.equal((confirm as unknown as { disabled: boolean }).disabled, false, "a written reason enables the act");
      await h.act(() => { void clickButton(confirm as never); });
      for (let i = 0; i < 8; i++) await h.settle();

      assert.equal(posts.length, 1, `expected exactly one capture_knowledge POST, saw ${posts.length}`);
      const sent = posts[0]!.body;
      assert.equal(sent.p_scope_kind, "firm", "the promotion is a FIRM-scope capture");
      assert.equal(sent.p_client, null, "a firm-scoped record names no client");
      assert.equal(sent.p_knowledge_key, "default_currency");
      assert.equal(sent.p_value, "MYR", "the value promoted is the client record's own, verbatim");
      assert.equal(sent.p_basis, "Partner meeting 2026-09-16: ringgit unless a client says otherwise",
        "the AUTHORED reason is what the record will carry as its basis");
      assert.deepEqual(sent.p_applies_when, { segment: "smp" });
      assert.equal(sent.p_effective_from, "2026-09-16");
      assert.equal(sent.p_effective_to, "2027-09-30");
      assert.deepEqual(sent.p_source, {},
        "a firm default pins NO document — 0205's evidence wall and 0192's own promotion path agree");
      assert.equal(sent.p_source_kind, "user_statement",
        "trust travels from what is being generalised; the wrapper never upgrades it");
      assert.equal(typeof sent.p_op_key, "string");
      assert.ok(String(sent.p_op_key).length >= 8, "a real op_key is minted per attempt");
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});

test("kp.07 a CLR refusal renders VERBATIM with its code inside the dialog, and every typed value survives", async () => {
  const posts: Posted[] = [];
  await withMockedEnv(
    wire({
      rank: 2,
      posts,
      promoteStatus: 400,
      promoteBody: {
        code: "CLR10",
        message: "knowledge key reporting_framework is a policy; a model_inference source is inferred and cannot become one",
        details: '{"reason":"knowledge_trust_insufficient"}',
      },
    }),
    async () => {
      const h = await renderComponent(App());
      bodyOf().appendChild(h.container);
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        await open(h);

        const reasonBox = findIn(bodyOf(), (n) => n.tagName === "TEXTAREA" && attr(n, "id") === "knowledge-promote-reason");
        await h.act(() => { setFieldValue(reasonBox as never, "the firm prepares MPERS accounts"); });
        for (let i = 0; i < 3; i++) await h.settle();
        const confirm = findIn(bodyOf(), (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Record firm default");
        await h.act(() => { void clickButton(confirm as never); });
        for (let i = 0; i < 8; i++) await h.settle();

        const text = textOf(bodyOf() as never);
        assert.match(text, /CLR10/, "the governed refusal carries its code");
        assert.match(text, /a model_inference source is inferred and cannot become one/,
          "the DB's own words, never re-worded");
        const stillThere = findIn(bodyOf(), (n) => n.tagName === "TEXTAREA" && attr(n, "id") === "knowledge-promote-reason");
        assert.ok(stillThere, "the dialog STAYS OPEN on a refusal — it is asking for a change");
        assert.equal((stillThere as unknown as { value: string }).value, "the firm prepares MPERS accounts",
          "the typed reason survives the refusal");
        assert.equal(posts.length, 1, "a refusal is never silently retried");
        // …and the refusal is announced, not merely painted.
        const alerts = findAllIn(bodyOf(), (n) => attr(n, "role") === "alert");
        assert.ok(alerts.length >= 1, "a refusal inside a dialog is announced");
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});

/** The value a control has COMMITTED — read off the node's React props rather than
 *  its DOM `value`. The harness's stub DOM does not reflect a `value` prop onto a
 *  freshly MOUNTED `<textarea>` (it does track a value written by `setFieldValue`
 *  on a node that is already on screen), so after a close/reopen the DOM property
 *  is empty while the prop React handed the control carries the draft. The prop is
 *  what a real browser renders; asserting the DOM property here would assert a
 *  harness limitation. */
function committedValue(node: Node): unknown {
  const key = Object.keys(node as object).find((k) => k.startsWith("__reactProps"));
  return (node as unknown as Record<string, { value?: unknown }>)[key ?? ""]?.value;
}

test("kp.08 cancelling keeps the draft under the same record — reopening hands it back to the control", async () => {
  await withMockedEnv(wire({ rank: 2 }), async () => {
    const h = await renderComponent(App());
    bodyOf().appendChild(h.container);
    try {
      for (let i = 0; i < 6; i++) await h.settle();
      await open(h);
      const reasonBox = findIn(bodyOf(), (n) => n.tagName === "TEXTAREA" && attr(n, "id") === "knowledge-promote-reason");
      await h.act(() => { setFieldValue(reasonBox as never, "half a sentence the partner was still writing"); });
      for (let i = 0; i < 3; i++) await h.settle();

      const cancel = findIn(bodyOf(), (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Cancel");
      assert.ok(cancel, "the dialog must offer a cancel");
      await h.act(() => { void clickButton(cancel as never); });
      for (let i = 0; i < 6; i++) await h.settle();
      assert.equal(
        findAllIn(bodyOf(), (n) => n.tagName === "TEXTAREA" && attr(n, "id") === "knowledge-promote-reason").length,
        0, "cancel actually closes the dialog — otherwise this cell proves nothing");

      await open(h);
      const reopened = findIn(bodyOf(), (n) => n.tagName === "TEXTAREA" && attr(n, "id") === "knowledge-promote-reason");
      assert.ok(reopened, "the dialog reopens");
      assert.equal(committedValue(reopened as Node), "half a sentence the partner was still writing",
        "an unsent draft survives a cancel under the same user/firm/record: the state lives on the surface, not inside the dialog");
      const confirm = findIn(bodyOf(), (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Record firm default");
      assert.equal((confirm as unknown as { disabled: boolean }).disabled, false,
        "…and the restored draft is what re-enables the act, which is the proof it is really there");
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});
