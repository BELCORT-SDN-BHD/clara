// Pinned-ids guard — pure decision logic (owner-ruled Q4-A).
//
// TWO hard-blocked ids stand under AGENTS.md hard constraint 11, the pinned ids (never expire):
//   - the canary `daba7f2e`     — NEVER answer it (first raised as an ADR-017 S4-V2 residual,
//     due 2026-08-02; carried as a standing constraint through every wave since — e.g.
//     docs/plan/completed/wave-b-contract.md, docs/plan/completed/wave-a-daily-loop-contract.md — and reaffirmed
//     in the ratified Wave E contract, docs/plan/active/wave-e-contract.md, ADR-065).
//   - the B2 witness `d023b48c` (full: d023b48c-94fa-43a5-a544-cc4fe3b1163d) — NEVER approve it
//     (the sandbox's first autonomous draft; fixed at Wave 7A / task #29 — see
//     docs/plan/completed/wave-7a-acceptance-h1.md / -h2.md — and reaffirmed the same way in
//     docs/plan/active/wave-e-contract.md, ADR-065).
//
// THE RULE THIS FILE ENFORCES (owner-ruled Q4-A): block a tool call that is WRITE-SHAPED and
// references either id; PASS a call that is READ-shaped. Both ids are read constantly in
// acceptance evidence ("read again, still untouched" / "read one more time, unmoved") — a gate
// that could not tell a read from a write would either break that evidence trail or protect
// nothing. So:
//
//   - Bash / PowerShell: blocked ONLY when the command carries the id TOGETHER WITH one of the
//     write-shaped keywords (rpc, approve, answer, update, insert, curl, post) as a whole word.
//     A plain SELECT, a grep, or a read-only script (e.g. live_ro.py) carrying the id but no
//     keyword PASSES.
//   - Any `mcp__*` tool: blocked whenever its input mentions the id AT ALL, no keyword required.
//     Arbitrary MCP tools are too varied to shape-classify safely here, so presence alone is
//     fail-closed — this is the ONE place this file is deliberately looser than "read-shaped
//     passes", by design (see the dispatch brief this file was built from).
//   - Every other tool (Read, Grep, Glob, Edit, Write, Task, …) is out of scope and always
//     passes: approving/answering a live record requires hitting a live system, which happens
//     through a shell command or an MCP tool here, never through a local file edit.
//
// AN ASYMMETRIC BOUNDARY, NOT A BARE SUBSTRING AND NOT A PLAIN \b, for the keyword check — this
// is the one precision detail that keeps routine reads passing while still catching the real
// audited write call. A bare substring match on "post" would block every read that prints
// `posting_date` (the B2 witness's own acceptance evidence quotes it constantly: "status
// 'draft', posting_date 2026-07-31"). But a PLAIN \b (boundary required on both sides) has the
// opposite failure: AGENTS.md's own hard-constraints example of the write this guard exists
// to catch is literally `select approve_entry(...)` — and \b does not match "approve" inside
// "approve_entry" either, because underscore is a \w character, so "approve_entry" reads as one
// glued token exactly like "0019_insert_wiki_seed.sql" does. Those two glued-by-underscore shapes
// need OPPOSITE outcomes (the RPC call must block; the filename must not), so the two sides of
// the boundary are deliberately different:
//   - LEFT must be a real boundary (not preceded by a letter/digit/underscore) — this is what
//     keeps `0019_insert_wiki_seed.sql` excluded (its "insert" is preceded by "_").
//   - RIGHT only excludes a following LETTER — this is what keeps "posting_date" and "approved"/
//     "answering"/"updated" (natural-language inflections of the same verb, exactly the phrasing
//     the acceptance evidence uses: "NEVER approved") excluded, while ADMITTING a trailing
//     underscore, so "approve_entry(", "answer_canary" and "rpc/…" all still match as the write
//     signals they are.
//
// ID MATCHING is a plain case-insensitive substring search for the 8-hex-char id, exactly as
// specified — this also naturally catches the id inside a full UUID (`d023b48c-94fa-...`) since
// the prefix is contiguous. No dependencies — Node built-ins only (well: none at all — pure
// string/regex logic, zero imports).

