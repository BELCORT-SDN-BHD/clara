// #654 — the FIRM knowledge register (`/settings/knowledge`), driven through the
// real component against a mocked PostgREST. What is REAL: `KnowledgeFirmPanel`,
// the shared badge/applicability presentation it borrows from the client register,
// `lib/registers/knowledge.ts`'s `loadFirmKnowledge` wrapper and `useAsyncRead`.
// What is FAKE is the wire.
//
// THESE CELLS ARE THE PRODUCT CLAIMS #654 MAKES ABOUT THIS SURFACE:
//   1. the four faces come from four DIFFERENT facts — a successful empty read, a
//      filter that hid everything, a failed/denied read and a populated register —
//      and the filtered face keeps the filter and offers to clear it;
//   2. a rule NAMES ITS AUTHORITY: the promoter, the authority the act required,
//      the promoter's role NOW, and the reason they authored;
//   3. a promoter who has since been removed is said out loud, because the rule
//      they recorded still stands and that is exactly what a reviewer must know;
//   4. the register names the clients that hold an exception and links to each
//      one's own record — `PRD:123`'s human-review interim, made usable;
//   5. it names the LIVE Work citing the key, and states plainly that a change here
//      does not re-run anything by itself.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import messages from "../../messages/en.json";
import { clickButton, renderComponent, setFieldValue, textOf } from "../../test/hookHarness";
// REQUIRED, not decorative — this surface renders `next/link` (whose prefetch hook
// reaches for `self`) and Base UI's Select. See knowledge-detail.test.tsx's own note.
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { KnowledgeFirmPanel } from "./knowledge-firm-panel";
import type { FirmKnowledgeRow } from "../../lib/registers/knowledge";

enableDomInspection();

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

function firmRow(over: Partial<FirmKnowledgeRow> = {}): FirmKnowledgeRow {
  return {
    record_id: "frec-1",
    revision_id: "frev-1",
    revision_n: 1,
    scope_kind: "firm",
    client_id: null,
    knowledge_key: "default_currency",
    kind: "assertion",
    value: "MYR",
    applies_when: {},
    applies_when_digest: "fd-empty",
    effective_from: null,
    effective_to: null,
    source_kind: "user_statement",
    trust: "asserted",
    source: { document_id: null, extraction_id: null, region_id: null, field_path: null, work_id: null },
    basis: "Partner meeting 2026-09-16: ringgit presentation is the firm's default",
    asserted_by: "u-admin",
    asserted_by_name: "Nurul Hayati",
    recorded_via: "human_ui",
    recorded_at: "2026-09-16T02:00:00Z",
    knowledge_version: "12",
    revision_kind: "capture",
    revision_reason: null,
    supersedes_id: null,
    superseded_by: null,
    superseded_at: null,
    state: "live",
    editable: true,
    correctable: true,
    key_description: "The default presentation currency.",
    authority: {
      promoter: "u-admin",
      promoter_name: "Nurul Hayati",
      recorded_via: "human_ui",
      recorded_at: "2026-09-16T02:00:00Z",
      reason: "Partner meeting 2026-09-16: ringgit presentation is the firm's default",
      required_role: "admin",
      promoter_role_at_act: "admin",
      promoter_role_now: "admin",
      promoter_active: true,
    },
    exception_count: 0,
    exceptions: [],
    live_work: [],
    firm_defaultable_reason: "The presentation currency the firm uses unless a client says otherwise.",
    in_effect_today: true,
    ...over,
  };
}

function App() {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(KnowledgeFirmPanel, {}),
  });
}

function envelope(records: FirmKnowledgeRow[]) {
  return { firm_id: "f1", as_of: "2026-09-16", knowledge_version: "12", records };
}

