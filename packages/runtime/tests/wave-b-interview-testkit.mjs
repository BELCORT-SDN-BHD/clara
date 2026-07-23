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
