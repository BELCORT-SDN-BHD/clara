// autoDraft v4 -> v5 (ledger #46, owner ruling 2026-07-29 — THE SST-ZERO PRECEDENT).
// Full finding + ruling narrated in autoDraft.v5.prompt.ts's own header; short version:
// task 7b389b4f-86af-4c72-ac17-07f1084eccb9 (IV-00743) settled CLR21 coding_incomplete —
// the model correctly refused to draft because the pre-v5 rule required a
// sst_purchase_cost-tagged chart account for ANY stated tax figure (including a stated
// ZERO), and this client's chart had none. The owner ruled on the client's own precedent:
// its four previously-approved EZSEC entries (all printing "SST Amt @ 6%: 0.00") are ALL
// two-leg. v5's ONLY functional change, anywhere in the closure: the purchase-leg SHAPE
// rule narrows the three-leg sst_purchase_cost visibility split to a STATED NONZERO tax;
// a stated ZERO or absent tax now takes the two-leg shape — in the prompt text
// (autoDraft.v5.prompt.ts) and its .describe() echoes (the schema's own .describe() in
// prompt.ts, and the DRAFT_TOOL's tool-level description in autoDraft.v5.tools.ts).
//
// This file proves the STRUCTURAL regression the family's own convention requires (mirrors
// ledger-44-autodraft-v4.test.mjs's own convention, INVERTED): errors.ts, infra.ts,
// impl.ts, AND the workflow entry .ts are UNMODIFIED version-renamed copies of v4 — this
// wave's fix touches ONLY prompt.ts + tools.ts, confined to the leg-shape rule text. No
// live model call anywhere in this file — every assertion is static text/schema shape.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { register } = await import("tsx/esm/api");
register();

const src = (name) => readFileSync(new URL(`../workflows/${name}`, import.meta.url), "utf8");
const asVN = (text, n) => text.replaceAll(`v${n}`, "vN").replaceAll(`V${n}`, "VN");
/** Drop the top-of-file block comment: it legitimately narrates each version's delta so it
 *  is EXPECTED to diverge; only the code from the first REAL import statement onward is
 *  compared. Line-anchored (mirrors ledger-44's own dropHeader). */
function dropHeader(text) {
  const m = /^import /m.exec(text);
  assert.ok(m, "a real import statement must be present");
  return text.slice(m.index);
}

// ===========================================================================
// Structural regression: errors.ts, infra.ts, impl.ts, and the workflow entry .ts are
// UNMODIFIED version-renamed copies of v4 — this wave's fix touches ONLY prompt.ts +
// tools.ts (the model-facing leg-shape rule), the mirror image of ledger #44's own
// convention (where impl.ts + the entry changed and prompt/tools/errors/infra did not).
// ===========================================================================

test("v5 errors.ts + infra.ts + impl.ts + the workflow entry (autoDraft.v5.ts) are token-for-token identical to v4 (version-renamed only, header narrative aside) — this wave's fix touches ONLY prompt.ts + tools.ts", () => {
  for (const part of ["errors", "infra", "impl"]) {
    assert.equal(
      dropHeader(asVN(src(`autoDraft.v5.${part}.ts`), 5)),
      dropHeader(asVN(src(`autoDraft.v4.${part}.ts`), 4)),
      `autoDraft.v5.${part}.ts must be a version-renamed copy of v4 — no behavioural change in this wave`,
    );
  }
  assert.equal(
    dropHeader(asVN(src("autoDraft.v5.ts"), 5)),
    dropHeader(asVN(src("autoDraft.v4.ts"), 4)),
    "autoDraft.v5.ts must be a version-renamed copy of v4 — no behavioural change in this wave",
  );
});

// ===========================================================================
// prompt.ts: mask the ONE paragraph the ruling touches (the SYSTEM_PROMPT leg-shape rule)
// and the ONE .describe() string on the draft schema's `lines` field — everything else in
// the file (imports, the rest of the system prompt, the whole typed-shape section) must be
// token-for-token identical to v4.
// ===========================================================================

