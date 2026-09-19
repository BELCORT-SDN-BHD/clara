// #658 — B3 Work detail's "knowledge this Work read" block (Sources tab).
//
// THE PRODUCT CLAIMS THESE CELLS MAKE:
//   1. all four face words render with their own sentence, and `partial` reads as NEITHER
//      neighbour — not as a clean read and not as a failure;
//   2. the runtime's own `unavailable` never reaches this surface;
//   3. a run with a trace-only version says so — the version is real, WHICH records it covered is
//      not known, and the sentence says exactly that rather than rendering an empty key list;
//   4. a Work with nothing recorded says "has not recorded a knowledge read" and adds the hint
//      that this is not the same as a run that read nothing;
//   5. denied and failed are separate faces, and a failed read offers a re-read rather than taking
//      the panel down.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import messages from "../../messages/en.json";
import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { WorkKnowledgeBlock } from "./work-knowledge-block";
import type { WorkKnowledgeDrift, WorkKnowledgeReadSummary } from "../../lib/work/knowledge";

enableDomInspection();

/** The harness's stub nodes are `Record<string, unknown>`, so an attribute read needs the
 *  estate's own cast (journal-composer.test.tsx:113's idiom) — `next build` runs a stricter
 *  TypeScript than `pnpm typecheck` does and rejects the bare optional call. */
const attr = (n: unknown, k: string): string | null =>
  (n as { getAttribute?: (key: string) => string | null }).getAttribute?.(k) ?? null;

const WORK = "11111111-1111-4111-8111-111111111111";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function refusal(code: string, message: string): Response {
  return new Response(JSON.stringify({ code, message, details: null, hint: null }), {
    status: 400, headers: { "content-type": "application/json" },
  });
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

function summary(over: Partial<WorkKnowledgeReadSummary> = {}): WorkKnowledgeReadSummary {
  return {
    status: "ok",
    reason: null,
    purpose: "accounting_work",
    tiers: { core: 3, requested: 1, remainder: 6 },
    records_shown: 10,
    truncated: false,
    run_id: "wrun_01M20WGD9ETKK6RWCBA8CWG1GE",
    seq: 1,
    read_at: "2026-09-19T02:00:00Z",
    keys: ["accounting_basis", "sst_regime"],
    ...over,
  };
}

function drift(over: Partial<WorkKnowledgeDrift> = {}): WorkKnowledgeDrift {
  return {
    observed_version: "42",
    current_version: "42",
    observed_from: "read",
    drifted: false,
    moved_keys: [],
    read_keys: ["accounting_basis", "sst_regime"],
    relevant: false,
    as_of: "2026-09-19",
    read: summary(),
    work_id: WORK,
    client_id: "c1",
    ...over,
  };
}

function App() {
  return createElement(NextIntlClientProvider, {
    locale: "en", messages,
    children: createElement(WorkKnowledgeBlock, { workId: WORK }),
  });
}

function mockDrift(body: unknown): typeof fetch {
  return (async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.includes("/rpc/work_knowledge_drift")) return jsonResponse(body);
    throw new Error(`unexpected fetch: ${u}`);
  }) as typeof fetch;
}

