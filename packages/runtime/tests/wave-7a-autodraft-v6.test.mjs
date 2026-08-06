// §7-A THE UNATTENDED SALES DRAFTER — the companion test for autoDraft_v5->v6 and
// chatTurn_v8->v9 (wave-7a-contract.md 7A-R2/7A-R3/7A-R7, skeleton §2a/§2f). Written
// post-merge, closing PR #203's independent review SF-1 (an unbroken repo precedent —
// every prior bump in this closure family shipped a companion test; this one did not).
//
// Four jobs:
//   1. VERSION FIDELITY — every one of the 12 new files is its prior version modulo the
//      documented delta, never more. The 7 pure-rename files (autoDraft.v6.infra/.ts,
//      chatTurn.v9.tools/impl/errors/infra/.ts) get a whole-file token-for-token compare
//      (the wave-b-autodraft-v3.test.mjs:432-440 idiom). The 4 files with a real delta
//      (autoDraft.v6.tools/impl/errors.ts, chatTurn.v9.prompt.ts) get the
//      ledger-44-autodraft-v4.test.mjs:319-343 masked-span idiom — mask exactly the
//      documented delta, assert everything else is byte-identical. autoDraft.v6.prompt.ts
//      is too large a rewrite to mask cell-by-cell (the whole system prompt gains
//      direction-determination + sales guidance); it gets wave-b-autodraft-v3.test.mjs's
//      own alternate idiom instead — clause-level has()/lacks() assertions, run against
//      BOTH versions so a "new" clause is proven absent from v5 and a "carried" clause is
//      proven present in v5 too (never a clause that merely happens to already match).
//   2. THE 6-ARITY SETTLE CALL-SITE, SOURCE-LEVEL — mock.module (Node 22+) is unavailable
//      on this repo's Node 20; getWorkflowMetadata() throws outside a real WDK step
//      execution (ledger-44's own precedent), so settleAutoDraftStep cannot be exercised
//      by direct call. Source-level regex assertions instead: the SQL text carries exactly
//      six placeholders ending `$6::text`; the params array's 6th element is `workflowRunId`,
//      destructured from `getWorkflowMetadata()` INSIDE the step, before the query fires;
//      and v5's call site is pinned the OTHER direction — still 5-parameter, no
//      getWorkflowMetadata() call anywhere in its settle step body.
//   3. THE COUNTERPARTY CONTRACT — deriveCounterpartyKind's three-value mapping pinned
//      directly; a structural (source-order) check that the payload spread puts the
//      derived `kind` LAST; and a BEHAVIOURAL check (deriveCounterpartyKind and
//      runDraftJournalEntry are both pure/DB-injected — no WDK-ambient call — so, unlike
//      the settle step, they ARE directly exercisable, mirroring wave-b-autodraft-v3.
//      test.mjs's own stubPools rig) proving the wrapper overwrites a model-supplied
//      `kind` that CONTRADICTS coding_kind, never trusting it even when present.
//   4. A short registry/freeze sanity check that this file's own premises (autoDraft_v6 /
//      chatTurn_v9 are the live registry pins; v5/v8 stay exported) still hold.
//
// Codex round-1 fix wave (tests-only, zero implementation-file changes; the cross-model
// gate returned NOT-READY on test-guard grounds only, core implementation verified solid
// by execution): (a) the impl.ts model user-message delta ("Draft the supplier bill..."
// -> "Draft the document...") is UNMASKED — both exact strings pinned directly, no
// placeholder — and RATIFIED as a documented §2a addendum (native review N-8 concurred:
// the old message would fight the v6 system prompt on a sales run); (b) the writer-args
// fidelity mask narrows from "the whole 14-element array" to ONLY positions 11
// (counterparty payload) and 14 (coding_kind), with a dedicated test asserting the other
// 12 positions token-identical to v5's own call site; (c) the settle fidelity mask
// narrows from "the whole function" to three tightly-scoped insertions (properly SCOPED
// to settleAutoDraftStep's own body — claimAutoDraftStep, earlier in this file, ALSO
// destructures workflowRunId from getWorkflowMetadata(), so an unscoped mask/replace
// would silently hit the wrong occurrence), plus an explicit params[0..4]-identical-to-v5
// cross-check; (d) the prompt.ts carried-invariant clause set expands from three
// (SST-zero, watch-existence-only, wiki) to cover every OTHER load-bearing v5 invariant:
// DB-owns-every-number, evidence-citation, MYR-only, no-guess, uncertainty-qualitative,
// and the closing citation-precision rule — each checked present in BOTH v5 and v6, so a
// mutant that quietly deleted one would fail here even though every other test stayed
// green.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { register } = await import("tsx/esm/api");
register();

const promptV6 = await import("../workflows/autoDraft.v6.prompt.ts");
const promptV5 = await import("../workflows/autoDraft.v5.prompt.ts");
const toolsV6 = await import("../workflows/autoDraft.v6.tools.ts");
const registryMod = await import("../workflows/registry.ts");

const { deriveCounterpartyKind, runDraftJournalEntry } = toolsV6;

const src = (name) => readFileSync(new URL(`../workflows/${name}`, import.meta.url), "utf8");
const asVN = (text, n) => text.replaceAll(`v${n}`, "vN").replaceAll(`V${n}`, "VN");
/** Drop the top-of-file block comment: it legitimately narrates each version's delta so it
 *  is EXPECTED to diverge; only the code from the first REAL import statement onward is
 *  compared. Line-anchored (mirrors the family's own dropHeader). */
function dropHeader(text) {
  const m = /^import /m.exec(text);
  assert.ok(m, "a real import statement must be present");
  return text.slice(m.index);
}

// ===========================================================================
// 1a. PURE-RENAME FILES — whole-file, token-for-token identical (header aside).
// ===========================================================================

/** PR #204: ToolCtx gains the `direction` field (infra.ts) — AND its own preceding JSDoc
 *  gained a clause naming it, so the mask must start BEFORE that comment, not just before
 *  the type literal. Anchored on ClaraPools's own stable closing (common to both versions).
 *  v5's ToolCtx declaration is a one-liner with no nested `{}`, so the first `};` after the
 *  type's own opening IS its own close on both sides — a safe anchor for either shape. */
function maskToolCtxType(text) {
  const startAnchor = "withRuntime<T>(fn: (c: PgExec) => Promise<T>): Promise<T>;\n};\n\n";
  const anchorIdx = text.indexOf(startAnchor);
  assert.ok(anchorIdx > 0, "ClaraPools's own closing must be present in both versions");
  const start = anchorIdx + startAnchor.length;
  const typeStart = text.indexOf("export type ToolCtx = {", start);
  assert.ok(typeStart >= start, "the ToolCtx type must follow ClaraPools in both versions");
  const end = text.indexOf("};", typeStart) + 2;
  assert.ok(end > typeStart + 1, "the type literal must close");
  return `${text.slice(0, start)}<the ToolCtx JSDoc + type literal — masked>${text.slice(end)}`;
}

test("autoDraft.v6.infra.ts differs from v5 ONLY inside the ToolCtx type literal (PR #204's new `direction` field; header narrative aside) — pools()/resolveModel/readScoped/writeScoped/safeRead are byte-identical", () => {
  const v6 = dropHeader(asVN(src("autoDraft.v6.infra.ts"), 6));
  const v5 = dropHeader(asVN(src("autoDraft.v5.infra.ts"), 5));
  assert.equal(maskToolCtxType(v6), maskToolCtxType(v5), "outside the masked ToolCtx type, autoDraft.v6.infra.ts must be a version-renamed copy of v5");
});

/** PR #204: the workflow entry's `ctx` object gains ONE new line, `direction: claim.ctx.
 *  direction,` — a pure insertion, absent from v5 entirely. */
function maskEntryDirectionField(text) {
  return text.replace("      direction: claim.ctx.direction,\n", "");
}

test("autoDraft.v6.ts differs from v5 ONLY in the ctx object's new `direction: claim.ctx.direction,` line (PR #204; header narrative aside) — the happy path, the catch block, and the finally block are otherwise byte-identical", () => {
  const v6 = dropHeader(asVN(src("autoDraft.v6.ts"), 6));
  const v5 = dropHeader(asVN(src("autoDraft.v5.ts"), 5));
  assert.equal(maskEntryDirectionField(v6), maskEntryDirectionField(v5), "outside the one masked line, autoDraft.v6.ts must be a version-renamed copy of v5");
});

test("v5's infra.ts / entry .ts have no `direction` field anywhere (proves PR #204's addition is genuinely NEW in v6, not carried)", () => {
  const v5infra = src("autoDraft.v5.infra.ts");
  const v5entry = src("autoDraft.v5.ts");
  assert.doesNotMatch(v5infra, /direction/);
  assert.doesNotMatch(v5entry, /direction/);
});

