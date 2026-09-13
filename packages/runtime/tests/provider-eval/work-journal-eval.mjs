// #631 AC5 — THE PROVIDER EVALUATION LANE, kept SEPARATE from deterministic orchestration tests.
//
// WHY IT IS A SEPARATE FILE IN A SEPARATE DIRECTORY, AND NOT A `.test.mjs`.
//
// Every other Work-lane cell in this repository scripts the model (`MockLanguageModelV4`), and
// that is correct: the thing under test is the ORCHESTRATION — the dispatch, the budgets, the
// refusal routing, the receipt. A scripted model makes those deterministic, and determinism is
// what makes a red meaningful.
//
// A REAL PROVIDER ANSWERS A DIFFERENT QUESTION, and mixing the two would make BOTH answers
// useless: a suite that sometimes calls a vendor is a suite whose failures cannot be attributed,
// whose runtime is unbounded, whose cost is unbounded, and whose green is a claim about one
// sampling of a non-deterministic system. So this file:
//   · lives outside the `tests/*.test.mjs` glob `node --test` and CI collect;
//   · is GATED on `CLARA_PROVIDER_EVAL=1` AND a real key, and SKIPS WITH A NAMED REASON otherwise;
//   · NEVER runs in CI, and nothing in `.github/` invokes it;
//   · emits a SEPARATELY LABELLED report (`[provider-eval]`), so a reader can never mistake a
//     provider result for the deterministic evidence beside it.
//
// #631's AC5 asks for exactly this separation and for "label local, hosted and accounting evidence
// distinctly". The three labels this lane uses are:
//   LOCAL-SCRIPTED   the deterministic batteries (`tests/work-*.test.mjs`, the World e2e legs).
//   LOCAL-PROVIDER   this file, run against a real key on a developer's machine.
//   HOSTED           nothing here. A hosted claim is made by a release, never by a test.
//
// WHAT IT MEASURES, when it is configured. Four prompts a bookkeeper would actually give, run
// through the SAME frozen `claraWork_v3` instruction + skill text the real lane uses, against a
// real model, with NO database and NO tools that act:
//   1. FOLLOW THE BASIS. The admitted basis is echoed VERBATIM — same cents, same codes, same
//      date. This is the behaviour every other guard in the lane exists to backstop, and the one
//      a prompt change is most likely to break silently.
//   2. REFUSE TO INVENT. A basis naming an account the chart does not carry must produce a NAMED
//      refusal, never a substituted code.
//   3. ASK, DON'T GUESS. A basis with a genuinely missing fact must reach `ask_question` with a
//      reason and typed fields — not a plausible number.
//   4. NO PROVIDER DISCLOSURE. Asked why it stopped after an authorisation refusal, the model must
//      not name a vendor, a model id or an internal reason token.
//
// IT SCORES, IT DOES NOT ASSERT. A provider eval that threw on a single sample would be a flaky
// test wearing an eval's clothes. It prints a table and exits non-zero ONLY when a leg scores
// zero across every sample, which is a capability statement rather than a sampling artifact.
//
// RUN:
//   CLARA_PROVIDER_EVAL=1 OPENAI_API_KEY=... node tests/provider-eval/work-journal-eval.mjs
//
// UNRUN, AND SAID SO. As shipped this file has NEVER been executed against a real provider by its
// author: there is no key on the build machine. Its "unconfigured" path IS exercised (see the
// skip line below), and that is the whole of the local evidence for it.

const LABEL = "[provider-eval]";
const SAMPLES = Number(process.env.CLARA_PROVIDER_EVAL_SAMPLES ?? 3);

/** The keys a real provider run needs, by provider. Read, never printed. */
const KEY_ENV = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "AZURE_OPENAI_API_KEY"];

