// chatTurn v7 -> v8 (owner-approved closing batch, 2026-07-29) — the prompt/schema
// half. Companion to ledger-46-chatturn-v8.test.mjs (the diagnostic-twin + structural
// regression half; split to hold the family's own 500-line file-cap discipline).
// Proves prompt.ts/tools.ts are confined to the #46b (SST-zero propagation) and #35
// (bind-existing counterparty) rule text, and that both distinctions are genuinely
// NEW relative to v7. No live model call anywhere in this file.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { register } = await import("tsx/esm/api");
register();

const promptV8 = await import("../workflows/chatTurn.v8.prompt.ts");
const toolsV8 = await import("../workflows/chatTurn.v8.tools.ts");
const promptV7 = await import("../workflows/chatTurn.v7.prompt.ts");
const toolsV7 = await import("../workflows/chatTurn.v7.tools.ts");

const src = (name) => readFileSync(new URL(`../workflows/${name}`, import.meta.url), "utf8");
/** Drop the top-of-file block comment: it legitimately narrates each version's delta so it
 *  is EXPECTED to diverge; only the code from the first REAL import statement onward is
 *  compared. Line-anchored (mirrors the family's own dropHeader). */
function dropHeader(text) {
  const m = /^import /m.exec(text);
  assert.ok(m, "a real import statement must be present");
  return text.slice(m.index);
}

/** The KNOWN identifier/import-path renames between v7 and v8 — targeted, not a
 *  blanket "v7"->"vN" substring replace (which would also rewrite legitimate
 *  historical version markers inside carried-forward prose). Mirrors the companion
 *  file's own V7_TO_V8_RENAMES (kept in sync manually — both files touch a fixed,
 *  small, well-known identifier set that changes only when the family repoints
 *  again). */
const V7_TO_V8_RENAMES = [
  ["buildToolsV7", "buildToolsV8"],
  ["SYSTEM_PROMPT_V7", "SYSTEM_PROMPT_V8"],
  ["toTypedParts_v7", "toTypedParts_v8"],
  ["chatTurn.v7.prompt.ts", "chatTurn.v8.prompt.ts"],
  ["chatTurn.v7.prompt.js", "chatTurn.v8.prompt.js"],
  ["chatTurn.v7.errors.js", "chatTurn.v8.errors.js"],
  ["chatTurn.v7.infra.js", "chatTurn.v8.infra.js"],
  ["chatTurn.v7.impl.ts", "chatTurn.v8.impl.ts"],
];
function upgradeV7(text) {
  let t = text;
  for (const [from, to] of V7_TO_V8_RENAMES) t = t.split(from).join(to);
  return t;
}

// ===========================================================================
// prompt.ts: mask the TWO paragraphs + THREE .describe() strings the ruling
// touches (the SST leg-shape rule and the bind-existing-counterparty guidance) —
// everything else (imports, the rest of the system prompt, the clarify tool, every
// typed-part shape) must be token-for-token identical to v7.
// ===========================================================================

function maskLegShape(text) {
  const startAnchor = "counterparty on every payable line. The";
  const start = text.indexOf(startAnchor);
  assert.ok(start > 0, "the sentence before the LEG SHAPE rule must be present, unchanged, in both versions");
  const from = start + startAnchor.length;
  const endAnchor = 'Call `draft_journal_entry` with coding_kind \\"supplier_bill\\".';
  const end = text.indexOf(endAnchor, from);
  assert.ok(end > from, "the supplier_bill draft_journal_entry call must follow the LEG SHAPE rule");
  return `${text.slice(0, from)}<the ledger #46b leg-shape rule — compared separately>${text.slice(end)}`;
}