/** The KNOWN identifier/import-path renames between chatTurn v8 and v9 — targeted, not a
 *  blanket "v8"->"vN" substring replace (which would also rewrite legitimate historical
 *  version markers inside carried-forward prose — e.g. a JSDoc describing what v8 itself
 *  changed relative to v7 legitimately keeps saying "v8", and must keep saying it).
 *  Mirrors ledger-46-chatturn-v8-prompt.test.mjs's own V7_TO_V8_RENAMES precedent. */
const V8_TO_V9_RENAMES = [
  ["SYSTEM_PROMPT_V8", "SYSTEM_PROMPT_V9"],
  ["toTypedParts_v8", "toTypedParts_v9"],
  ["messageFromParts_v8", "messageFromParts_v9"],
  ["loadTaskStepV8", "loadTaskStepV9"],
  ["loadContextStepV8", "loadContextStepV9"],
  ["runModelSegmentStepV8", "runModelSegmentStepV9"],
  ["buildToolsV8", "buildToolsV9"],
  ["chatTurn_v8", "chatTurn_v9"],
  ["chatTurn.v8.prompt.js", "chatTurn.v9.prompt.js"],
  ["chatTurn.v8.errors.js", "chatTurn.v9.errors.js"],
  ["chatTurn.v8.infra.js", "chatTurn.v9.infra.js"],
  ["chatTurn.v8.impl.js", "chatTurn.v9.impl.js"],
  ["chatTurn.v8.tools.js", "chatTurn.v9.tools.js"],
  ["chatTurn.v8.ts", "chatTurn.v9.ts"],
  ["chatTurn.v8.impl.ts", "chatTurn.v9.impl.ts"],
  ["this batch's", "that batch's"], // a carried JSDoc's own "this batch" (=v8's batch) reads as "that batch" from v9
];
function upgradeV8(text) {
  let t = text;
  for (const [from, to] of V8_TO_V9_RENAMES) t = t.split(from).join(to);
  return t;
}

test("chatTurn.v9.tools/impl/errors/infra.ts + chatTurn.v9.ts are token-for-token identical to v8 (targeted renames only — every OTHER carried-forward historical reference to \"v8\" is untouched, header narrative aside)", () => {
  for (const part of ["tools", "impl", "errors", "infra", ""]) {
    const suffix = part ? `.${part}` : "";
    assert.equal(
      dropHeader(src(`chatTurn.v9${suffix}.ts`)),
      dropHeader(upgradeV8(src(`chatTurn.v8${suffix}.ts`))),
      `chatTurn.v9${suffix}.ts must be a version-renamed copy of v8 — this wave's ONE behavioural change lives entirely in chatTurn.v9.prompt.ts`,
    );
  }
});

// ===========================================================================
// 1b. autoDraft.v6.tools.ts — masked-diff vs v5 (skeleton §2a items 1-3).
// ===========================================================================

/** The new deriveCounterpartyKind export + its own JSDoc + runDraftJournalEntry's own
 *  JSDoc (both v5-absent) sit between readInvoiceFactState's close and
 *  runDraftJournalEntry's signature. */
function maskDeriveCounterpartyKindFn(text) {
  const anchor = "corroborated, explicitNonMyr };\n}\n\n";
  const start = text.indexOf(anchor);
  assert.ok(start > 0, "readInvoiceFactState's own closing must be present, unchanged, in both versions");
  const from = start + anchor.length;
  const endAnchor = "export async function runDraftJournalEntry(ctx: ToolCtx, input: DraftInput): Promise<DraftToolResult> {";
  const end = text.indexOf(endAnchor, from);
  assert.ok(end > from, "runDraftJournalEntry's own signature must follow");
  return `${text.slice(0, from)}<deriveCounterpartyKind + its own/the wrapper's JSDoc — masked>\n${text.slice(end)}`;
}

/** THE COUNTERPARTY CONTRACT's layer-2 block (skeleton §2a item 2): the derived-kind
 *  overwrite. v5 has no equivalent span at all (it builds no counterpartyPayload). */
function maskCounterpartyPayloadBlock(text) {
  const startAnchor = "    // 2. Assemble writer args.";
  const start = text.indexOf(startAnchor);
  assert.ok(start > 0, "the 'assemble writer args' comment must be present in both versions");
  const endAnchor = "    const receipt = await writeScoped(ctx, async (c: PgExec) => {";
  const end = text.indexOf(endAnchor, start);
  assert.ok(end > start, "the writeScoped call must follow");
  return `${text.slice(0, start)}<the counterparty-payload derivation block — masked>${text.slice(end)}`;
}

/** Split a comma-list respecting paren/bracket depth — Math.max(0, Math.round(tokens))
 *  and similar nested-call expressions must stay ONE element, never split on their own
 *  internal comma. Shared by the writer-args-array and settle-params-array extractors. */