async function mount(impl: typeof fetch, assertions: (h: Awaited<ReturnType<typeof renderComponent>>) => Promise<void>) {
  await withMockedEnv(impl, async () => {
    const h = await renderComponent(App());
    try {
      for (let i = 0; i < 6; i++) await h.settle();
      await assertions(h);
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
}

/** `clara.caller_context`, the view the register reads ONCE to decide whether to
 *  offer Correct and Withdraw at all. Admin (rank 2) unless a cell says otherwise. */
const CALLER = (rank: number) => [{
  user_id: "99999999-9999-4999-8999-999999999999",
  firm_id: "88888888-8888-4888-8888-888888888888",
  firm_name: "Rig Firm",
  role: rank >= 3 ? "owner" : rank >= 2 ? "admin" : rank >= 1 ? "bookkeeper" : "viewer",
  role_rank: rank,
  is_operator: false,
}];

type Posted = { url: string; body: Record<string, unknown> };

const okFetch = (
  records: FirmKnowledgeRow[],
  opts: { rank?: number; posts?: Posted[]; actStatus?: number; actBody?: unknown } = {},
) =>
  (async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/rest/v1/caller_context")) return jsonResponse(CALLER(opts.rank ?? 2));
    if (u.includes("/rpc/list_firm_knowledge")) return jsonResponse(envelope(records));
    if (u.includes("/rpc/correct_knowledge") || u.includes("/rpc/withdraw_knowledge")) {
      opts.posts?.push({ url: u, body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown> });
      if (opts.actStatus && opts.actStatus >= 400) return jsonResponse(opts.actBody, opts.actStatus);
      return jsonResponse({ status: u.includes("correct") ? "corrected" : "withdrawn", record_id: "frec-1", revision_n: 2 });
    }
    throw new Error(`unexpected fetch: ${u}`);
  }) as typeof fetch;

type Stub = { tagName?: string; childNodes?: Stub[] };
function findIn(root: Stub, predicate: (n: Stub) => boolean): Stub | null {
  if (predicate(root)) return root;
  for (const c of root.childNodes ?? []) {
    const found = findIn(c, predicate);
    if (found) return found;
  }
  return null;
}
const attrOf = (n: Stub, key: string): string =>
  String((n as { getAttribute?: (k: string) => string | null }).getAttribute?.(key) ?? "");
const bodyOf = () =>
  (globalThis as unknown as { document: { body: Stub & { appendChild: (c: unknown) => void } } }).document.body;

// =============================================================================
// 1 — the four faces
// =============================================================================

test("kf.01 a SUCCESSFUL EMPTY read is an empty state that says what to do, not an error", async () => {
  await mount(okFetch([]), async (h) => {
    const text = h.text();
    assert.match(text, /has not promoted any knowledge to a firm-wide default yet/,
      "a successful empty read must say the firm has recorded nothing, not that something failed");
    assert.doesNotMatch(text, /could not|couldn't|failed/i,
      "an empty read must never borrow a failure's words");
  });
});

test("kf.02 a DENIED read renders the forbidden face, never an empty one", async () => {
  await mount(
    (async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes("/rpc/list_firm_knowledge")) {
        return jsonResponse({ message: "permission denied for function list_firm_knowledge" }, 403);
      }
      throw new Error(`unexpected fetch: ${u}`);
    }) as typeof fetch,
    async (h) => {
      const text = h.text();
      assert.doesNotMatch(text, /has not promoted any knowledge/,
        "a refusal must not be rendered as 'nothing recorded' — they are different facts");
      const alert = h.find(
        (n) => String((n as { getAttribute?: (k: string) => string | null }).getAttribute?.("role") ?? "") === "alert",
      );
      assert.ok(alert, "a denied read renders an alert, not an empty state");
    },
  );
});

test("kf.03 the kind filter is a named control, and the filtered face is ABSENT while rules are on screen", async () => {
  await mount(okFetch([firmRow()]), async (h) => {
    // The filter's ACCESSIBLE NAME, not its rendered value: Base UI's Select
    // portals its listbox and renders its value through a slot the harness's stub
    // DOM does not fill, so naming the control is what is assertable here. The
    // filtered-to-nothing FACE itself is driven in a real browser by
    // e2e/knowledge-firm-walk.spec.ts, which is where a portalled listbox can
    // actually be opened — the same split knowledge-detail.test.tsx already makes.
    const trigger = h.find(
      (n) => n.tagName === "BUTTON"
        && String((n as { getAttribute?: (k: string) => string | null }).getAttribute?.("aria-label") ?? "") === "Kind",
    );
    assert.ok(trigger, "the kind filter must render with its accessible name");
    assert.match(h.text(), /Kind/, "the filter is labelled in the visible text too");
    assert.doesNotMatch(h.text(), /No firm rule matches this filter/,
      "with a rule on screen and no filter applied, the filtered face must be absent");
    assert.doesNotMatch(h.text(), /has not promoted any knowledge/,
      "…and so must the successful-empty face");
  });
});