/** Mask the LEG SHAPE paragraph in the system prompt array — bounded by the (unchanged, on
 *  both sides) sentence immediately before it and the sst_registration_watch paragraph
 *  immediately after. Everything OUTSIDE this span is compared token-for-token. */
function maskLegShapeParagraph(text) {
  const startAnchor = '"supplier bill (purchase direction): the counterparty is the VENDOR, never a customer.",';
  const start = text.indexOf(startAnchor);
  assert.ok(start > 0, "the paragraph before the LEG SHAPE rule must be present, unchanged, in both versions");
  const from = start + startAnchor.length;
  const endAnchor = '"The context pack (via get_context_pack';
  const end = text.indexOf(endAnchor, from);
  assert.ok(end > from, "the sst_registration_watch paragraph must follow the LEG SHAPE rule");
  return `${text.slice(0, from)}\n<the ledger #46 leg-shape rule — compared separately>\n${text.slice(end)}`;
}

/** Mask the draft schema's `lines` field .describe() string — bounded by its own `.describe(`
 *  open and the `document_id` field that follows it (both anchors byte-identical in v4/v5). */
function maskLegShapeDescribe(text) {
  const startAnchor = '.describe(\n      "At least two balanced lines.';
  const start = text.indexOf(startAnchor);
  assert.ok(start > 0, "the lines field's own .describe( open must be present, unchanged, in both versions");
  const endAnchor = "  document_id: z.string().uuid()";
  const end = text.indexOf(endAnchor, start);
  assert.ok(end > start, "the document_id field must follow the lines field's describe()");
  return `${text.slice(0, start)}<the ledger #46 schema-describe rule — compared separately>\n${text.slice(end)}`;
}

test("v5's prompt.ts differs from v4's ONLY in the SYSTEM_PROMPT leg-shape paragraph and the draft schema's `lines` .describe() string (header narrative aside) — imports, the rest of the system prompt, and the whole typed-shape section are unchanged", () => {
  const v4p = dropHeader(asVN(src("autoDraft.v4.prompt.ts"), 4));
  const v5p = dropHeader(asVN(src("autoDraft.v5.prompt.ts"), 5));
  assert.equal(
    maskLegShapeDescribe(maskLegShapeParagraph(v5p)),
    maskLegShapeDescribe(maskLegShapeParagraph(v4p)),
    "outside the two masked spans, autoDraft.v5.prompt.ts must be a version-renamed copy of v4",
  );
});

// ===========================================================================
// tools.ts: mask the ONE span the ruling touches — the DRAFT_TOOL's own `.description`
// string, which echoes the leg-shape rule at the tool-call surface. Everything else
// (read_document/get_context_pack/coding_lane/get_draft_review, runDraftJournalEntry's
// full server-side logic) must be token-for-token identical to v4.
// ===========================================================================

/** Mask the DRAFT_TOOL's own description string — bounded by the tool's own opening
 *  (byte-identical in v4/v5: `[DRAFT_TOOL]: tool({` then `description:`) and the
 *  `inputSchema: draftJournalEntryInputSchema,` line that follows it in both versions. */
function maskDraftToolDescription(text) {
  const startAnchor = "[DRAFT_TOOL]: tool({\n      description:\n";
  const start = text.indexOf(startAnchor);
  assert.ok(start > 0, "the DRAFT_TOOL's own opening must be present, unchanged, in both versions");
  const from = start + startAnchor.length;
  const endAnchor = "inputSchema: draftJournalEntryInputSchema,";
  const end = text.indexOf(endAnchor, from);
  assert.ok(end > from, "inputSchema must follow the description in both versions");
  return `${text.slice(0, from)}<the ledger #46 tool-description rule — compared separately>\n      ${text.slice(end)}`;
}

test("v5's tools.ts differs from v4's ONLY in the DRAFT_TOOL's own description string (header narrative aside) — the read tools and runDraftJournalEntry's full server-side logic are unchanged", () => {
  const v4t = dropHeader(asVN(src("autoDraft.v4.tools.ts"), 4));
  const v5t = dropHeader(asVN(src("autoDraft.v5.tools.ts"), 5));
  assert.equal(
    maskDraftToolDescription(v5t),
    maskDraftToolDescription(v4t),
    "outside the masked description, autoDraft.v5.tools.ts must be a version-renamed copy of v4",
  );
});

