// Typed-receipt narrowing — the runtime-side twin of the dashboard's narrowRuleWrite
// law (apps/dashboard/app/shared/reviewApi.ts): a REFUSED or SKIPPED typed jsonb return
// must NEVER narrow to success. Two DB shapes ride this helper:
//   * a bounded-write REFUSAL — propose_autopost_rule / sign_autopost_rule return an
//     HTTP-200 {status:'refused', reason:'bounds_exceeded'} (0016 ADV-R2#4/ADV-R3#6): a
//     durable, audited refusal, not an exception. ANY future runtime caller of those two
//     writers MUST branch on {status:'refused'} — this is the mandated helper for that.
//   * a quiet rule-post SKIP — execute_rule_post returns {status:'skipped', reason:...}
//     for a benign non-post (polarity_unverified, direction_unproven, anchor_missing,
//     customer_unresolved, cn_not_autopostable, purchase_sst_not_autopostable, ...): the
//     draft stays for human review (visibility-as-safety), never retried into a post.
// Anything that is not an explicit typed refusal/skip is success-shaped (legacy jsonb
// receipts included), exactly as the dashboard law narrows.

/**
 * Narrow a DB writer's jsonb receipt into a typed status. A refused/skipped receipt
 * passes through {status, reason}; everything else (incl. 'posted' and legacy receipts)
 * is {status:'ok'}.
 * @param {unknown} out
 * @returns {{status:"ok"} | {status:"refused"|"skipped", reason:string}}
 */
export function narrowTypedStatus(out) {
  if (out && typeof out === "object" && (out.status === "refused" || out.status === "skipped")) {
    const reason = out.reason;
    return { status: out.status, reason: typeof reason === "string" ? reason : out.status };
  }
  return { status: "ok" };
}