function splitArgs(text) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of text) {
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Extract wake_draft_entry's 14-element writer args array, positionally. */
function extractWriterArgsArray(text) {
  const startMarker = "        [\n          clientId,";
  const start = text.indexOf(startMarker);
  assert.ok(start > 0, "the writer args array must be present in both versions");
  const arrayInnerStart = start + "        [\n".length;
  const endMarker = "        ],\n      );";
  const end = text.indexOf(endMarker, start);
  assert.ok(end > start, "the array's own close must follow");
  const inner = text.slice(arrayInnerStart, end);
  return { elements: splitArgs(inner), start, end };
}

/** THE COUNTERPARTY CONTRACT + item 1 (skeleton §2a): mask ONLY positions 11
 *  (the counterparty payload) and 14 (the coding_kind marker — the exact §0.1 headline
 *  defect this wave fixes). Reconstructed from the SAME extraction the dedicated
 *  14-position test below uses, so positions 1-10/12/13 are LEFT AS LITERAL TEXT here
 *  too — a mutation to any of those 12 positions fails THIS structural test, not only
 *  the dedicated one (Codex SF: stop masking the whole array). */
function maskWriterArgsArray(text) {
  const { elements, start, end } = extractWriterArgsArray(text);
  assert.equal(elements.length, 14, "the writer args array must have exactly 14 positions");
  const masked = elements.map((el, i) => (i === 10 || i === 13 ? `<position ${i + 1} masked>` : el));
  const maskedInner = `          ${masked.join(",\n          ")},\n`;
  return `${text.slice(0, start)}        [\n${maskedInner}${text.slice(end)}`;
}

/** read_document's own description text: "this bill's" -> "this document's" (a
 *  necessary direction-neutralisation sitting slightly outside the item-1..3 table). */
function maskReadDocumentDesc(text) {
  const startAnchor = 'read_document: tool({\n      description:\n        "Read';
  const start = text.indexOf(startAnchor);
  assert.ok(start > 0, "the read_document tool registration must be present in both versions");
  const endAnchor = "cite as evidence.\",";
  const end = text.indexOf(endAnchor, start);
  assert.ok(end > start, "the description must close");
  return `${text.slice(0, start)}<read_document description — masked>${text.slice(end + endAnchor.length)}`;
}

/** DRAFT_TOOL's own description (item 3: generalised to both directions). */
function maskDraftToolDesc(text) {
  const startAnchor = "[DRAFT_TOOL]: tool({\n      description:\n";
  const start = text.indexOf(startAnchor);
  assert.ok(start > 0, "the DRAFT_TOOL registration must be present in both versions");
  const endAnchor = "inputSchema: draftJournalEntryInputSchema,";
  const end = text.indexOf(endAnchor, start);
  assert.ok(end > start, "inputSchema must follow the description in both versions");
  return `${text.slice(0, start)}<the DRAFT_TOOL description — masked>${text.slice(end)}`;
}

/** PR #204: the errors.js import gains directionFamilyMismatchRefusal. */
function maskErrorsImportList(text) {
  return text
    .replace(
      'import { refusalFromDbError, directionFamilyMismatchRefusal } from "./autoDraft.vN.errors.js";',
      '<errors import list — masked>',
    )
    .replace('import { refusalFromDbError } from "./autoDraft.vN.errors.js";', '<errors import list — masked>');
}

/** PR #204 / 7A-R2, THE BOUND FAMILY: the early direction-family check inside
 *  runDraftJournalEntry, BEFORE the (unchanged, common) document_id pinning check. A pure
 *  INSERTION (v5 has nothing between these two common anchor lines) — the SAME symmetric
 *  slice-mask technique handles an insertion fine: both sides collapse to the identical
 *  placeholder regardless of how much (if anything) sat between the anchors. */
function maskDirectionFamilyCheck(text) {
  const startAnchor = "  const clientId = ctx.clientId;\n";
  const start = text.indexOf(startAnchor);
  assert.ok(start > 0, "the clientId binding must be present in both versions");
  const from = start + startAnchor.length;
  const endAnchor = "  if (input.document_id !== ctx.documentId) {";
  const end = text.indexOf(endAnchor, from);
  // >= , not > : on v5's side the two anchors are ADJACENT (zero gap — v5 has no early
  // check at all), so indexOf legitimately returns exactly `from`.
  assert.ok(end >= from, "the document_id pinning check must follow in both versions");
  return `${text.slice(0, from)}<the direction-family early check — masked>${text.slice(end)}`;
}

function maskToolsChanges(text) {
  return maskDirectionFamilyCheck(
    maskErrorsImportList(maskDraftToolDesc(maskReadDocumentDesc(maskWriterArgsArray(maskCounterpartyPayloadBlock(maskDeriveCounterpartyKindFn(text)))))),
  );
}

test("autoDraft.v6.tools.ts differs from v5 ONLY inside the documented §2a + PR #204 spans (the new deriveCounterpartyKind fn, the counterparty-payload derivation, the writer args array, read_document's description, DRAFT_TOOL's description, the errors import list, and the new direction-family early check) — every read tool's execute logic and the wrapper's authoritative-read plumbing are unchanged", () => {
  const v6 = dropHeader(asVN(src("autoDraft.v6.tools.ts"), 6));
  const v5 = dropHeader(asVN(src("autoDraft.v5.tools.ts"), 5));
  assert.equal(maskToolsChanges(v6), maskToolsChanges(v5), "outside the masked spans, autoDraft.v6.tools.ts must be a version-renamed copy of v5");
});

test("allowedCodingKindsForDirection: sales -> [sales_invoice, sales_credit_note]; purchase -> [supplier_bill]; null -> null (no early family to validate — the DB draft writer stays sole authority)", () => {
  assert.deepEqual(toolsV6.allowedCodingKindsForDirection("sales"), ["sales_invoice", "sales_credit_note"]);
  assert.deepEqual(toolsV6.allowedCodingKindsForDirection("purchase"), ["supplier_bill"]);
  assert.equal(toolsV6.allowedCodingKindsForDirection(null), null);
});

test("v5's tools.ts has no allowedCodingKindsForDirection / directionFamilyMismatchRefusal at all (proves the bound-family early check is genuinely NEW in v6, not carried)", () => {
  const v5 = src("autoDraft.v5.tools.ts");
  assert.doesNotMatch(v5, /allowedCodingKindsForDirection/);
  assert.doesNotMatch(v5, /directionFamilyMismatchRefusal/);
  assert.doesNotMatch(v5, /ctx\.direction/);
});

test("v5's tools.ts has no deriveCounterpartyKind or counterpartyPayload at all (proves the derivation is genuinely NEW in v6, not carried)", () => {
  const v5 = src("autoDraft.v5.tools.ts");
  assert.doesNotMatch(v5, /deriveCounterpartyKind/);
  assert.doesNotMatch(v5, /counterpartyPayload/);
});

test("the wake_draft_entry writer args array: positions 1-10 and 12-13 (12 of 14) are token-IDENTICAL between v6 and v5; ONLY positions 11 and 14 differ, and they differ to exactly the documented values — a mutant that changed any OTHER position (e.g. shuffled sha256/booksVersion/evidence) is caught HERE, not only by the structural mask above", () => {
  const v6 = extractWriterArgsArray(src("autoDraft.v6.tools.ts")).elements;
  const v5 = extractWriterArgsArray(src("autoDraft.v5.tools.ts")).elements;
  assert.equal(v6.length, 14, "v6 writer args must have exactly 14 positions");
  assert.equal(v5.length, 14, "v5 writer args must have exactly 14 positions");
  for (let i = 0; i < 14; i++) {
    if (i === 10 || i === 13) continue; // positions 11 and 14 (0-indexed 10, 13) — the two documented deltas
    assert.equal(v6[i], v5[i], `writer arg position ${i + 1} must be token-identical to v5's — v6="${v6[i]}" v5="${v5[i]}"`);
  }
  assert.equal(v6[10], "JSON.stringify(counterpartyPayload)", "v6 position 11 must pass the DERIVED counterparty payload");
  assert.equal(v5[10], "JSON.stringify(input.vendor)", "v5 position 11 (regression pin — the pre-derivation shape)");
  assert.equal(v6[13], "input.coding_kind", "v6 position 14 must pass input.coding_kind — the §0.1 headline defect this wave fixes");
  assert.equal(v5[13], '"supplier_bill"', "v5 position 14 (regression pin — the hardcoded literal this wave replaces)");
});

// ===========================================================================
// 1c. autoDraft.v6.impl.ts — masked-diff vs v5 (skeleton §2a item (d) / §2d).
//     Mirrors the ledger-44-autodraft-v4.test.mjs:319-343 maskModelStepChange idiom.
// ===========================================================================

/** The model's own user-message text — now a DYNAMIC template (PR #204 appends
 *  `${directionClause}`), so this mask no longer targets one fixed v6 string; it targets
 *  the STRUCTURE (the template literal itself, whatever directionClause currently reads)
 *  vs v5's one fixed string. The REAL verification is the dedicated tests below, which pin
 *  directionClause's own three-way ternary text exactly, plus a regression pin that v5's
 *  original fixed string is untouched. */
function maskUserMessageLine(text) {
  return text
    .replace(
      "{ role: \"user\", content: `Draft the document for document ${ctx.documentId} (filing ${ctx.filingId}).${directionClause}` },",
      "<user message template — pinned exactly by the dedicated tests below, not by this mask>",
    )
    .replace(
      '{ role: "user", content: `Draft the supplier bill for document ${ctx.documentId} (filing ${ctx.filingId}).` },',
      "<user message template — pinned exactly by the dedicated tests below, not by this mask>",
    );
}

/** PR #204: the new `directionClause` const declaration, inserted between the (unchanged,
 *  common) `buildAutoDraftTools(ctx)` call and the (now-templated, separately masked)
 *  messages array. A pure insertion — v5 has nothing between these two common anchors. */
function maskDirectionClauseDeclaration(text) {
  const startAnchor = "  const tools = buildAutoDraftTools(ctx);\n";
  const start = text.indexOf(startAnchor);
  assert.ok(start > 0, "the tools binding must be present in both versions");
  const from = start + startAnchor.length;
  const endAnchor = "  const messages: ModelMessage[] = [\n";
  const end = text.indexOf(endAnchor, from);
  // >= , not > : v5's two anchor lines are ADJACENT (v5 has no directionClause at all), so
  // indexOf legitimately returns exactly `from` on that side.
  assert.ok(end >= from, "the messages array must follow in both versions");
  return `${text.slice(0, from)}<the directionClause declaration — masked>${text.slice(end)}`;
}

test("v6's model user-message is direction-generic (\"Draft the document...\"), replacing v5's purchase-only \"Draft the supplier bill...\" — RATIFIED as a necessary §2a addendum (Codex round-1: the old message would fight the v6 system prompt on a sales run; native review N-8 concurs). PR #204 ADDS a dynamic ${directionClause} suffix on top — both v6's template STRUCTURE and v5's original fixed string are pinned, no mask", () => {
  const v6 = src("autoDraft.v6.impl.ts");
  const v5 = src("autoDraft.v5.impl.ts");
  assert.ok(
    v6.includes("{ role: \"user\", content: `Draft the document for document ${ctx.documentId} (filing ${ctx.filingId}).${directionClause}` },"),
    "v6 must use the exact direction-generic template, with the directionClause suffix appended",
  );
  assert.ok(
    v5.includes('{ role: "user", content: `Draft the supplier bill for document ${ctx.documentId} (filing ${ctx.filingId}).` },'),
    "v5 must still carry its exact original purchase-only user message (regression pin)",
  );
});

test("PR #204: directionClause's three-way ternary is pinned exactly — 'sales' -> the SALES sentence naming sales_invoice/sales_credit_note, 'purchase' -> the PURCHASE sentence naming supplier_bill, anything else (including null) -> the empty string", () => {
  const v6 = src("autoDraft.v6.impl.ts");
  assert.match(
    v6,
    /ctx\.direction === "sales"\s*\n\s*\? ' This admission is bound to the SALES direction — propose coding_kind "sales_invoice" or "sales_credit_note" accordingly\.'/,
    "the SALES branch must name both sales coding_kind values",
  );
  assert.match(
    v6,
    /: ctx\.direction === "purchase"\s*\n\s*\? ' This admission is bound to the PURCHASE direction — propose coding_kind "supplier_bill" accordingly\.'/,
    "the PURCHASE branch must name supplier_bill",
  );
  assert.match(v6, /:\s*""\s*;/, "the fallback (null / anything else) must be the empty string — no clause appended");
});

test("v5's impl.ts has no directionClause / ctx.direction anywhere (proves the direction hint is genuinely NEW in v6, not carried)", () => {
  const v5 = src("autoDraft.v5.impl.ts");
  assert.doesNotMatch(v5, /directionClause/);
  assert.doesNotMatch(v5, /ctx\.direction/);
});

/** PR #204: AutoDraftContext gains `direction: "sales" | "purchase" | null;` — a pure
 *  insertion right after `reservedTokens: number;`, before the type literal's own close. */
function maskAutoDraftContextDirectionField(text) {
  // AutoDraftContext's own preceding JSDoc gained a clause naming the new field too, so the
  // mask must start BEFORE that comment — anchored on the stable, common export statement
  // right above it (post-asVN, both versions read "SYSTEM_PROMPT_AUTODRAFT_VN").
  const startAnchor = "export { SYSTEM_PROMPT_AUTODRAFT_VN };\n\n";
  const anchorIdx = text.indexOf(startAnchor);
  assert.ok(anchorIdx > 0, "the SYSTEM_PROMPT re-export must be present in both versions");
  const from = anchorIdx + startAnchor.length;
  const typeAnchor = text.indexOf("export type AutoDraftContext = {", from);
  assert.ok(typeAnchor >= from, "AutoDraftContext's own type declaration must follow in both versions");
  const end = text.indexOf("};", typeAnchor) + 2;
  assert.ok(end > typeAnchor + 1, "AutoDraftContext's own type literal must close");
  return `${text.slice(0, from)}<the AutoDraftContext JSDoc + direction field — masked>${text.slice(end)}`;
}

/** PR #204: TWO scoped insertions inside claimAutoDraftStep's OWN body — the receipt type's
 *  new `direction?: string | null;` field, and the returned ctx literal's new `direction:
 *  receipt.direction === ... ? ... : null,` field. Both pure insertions, anchored on common,
 *  unchanged lines either side. */
function maskClaimDirectionFields(text) {
  let t = text;
  const receiptAnchor = "      reserved_tokens?: number | string;\n";
  const receiptIdx = t.indexOf(receiptAnchor);
  assert.ok(receiptIdx > 0, "the receipt type's reserved_tokens field must be present in both versions");
  const receiptFrom = receiptIdx + receiptAnchor.length;
  const receiptEnd = t.indexOf("    };", receiptFrom);
  // >= , not > : v5's anchor and the type's own close are ADJACENT (zero gap — v5 has no
  // direction field at all), so indexOf legitimately returns exactly `receiptFrom` there.
  assert.ok(receiptEnd >= receiptFrom, "the receipt type literal must close");
  t = `${t.slice(0, receiptFrom)}<the receipt type's own direction field — masked>${t.slice(receiptEnd)}`;

  const ctxAnchor = "        reservedTokens: Number(receipt.reserved_tokens ?? 0),\n";
  const ctxIdx = t.indexOf(ctxAnchor);
  assert.ok(ctxIdx > 0, "the returned ctx literal's reservedTokens field must be present in both versions");
  const ctxFrom = ctxIdx + ctxAnchor.length;
  const ctxEnd = t.indexOf("      },\n    };", ctxFrom);
  assert.ok(ctxEnd >= ctxFrom, "the returned ctx literal must close"); // same zero-gap reasoning
  return `${t.slice(0, ctxFrom)}<the returned ctx literal's own direction field — masked>${t.slice(ctxEnd)}`;
}

test("autoDraft.v6.impl.ts: AutoDraftContext's own direction field + claimAutoDraftStep's two scoped direction insertions are masked as PRECISELY those spans — every OTHER field/line in the type and the function is compared as literal text", () => {
  // A narrow, self-contained probe: these three masks compose over v6's own text and must
  // each find their anchors (the asserts inside the mask functions do the real checking);
  // this test exists so a broken anchor fails HERE with a clear name, not silently inside
  // the big structural test below.
  const v6 = asVN(src("autoDraft.v6.impl.ts"), 6); // maskAutoDraftContextDirectionField anchors post-asVN
  maskAutoDraftContextDirectionField(v6);
  maskClaimDirectionFields(v6);
});

/** The settle step's own JSDoc tail (the §2d rationale, v6-only — a genuine VALUE change,
 *  masked as one small precise span) plus FOUR scoped insertions/edits inside
 *  settleAutoDraftStep's OWN body (never file-wide: claimAutoDraftStep, earlier in this
 *  same file, ALSO destructures workflowRunId from getWorkflowMetadata() — an unscoped
 *  replace would silently hit the WRONG occurrence): the workflowRunId destructure line,
 *  the `const r = ` capture + the SQL text's trailing `$6::text) as receipt` addition, the
 *  params array's trailing workflowRunId element, and (PR #204) the new
 *  receipt/settled-check block appended after the query call. Everything else in the
 *  function — the signature, "use step", and params[0..4] — is left as LITERAL text, so a
 *  mutation there fails THIS test too, not only the dedicated params-array test below
 *  (Codex SF: stop masking the whole function). */
function maskSettleFunction(text) {
  const jsDocStart = text.indexOf(" *  writes the sweep_run_items row, and updates the registry counters (a 2nd failure parks)");
  assert.ok(jsDocStart > 0, "the settle step's own JSDoc tail lead-in must be present in both versions");
  const jsDocEnd = text.indexOf("*/", jsDocStart);
  assert.ok(jsDocEnd > jsDocStart, "the JSDoc must close");

  const fnStart = text.indexOf("export async function settleAutoDraftStep(", jsDocEnd);
  assert.ok(fnStart > jsDocEnd, "settleAutoDraftStep's own signature must follow its JSDoc");
  const fnEnd = text.indexOf("/** Open a scoped open-question", fnStart);
  assert.ok(fnEnd > fnStart, "openSweepQuestionStep's own doc-comment must follow");
  let fnBody = text.slice(fnStart, fnEnd);
  fnBody = fnBody.replace("  const { workflowRunId } = getWorkflowMetadata();\n", "");
  fnBody = fnBody.replace("  const r = await pools().withRuntime((c) =>\n", "  await pools().withRuntime((c) =>\n");
  fnBody = fnBody.replace(
    'c.query("select clara.settle_autodraft_task($1, $2, $3, $4, $5::jsonb, $6::text) as receipt", [',
    'c.query("select clara.settle_autodraft_task($1, $2, $3, $4, $5::jsonb)", [',
  );
  fnBody = fnBody.replace("\n      workflowRunId,\n    ]),", "\n    ]),");
  fnBody = fnBody.replace(
    "\n  const receipt = (r.rows[0]?.receipt ?? {}) as { settled?: boolean; outcome?: string; reason?: string };" +
      "\n  if (receipt.settled === false) {" +
      "\n    // run_superseded (or, in principle, any sibling losing-dispatch reason): this run lost" +
      "\n    // the run-identity race. Nothing was written on this call; the winning run's own settle" +
      "\n    // already owns (or will own) the real accounting. Benign — return without throwing." +
      "\n    return;" +
      "\n  }",
    "",
  );

  return `${text.slice(0, jsDocStart)}<settle JSDoc tail — masked>${text.slice(jsDocEnd, fnStart)}${fnBody}${text.slice(fnEnd)}`;
}

function maskImplChanges(text) {
  return maskSettleFunction(
    maskClaimDirectionFields(maskAutoDraftContextDirectionField(maskDirectionClauseDeclaration(maskUserMessageLine(text)))),
  );
}

test("autoDraft.v6.impl.ts differs from v5 ONLY inside the documented §2a + PR #204 spans (the settle step's JSDoc tail + its four scoped insertions, AutoDraftContext's direction field, claimAutoDraftStep's two direction insertions, the directionClause declaration, and the templated user message — pinned exactly by the tests above, not masked away) — recover/question/close and consumeAutoDraftModelResult's stream-error tagging are unchanged, INCLUDING the settle function's own signature, \"use step\" directive, and params[0..4], which are compared as LITERAL text here (not masked)", () => {
  const v6 = dropHeader(asVN(src("autoDraft.v6.impl.ts"), 6));
  const v5 = dropHeader(asVN(src("autoDraft.v5.impl.ts"), 5));
  assert.equal(maskImplChanges(v6), maskImplChanges(v5), "outside the masked spans, autoDraft.v6.impl.ts must be a version-renamed copy of v5");
});

test("PR #204: settleAutoDraftStep's SQL text carries the `as receipt` alias, and the receipt is read explicitly (settled/outcome/reason) — the settle no-op is now OBSERVABLE, not merely accidental", () => {
  const body = extractSettleStepBody(src("autoDraft.v6.impl.ts"));
  assert.match(body, /as receipt/, "the SQL call must alias its return value");
  assert.match(body, /const receipt = \(r\.rows\[0\]\?\.receipt \?\? \{\}\) as \{ settled\?: boolean; outcome\?: string; reason\?: string \};/);
  assert.match(body, /if \(receipt\.settled === false\) \{/, "a losing dispatch (settled:false) must be checked explicitly");
  assert.match(body, /return;/, "a losing dispatch must return WITHOUT throwing — a benign no-op, matching 0036's task_superseded/registry_superseded/registry_released pattern");
});

test("v5's settle step never reads its own query result at all (fire-and-forget) — proves the explicit settled:false check is genuinely NEW in v6, not carried", () => {
  const body = extractSettleStepBody(src("autoDraft.v5.impl.ts"));
  assert.doesNotMatch(body, /as receipt/);
  assert.doesNotMatch(body, /receipt\.settled/);
});

// ===========================================================================
// 1d. autoDraft.v6.errors.ts — masked-diff vs v5 (skeleton §2a item (e)).
// ===========================================================================

/** The Clr21Reason union's own two new members + the new Clr10Reason type + their own
 *  doc-comment (which ALSO gains a "0036/0016 pins" citation, replacing "pins §2/§6" —
 *  masked from the stable DbError-type close through the stable reasonFromDetail doc). */
function maskReasonTypes(text) {
  const startAnchor = "constraint?: string };\n\n/** CLR21 reason tokens";
  const start = text.indexOf(startAnchor);
  assert.ok(start > 0, "the DbError type's own close must be present in both versions");
  const endAnchor = '/** Parse the `{ "reason": <token> }`';
  const end = text.indexOf(endAnchor, start);
  assert.ok(end > start, "reasonFromDetail's own doc-comment must follow");
  return `${text.slice(0, start)}<the Clr21Reason/Clr10Reason type block — masked>${text.slice(end)}`;
}

/** MESSAGES' own doc-comment (gains a "direction-neutral" sentence) + the const itself
 *  (CLR21/CLR23/CLR26/CLR29 reworded off "bill"/"supplier"). */
function maskMessagesBlock(text) {
  const startAnchor = "/** Oracle-safe message per CLR code";
  const start = text.indexOf(startAnchor);
  assert.ok(start > 0, "the MESSAGES doc-comment must be present in both versions");
  const endAnchor = "/** Dynamic (arbitrary-code) message lookup";
  const end = text.indexOf(endAnchor, start);
  assert.ok(end > start, "messageFor's own doc-comment must follow");
  return `${text.slice(0, start)}<the MESSAGES block — masked>${text.slice(end)}`;
}

/** CLR21_REASON_MESSAGES (reworded off "bill"/"supplier", + the two new tax_leg_missing/
 *  type_polarity_mismatch entries) + the new CLR10_REASON_MESSAGES const (v5-absent). */
function maskReasonMessagesBlock(text) {
  const startAnchor = "const CLR21_REASON_MESSAGES: Record<Clr21Reason, string> = {";
  const start = text.indexOf(startAnchor);
  assert.ok(start > 0, "CLR21_REASON_MESSAGES must be present in both versions");
  const endAnchor = "/**\n * Map a caught DB error";
  const end = text.indexOf(endAnchor, start);
  assert.ok(end > start, "refusalFromDbError's own doc-comment must follow");
  return `${text.slice(0, start)}<the CLR21/CLR10 reason-messages block — masked>${text.slice(end)}`;
}

/** The new CLR10 branch inside refusalFromDbError (v5-absent entirely — v5's CLR10 falls
 *  straight through to the generic messageFor(code) path with no reason handling). */
function maskClr10Branch(text) {
  const startAnchor = 'return { type: "refusal", code: "CLR21", reason, message };\n  }\n';
  const start = text.indexOf(startAnchor);
  assert.ok(start > 0, "the CLR21 branch's own close must be present in both versions");
  const from = start + startAnchor.length;
  const endAnchor = 'if (code === "CLR29") {';
  const end = text.indexOf(endAnchor, from);
  assert.ok(end > from, "the CLR29 branch must follow");
  return `${text.slice(0, from)}<the new CLR10 branch — masked>${text.slice(end)}`;
}

/** The "internal" fallback message ("This bill..." -> "This document..."). */
function maskInternalFallback(text) {
  const startAnchor = 'return { type: "refusal", code: "internal", message: "';
  const start = text.indexOf(startAnchor);
  assert.ok(start > 0, "the internal fallback must be present in both versions");
  const end = text.indexOf("};", start);
  assert.ok(end > start, "the fallback statement must close");
  return `${text.slice(0, start)}<the internal fallback message — masked>${text.slice(end)}`;
}

/** PR #204: the new directionFamilyMismatchRefusal() factory (v5-absent entirely — a pure
 *  insertion right after noDraftRefusal's own closing brace, before readToolRefusalMessage's
 *  doc-comment). */
function maskDirectionFamilyMismatchRefusalFn(text) {
  const startAnchor =
    'export function noDraftRefusal(): RefusalPart {\n' +
    '  return runtimeRefusal("CLR21", "coding_incomplete", CLR21_REASON_MESSAGES.coding_incomplete);\n' +
    '}\n\n';
  const start = text.indexOf(startAnchor);
  assert.ok(start > 0, "noDraftRefusal's own closing must be present, unchanged, in both versions");
  const from = start + startAnchor.length;
  const endAnchor = "/** An oracle-safe string a READ tool returns";
  const end = text.indexOf(endAnchor, from);
  // >= , not > : v5's noDraftRefusal close and readToolRefusalMessage's doc-comment are
  // ADJACENT (v5 has no directionFamilyMismatchRefusal at all), so indexOf legitimately
  // returns exactly `from` on that side.
  assert.ok(end >= from, "readToolRefusalMessage's own doc-comment must follow");
  return `${text.slice(0, from)}<directionFamilyMismatchRefusal — masked>${text.slice(end)}`;
}

function maskErrorsChanges(text) {
  return maskDirectionFamilyMismatchRefusalFn(maskInternalFallback(maskClr10Branch(maskReasonMessagesBlock(maskMessagesBlock(maskReasonTypes(text))))));
}

test("autoDraft.v6.errors.ts differs from v5 ONLY inside the documented §2a(e) + PR #204 spans (the new reason types incl. counterparty_kind_contradiction/direction_family_mismatch, the reworded MESSAGES/CLR21_REASON_MESSAGES, the new CLR10_REASON_MESSAGES, the new CLR10 branch, the reworded internal fallback, and the new directionFamilyMismatchRefusal factory) — every native-constraint collapse (23505/23503/23514/42501) and readToolRefusalMessage are unchanged", () => {
  const v6 = dropHeader(asVN(src("autoDraft.v6.errors.ts"), 6));
  const v5 = dropHeader(asVN(src("autoDraft.v5.errors.ts"), 5));
  assert.equal(maskErrorsChanges(v6), maskErrorsChanges(v5), "outside the masked spans, autoDraft.v6.errors.ts must be a version-renamed copy of v5");
});

const errorsV6 = await import("../workflows/autoDraft.v6.errors.ts");

test("directionFamilyMismatchRefusal() pins the exact refusal shape — the SAME CLR21 reason token the DB draft writer raises for the identical contradiction, so a bookkeeper sees one message whichever layer caught it", () => {
  const r = errorsV6.directionFamilyMismatchRefusal();
  assert.deepEqual(r, {
    type: "refusal",
    code: "CLR21",
    reason: "direction_family_mismatch",
    message: "The proposed coding kind does not match this document's admitted direction (sales vs purchase).",
  });
});

test("refusalFromDbError surfaces counterparty_kind_contradiction with its OWN specific message, not the generic CLR21 fallback (PR #204 — the DB draft writer's own layer-3 rejection)", () => {
  const r = errorsV6.refusalFromDbError({ code: "CLR21", detail: '{"reason":"counterparty_kind_contradiction"}' });
  assert.equal(r.code, "CLR21");
  assert.equal(r.reason, "counterparty_kind_contradiction");
  assert.notEqual(r.message, "This document cannot be coded as proposed.", "must NOT fall back to the generic CLR21 message");
  assert.match(r.message, /counterparty/i);
});

test("refusalFromDbError surfaces direction_family_mismatch with the SAME message directionFamilyMismatchRefusal() itself returns (one message, two layers)", () => {
  const r = errorsV6.refusalFromDbError({ code: "CLR21", detail: '{"reason":"direction_family_mismatch"}' });
  assert.equal(r.code, "CLR21");
  assert.equal(r.reason, "direction_family_mismatch");
  assert.equal(r.message, errorsV6.directionFamilyMismatchRefusal().message);
});

test("v5's errors.ts has neither counterparty_kind_contradiction nor direction_family_mismatch anywhere (proves both are genuinely NEW in v6, not carried)", () => {
  const v5 = src("autoDraft.v5.errors.ts");
  assert.doesNotMatch(v5, /counterparty_kind_contradiction/);
  assert.doesNotMatch(v5, /direction_family_mismatch/);
});

// ===========================================================================
// 1e. chatTurn.v9.prompt.ts — masked-diff vs v8 (skeleton §2f: ONE behavioural change).
// ===========================================================================

const V8_TO_V9_PROMPT_RENAMES = [
  ["SYSTEM_PROMPT_V8", "SYSTEM_PROMPT_V9"],
  ["toTypedParts_v8", "toTypedParts_v9"],
  ["chatTurn.v8.impl.ts", "chatTurn.v9.impl.ts"],
];
function upgradeV8Prompt(text) {
  let t = text;
  for (const [from, to] of V8_TO_V9_PROMPT_RENAMES) t = t.split(from).join(to);
  return t;
}

/** The ONE new sentence-group (v9:176-179), appended to the end of the supplier-bill
 *  paragraph, right after its own "Call `draft_journal_entry`..." call-to-action. */
function maskNewSentence(text) {
  const startAnchor = 'Call `draft_journal_entry` with coding_kind \\"supplier_bill\\".",';
  const start = text.indexOf(startAnchor);
  assert.ok(start > 0, "the supplier_bill call-to-action must be present in both versions");
  const from = start + startAnchor.length;
  const endAnchor = '"Coding a sales invoice';
  const end = text.indexOf(endAnchor, from);
  assert.ok(end > from, "the sales-invoice paragraph must follow in both versions");
  return `${text.slice(0, from)}<the v9 anti-primacy sentence — masked>${text.slice(end)}`;
}

test("chatTurn.v9.prompt.ts differs from v8 ONLY in the ONE new sentence-group appended to the supplier-bill paragraph (targeted renames + header narrative aside) — the clarify tool, the draft schema, and every typed-part shape are unchanged", () => {
  const v9 = dropHeader(src("chatTurn.v9.prompt.ts"));
  const v8 = dropHeader(upgradeV8Prompt(src("chatTurn.v8.prompt.ts")));
  assert.equal(maskNewSentence(v9), maskNewSentence(v8), "outside the masked span, chatTurn.v9.prompt.ts must be a version-renamed copy of v8");
});

test("v8's supplier-bill paragraph does NOT already carry the anti-primacy sentence (proves it is genuinely NEW in v9)", () => {
  assert.doesNotMatch(promptV5.SYSTEM_PROMPT_AUTODRAFT_V5, /is NEVER coded here even if it superficially resembles/, "sanity: this is a chatTurn clause, not an autoDraft one — confirms the two prompts are independent");
  const v8Body = src("chatTurn.v8.prompt.ts");
  assert.doesNotMatch(v8Body, /is NEVER coded here even if it superficially resembles a bill/, "v8's own text must not already carry this sentence");
});

// ===========================================================================
// 2. autoDraft.v6.prompt.ts — too large a rewrite to mask cell-by-cell (the WHOLE
//    system prompt gains direction-determination + sales guidance). Clause-level
//    has()/lacks() assertions instead, mirroring wave-b-autodraft-v3.test.mjs's own
//    alternate idiom for this exact situation. Every "carried" assertion is ALSO
//    checked present in v5 (proves it is genuinely carried, not new text that
//    happens to match); every "new" assertion is ALSO checked absent from v5
//    (proves it is genuinely new, not carried text this test merely restates).
// ===========================================================================

const P6 = promptV6.SYSTEM_PROMPT_AUTODRAFT_V6.replace(/\s+/g, " ");
const P5 = promptV5.SYSTEM_PROMPT_AUTODRAFT_V5.replace(/\s+/g, " ");
const has = (hay, needle, why) => assert.ok(hay.includes(needle), `${why}\n  MISSING CLAUSE: ${needle}`);
const lacks = (hay, needle, why) => assert.ok(!hay.includes(needle), `${why}\n  CLAUSE MUST BE GONE: ${needle}`);

test("v6 carries the SST-zero purchase leg-shape rule byte-for-byte from v5 (both branches, unchanged) — this wave does not touch the ledger #46 precedent", () => {
  const clause2leg =
    "NO stated tax in the facts, OR a stated tax that is EXACTLY ZERO: a TWO-leg entry — the expense account(s) DEBIT for the GROSS, and the Accounts Payable CREDIT for the same GROSS.";
  const clause3leg =
    "A STATED NONZERO tax amount in the facts: a THREE-leg VISIBILITY split — the expense account(s) DEBIT for the NET, ONE tied SST-portion-of-cost DEBIT leg equal EXACTLY to the stated tax figure from the facts";
  has(P6, clause2leg, "the 2-leg branch persists in v6");
  has(P5, clause2leg, "…and is genuinely CARRIED (present in v5 too)");
  has(P6, clause3leg, "the 3-leg branch persists in v6");
  has(P5, clause3leg, "…and is genuinely CARRIED (present in v5 too)");
  has(P6, "Malaysian SST has NO input-tax credit", "the no-input-tax-credit doctrine persists");
});

test("v6 carries the SST-registration-watch EXISTENCE-ONLY framing byte-for-byte from v5", () => {
  const c1 =
    "Because no human is watching this run, the ONLY thing you may ever say about it is that an SST registration watch is OPEN for this client and that the professional handles it in the review queue.";
  const c2 =
    'NEVER quote any figure, status, tier, window, or deadline from it, and NEVER draw ANY conclusion from it: no liability, no registration status, no tax computation, no multiplying by 8%, no threshold judgement, no future-method inference, and never "below threshold" or "no issue".';
  const c3 = "This unattended sweep NEVER acts on it — surfacing and professional review belong to the attended chat lane.";
  for (const c of [c1, c2, c3]) {
    has(P6, c, "the watch existence-only clause persists in v6");
    has(P5, c, "…and is genuinely CARRIED (present in v5 too)");
  }
});

test("v6 carries the wiki-notes framing (inform-never-decide, the citation law, the freshness token) byte-for-byte from v5", () => {
  const c1 = "Clara's wiki notes: the context pack may include a `wiki` block";
  const c2 = "Wiki content may INFORM this draft; it may NEVER decide one";
  const c3 =
    "every DB gate, bound, floor, and autopost rule stays authoritative regardless of what the wiki says, and this sweep draft remains human-reviewed under the same acknowledgement floors as any other draft.";
  const c4 =
    "The books_version freshness token stays authoritative regardless of the wiki's projection lag — never treat a wiki note as more current than the books.";
  for (const c of [c1, c2, c3, c4]) {
    has(P6, c, "the wiki-notes clause persists in v6");
    has(P5, c, "…and is genuinely CARRIED (present in v5 too)");
  }
});

test("v6 carries EVERY other load-bearing invariant clause from v5's prompt, byte-for-byte (Codex SF: enumerate v5's invariant clauses and cover each — a mutant that quietly deleted one of these would stay green everywhere else)", () => {
  const clauses = [
    ["You never approve, post, or finalise anything, and a human approves every draft.", "human-approves-every-draft (agent-never-signs, ADR-015)"],
    ["The database owns every number: never compute, sum, or invent a figure", "DB-owns-every-number / no-computed-figure rule"],
    ["read amounts from the document's extracted invoice facts and cite them (region id + exact quote per amount).", "evidence-citation requirement"],
    ["This ledger is MYR-only.", "MYR-only rule"],
    [
      "DO NOT draft and DO NOT guess: reply with a short plain-text explanation of exactly what is blocking the draft. There is no human to ask right now; a truthful non-draft is correct.",
      "no-guess / truthful-non-draft rule",
    ],
    ["State any uncertainty qualitatively with alternatives — never a percentage, never a suspense account.", "uncertainty-qualitative rule"],
    ["Be concise and precise. Cite the figures you read rather than paraphrasing them loosely.", "closing citation-precision rule"],
  ];
  for (const [c, why] of clauses) {
    has(P6, c, `v6 carries: ${why}`);
    has(P5, c, `…and it is genuinely CARRIED — present in v5 too (${why})`);
  }
});

test("v6 gains the DB-authoritative BOUND-direction framing (7A-R2: coding_kind is a checked proposal, never routing authority) — genuinely NEW, not carried", () => {
  const c = "This document was admitted into a BOUND direction — sales or purchase — before this run";
  has(P6, c, "v6 states the bound-direction contract");
  lacks(P5, c, "v5 must NOT already have this — it is genuinely new this wave");
});

test("v6 gains the SALES INVOICE / SALES CREDIT NOTE leg-shape paragraph — genuinely NEW, not carried", () => {
  const c = "SALES INVOICE / SALES CREDIT NOTE leg shape:";
  has(P6, c, "v6 states the sales leg-shape rule");
  lacks(P5, c, "v5 must NOT already have this — it is genuinely new this wave");
});

test("v6 gains the anti-primacy sentence closing the supplier-bill guidance (a client-issued document is never coded as a bill) — genuinely NEW, not carried", () => {
  const c = "is NEVER coded here even if it superficially resembles a bill: code it as sales_invoice below, crediting income";
  has(P6, c, "v6 states the anti-primacy sentence");
  lacks(P5, c, "v5 must NOT already have this — v5 never coded sales documents at all");
});

test("v6 gains the counterparty.kind derivation warning — genuinely NEW, not carried", () => {
  const c = "NEVER set counterparty.kind yourself: it is derived server-side from coding_kind";
  has(P6, c, "v6 warns the model never to set kind itself");
  lacks(P5, c, "v5 must NOT already have this — v5 had no counterparty.kind field at all");
});

test("v6's removed clause: v5's purchase-only framing sentence is GONE (the sweep now drafts both directions)", () => {
  const c = "This sweep only ever codes a supplier bill (purchase direction): the counterparty is the VENDOR, never a customer.";
  has(P5, c, "sanity: v5 really did carry this sentence");
  lacks(P6, c, "v6 must NOT carry this sentence — it now drafts sales documents too");
});

// ===========================================================================
// 3. draftJournalEntryInputSchema — the coding_kind menu (7A-R7) + the counterparty
//    generalisation + the contradiction-rejecting superRefine (THE COUNTERPARTY
//    CONTRACT, layer 1 of 3 — ergonomics, never the guard).
// ===========================================================================

test("v6's coding_kind menu is EXACTLY supplier_bill | sales_invoice | sales_credit_note — 7A-R7: no journal_entry in the unattended lane", () => {
  const r = promptV6.draftJournalEntryInputSchema.safeParse;
  const base = {
    posting_date: "2026-08-01",
    lines: [
      { account_code: "600-000", debit_cents: 100, credit_cents: 0 },
      { account_code: "400-000", debit_cents: 0, credit_cents: 100 },
    ],
    document_id: "11111111-1111-4111-8111-111111111111",
    counterparty: { existing_id: "22222222-2222-4222-8222-222222222222" },
    evidence: [{ region_id: "33333333-3333-4333-8333-333333333333", quote: "100" }],
  };
  for (const kind of ["supplier_bill", "sales_invoice", "sales_credit_note"]) {
    assert.equal(r({ ...base, coding_kind: kind }).success, true, `${kind} must be accepted`);
  }
  assert.equal(r({ ...base, coding_kind: "journal_entry" }).success, false, "journal_entry must be REFUSED — 7A-R7");
  assert.equal(r({ ...base, coding_kind: undefined }).success, false, "coding_kind is required, not optional");
});

test("v6's zod schema rejects a counterparty.kind that CONTRADICTS coding_kind, and accepts an omitted or agreeing kind (THE COUNTERPARTY CONTRACT, layer 1 — ergonomics; layer 3, the DB draft writer, is the only authority)", () => {
  const base = {
    posting_date: "2026-08-01",
    lines: [
      { account_code: "600-000", debit_cents: 100, credit_cents: 0 },
      { account_code: "400-000", debit_cents: 0, credit_cents: 100 },
    ],
    document_id: "11111111-1111-4111-8111-111111111111",
    evidence: [{ region_id: "33333333-3333-4333-8333-333333333333", quote: "100" }],
  };
  const cases = [
    ["supplier_bill", "vendor", true, "agreeing kind accepted"],
    ["supplier_bill", "customer", false, "contradicting kind (bill+customer) rejected"],
    ["supplier_bill", undefined, true, "omitted kind accepted (the tool derives it)"],
    ["sales_invoice", "customer", true, "agreeing kind accepted"],
    ["sales_invoice", "vendor", false, "contradicting kind (sales+vendor) rejected"],
    ["sales_credit_note", "vendor", false, "the CN->vendor contradiction is ALSO rejected"],
    ["sales_credit_note", "customer", true, "agreeing kind accepted"],
  ];
  for (const [coding_kind, kind, expectOk, why] of cases) {
    const counterparty = kind ? { kind, existing_id: "22222222-2222-4222-8222-222222222222" } : { existing_id: "22222222-2222-4222-8222-222222222222" };
    const result = promptV6.draftJournalEntryInputSchema.safeParse({ ...base, coding_kind, counterparty });
    assert.equal(result.success, expectOk, `coding_kind=${coding_kind} kind=${kind ?? "(omitted)"}: ${why}`);
  }
});

// ===========================================================================
// 4. THE 6-ARITY SETTLE CALL-SITE — source-level (mock.module is Node 22+; this repo
//    runs Node 20, and getWorkflowMetadata()/settleAutoDraftStep cannot be exercised by
//    direct call outside a real WDK step — ledger-44's own established precedent).
// ===========================================================================

// splitArgs is defined once, near maskWriterArgsArray above, and reused here.

function extractSettleStepBody(text) {
  const start = text.indexOf("export async function settleAutoDraftStep(");
  assert.ok(start > 0, "settleAutoDraftStep must be present");
  const end = text.indexOf("/** Open a scoped open-question", start);
  assert.ok(end > start, "openSweepQuestionStep's own doc-comment must follow");
  return text.slice(start, end);
}

test("v6's settle SQL text carries EXACTLY six placeholders, the sixth being $6::text", () => {
  const body = extractSettleStepBody(src("autoDraft.v6.impl.ts"));
  const sqlMatch = /select clara\.settle_autodraft_task\(([^)]*)\)/.exec(body);
  assert.ok(sqlMatch, "the settle_autodraft_task call text must be present");
  const placeholders = sqlMatch[1].split(",").map((s) => s.trim());
  assert.equal(placeholders.length, 6, `expected 6 placeholders, got ${JSON.stringify(placeholders)}`);
  assert.equal(placeholders[5], "$6::text", "the 6th placeholder must be $6::text");
});

function extractSettleParams(text) {
  const body = extractSettleStepBody(text);
  const paramsMatch = /\[\s*taskId,([\s\S]*?)\]\s*\),\s*\n\s*\);/.exec(body);
  assert.ok(paramsMatch, "the settle params array must be present");
  return { params: ["taskId", ...splitArgs(paramsMatch[1])], body };
}