// =============================================================================
// 2 — authority
// =============================================================================

test("kf.04 a rule names its promoter, the authority the act required, and the reason they AUTHORED", async () => {
  await mount(okFetch([firmRow()]), async (h) => {
    const text = h.text();
    assert.match(text, /Nurul Hayati/, "the promoter must be named");
    assert.match(text, /Authority the act required/);
    assert.match(text, /admin/, "the floor the door verified must be legible");
    assert.match(text, /Partner meeting 2026-09-16/,
      "the AUTHORED reason is what the rule stands on, and it must be readable");
    assert.match(text, /MYR/, "the value itself must be on screen");
    assert.match(text, /Firm default/, "a firm-scope row carries the firm badge");
  });
});

test("kf.05 a promoter who is no longer an active member is SAID, because the rule still stands", async () => {
  await mount(
    okFetch([firmRow({
      authority: {
        ...firmRow().authority,
        promoter_role_now: null,
        promoter_active: false,
      },
    })]),
    async (h) => {
      const text = h.text();
      assert.match(text, /no longer an active member/,
        "a revoked promoter is a fact about the rule a reviewer needs");
      assert.match(text, /No current membership/);
      assert.match(text, /MYR/, "…and the rule itself is still rendered, not hidden");
    },
  );
});

// =============================================================================
// 3 — the human-review affordance PRD:123 asks for in place of the engine
// =============================================================================

test("kf.06 the register names the clients holding an exception and links to each one's own record", async () => {
  await mount(
    okFetch([firmRow({
      exception_count: 2,
      exceptions: [
        { client_id: "11111111-1111-4111-8111-111111111111", client_name: "Alpha Trading", record_id: "rec-a", value: "USD", recorded_at: "2026-09-10T01:00:00Z" },
        { client_id: "22222222-2222-4222-8222-222222222222", client_name: "Beta Services", record_id: "rec-b", value: "SGD", recorded_at: "2026-09-11T01:00:00Z" },
      ],
    })]),
    async (h) => {
      const text = h.text();
      assert.match(text, /2 clients hold an exception/);
      assert.match(text, /Alpha Trading/);
      assert.match(text, /Beta Services/);
      assert.match(text, /USD/);
      const link = h.find(
        (n) => n.tagName === "A"
          && String((n as { getAttribute?: (k: string) => string | null }).getAttribute?.("href") ?? "")
            .includes("/clients/11111111-1111-4111-8111-111111111111/knowledge/rec-a"),
      );
      assert.ok(link, "each exception links to that client's OWN record, not to a firm-level copy");
    },
  );
});

test("kf.07 the register names the live Work citing the key and says a change here re-runs nothing by itself", async () => {
  await mount(
    okFetch([firmRow({
      live_work: [{
        work_id: "33333333-3333-4333-8333-333333333333",
        client_id: "11111111-1111-4111-8111-111111111111",
        purpose: "journal_entry",
        status: "awaiting_input",
      }],
    })]),
    async (h) => {
      const text = h.text();
      assert.match(text, /does not re-run work by itself/,
        "the deferred re-evaluation engine is stated, never implied by absence");
      assert.match(text, /journal_entry/);
      assert.match(text, /awaiting_input/);
      const link = h.find(
        (n) => n.tagName === "A"
          && String((n as { getAttribute?: (k: string) => string | null }).getAttribute?.("href") ?? "")
            .includes("/work/33333333-3333-4333-8333-333333333333"),
      );
      assert.ok(link, "the live Work must be reachable, not merely counted");
    },
  );
});