export const PINNED_IDS = Object.freeze([
  Object.freeze({
    id: "daba7f2e",
    label: "the canary",
    rule: "NEVER answer it",
    provenance:
      "AGENTS.md hard constraint 11 (the pinned ids); first raised as an ADR-017 S4-V2 residual (due 2026-08-02); "
      + "reaffirmed as a standing constraint in the ratified Wave E contract (docs/plan/active/wave-e-contract.md, ADR-065)",
  }),
  Object.freeze({
    id: "d023b48c",
    label: "the B2 witness (the sandbox's first autonomous draft)",
    rule: "NEVER approve it",
    provenance:
      "AGENTS.md hard constraint 11 (the pinned ids); fixed at Wave 7A / task #29 (docs/plan/completed/wave-7a-acceptance-h1.md, -h2.md); "
      + "reaffirmed as a standing constraint in the ratified Wave E contract (docs/plan/active/wave-e-contract.md, ADR-065)",
  }),
]);

// Asymmetric boundary, case-insensitive — see header for why plain \b is wrong on the right side.
const WRITE_KEYWORD_RE = /(?<![A-Za-z0-9_])(?:rpc|approve|answer|update|insert|curl|post)(?![A-Za-z])/i;

/** Flatten any hook-input value (string, object, null, …) to a single searchable string. */
export function flatten(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** The first pinned id found in `text` (case-insensitive substring), or null. */
export function findPinnedId(text) {
  if (!text) return null;
  const lower = String(text).toLowerCase();
  for (const pin of PINNED_IDS) {
    if (lower.includes(pin.id)) return pin;
  }
  return null;
}

/** True if `text` carries one of the write-shaped keywords as a whole word. */
export function isWriteShaped(text) {
  return WRITE_KEYWORD_RE.test(String(text || ""));
}

/**
 * Decide whether a tool call should be blocked.
 * @param {{tool_name?: string, tool_input?: unknown}} call
 * @returns {{block: boolean, pin?: object, shape?: string}}
 */
export function evaluateToolCall({ tool_name, tool_input } = {}) {
  const isBashLike = tool_name === "Bash" || tool_name === "PowerShell";
  const isMcp = typeof tool_name === "string" && tool_name.startsWith("mcp__");

  if (!isBashLike && !isMcp) {
    return { block: false, shape: "out-of-scope-tool" };
  }

  const text = flatten(tool_input);
  const pin = findPinnedId(text);
  if (!pin) {
    return { block: false, shape: isMcp ? "mcp-no-id" : "bash-no-id" };
  }

  if (isMcp) {
    // Any mcp__ tool naming the id is blocked outright — no keyword requirement (see header).
    return { block: true, pin, shape: "mcp-id-present" };
  }

  if (isWriteShaped(text)) {
    return { block: true, pin, shape: "bash-write-shaped" };
  }
  return { block: false, shape: "bash-read-shaped" };
}

/** The stderr message printed on a block — a pure builder so the selftest can assert on it. */
export function blockMessage({ pin, shape, tool_name }) {
  return (
    `BLOCKED (pinned-ids guard) — this call references ${pin.label} (\`${pin.id}\`): ${pin.rule}. `
    + `Provenance: ${pin.provenance}. `
    + `[tool: ${tool_name ?? "?"}, shape: ${shape}] `
    + `A plain read (SELECT / a read-only script such as live_ro.py) is NOT blocked by this guard — `
    + `only a write-shaped Bash/PowerShell command (the id alongside rpc/approve/answer/update/insert/`
    + `curl/post as a whole word) or ANY mcp__ tool naming the id is. If this really was meant as a `
    + `read, rephrase it so it carries no write keyword; otherwise this id stays untouched — ask the `
    + `owner (Tao, tools@belcort.com) before overriding.`
  );
}