// ===========================================================================
// Contract cell: the rule text itself, at both echo sites, must explicitly distinguish a
// STATED NONZERO tax from a stated ZERO (or absent) tax — the exact refinement the owner
// ruled on the client's own precedent. No live model call; static text/schema assertions
// only (the family's own prompt-testing convention — see ledger-44's structural cells).
// ===========================================================================

const promptV5 = await import("../workflows/autoDraft.v5.prompt.ts");
const toolsV5 = await import("../workflows/autoDraft.v5.tools.ts");
const promptV4 = await import("../workflows/autoDraft.v4.prompt.ts");
const toolsV4 = await import("../workflows/autoDraft.v4.tools.ts");

test("v5's SYSTEM_PROMPT explicitly distinguishes a STATED NONZERO tax (three-leg) from a stated ZERO or absent tax (two-leg) — the owner's SST-zero precedent, made unambiguous to the model", () => {
  const p = promptV5.SYSTEM_PROMPT_AUTODRAFT_V5;
  assert.match(p, /STATE a NONZERO tax/, "the leg-shape check must key on NONZERO, not merely 'stated'");
  assert.match(
    p,
    /NO stated tax in the facts, OR a stated tax that is EXACTLY ZERO: a TWO-leg entry/,
    "a stated-but-zero tax must be grouped with 'no stated tax' under the two-leg branch",
  );
  assert.match(p, /A STATED NONZERO tax amount in the facts: a THREE-leg VISIBILITY split/, "only a NONZERO stated tax opens the three-leg split");
  assert.match(
    p,
    /A stated-but-zero tax figure documents "no tax was charged"/,
    "the prompt must state WHY a zero tax takes the two-leg shape, not just assert it",
  );
});

test("v5's draft schema .describe() (the lines field) explicitly distinguishes a NONZERO stated tax from NO tax / an EXACTLY ZERO stated tax", () => {
  const d = promptV5.draftJournalEntryInputSchema.shape.lines.description;
  assert.match(d, /a stated tax that is EXACTLY\s+ZERO: expense debit\(s\) GROSS/, "zero-stated tax must route to the two-leg description");
  assert.match(d, /state a NONZERO tax: expense debit\(s\) NET/, "only a NONZERO stated tax routes to the three-leg description");
});

test("v5's DRAFT_TOOL description (the tool-call-surface echo) explicitly distinguishes a STATED NONZERO tax from NO tax / a stated ZERO tax", () => {
  const desc = toolsV5.buildAutoDraftTools({
    firmId: "f", clientId: "c", documentId: "d", filingId: "fl", taskId: "t",
  })[promptV5.DRAFT_TOOL].description;
  assert.match(desc, /or a stated ZERO tax, in the facts, expense debit\(s\)\s+GROSS/, "zero-stated tax must route to the two-leg tool description");
  assert.match(desc, /a STATED NONZERO tax, expense debit\(s\) NET/, "only a NONZERO stated tax routes to the three-leg tool description");
});

test("v4's equivalent text does NOT distinguish nonzero from zero — proves the NONZERO/zero split is genuinely NEW in v5, not carried forward unchanged", () => {
  assert.doesNotMatch(promptV4.SYSTEM_PROMPT_AUTODRAFT_V4, /NONZERO/, "v4's system prompt must not already carry the nonzero distinction");
  assert.doesNotMatch(promptV4.draftJournalEntryInputSchema.shape.lines.description, /NONZERO/, "v4's schema describe() must not already carry it");
  const v4Desc = toolsV4.buildAutoDraftTools({
    firmId: "f", clientId: "c", documentId: "d", filingId: "fl", taskId: "t",
  })[promptV4.DRAFT_TOOL].description;
  assert.doesNotMatch(v4Desc, /NONZERO/, "v4's tool description must not already carry it");
});
