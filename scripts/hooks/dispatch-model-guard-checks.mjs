// Dispatch-model guard — pure decision logic (AGENTS.md hard constraint 5).
//
// THE LAW THIS ENFORCES. Every dispatch pins an explicit `model`. Omission does not fail — it
// SILENTLY INHERITS the main model (Fable), which is forbidden. Named and built-in Workflows
// count as dispatches. Sources:
//   - AGENTS.md, hard constraint 5 ("Every dispatch pins an explicit `model`").
//   - docs/adr/README.md:276-278 — "Named/built-in Workflow invocations are dispatches — every
//     dispatch pins an explicit `model`; omission inherits the main model, which is forbidden.
//     *(owner directive, recorded at 0069)*".
// It was prompt-enforced only until this file, and it was violated once historically: a
// code-review Workflow script whose agent() calls carried no model pin ran the whole review on
// the inherited main model without anyone noticing at dispatch time. That is the exact shape
// this guard exists to catch.
//
// ===========================================================================================
// THREAT MODEL — READ THIS BEFORE JUDGING THE GUARD. Same posture as the pinned-ids guard
// (scripts/hooks/pinned-ids-guard-checks.mjs), and stated here for the same reason.
//
// This is a MISTAKE-NET for the common OMISSION shapes. It exists to catch the realistic
// failure: an orchestrator, working fast, spawns a lane or fires a workflow and simply forgets
// the `model` field. Against that, a shape check on the tool input is exactly the right
// instrument, and it is the only instrument available — the omission is invisible at runtime
// (the dispatch succeeds, on the wrong model).
//
// It is NOT containment, and nothing here should be read as claiming otherwise. Anything that
// spawns a worker through a channel this file does not classify — a raw `codex exec` in Bash,
// an MCP server that fans out internally, a workflow whose model is chosen by data at runtime —
// passes untouched. The law's PRIMARY enforcement is elsewhere and always was: the process law
// in AGENTS.md and the review ladder. This guard is a cheap net under those, not a substitute.
//
// The structural ceiling is the same as the pinned-ids guard's, and is documented in full in
// that file's header: a PreToolUse hook that FAILS TO LAUNCH fails OPEN (only exit 2 blocks);
// `disableAllHooks: true` in an untracked settings.local.json blanks it; hook entries MERGE
// across settings levels, so a personal settings file cannot selectively remove this one.
//
// ===========================================================================================
// WHAT IS DELIBERATELY OUT OF SCOPE. Each of these is a decision, not an oversight.
//
//   1. FORKS. `subagent_type: "fork"` inherits the parent model BY DESIGN — the tool contract
//      says a `model` override is ignored for a fork. Blocking an unpinned fork would fire on
//      every legitimate fork and teach the operator to work around the guard, which is worse
//      than not having it. Exempted explicitly, never silently.
//   2. PARTIAL PINNING inside a Workflow script. A script whose agent() calls are SOME pinned
//      and SOME not passes this guard. Catching that needs a parser, not a regex: pins reach a
//      call site through a shared options object, a loop, a spread, or a variable, and a
//      naive "count agent( vs count model:" comparison would red every one of those. The
//      observed real-world failure was the ZERO-pin script, and that is what is caught here.
//   3. NAMED workflows. A `Workflow` call that names a workflow instead of carrying its script
//      (tool_input.name, no script/scriptPath) cannot be inspected from the dispatch payload —
//      the body lives elsewhere. ALLOWED, and the omission stays a review-ladder matter.
//   4. AN UNREADABLE scriptPath. Fail-OPEN. A mistake-net that blocks on its own inability to
//      read a file converts an I/O hiccup into a broken harness, which is the failure mode the
//      pinned-ids guard's malformed-stdin path also declines to have.
//   5. CASE. The agent-call probe is case-SENSITIVE (`agent(`, the spelling the workflow DSL
//      uses). A script spelling it `Agent(` is not classified as a dispatch site here. Widening
//      to /i would start blocking scripts that merely construct something named `Agent`, and a
//      false BLOCK is the expensive direction for a net whose whole value is being ignorable.
//   6. AN UNRECOGNISED INPUT SHAPE. The field names below (model, subagent_type, script,
//      scriptPath, name) are the dispatch tools' documented inputs. A future rename lands in
//      the ALLOW branch, not the block branch — which is why the selftest is wired into CI: a
//      silently-dead guard here looks exactly like a clean run.
//
// No dependencies — pure string/regex logic, zero imports.

/** The citation every block message carries. Kept in one place so it cannot drift. */
export const CONSTRAINT_CITATION =
  "AGENTS.md hard constraint 5 (every dispatch pins an explicit `model`; omission silently "
  + "inherits the main model, which is forbidden) — owner directive recorded at ADR-0069 "
  + "(docs/adr/README.md, \"Named/built-in Workflow invocations are dispatches\")";