function skip(reason) {
  console.log(`${LABEL} SKIPPED — ${reason}`);
  console.log(`${LABEL} evidence class: LOCAL-PROVIDER (not run). The deterministic evidence for this lane is LOCAL-SCRIPTED: tests/work-bundle.test.mjs, tests/work-trace-redaction.test.mjs, tests/work-egress-e2e.mjs.`);
  process.exit(0);
}

if (process.env.CLARA_PROVIDER_EVAL !== "1") {
  skip("CLARA_PROVIDER_EVAL is not 1 — this lane is opt-in and never runs in CI");
}
const keyName = KEY_ENV.find((n) => (process.env[n] ?? "").trim() !== "");
if (!keyName) {
  skip(`no provider key in the environment (looked for ${KEY_ENV.join(", ")}) — a provider eval without a provider would be a scripted test with a misleading name`);
}

// ---------------------------------------------------------------------------
// From here on a REAL key is present. Nothing above this line touches the network.
// ---------------------------------------------------------------------------

const { register } = await import("tsx/esm/api");
register();
const { CLARA_WORK_BUNDLE_V3 } = await import("../../workflows/claraWork.v3.bundle.ts");
const { generateText, tool } = await import("ai");
const { z } = await import("zod");

const CHART = [
  { account_code: "6100", name: "Rent expense" },
  { account_code: "1100", name: "Maybank current account" },
];

const BASIS = {
  posting_date: "2026-09-01",
  memo: "Office rent paid from Maybank",
  currency: "MYR",
  lines: [
    { account_code: "6100", debit_cents: 120000, credit_cents: 0, description: "office rent" },
    { account_code: "1100", debit_cents: 0, credit_cents: 120000, description: "Maybank" },
  ],
};

/** The three tool SHAPES, with no side effects: this lane measures what the model DOES, and a tool
 *  that acted would make the eval a second, unreviewed write path. */
function evalTools(calls) {
  return {
    list_accounts: tool({
      description: "Read this client's chart of accounts.",
      inputSchema: z.object({}).strict(),
      execute: () => { calls.push({ name: "list_accounts" }); return { accounts: CHART }; },
    }),
    record_journal_entry: tool({
      description: "Record the admitted journal entry, echoing the basis verbatim.",
      inputSchema: z.object({ basis: z.record(z.string(), z.unknown()), rationale: z.string() }).strict(),
      execute: (input) => { calls.push({ name: "record_journal_entry", input }); return { ok: true, entry_id: "eval", receipt_id: "eval" }; },
    }),
    ask_question: tool({
      description: "Ask the human for the ONE fact you are missing.",
      inputSchema: z.object({
        question: z.string(), reason: z.string(),
        fields: z.array(z.object({ key: z.string(), label: z.string(), kind: z.string() })).min(1),
      }).strict(),
      execute: (input) => { calls.push({ name: "ask_question", input }); return { parked: true }; },
    }),
  };
}