test("kf.08 the register reads its effective dates against the SERVER's Kuala Lumpur date, not the browser's", async () => {
  await mount(
    okFetch([firmRow({
      effective_from: "2026-10-01",
      effective_to: "2027-09-30",
      in_effect_today: false,
    })]),
    async (h) => {
      const text = h.text();
      assert.match(text, /read against 2026-09-16 in Asia\/Kuala_Lumpur/,
        "the as_of the DB computed must be the date the surface names");
      assert.match(text, /Not in effect on 2026-09-16/,
        "a rule whose window has not opened says so rather than reading as current");
      assert.match(text, /2026-10-01/, "the exact effective dates stay exact");
    },
  );
});

// =============================================================================
// 4 — CORRECT AND WITHDRAW (fix round 1, adversarial finding 654-ADV-3).
//
// DECISIONS §2/#654 binds the entrance to "firm register, Promote dialog,
// Correct/Withdraw, and the firm-rule-vs-client-exception pair". The first cut
// shipped three of the four, and the missing one had no substitute: a firm-scope
// record has no client, `knowledgeRecordHref` requires one, and the only governed
// detail route is `/clients/[clientId]/knowledge/[recordId]` — so a promoted rule
// could never be corrected or withdrawn anywhere in the product.
// =============================================================================