/**
 * An agent-call site inside a Workflow script. `\b` before `agent` is load-bearing: it keeps
 * `subagent(`/`myagent(` out, since both halves are word characters and no boundary exists
 * between them. Case-sensitive on purpose — see out-of-scope note 5.
 */
const AGENT_CALL_RE = /\bagent\s*\(/;

/** A model pin, in any of the object spellings a script can use (`model:`, `model :`). */
const MODEL_PIN_RE = /\bmodel\s*:/;

/**
 * True when this call is an agent dispatch.
 *
 * "Agent" is the current tool name. "Task" is the legacy name for the same tool and is accepted
 * ONLY when the input carries a dispatch field (subagent_type or prompt) — an unrelated future
 * tool that happens to be called Task must not be dragged into scope by its name alone.
 */
export function isAgentDispatch(tool_name, tool_input) {
  if (tool_name === "Agent") return true;
  if (tool_name !== "Task") return false;
  return typeof tool_input?.subagent_type === "string" || typeof tool_input?.prompt === "string";
}

/**
 * True when the input carries a usable explicit model pin.
 *
 * A non-string `model` (a number, an object, null) counts as ABSENT and therefore blocks: the
 * field is a model id, and on an in-scope dispatch the fail-closed answer is the correct one.
 */
export function hasExplicitModel(tool_input) {
  const model = tool_input?.model;
  return typeof model === "string" && model.trim() !== "";
}

/** True when `subagent_type` is the fork type, which inherits the parent model by design. */
export function isFork(tool_input) {
  return tool_input?.subagent_type === "fork";
}

/** Counts the two shapes a Workflow script is judged on. Pure — takes the text, not a path. */
export function scriptShape(script) {
  const text = typeof script === "string" ? script : "";
  return { hasAgentCall: AGENT_CALL_RE.test(text), hasModelPin: MODEL_PIN_RE.test(text) };
}

/**
 * Decide whether a tool call should be blocked.
 *
 * `script` is the EFFECTIVE script text for a Workflow call, already resolved by the caller
 * (tool_input.script, else the contents of tool_input.scriptPath). Keeping the read outside
 * this module is what keeps it pure and the selftest fixture-driven; null/absent means "not
 * inspectable", which ALLOWS.
 *
 * @param {{tool_name?: string, tool_input?: unknown, script?: string|null}} call
 * @returns {{block: boolean, shape: string}}
 */
export function evaluateToolCall({ tool_name, tool_input, script } = {}) {
  if (isAgentDispatch(tool_name, tool_input)) {
    if (isFork(tool_input)) return { block: false, shape: "agent-fork-inherits-by-design" };
    if (hasExplicitModel(tool_input)) return { block: false, shape: "agent-model-pinned" };
    return { block: true, shape: "agent-model-missing" };
  }

  if (tool_name === "Workflow") {
    const text = typeof script === "string" ? script : "";
    if (!text.trim()) return { block: false, shape: "workflow-script-not-inspectable" };
    const { hasAgentCall, hasModelPin } = scriptShape(text);
    if (!hasAgentCall) return { block: false, shape: "workflow-no-agent-call" };
    if (hasModelPin) return { block: false, shape: "workflow-model-pinned" };
    return { block: true, shape: "workflow-zero-model-pins" };
  }

  return { block: false, shape: "out-of-scope-tool" };
}

/** The stderr message printed on a block — a pure builder so the selftest can assert on it. */
export function blockMessage({ shape, tool_name }) {
  const fix =
    shape === "workflow-zero-model-pins"
      ? "FIX: add a `model:` pin to every agent() call in the script (the default worker lane is "
        + "`claude-sonnet-5` at xhigh; escalate to `claude-opus-5`; Codex lanes are `gpt-5.6-sol`). "
        + "This script contains at least one agent() call and NOT ONE model pin, so every lane it "
        + "spawns would run on the inherited main model."
      : "FIX: add an explicit `model` to this Agent call (the default worker lane is "
        + "`claude-sonnet-5` at xhigh; escalate to `claude-opus-5`; Codex lanes are `gpt-5.6-sol`). "
        + "A fork (`subagent_type: \"fork\"`) is exempt — it inherits the parent model by design.";
  return (
    `BLOCKED (dispatch-model guard) — this dispatch pins no \`model\`. ${CONSTRAINT_CITATION}. `
    + `[tool: ${tool_name ?? "?"}, shape: ${shape}] `
    + `${fix} `
    + `This guard is a mistake-net for the omission, not containment: partial pinning inside a `
    + `workflow script, a named (uninspectable) workflow, and any worker spawned outside these `
    + `tools all pass it — the law still binds them. If you believe this block is wrong, ask the `
    + `owner (Tao, tools@belcort.com) rather than routing around it.`
  );
}
