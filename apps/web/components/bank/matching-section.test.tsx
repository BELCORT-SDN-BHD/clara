// components/bank/matching-section.tsx — INTERACTION tests (independent
// review on web/p3-bank, BLOCKER-2 + N9). Mounted for real via
// test/hookHarness.ts's `renderComponent`:
//   - a refusal from the match door renders VISIBLY (BLOCKER-2: the
//     ORIGINAL bug was that neither the match nor the unmatch acting form
//     rendered a refusal anywhere at all — the button simply un-busied,
//     reading as silent success on a money door).
//   - a refusal from the unmatch door renders VISIBLY too.
//   - the matched-cents field accepts "1,234.56"-style grouped input and
//     sends the CORRECT parsed cents on the wire, never parseInt's
//     truncate-at-the-first-comma "1,234" -> 1 (N9).
//
// Checkboxes/inputs are found by their PARENT ROW's text content, never by
// a fixed array index — building this test caught a real hookHarness bug
// (insertBefore always appended, ignoring the reference node, corrupting
// document order for any conditionally-mounted sibling; fixed at the
// source in test/hookHarness.ts) precisely because an ordinal index looked
// plausible right up until it silently pointed at the wrong control.
//
// EVERY shadcn `<Input>` here (the matched-cents field AND the unmatch
// form's two text fields) is @base-ui/react's `Input` primitive underneath —
// a thin wrapper around `Field.Control` (base-ui/react/input/Input.mjs),
// whose OWN onChange reads `event.currentTarget`/`event.nativeEvent` before
// ever reaching this component's onChange prop via base-ui's own
// prop-merging. A plain dispatched "input" event (this harness's
// `fireEvent`, which mirrors what react-dom's OWN delegated listener hands a
// handler) never gets that wrapper far enough to forward the call — the
// FIRST version of the unmatch-form test below dispatched exactly that and
// PASSED anyway, because its mock refused with a fixed body regardless of
// request content; only adding a body-capture assertion (seenUnmatchBodies)
// exposed that `p_match`/`p_reason` were still landing on the wire as empty
// strings. Every text `<Input>` in this file is therefore driven with
// `setFieldValue` (hookHarness.ts), which calls the control's onChange prop
// DIRECTLY with an event shape base-ui's wrapper actually needs — checkboxes,
// selects, and form submission all still go through real dispatch unchanged.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf, setNativeValue, setFieldValue } from "../../test/hookHarness";
import { configureSessionTokenSource, resetSessionTokenSource } from "@/lib/session-accessor";
import { MatchingSection } from "./matching-section";
import messages from "../../messages/en.json";

type Node = { tagName?: string; type?: string; checked?: boolean; value?: string; parentNode?: Node | null; childNodes?: Node[] };

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

function App() {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(MatchingSection, { clientId: "c1" }),
  });
}

const LINE = { line_id: "l1", statement_id: "s1", bank_account_id: "acc1", entry_date: "2026-04-05", description: "fee", amount_cents: -1500 };
const CANDIDATE = { entry_id: "e1", posting_date: "2026-04-05", memo: "misc payable", counterparty_name: "Acme", high_stakes: false };

async function mountAndSettle() {
  const h = await renderComponent(App());
  for (let i = 0; i < 3; i++) await h.settle();
  return h;
}

/** Every `<input type="checkbox">`, still connected to its live parent for
 *  content-based identification — never assume a fixed position. */
function checkboxes(h: Awaited<ReturnType<typeof renderComponent>>): Node[] {
  const found: Node[] = [];
  function walk(n: Node) {
    if (n.tagName === "INPUT" && n.type === "checkbox") found.push(n);
    for (const c of n.childNodes ?? []) walk(c);
  }
  walk(h.container as unknown as Node);
  return found;
}

/** The checkbox whose PARENT ROW's rendered text contains `needle` — content-
 *  based, immune to DOM-order assumptions. */
function checkboxNear(h: Awaited<ReturnType<typeof renderComponent>>, needle: string): Node {
  const box = checkboxes(h).find((b) => textOf((b.parentNode ?? {}) as never).includes(needle));
  assert.ok(box, `no checkbox found near "${needle}"`);
  return box!;
}

function hasAncestorText(node: Node, needle: string): boolean {
  let current = node.parentNode;
  for (let depth = 0; current && depth < 4; depth += 1, current = current.parentNode) {
    if (textOf(current as never).includes(needle)) return true;
  }
  return false;
}