async function render(impl: typeof fetch, check: (text: string, h: Awaited<ReturnType<typeof renderComponent>>) => void) {
  await withMockedEnv(impl, async () => {
    const h = await renderComponent(App());
    try {
      for (let i = 0; i < 6; i++) await h.settle();
      check(h.text(), h);
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
}

test("wkb.01 an `ok` read names the version, the period, the keys and the per-tier counts", async () => {
  await render(mockDrift(drift()), (text) => {
    assert.match(text, /Read complete/);
    assert.match(text, /Knowledge version 42/);
    assert.match(text, /Read for 2026-09-19/, "the PERIOD it read for");
    assert.match(text, /accounting_basis, sst_regime/, "the keys it actually read");
    assert.match(text, /Required 3 · requested 1 · other 6/, "the per-tier counts");
    assert.match(text, /10 record\(s\) reached the run/);
  });
});

test("wkb.02 `partial` reads as NEITHER neighbour, and the runtime's own word never appears", async () => {
  await render(
    mockDrift(drift({ read: summary({ status: "partial", reason: "remainder truncated", truncated: true }) })),
    (text) => {
      assert.match(text, /Read partial/);
      assert.match(text, /Some records beyond the required set were withheld/,
        "…and it says WHAT was partial: the required set is complete, the rest is not");
      assert.match(text, /remainder truncated/, "the door's own reason, verbatim");
      assert.ok(!/Read complete/.test(text), "a partial read is not a clean one");
      assert.ok(!/could not be determined/.test(text), "…and it is not a failure either");
      assert.ok(!/unavailable/i.test(text), "the runtime's frozen word is not a face word");
    },
  );
});

test("wkb.03 `unknown` and `denied` each carry their own sentence, and neither implies absence", async () => {
  await render(mockDrift(drift({ read: summary({ status: "unknown", reason: "read_failed" }) })), (text) => {
    assert.match(text, /Read status unknown/);
    assert.ok(!/no recorded knowledge|read nothing/i.test(text),
      "a read that did not succeed must never render as a client with nothing recorded");
  });
  await render(mockDrift(drift({ read: summary({ status: "denied", reason: "refused" }) })), (text) => {
    assert.match(text, /Read refused/);
  });
});

test("wkb.04 a trace-only observation says the version is known and the records are NOT", async () => {
  await render(
    mockDrift(drift({
      observed_from: "trace", read: null, read_keys: null, relevant: null,
      observed_version: "7", current_version: "7", drifted: false,
    })),
    (text, h) => {
      assert.match(text, /Knowledge version 7/, "the version IS known and is shown");
      assert.match(text, /not which records it read/i,
        "…and the sentence says exactly what is missing, rather than rendering an empty key list");
      assert.ok(h.find((n) => attr(n, "data-testid") === "work-knowledge-trace-only"));
      assert.ok(!/Required 0/.test(text), "a zero tier count would be a number a reader could act on");
    },
  );
});

test("wkb.05 a Work with NOTHING recorded says so, and says that is not the same as reading nothing", async () => {
  await render(
    mockDrift(drift({
      observed_from: null, observed_version: null, read: null, read_keys: null,
      relevant: null, drifted: null, as_of: null,
    })),
    (text, h) => {
      assert.match(text, /has not recorded a knowledge read/);
      assert.match(text, /not the same as a run that read nothing/i);
      assert.ok(h.find((n) => attr(n, "data-testid") === "work-knowledge-none"));
    },
  );
});

test("wkb.06 denied and failed are separate faces, and failed offers a re-read", async () => {
  await render(
    (async (url: RequestInfo | URL) => {
      if (String(url).includes("/rpc/work_knowledge_drift")) return refusal("CLR04", "insufficient role");
      throw new Error("unexpected");
    }) as typeof fetch,
    (text, h) => {
      assert.match(text, /You do not have access to this Work's knowledge read/);
      assert.equal(h.find((n) => n.tagName === "BUTTON"), null, "a denial offers no fake retry");
    },
  );
  await render(
    (async (url: RequestInfo | URL) => {
      if (String(url).includes("/rpc/work_knowledge_drift")) return jsonResponse({ message: "boom" }, 500);
      throw new Error("unexpected");
    }) as typeof fetch,
    (text, h) => {
      assert.match(text, /could not be determined/);
      assert.match(text, /not a Work that read nothing/i);
      const button = h.find((n) => n.tagName === "BUTTON");
      assert.ok(button, "a failed read offers a re-read rather than taking the panel down");
    },
  );
});

test("wkb.07 the drift banner rides on the block itself, in the wording the door's answer earns", async () => {
  await render(
    mockDrift(drift({
      drifted: true, relevant: true, moved_keys: ["sst_regime", "default_currency"],
      read_keys: ["sst_regime"], current_version: "50",
    })),
    (text, h) => {
      assert.match(text, /A record this Work read has changed/);
      assert.match(text, /sst_regime/);
      assert.ok(!/default_currency/.test(text.split("A record this Work read has changed")[1] ?? ""),
        "only the keys the Work READ are named — the intersection the door computed, not every moved key");
      assert.ok(h.find((n) => attr(n, "data-testid") === "work-knowledge-drift-relevant"));
    },
  );
  await render(
    mockDrift(drift({
      observed_from: "trace", read: null, read_keys: null, relevant: null,
      drifted: true, moved_keys: ["sst_regime"], current_version: "50",
    })),
    (text, h) => {
      assert.match(text, /changed after this Work last read it/);
      assert.ok(!/unrelated/i.test(text), "never a confident `unrelated` where no read-set was recorded");
      assert.ok(h.find((n) => attr(n, "data-testid") === "work-knowledge-drift-unrecorded"));
    },
  );
});