async function mountForDialog(
  impl: typeof fetch,
  assertions: (h: Awaited<ReturnType<typeof renderComponent>>) => Promise<void>,
) {
  await withMockedEnv(impl, async () => {
    const h = await renderComponent(App());
    // The dialogs PORTAL into document.body, so the container has to be in the
    // document for the portalled subtree to be reachable at all.
    bodyOf().appendChild(h.container);
    try {
      for (let i = 0; i < 6; i++) await h.settle();
      await assertions(h);
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
}

async function openDialog(h: Awaited<ReturnType<typeof renderComponent>>, label: string) {
  const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).trim() === label);
  assert.ok(trigger, label + " must render as a trigger for an admin on a live firm rule");
  await h.act(() => { void clickButton(trigger as never); });
  for (let i = 0; i < 6; i++) await h.settle();
}

test("kf.09 an admin is offered CORRECT on a live firm rule, the reason is required, and the door is called with this rule's record_id", async () => {
  const posts: Posted[] = [];
  await mountForDialog(okFetch([firmRow()], { rank: 2, posts }), async (h) => {
    await openDialog(h, "Correct");

    const valueField = findIn(bodyOf(), (n) => n.tagName === "INPUT" && attrOf(n, "id") === "firm-knowledge-correct-value-frec-1");
    assert.ok(valueField, "the correction opens on the CURRENT value, in the spelling the catalog types this key as");
    assert.equal((valueField as unknown as { value: string }).value, "MYR");

    const confirm = findIn(bodyOf(), (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Record correction");
    assert.ok(confirm, "the dialog's confirm control must render");
    assert.equal((confirm as unknown as { disabled: boolean }).disabled, true,
      "with no reason written the act cannot fire — the door refuses a blank one too (CLR10 knowledge_reason_required)");
    assert.match(textOf(bodyOf() as never), /Their exception still wins where it applies/,
      "a correction must say what it does NOT do to a client holding its own value");

    const reasonBox = findIn(bodyOf(), (n) => n.tagName === "TEXTAREA" && attrOf(n, "id") === "firm-knowledge-correct-reason-frec-1");
    assert.ok(reasonBox);
    await h.act(() => { setFieldValue(reasonBox as never, "the partners moved the firm to SGD presentation"); });
    for (let i = 0; i < 3; i++) await h.settle();
    const confirm2 = findIn(bodyOf(), (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Record correction");
    assert.equal((confirm2 as unknown as { disabled: boolean }).disabled, false, "a written reason enables the act");
    await h.act(() => { void clickButton(confirm2 as never); });
    for (let i = 0; i < 8; i++) await h.settle();

    assert.equal(posts.length, 1, "exactly one door call: " + JSON.stringify(posts));
    const sent = posts[0]!;
    assert.match(sent.url, /correct_knowledge/);
    assert.equal(sent.body.p_record, "frec-1", "the correction must name THIS rule's record_id, never its revision id");
    assert.equal(sent.body.p_reason, "the partners moved the firm to SGD presentation");
    assert.equal(sent.body.p_value, "MYR");
    assert.ok(String(sent.body.p_op_key ?? "").length > 0, "every governed act carries an op_key");
  });
});

test("kf.10 an admin is offered WITHDRAW, is told what it does to clients, and a CLR refusal renders VERBATIM inside the dialog with the draft intact", async () => {
  const posts: Posted[] = [];
  await mountForDialog(
    okFetch([firmRow({ exception_count: 2 })], {
      rank: 2,
      posts,
      actStatus: 400,
      actBody: { code: "CLR04", message: "only an administrator may withdraw a firm-wide rule" },
    }),
    async (h) => {
      await openDialog(h, "Withdraw");
      assert.match(textOf(bodyOf() as never), /no work is re-run/,
        "withdrawal must state that nothing is re-evaluated by itself (PRD:123's accepted interim)");
      assert.match(textOf(bodyOf() as never), /2 client\(s\) hold their own value for this key and are unaffected/,
        "the number comes from the register's own read, not from reassurance");

      const reasonBox = findIn(bodyOf(), (n) => n.tagName === "TEXTAREA" && attrOf(n, "id") === "firm-knowledge-withdraw-reason-frec-1");
      assert.ok(reasonBox);
      await h.act(() => { setFieldValue(reasonBox as never, "superseded by the 2027 engagement policy"); });
      for (let i = 0; i < 3; i++) await h.settle();
      const confirm = findIn(bodyOf(), (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Withdraw rule");
      await h.act(() => { void clickButton(confirm as never); });
      for (let i = 0; i < 8; i++) await h.settle();

      assert.equal(posts.length, 1);
      const sent = posts[0]!;
      assert.match(sent.url, /withdraw_knowledge/);
      assert.equal(sent.body.p_record, "frec-1");

      const after = textOf(bodyOf() as never);
      assert.match(after, /only an administrator may withdraw a firm-wide rule/,
        "the DB's own words must reach the human verbatim, inside the dialog the page banner sits behind");
      assert.match(after, /CLR04/, "…with its code");
      const stillThere = findIn(bodyOf(), (n) => n.tagName === "TEXTAREA" && attrOf(n, "id") === "firm-knowledge-withdraw-reason-frec-1");
      assert.ok(stillThere, "a refusal must not close the dialog");
      assert.equal((stillThere as unknown as { value: string }).value, "superseded by the 2027 engagement policy",
        "…nor destroy what the human typed");
      assert.match(after, /MYR/, "…nor blank the register behind it");
    },
  );
});

test("kf.11 below the admin floor BOTH controls are absent and a sentence says who can, and a non-correctable revision offers neither", async () => {
  await mountForDialog(okFetch([firmRow()], { rank: 1 }), async (h) => {
    assert.equal(h.find((n) => n.tagName === "BUTTON" && textOf(n).trim() === "Correct"), null,
      "a bookkeeper must not be offered a control that can only refuse");
    assert.equal(h.find((n) => n.tagName === "BUTTON" && textOf(n).trim() === "Withdraw"), null);
    assert.match(h.text(), /Administrator access required/);
    assert.match(h.text(), /administrator or owner of this firm can change this rule/,
      "the denial says who CAN, not merely that this person cannot");
    assert.match(h.text(), /MYR/, "…and the rule itself is still readable by a viewer+");
  });

  // …and the database's own answer outranks the rank: a withdrawn revision is
  // terminal and a superseded one immutable, so `correctable=false` offers nothing
  // even to an owner. The register still SHOWS the rule — a withdrawal is visible
  // as a withdrawal rather than as an absence.
  await mountForDialog(
    okFetch([firmRow({ state: "withdrawn", correctable: false, revision_kind: "withdrawal", revision_reason: "retired" })], { rank: 3 }),
    async (h) => {
      assert.equal(h.find((n) => n.tagName === "BUTTON" && textOf(n).trim() === "Correct"), null,
        "a control the door would refuse must not be offered at all");
      assert.equal(h.find((n) => n.tagName === "BUTTON" && textOf(n).trim() === "Withdraw"), null);
      assert.doesNotMatch(h.text(), /Administrator access required/,
        "terminality is not a permission problem and must not borrow its words");
      assert.match(h.text(), /MYR/);
    },
  );
});

test("[1005]: the kind filter trigger shows 'All kinds' on first render, never the raw 'all' sentinel", async () => {
  await mount(okFetch([firmRow()]), async (h) => {
    // The popup is never opened — this is the FIRST render's own text.
    const text = h.text();
    assert.match(text, /All kinds/, "the ALL sentinel's label must render");
    // Case-SENSITIVE: the raw sentinel is the lowercase literal "all" (`const ALL = "all"`);
    // "All kinds" (capital A) must not be mistaken for it.
    assert.doesNotMatch(text, /\ball\b/, "the raw 'all' sentinel value must never render as trigger text");
  });
});

// =============================================================================
// 6 — #912: the role at the act is a SECOND fact, never a restatement of the first
// =============================================================================

test("kf.12 a demoted promoter's rule shows the role the act ran under BESIDE the role they hold now", async () => {
  await mount(
    okFetch([firmRow({
      authority: {
        ...firmRow().authority,
        promoter_role_at_act: "owner",
        promoter_role_now: "bookkeeper",
      },
    })]),
    async (h) => {
      const text = h.text();
      assert.match(text, /Their role at the time/,
        "the authority the act ran under must be labelled as its own fact");
      assert.match(text, /owner/, "…and carry the role the promoter actually held");
      assert.match(text, /Their role now/);
      assert.match(text, /bookkeeper/,
        "…beside the CURRENT role, which the demotion moved -- two facts, not one");
    },
  );
});

test("kf.13 a rule recorded before Clara kept the role says UNKNOWN, and says why, rather than borrowing the current one", async () => {
  await mount(
    okFetch([firmRow({
      authority: {
        ...firmRow().authority,
        promoter_role_at_act: null,
        promoter_role_now: "admin",
      },
    })]),
    async (h) => {
      const text = h.text();
      assert.match(text, /Not recorded — this rule predates the record of authority/,
        "an unknown historical role is said plainly, with the reason it is unknown");
      assert.match(text, /Their role now/,
        "…and the current role is still shown, as the separate fact it is");
    },
  );
});

test("kf.14 a promoter who held NO membership when the act was recorded is said in words, not as the database's own marker", async () => {
  // 'none' is not a rank and must never read as one. clara.audit_log.actor_role carries it when
  // the stamp looked a NAMED actor up and found no active membership: on this register that is
  // the narrow case where a membership is withdrawn while the act is still parked on a lock (the
  // role is resolved at the audit write -- 0243's header, CONTEXT.md "Role at the act", db
  // battery ar.07), so the value is rare but reachable, and rendering it raw would put the bare
  // token "none" under "Their role at the time" as if it were a rank the person held.
  //
  // The register's OTHER marker, 'no_actor', is unreachable here and deliberately gets no
  // wording: clara.knowledge_records.asserted_by is NOT NULL and the authority subquery matches
  // `a.actor is not distinct from r.asserted_by`, so an audit row with no actor can never be the
  // one this block cites.
  await mount(
    okFetch([firmRow({
      authority: {
        ...firmRow().authority,
        promoter_role_at_act: "none",
        promoter_role_now: "bookkeeper",
      },
    })]),
    async (h) => {
      const text = h.text();
      assert.match(text, /No membership in this firm when the rule was recorded/,
        "'none' is a measured fact about a person, and the register must say it in words");
      assert.doesNotMatch(text, /Their role at the times*none/,
        "…never the database's own marker rendered as if it were a rank");
      assert.match(text, /Their role now/,
        "…and the current role is still shown, as the separate fact it is");
    },
  );
});