test("BLOCKER-2: a match_bank_line refusal renders visibly in the match card, and the matched-cents field parses a grouped amount correctly (N9)", async () => {
  const seenMatchBodies: Record<string, unknown>[] = [];
  await withMockedEnv(
    async (u, init) => {
      const url = String(u);
      if (url.includes("/rpc/list_unmatched_lines")) return jsonResponse([LINE]);
      if (url.includes("/rpc/list_bank_match_candidates")) return jsonResponse([CANDIDATE]);
      if (url.includes("/rpc/match_bank_line")) {
        seenMatchBodies.push(JSON.parse(String(init?.body ?? "{}")));
        return jsonResponse({ code: "CLR10", message: "the two sides do not net to zero", details: '{"reason":"match_unbalanced"}' }, 400);
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await mountAndSettle();
      try {
        assert.equal(checkboxes(h).length, 1, "only the unmatched-line checkbox exists before any line is selected");
        const lineBox = checkboxNear(h, "fee");
        await h.fireEvent(lineBox as never, "click", (n) => setNativeValue(n as never, "checked", true));
        for (let i = 0; i < 3; i++) await h.settle(); // load candidates for the now-selected line's account

        assert.equal(checkboxes(h).length, 3, "the candidate-entry checkbox (and the ack checkbox) must now also render");
        const candidateBox = checkboxNear(h, "misc payable");
        await h.fireEvent(candidateBox as never, "click", (n) => setNativeValue(n as never, "checked", true));

        const centsInput = h.find(
          (n) => n.tagName === "INPUT" && (n as unknown as { type?: string }).type !== "checkbox"
            && hasAncestorText(n as unknown as Node, "misc payable"),
        );
        assert.ok(centsInput, "the matched-cents amount field must render inside the candidate's own row");
        await h.act(() => { setFieldValue(centsInput as never, "1,234.56"); });

        const matchButton = h.find((n) => n.tagName === "BUTTON" && textOf(n) === "Match");
        assert.ok(matchButton, "the Match submit button must render");
        await h.fireEvent(matchButton!, "click");
        for (let i = 0; i < 3; i++) await h.settle();

        assert.equal(seenMatchBodies.length, 1, "match_bank_line must have been called exactly once");
        const entries = seenMatchBodies[0]!.p_entries as { entry_id: string; matched_cents: number }[];
        assert.equal(entries[0]?.matched_cents, 123456, "\"1,234.56\" must parse to 123456 cents, never parseInt's truncate-at-comma \"1\"");

        // BLOCKER-2: the refusal must render SOMEWHERE visible — the original
        // defect was that it rendered NOWHERE (only the top unmatched-lines
        // card had a renderer at all).
        assert.match(h.text(), /the two sides do not net to zero/, "the match refusal must render visibly, not silently un-busy the button");
        assert.match(h.text(), /CLR10/, "the CLR code must render beside the message");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("BLOCKER-2: an unmatch_bank_match refusal renders visibly in the unmatch form, and the typed match id/reason genuinely reach the wire", async () => {
  const seenUnmatchBodies: Record<string, unknown>[] = [];
  await withMockedEnv(
    async (u, init) => {
      const url = String(u);
      if (url.includes("/rpc/list_unmatched_lines")) return jsonResponse([]);
      if (url.includes("/rpc/unmatch_bank_match")) {
        seenUnmatchBodies.push(JSON.parse(String(init?.body ?? "{}")));
        return jsonResponse({ code: "CLR10", message: "no such match", details: '{"reason":"match_not_found"}' }, 400);
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await mountAndSettle();
      try {
        const matchIdInput = h.find((n) => n.tagName === "INPUT" && textOf((n.parentNode ?? {}) as Node).includes("Match ID"));
        const reasonInput = h.find((n) => n.tagName === "INPUT" && textOf((n.parentNode ?? {}) as Node).includes("Reason"));
        assert.ok(matchIdInput && reasonInput, "the unmatch form's two text inputs must render");
        await h.act(() => {
          setFieldValue(matchIdInput as never, "match-1");
          setFieldValue(reasonInput as never, "wrong pair");
        });

        // The Unmatch button is `type="submit"` inside a <form onSubmit=…> —
        // a real browser turns a submit-button click into a native "submit"
        // event AT THE FORM; this stub does not replicate that browser
        // behaviour, so the test dispatches "submit" on the form directly
        // (react-dom delegates onSubmit the same way it delegates onClick).
        const form = h.find((n) => n.tagName === "FORM");
        assert.ok(form, "the unmatch form must render");
        await h.fireEvent(form!, "submit");
        for (let i = 0; i < 3; i++) await h.settle();

        assert.match(h.text(), /no such match/, "the unmatch refusal must render visibly in its own form");

        // Honesty check on THIS test itself: a fixed-response mock would let
        // this test "pass" even if the two inputs above never actually wrote
        // to component state (submitUnmatch would still fire with empty
        // strings and still get the same canned refusal). Assert the wire
        // body actually carries the TYPED values, not just that a refusal
        // rendered. This assertion is exactly what CAUGHT that the original
        // version of this test — which drove these two fields via plain
        // `fireEvent("input", …)` + `setNativeValue`, on the theory that a
        // "plain" shadcn `<Input>` needs no special handling — was a false
        // positive: it asserted the mock's fixed refusal text and nothing
        // about the request body, so it passed even though `p_match`/
        // `p_reason` reached the wire as EMPTY STRINGS (the same base-ui
        // Field.Control onChange-wrapper issue as the matching card's cents
        // field, not something unique to that one control). Fixed by driving
        // every text `<Input>` in this file through `setFieldValue`.
        assert.equal(seenUnmatchBodies.length, 1, "unmatch_bank_match must have been called exactly once");
        assert.equal(seenUnmatchBodies[0]!.p_match, "match-1", "the typed match id must reach the wire, not an empty default");
        assert.equal(seenUnmatchBodies[0]!.p_reason, "wrong pair", "the typed reason must reach the wire, not an empty default");
      } finally {
        await h.unmount();
      }
    },
  );
});