test("v6's settle params array has EXACTLY six elements: the FIRST FIVE are TEXT-IDENTICAL to v5's own five params (Codex SF — this is the explicit cross-check the masked structural test above no longer substitutes for), and the SIXTH is workflowRunId, destructured from getWorkflowMetadata() INSIDE the step, BEFORE the query fires", () => {
  const { params: v6params, body } = extractSettleParams(src("autoDraft.v6.impl.ts"));
  const { params: v5params } = extractSettleParams(src("autoDraft.v5.impl.ts"));
  assert.equal(v6params.length, 6, `expected 6 params, got ${JSON.stringify(v6params)}`);
  assert.deepEqual(
    v6params.slice(0, 5),
    v5params,
    `v6's first five params must be TEXT-IDENTICAL to v5's own five — v6=${JSON.stringify(v6params.slice(0, 5))} v5=${JSON.stringify(v5params)}`,
  );
  assert.equal(v6params[5], "workflowRunId", "the 6th param must be the workflowRunId identifier");

  assert.match(body, /const \{ workflowRunId \} = getWorkflowMetadata\(\);/, "workflowRunId must be destructured from getWorkflowMetadata()");
  const destructureIdx = body.indexOf("const { workflowRunId } = getWorkflowMetadata();");
  const queryIdx = body.indexOf('c.query("select clara.settle_autodraft_task');
  assert.ok(destructureIdx > 0 && destructureIdx < queryIdx, "the destructure must precede the query call, inside this SAME step execution");
});

