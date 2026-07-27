// Wave-B interview test helpers — closure-logic driving of the PURE interview core +
// writer with a scripted `ask` (no WDK engine) and a stubbed withRuntime (no DB). Mirrors
// the s6-closure-logic / wave-a-autodraft pattern: the .ts sources import through tsx's
// ESM loader; none of the modules under test import "workflow".

/** An answer resolution the way the answer/cancel route delivers it into a hook. */
export const ANSWER = (value, answeredBy = "11111111-1111-4111-8111-111111111111") => ({ kind: "answer", value, answeredBy });
export const CANCEL = () => ({ kind: "cancelled" });
export const EXPIRE = () => ({ kind: "expired" });

/** Build a scripted AskFn: it records every prompt asked and returns the next scripted
 *  resolution in order. A resolution may be a value (wrapped as ANSWER) or a full
 *  {kind,...} object. Throws if the script runs dry (an unexpected extra park). */
export function scriptedAsk(script) {
  const asked = [];
  let i = 0;
  const ask = async (prompt) => {
    asked.push(prompt);
    if (i >= script.length) throw new Error(`scriptedAsk: no scripted resolution for park #${i} (seg=${prompt.seg} phase=${prompt.phase})`);
    const r = script[i++];
    if (r && typeof r === "object" && typeof r.kind === "string") return r;
    return ANSWER(r);
  };
  return { ask, asked, remaining: () => script.length - i };
}

/** A stubbed withRuntime + query router for update_onboarding_plan / plan reads. Options:
 *   - plan: the onboarding_plans row a read returns.
 *   - items: the onboarding_plan_items rows a read returns (snake shape {item_key,state,answer,
 *     answered_by}); readPlan's second query + the route binding reads use these. May be a
 *     function (updateN) => rows so a CLR06 re-read can reflect a foreign edit.
 *   - principal: the resolve_chat_principal row ({firm_id, role}) for verifyFirmCommitReceipt.
 *   - failCas: if a number N, the Nth (1-based) update_onboarding_plan call throws CLR06.
 *   - receipts: overrides the revision tokens returned per successful update call. */