function maskCounterpartyPara(text) {
  const startAnchor = "Counterparties: match before create";
  const start = text.indexOf(startAnchor);
  assert.ok(start > 0, "the counterparty paragraph's own opening must be present in both versions");
  const endAnchor = "Professional vigilance:";
  const end = text.indexOf(endAnchor, start);
  assert.ok(end > start, "the professional-vigilance paragraph must follow the counterparty paragraph");
  return `${text.slice(0, start)}<the #35 bind-existing-counterparty guidance — compared separately>${text.slice(end)}`;
}

function maskCodingKindDescribe(text) {
  const startAnchor = 'an Accounts Payable credit — expense GROSS " +';
  const start = text.indexOf(startAnchor);
  assert.ok(start > 0, "the coding_kind describe()'s own opening must be present in both versions");
  const from = start + startAnchor.length;
  const endAnchor = 'sales_invoice " +';
  const end = text.indexOf(endAnchor, from);
  assert.ok(end > from, "the sales_invoice clause must follow the supplier_bill clause");
  return `${text.slice(0, from)}<masked coding_kind describe>${text.slice(end)}`;
}

function maskLinesDescribe(text) {
  const anchor = '.describe(\n      "At least two balanced lines. supplier_bill when the facts state NO tax';
  const start = text.indexOf(anchor);
  assert.ok(start > 0, "the lines describe()'s own opening must be present in both versions");
  const from = start + '.describe(\n      "At least two balanced lines. '.length;
  const endAnchor = "sales_invoice: one Trade Debtors";
  const end = text.indexOf(endAnchor, from);
  assert.ok(end > from, "the sales_invoice clause must follow the supplier_bill clause");
  return `${text.slice(0, from)}<masked lines describe>${text.slice(end)}`;
}

function maskCounterpartyDescribe(text) {
  const startAnchor = "The counterparty (the supplier on a supplier_bill; the CUSTOMER on a sales entry)";
  const start = text.indexOf(startAnchor);
  assert.ok(start > 0, "the counterparty describe()'s own opening must be present in both versions");
  const from = start + startAnchor.length;
  const endAnchor = "),\n  evidence: z";
  const end = text.indexOf(endAnchor, from);
  assert.ok(end > from, "the evidence field must follow the counterparty field");
  return `${text.slice(0, from)}<masked counterparty describe>${text.slice(end)}`;
}

function maskPromptChanges(text) {
  return maskCounterpartyDescribe(maskLinesDescribe(maskCodingKindDescribe(maskCounterpartyPara(maskLegShape(text)))));
}

test("v8's prompt.ts differs from v7's ONLY in the SST leg-shape rule (system prompt + coding_kind/lines describe()) and the bind-existing-counterparty guidance (system prompt + counterparty describe()) — imports, the clarify tool, and every typed-part shape are unchanged", () => {
  const v7p = dropHeader(upgradeV7(src("chatTurn.v7.prompt.ts")));
  const v8p = dropHeader(src("chatTurn.v8.prompt.ts"));
  assert.equal(
    maskPromptChanges(v8p),
    maskPromptChanges(v7p),
    "outside the five masked spans, chatTurn.v8.prompt.ts must be a version-renamed copy of v7",
  );
});

// ===========================================================================
// tools.ts: mask the ONE span the ruling touches — the DRAFT_TOOL's own
// `.description` string, which echoes both rule changes at the tool-call surface.
// Everything else (the read tools, runDraftJournalEntry's full server-side logic)
// must be token-for-token identical to v7.
// ===========================================================================

function maskDraftToolDescription(text) {
  const startAnchor = "[DRAFT_TOOL]: tool({\n      description:\n";
  const start = text.indexOf(startAnchor);
  assert.ok(start > 0, "the DRAFT_TOOL's own opening must be present, unchanged, in both versions");
  const from = start + startAnchor.length;
  const endAnchor = "inputSchema: draftJournalEntryInputSchema,";
  const end = text.indexOf(endAnchor, from);
  assert.ok(end > from, "inputSchema must follow the description in both versions");
  return `${text.slice(0, from)}<the ledger #46b/#35 tool-description rule — compared separately>\n      ${text.slice(end)}`;
}