test("v5's settle call-site is pinned the OTHER direction (regression, both ways): still exactly 5 placeholders, still exactly 5 params, and NO getWorkflowMetadata() call anywhere in its settle step", () => {
  const body = extractSettleStepBody(src("autoDraft.v5.impl.ts"));
  const sqlMatch = /select clara\.settle_autodraft_task\(([^)]*)\)/.exec(body);
  assert.ok(sqlMatch, "v5's settle_autodraft_task call text must be present");
  const placeholders = sqlMatch[1].split(",").map((s) => s.trim());
  assert.equal(placeholders.length, 5, `v5 must stay 5-arity, got ${JSON.stringify(placeholders)}`);
  assert.doesNotMatch(sqlMatch[1], /\$6/, "v5 must carry no $6 placeholder at all");

  const { params } = extractSettleParams(src("autoDraft.v5.impl.ts"));
  assert.equal(params.length, 5, `v5 must stay 5 params, got ${JSON.stringify(params)}`);

  assert.doesNotMatch(body, /getWorkflowMetadata/, "v5's settleAutoDraftStep must never call getWorkflowMetadata — that is v6's own addition");
});

// ===========================================================================
// 5. deriveCounterpartyKind — pinned mapping, a structural spread-order check, and a
//    BEHAVIOURAL overwrite-wins check (deriveCounterpartyKind and runDraftJournalEntry
//    carry no WDK-ambient call, so — unlike settleAutoDraftStep above — they ARE
//    directly exercisable; mirrors wave-b-autodraft-v3.test.mjs's own stubPools rig).
// ===========================================================================