export function stubRuntime({ plan = null, items = [], principal = null, failCas = 0, receipts = [] } = {}) {
  const calls = { reads: 0, itemReads: 0, updates: [], updateArgs: [], principalReads: 0 };
  let updateN = 0;
  const client = {
    query: async (sql, params) => {
      if (/resolve_chat_principal/.test(sql)) {
        calls.principalReads += 1;
        return { rows: principal ? [principal] : [], rowCount: principal ? 1 : 0 };
      }
      if (/from clara\.onboarding_plan_items/.test(sql)) {
        calls.itemReads += 1;
        const rows = typeof items === "function" ? items(updateN) : items;
        return { rows, rowCount: rows.length };
      }
      if (/from clara\.onboarding_plans/.test(sql) && /select/i.test(sql)) {
        calls.reads += 1;
        return { rows: plan ? [plan] : [], rowCount: plan ? 1 : 0 };
      }
      if (/update_onboarding_plan/.test(sql)) {
        updateN += 1;
        calls.updates.push({ n: updateN, params });
        calls.updateArgs.push({ planId: params?.[0], expectedRevision: params?.[1], items: JSON.parse(params?.[2] ?? "[]"), answeredBy: params?.[3], opKey: params?.[4] });
        if (failCas === updateN) {
          const err = new Error("stale onboarding plan revision");
          err.code = "CLR06";
          err.detail = '{"reason":"stale_plan"}';
          throw err;
        }
        const rev = receipts[updateN - 1] ?? { revision_token: `rev-${updateN + 1}`, revision_n: updateN + 1, status: "updated" };
        return { rows: [{ receipt: rev }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
  const withRuntime = async (fn) => fn(client);
  return { withRuntime, calls };
}

/**
 * The scripted answers the LIVE e2e drives a client interview with, for the `sdn_bhd` fixture.
 * ONE definition, shared by interview-e2e.mjs and interview-kill-resume-e2e.mjs, because both
 * drive the same interview and a script that drifts between them is a CI failure waiting for
 * whichever one runs second.
 *
 * These target the DEFAULT-ACCEPTING path deliberately. The e2e's purpose is durability under
 * faults — cancel, kill, resume, exactly-once — not framework edge cases, which are covered by the
 * closure battery. So an eligible Sdn Bhd takes MPERS (its statutory default) on the accrual basis
 * (its default), and NO warning park is opened anywhere in the drive. That last property is
 * load-bearing for the kill/resume sibling: it counts confirms by `phase === "c"`, and a warning
 * park is also phase "c", so a warning would silently shift where the kill lands.
 *
 * A v2 segment can open MORE THAN ONE 'q' park — the framework answer is followed by its edition
 * question — so an entry may be an ARRAY consumed in order. That is why the driver asks through
 * `scriptedAnswers` rather than indexing a map: the v1-era single lookup answered "MPERS" to the
 * edition question and re-asked forever.
 */
export const INTERVIEW_V2_CLIENT_ANSWERS = {
  legal_name: "Acme Trading SB",
  entity_type: "sdn_bhd",
  ssm: "202401001234-K",
  turnover: "RM1M-5M",
  tin: "C2584563222",
  msic: "46900",
  sst_regime: "service_tax",
  sst_no: "skip",
  statutory: "skip",
  banks: "skip",
  currency: "MYR",
  fye: "6",
  // v2 (F2): the CA 2016 s.244 private-entity screen — asked of a Sdn Bhd and of nobody else.
  // "no" is the determination path that keeps MPERS available, and opens no follow-up (only a
  // bare "subsidiary" does).
  mpers_eligibility: "no",
  // v2 (F2): the answer, then the EDITION follow-up MPERS opens.
  framework: ["MPERS", "2025"],
  // v2 (F2): the second recorded axis. Accrual opens no follow-up and raises no warning.
  accounting_basis: "accrual",
  coa_seed: "yes",
  opening_position: "new_first_year",
  fa_depreciation: "no",
  sample_invoices: "skip",
};

/**
 * Build a per-segment answer supplier over a script map. Answers are consumed IN ORDER per
 * segment, so a segment that opens follow-up parks gets its follow-up answers in sequence.
 *
 * Create ONE supplier per interview run and share it across every driver that touches that run —
 * a driver that builds its own would restart a part-consumed segment from the top (the kill/resume
 * pair hands the same run to two drivers across the kill).
 *
 * Exhaustion throws with the reason spelled out: a silent undefined is what let a v1-era script
 * meet a v2 segment and fail as a timeout instead of as a missing answer.
 */
export function scriptedAnswers(map = INTERVIEW_V2_CLIENT_ANSWERS) {
  const queues = new Map(Object.entries(map).map(([k, v]) => [k, Array.isArray(v) ? [...v] : [v]]));
  return (seg) => {
    const queue = queues.get(seg);
    if (!queue) throw new Error(`no scripted answer for segment '${seg}' — the interview asks a segment this script does not carry`);
    if (queue.length === 0) throw new Error(`scripted answers for segment '${seg}' are exhausted — it opened more parks than the script carries`);
    return queue.shift();
  };
}

/** Deep-scan a value for any secret-shaped object KEY (P19 negative assertion). The
 *  benign 'revision_token' is a token but not a secret; only these exact keys leak. */
const SECRET_KEYS = new Set(["admission_token", "admission", "secret", "wake_secret", "credential", "credential_id"]);
export function containsSecretShape(value) {
  const seen = new Set();
  const walk = (v) => {
    if (v == null || typeof v !== "object") return false;
    if (seen.has(v)) return false;
    seen.add(v);
    for (const [k, val] of Object.entries(v)) {
      if (SECRET_KEYS.has(k.toLowerCase())) return true;
      if (walk(val)) return true;
    }
    return false;
  };
  return walk(value);
}