test("v8's tools.ts differs from v7's ONLY in the DRAFT_TOOL's own description string (header narrative aside) — the read tools and runDraftJournalEntry's full server-side logic (including the counterparty pass-through, byte-unchanged) are unchanged", () => {
  const v7t = dropHeader(upgradeV7(src("chatTurn.v7.tools.ts")));
  const v8t = dropHeader(src("chatTurn.v8.tools.ts"));
  assert.equal(
    maskDraftToolDescription(v8t),
    maskDraftToolDescription(v7t),
    "outside the masked description, chatTurn.v8.tools.ts must be a version-renamed copy of v7",
  );
});

// ===========================================================================
// Contract cells (#46b): the rule text, at all three echo sites, must explicitly
// distinguish a STATED NONZERO tax from a stated ZERO or absent tax — the SAME
// SST-zero precedent already shipped in autoDraft_v5, now propagated here. No live
// model call; static text/schema assertions only.
// ===========================================================================

test("v8's SYSTEM_PROMPT explicitly distinguishes a STATED NONZERO tax (three-leg) from a stated ZERO or absent tax (two-leg) — the SST-zero precedent, propagated from autoDraft_v5", () => {
  const p = promptV8.SYSTEM_PROMPT_V8;
  assert.match(p, /STATE a NONZERO tax/, "the leg-shape check must key on NONZERO, not merely 'stated'");
  assert.match(
    p,
    /NO stated tax in the facts, OR a stated tax that is EXACTLY ZERO: a TWO-leg entry/,
    "a stated-but-zero tax must be grouped with 'no stated tax' under the two-leg branch",
  );
  assert.match(p, /A STATED NONZERO tax amount in the facts: a THREE-leg visibility split/, "only a NONZERO stated tax opens the three-leg split");
});

test("v8's draft schema .describe()s (coding_kind + lines) explicitly distinguish a NONZERO stated tax from NO tax / an EXACTLY ZERO stated tax", () => {
  const shape = promptV8.draftJournalEntryInputSchema.shape;
  assert.match(shape.coding_kind.description, /state NO tax or a stated ZERO tax/, "coding_kind's describe() must group zero with no-tax");
  assert.match(shape.coding_kind.description, /state a NONZERO tax/, "coding_kind's describe() must key the 3-leg branch on NONZERO");
  assert.match(shape.lines.description, /state NO tax, or a stated tax\s+that is EXACTLY ZERO/, "lines describe() must group zero with no-tax");
  assert.match(shape.lines.description, /state a NONZERO tax/, "lines describe() must key the 3-leg branch on NONZERO");
});

test("v8's DRAFT_TOOL description (the tool-call-surface echo) explicitly distinguishes a STATED NONZERO tax from NO tax / a stated ZERO tax", () => {
  const desc = toolsV8.buildToolsV8({ firmId: "f", clientId: "c", createdBy: "u", taskId: "t" })[promptV8.DRAFT_TOOL].description;
  assert.match(desc, /or a stated ZERO tax, in the facts,\s+expense debit\(s\) GROSS/, "zero-stated tax must route to the two-leg tool description");
  assert.match(desc, /a STATED NONZERO tax, expense debit\(s\) NET/, "only a NONZERO stated tax routes to the three-leg tool description");
});

test("v7's equivalent text does NOT distinguish nonzero from zero — proves the NONZERO/zero split is genuinely NEW in v8, not carried forward unchanged", () => {
  assert.doesNotMatch(promptV7.SYSTEM_PROMPT_V7, /NONZERO/, "v7's system prompt must not already carry the nonzero distinction");
  assert.doesNotMatch(promptV7.draftJournalEntryInputSchema.shape.coding_kind.description, /NONZERO/, "v7's coding_kind describe() must not already carry it");
  assert.doesNotMatch(promptV7.draftJournalEntryInputSchema.shape.lines.description, /NONZERO/, "v7's lines describe() must not already carry it");
  const v7Desc = toolsV7.buildToolsV7({ firmId: "f", clientId: "c", createdBy: "u", taskId: "t" })[promptV7.DRAFT_TOOL].description;
  assert.doesNotMatch(v7Desc, /NONZERO/, "v7's tool description must not already carry it");
});