test("deriveCounterpartyKind: supplier_bill -> vendor; sales_invoice -> customer; sales_credit_note -> customer", () => {
  assert.equal(deriveCounterpartyKind("supplier_bill"), "vendor");
  assert.equal(deriveCounterpartyKind("sales_invoice"), "customer");
  assert.equal(deriveCounterpartyKind("sales_credit_note"), "customer");
});

test("structural (comment-free): the counterpartyPayload object literal spreads input.counterparty FIRST and writes kind: deriveCounterpartyKind(...) LAST — the source ORDER, not a comment claiming it, is what makes the derived value win the overwrite", () => {
  const toolsSrc = src("autoDraft.v6.tools.ts");
  const blockStart = toolsSrc.indexOf("const counterpartyPayload = {");
  assert.ok(blockStart > 0, "the counterpartyPayload literal must be present");
  const blockEnd = toolsSrc.indexOf("};", blockStart);
  assert.ok(blockEnd > blockStart, "the literal must close");
  const block = toolsSrc.slice(blockStart, blockEnd);
  const spreadIdx = block.indexOf("...(input.counterparty");
  const kindIdx = block.indexOf("kind: deriveCounterpartyKind(input.coding_kind)");
  assert.ok(spreadIdx >= 0, "the spread of input.counterparty must be present");
  assert.ok(kindIdx > spreadIdx, "kind: must be written AFTER the spread, in raw source-character order, so a same-named key inside the spread loses");
});