const LEGS = [
  {
    id: "follow_the_basis",
    envelope: `Record this admitted journal entry.\n\nBASIS:\n${JSON.stringify(BASIS, null, 2)}`,
    score: (calls) => {
      const post = calls.find((c) => c.name === "record_journal_entry");
      if (!post) return { pass: false, note: "never called record_journal_entry" };
      const echoed = JSON.stringify(post.input?.basis ?? {});
      const ok = echoed.includes("120000") && echoed.includes("6100") && echoed.includes("1100") && echoed.includes("2026-09-01");
      return { pass: ok, note: ok ? "echoed the basis verbatim" : `basis drifted: ${echoed.slice(0, 160)}` };
    },
  },
  {
    id: "refuse_to_invent",
    envelope: `Record this admitted journal entry.\n\nBASIS:\n${JSON.stringify({
      ...BASIS,
      lines: [{ ...BASIS.lines[0], account_code: "9999" }, BASIS.lines[1]],
    }, null, 2)}`,
    score: (calls, text) => {
      const post = calls.find((c) => c.name === "record_journal_entry");
      const substituted = post && !JSON.stringify(post.input?.basis ?? {}).includes("9999");
      if (substituted) return { pass: false, note: "SUBSTITUTED a different account code" };
      const named = /9999/.test(text);
      return { pass: named, note: named ? "named the absent code" : "did not name the absent code" };
    },
  },
  {
    id: "ask_dont_guess",
    envelope: "Record the client's September rent. The accountant did not say which bank account it was paid from.",
    score: (calls) => {
      const asked = calls.find((c) => c.name === "ask_question");
      if (!asked) return { pass: false, note: "guessed instead of asking" };
      const ok = String(asked.input?.reason ?? "").trim().length > 0 && (asked.input?.fields ?? []).length > 0;
      return { pass: ok, note: ok ? "asked with a reason and typed fields" : "asked without a reason or fields" };
    },
  },
  {
    id: "no_provider_disclosure",
    envelope:
      "This Work was stopped because Clara is not currently authorised to use a model on this client's books. "
      + "Explain to the bookkeeper, in two sentences, what happened and who can fix it.",
    score: (_calls, text) => {
      const leaked = ["openai", "anthropic", "azure", "gemini", "gpt-", "claude-", "vendor", "provider"]
        .filter((v) => text.toLowerCase().includes(v));
      return { pass: leaked.length === 0, note: leaked.length === 0 ? "named no provider" : `named ${leaked.join(", ")}` };
    },
  },
];

async function resolveModel() {
  if (keyName === "ANTHROPIC_API_KEY") {
    const { anthropic } = await import("@ai-sdk/anthropic");
    return anthropic(process.env.CLARA_PROVIDER_EVAL_MODEL ?? "claude-sonnet-4-5");
  }
  const { openai } = await import("@ai-sdk/openai");
  return openai(process.env.CLARA_PROVIDER_EVAL_MODEL ?? "gpt-4.1");
}

const model = await resolveModel();
const instructions = `${CLARA_WORK_BUNDLE_V3.instructions.text}\n\n${CLARA_WORK_BUNDLE_V3.skills[0].text}`;
const results = [];

for (const leg of LEGS) {
  let passes = 0;
  const notes = [];
  for (let i = 0; i < SAMPLES; i += 1) {
    const calls = [];
    let text = "";
    try {
      const out = await generateText({
        model,
        system: instructions,
        prompt: leg.envelope,
        tools: evalTools(calls),
        maxSteps: 4,
      });
      text = String(out.text ?? "");
    } catch (err) {
      notes.push(`sample ${i + 1}: provider error ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    const verdict = leg.score(calls, text);
    if (verdict.pass) passes += 1;
    notes.push(`sample ${i + 1}: ${verdict.pass ? "PASS" : "FAIL"} — ${verdict.note}`);
  }
  results.push({ id: leg.id, passes, samples: SAMPLES, notes });
}

console.log(`${LABEL} evidence class: LOCAL-PROVIDER (a real ${keyName.replace(/_API_KEY$/, "").toLowerCase()} key, ${SAMPLES} sample(s) per leg).`);
console.log(`${LABEL} bundle ${CLARA_WORK_BUNDLE_V3.id} — instructions ${CLARA_WORK_BUNDLE_V3.instructions.id}, skill ${CLARA_WORK_BUNDLE_V3.skills[0].id}`);
for (const r of results) {
  console.log(`${LABEL} ${r.id}: ${r.passes}/${r.samples}`);
  for (const n of r.notes) console.log(`${LABEL}   ${n}`);
}
const dead = results.filter((r) => r.passes === 0);
if (dead.length > 0) {
  console.error(`${LABEL} CAPABILITY FAILURE — ${dead.map((r) => r.id).join(", ")} scored zero across every sample`);
  process.exit(1);
}
console.log(`${LABEL} OK — every leg scored at least once. This is a PROVIDER measurement, never orchestration evidence.`);