// ===========================================================================
// Contract cells (#35): the rule text, at all three echo sites, must explicitly
// guide the model to prefer an existing counterparty over proposing a new one,
// and to name a concrete discovery path (list_journal_entries / get_journal_entry)
// — matching the DB write floor's pre-existing, unconditional acceptance of an
// `{existing_id}` proposal.
// ===========================================================================

test("v8's SYSTEM_PROMPT instructs preferring a KNOWN counterparty over proposing a new one, and names a discovery path", () => {
  const p = promptV8.SYSTEM_PROMPT_V8;
  assert.match(p, /PREFER THE KNOWN counterparty over proposing a new/, "the counterparty paragraph must state the preference explicitly");
  assert.match(p, /list_journal_entries.*get_journal_entry/, "the counterparty paragraph must name a concrete discovery path for an existing id");
  assert.match(p, /propose its counterparty_id as `\{existing_id\}`/, "the counterparty paragraph must name the exact proposal shape");
});

test("v8's counterparty .describe() explicitly prefers existing_id and names the discovery path", () => {
  const desc = promptV8.draftJournalEntryInputSchema.shape.counterparty.description;
  assert.match(desc, /PREFER `existing_id`/, "the counterparty describe() must state the preference explicitly");
  assert.match(desc, /list_journal_entries \/ get_journal_entry/, "the counterparty describe() must name the discovery path");
});

test("v8's DRAFT_TOOL description echoes the existing-counterparty preference", () => {
  const desc = toolsV8.buildToolsV8({ firmId: "f", clientId: "c", createdBy: "u", taskId: "t" })[promptV8.DRAFT_TOOL].description;
  assert.match(desc, /prefer an existing counterparty_id/, "the tool description must echo the existing-counterparty preference");
});

test("v7's equivalent text does NOT instruct preferring an existing counterparty generally — proves #35's guidance is genuinely NEW in v8", () => {
  assert.doesNotMatch(
    promptV7.SYSTEM_PROMPT_V7,
    /PREFER THE KNOWN counterparty/,
    "v7's system prompt must not already carry the general existing-counterparty preference",
  );
  assert.doesNotMatch(
    promptV7.draftJournalEntryInputSchema.shape.counterparty.description,
    /PREFER `existing_id`/,
    "v7's counterparty describe() must not already carry it",
  );
  const v7Desc = toolsV7.buildToolsV7({ firmId: "f", clientId: "c", createdBy: "u", taskId: "t" })[promptV7.DRAFT_TOOL].description;
  assert.doesNotMatch(v7Desc, /prefer an existing counterparty_id/, "v7's tool description must not already carry it");
});

test("the draft_journal_entry wrapper (runDraftJournalEntry) already forwards counterparty.existing_id verbatim to the DB — #35 is prompt/schema guidance only, never a wrapper behavioural change (the DB write floor is the untouched enforcement)", () => {
  const v7Body = readFileSync(new URL("../workflows/chatTurn.v7.tools.ts", import.meta.url), "utf8");
  const v8Body = readFileSync(new URL("../workflows/chatTurn.v8.tools.ts", import.meta.url), "utf8");
  const forwardLine = "input.counterparty ? JSON.stringify(input.counterparty) : null,";
  assert.ok(v7Body.includes(forwardLine), "v7 already forwards counterparty verbatim, unconditionally");
  assert.ok(v8Body.includes(forwardLine), "v8 forwards counterparty verbatim, unconditionally — byte-identical to v7");
});