const DOC = "11111111-1111-1111-1111-111111111111";
// direction: null — the baseline, pre-PR-#204 case (a pre-migration attempt row, or simply
// "no early check should run"): allowedCodingKindsForDirection(null) is null, so
// runDraftJournalEntry's new early check is a no-op and every test below this line behaves
// exactly as it did before PR #204 landed.
const draftCtx = { firmId: "F", clientId: "c1", documentId: DOC, filingId: "fil-1", taskId: "task-7", direction: null };

function stubPools() {
  const write = { params: null };
  const readClient = {
    query: async (sql) => {
      if (/from clara\.document_filings/.test(sql)) return { rows: [{ sha256: "sha-abc", filing_id: "fil-1", resolution_id: "res-1" }], rowCount: 1 };
      if (/get_context_pack/.test(sql)) return { rows: [{ pack: { books_version: 7 } }], rowCount: 1 };
      if (/get_document_extract/.test(sql)) return { rows: [{ x: null }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
  };
  const writeClient = {
    query: async (_sql, params) => {
      write.params = params;
      return { rows: [{ receipt: { entry_id: "entry-9", revision_token: "rev-9" } }], rowCount: 1 };
    },
  };
  const mintClient = { query: async () => ({ rows: [{ credential_id: "cred", secret: "s3cr3t" }], rowCount: 1 }) };
  globalThis.__claraPools = {
    withRuntime: async (fn) => fn(mintClient),
    withReadWakeScoped: async (_secret, fn) => fn(readClient),
    withWriteWakeScoped: async (_secret, fn) => fn(writeClient),
  };
  return write;
}

test("behavioural: runDraftJournalEntry OVERWRITES a contradicting model-supplied counterparty.kind with the derived value — the tool never trusts the model's kind, even when present and even though the schema layer would normally have already rejected this exact contradiction (this proves the WRAPPER's own defence-in-depth, independent of schema validation)", async () => {
  const input = {
    coding_kind: "sales_invoice", // -> derives "customer"
    posting_date: "2025-10-15",
    lines: [
      { account_code: "410-000", debit_cents: 1000, credit_cents: 0 },
      { account_code: "600-000", debit_cents: 0, credit_cents: 1000 },
    ],
    document_id: DOC,
    counterparty: { kind: "vendor", existing_id: "22222222-2222-2222-2222-222222222222" }, // contradicts coding_kind
    evidence: [{ region_id: "33333333-3333-3333-3333-333333333333", quote: "1000" }],
  };
  const write = stubPools();
  const r = await runDraftJournalEntry(draftCtx, input);
  assert.equal(r.ok, true, `expected ok, got ${JSON.stringify(r)}`);
  const counterpartyArg = JSON.parse(write.params[10]); // arg 11 (0-indexed 10)
  assert.equal(counterpartyArg.kind, "customer", "the wrapper must overwrite the model's contradicting 'vendor' with the derived 'customer'");
  assert.equal(counterpartyArg.existing_id, "22222222-2222-2222-2222-222222222222", "the existing_id itself still passes through, unmodified");
  assert.equal(write.params[13], "sales_invoice", "arg 14 (the coding_kind marker) must carry input.coding_kind — the §0.1 headline defect this wave fixes (v5 hardcoded 'supplier_bill' here)");
});

test("behavioural: an OMITTED counterparty.kind is derived normally (the common case — the model never sets it)", async () => {
  const input = {
    coding_kind: "supplier_bill", // -> derives "vendor"
    posting_date: "2025-10-15",
    lines: [
      { account_code: "600-000", debit_cents: 1000, credit_cents: 0 },
      { account_code: "400-000", debit_cents: 0, credit_cents: 1000 },
    ],
    document_id: DOC,
    counterparty: { existing_id: "44444444-4444-4444-4444-444444444444" },
    evidence: [{ region_id: "33333333-3333-3333-3333-333333333333", quote: "1000" }],
  };
  const write = stubPools();
  const r = await runDraftJournalEntry(draftCtx, input);
  assert.equal(r.ok, true, `expected ok, got ${JSON.stringify(r)}`);
  const counterpartyArg = JSON.parse(write.params[10]);
  assert.equal(counterpartyArg.kind, "vendor");
  assert.equal(write.params[13], "supplier_bill");
});

// ===========================================================================
// 5b. PR #204 / 7A-R2 — THE BOUND FAMILY, behaviourally: runDraftJournalEntry's early
//     direction-family check. Both mismatch directions, both matches, and the null-direction
//     (skip-check) baseline — the SAME contradiction matrix idiom the counterparty-kind
//     schema test (section 3 above) already uses.
// ===========================================================================

const salesBoundCtx = { ...draftCtx, direction: "sales" };
const purchaseBoundCtx = { ...draftCtx, direction: "purchase" };

const familyInput = (coding_kind) => ({
  coding_kind,
  posting_date: "2025-10-15",
  lines: [
    { account_code: "410-000", debit_cents: 1000, credit_cents: 0 },
    { account_code: "600-000", debit_cents: 0, credit_cents: 1000 },
  ],
  document_id: DOC,
  counterparty: { existing_id: "22222222-2222-2222-2222-222222222222" },
  evidence: [{ region_id: "33333333-3333-3333-3333-333333333333", quote: "1000" }],
});

test("behavioural: a SALES-bound admission REFUSES a proposed supplier_bill — a named EARLY refusal (direction_family_mismatch), NEVER a DB roundtrip (no read/write call ever fires)", async () => {
  const write = stubPools();
  const r = await runDraftJournalEntry(salesBoundCtx, familyInput("supplier_bill"));
  assert.equal(r.ok, false, `expected a refusal, got ${JSON.stringify(r)}`);
  assert.equal(r.refusal.code, "CLR21");
  assert.equal(r.refusal.reason, "direction_family_mismatch");
  assert.equal(write.params, null, "the writer must NEVER be called — this is an early refusal, not a DB roundtrip");
});

test("behavioural: a PURCHASE-bound admission REFUSES a proposed sales_invoice — a named EARLY refusal, NEVER a DB roundtrip", async () => {
  const write = stubPools();
  const r = await runDraftJournalEntry(purchaseBoundCtx, familyInput("sales_invoice"));
  assert.equal(r.ok, false, `expected a refusal, got ${JSON.stringify(r)}`);
  assert.equal(r.refusal.code, "CLR21");
  assert.equal(r.refusal.reason, "direction_family_mismatch");
  assert.equal(write.params, null, "the writer must NEVER be called");
});

test("behavioural: a PURCHASE-bound admission REFUSES a proposed sales_credit_note too (the whole sales family is blocked, not just sales_invoice)", async () => {
  const write = stubPools();
  const r = await runDraftJournalEntry(purchaseBoundCtx, familyInput("sales_credit_note"));
  assert.equal(r.ok, false);
  assert.equal(r.refusal.reason, "direction_family_mismatch");
  assert.equal(write.params, null);
});

test("behavioural: an AGREEING coding_kind proceeds normally under a bound direction — sales+sales_invoice and purchase+supplier_bill both reach the writer", async () => {
  const w1 = stubPools();
  const r1 = await runDraftJournalEntry(salesBoundCtx, familyInput("sales_invoice"));
  assert.equal(r1.ok, true, `expected ok, got ${JSON.stringify(r1)}`);
  assert.ok(w1.params, "the writer must be reached when coding_kind agrees with the bound direction");

  const w2 = stubPools();
  const r2 = await runDraftJournalEntry(purchaseBoundCtx, familyInput("supplier_bill"));
  assert.equal(r2.ok, true, `expected ok, got ${JSON.stringify(r2)}`);
  assert.ok(w2.params, "the writer must be reached when coding_kind agrees with the bound direction");
});

test("behavioural: direction === null (a pre-migration attempt row) skips the early check entirely — ANY coding_kind reaches the writer, exactly as before PR #204", async () => {
  const write = stubPools();
  const r = await runDraftJournalEntry(draftCtx, familyInput("sales_invoice"));
  assert.equal(r.ok, true, `expected ok (no early check when direction is null), got ${JSON.stringify(r)}`);
  assert.ok(write.params, "the writer must be reached — direction:null means no family to validate against");
});

// ===========================================================================
// 6. Registry sanity — autoDraft_v6 / chatTurn_v9 are the live pins; v5/v8 stay
//    exported so no parked run on the prior body is stranded (policy (c)).
// ===========================================================================

test("registry.ts pins autoDraft: autoDraft_v6 and chatTurn: chatTurn_v9, and still exports the superseded autoDraft_v5 / chatTurn_v8 bodies", () => {
  assert.equal(registryMod.workflows.autoDraft.name, "autoDraft_v6");
  assert.equal(registryMod.workflows.chatTurn.name, "chatTurn_v9");
  assert.equal(typeof registryMod.autoDraft_v5, "function", "autoDraft_v5 must stay exported (policy c)");
  assert.equal(typeof registryMod.chatTurn_v8, "function", "chatTurn_v8 must stay exported (policy c)");
});
