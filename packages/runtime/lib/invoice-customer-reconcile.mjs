// THE RECONCILER — who WINS when the deterministic reader and Azure's typed `CustomerName`
// disagree. Split from `invoice-customer-identity.mjs` (the 500-line limit) on the module's
// last natural seam: the READER decides WHICH LINE names the buyer; this file decides WHOSE
// READING SURVIVES. It is the judgement half of X7 and the part to read hardest.

import { partyKey } from "./invoice-party-grammar.mjs";

/**
 * Merge the reader's emissions into the mapper's field list, reconciling `invoice.customer_name`
 * against Azure's typed row. Mutates `out` and `identity.receipt`.
 *
 * THE READER IS A CHECK/OVERRIDE LAYER, NEVER A SOLE AUTHOR — the two overrules and the
 * positive-evidence law are recorded in the module header above. THE LAWFUL ACTIONS ARE FOUR:
 *   COLLAPSE   reader AGREES with typed → ONE row survives, the TYPED one (it carries Azure's own
 *              region). `typed_collapsed`. Never two rows for one field_path —
 *              `persist_invoice_facts` forfeits the WHOLE extraction on conflicting text
 *              duplicates (0026:810-819), destroying the working `invoice.total` capture too.
 *   OVERRIDE   typed (non-empty) == the reader's OWN Attn person, and a distinct party block
 *              exists → THE F7 DEFECT: the party REPLACES the typed row, the person is emitted
 *              as `invoice.contact_person`. `typed_overridden_attn`. The only branch where one
 *              machine reading overrules another of the same field, and the document licenses
 *              it — a line labelled `Attn` is not a party under any reading of the page.
 *   WITHDRAW   unexplained disagreement → EMIT NEITHER (X6's semantics). `typed_disagreement`.
 *   WITHDRAW   contested landscape → EMIT NEITHER. `typed_vs_contested`.
 *
 * And its two lawful silences: reader ABSENT/refused → typed stands byte-identically (the reader
 * having nothing to say is not evidence about Azure); reader has a party but typed is
 * empty/absent → nothing emitted, `sole_authorship_refused`.
 *
 * `invoice.contact_person` is unaffected by all of the above: it has no typed counterpart in the
 * Document Intelligence vocabulary and no other producer in the repo, so it is purely additive.
 */
export function mergeCustomerIdentity(out, identity) {
  const receipt = identity.receipt;
  const contact = identity.fields.find((f) => f.field_path === "invoice.contact_person");
  const party = identity.fields.find((f) => f.field_path === "invoice.customer_name");
  const typed = out.find((r) => r.field_path === "invoice.customer_name");
  const typedRaw = String(typed?.value_raw ?? "").trim();

  if (contact && !out.some((r) => r.field_path === "invoice.contact_person")) {
    out.push(contact);
    receipt.contact_emitted += 1;
  }

  // A CONTEST is a positive measurement, so it is handled BEFORE the no-party return — the
  // reader emits no party precisely because it found two.
  if (receipt.outcome === "contested") {
    if (typed && typedRaw) {
      out.splice(out.indexOf(typed), 1);
      receipt.typed_vs_contested += 1;
    }
    return;
  }
  if (!party) return;

  if (!typed || !typedRaw) {
    // RECONCILIATION-ONLY. There is nothing to reconcile against, and the reader does not get to
    // author an identity on its own. Recorded rather than silent so the refusal is inspectable
    // on live without re-running the engine.
    receipt.sole_authorship_refused += 1;
    receipt.outcome = "sole_authorship_refused";
    return;
  }
  if (partyKey(typedRaw) === partyKey(party.value_raw)) {
    receipt.typed_collapsed += 1;
    return;
  }
  if (receipt.attn_key && partyKey(typedRaw) === receipt.attn_key) {
    Object.assign(typed, party);
    receipt.typed_overridden_attn += 1;
    receipt.outcome = "attn_overridden";
    return;
  }
  // A COMPROMISED CONTACT READ MAY NOT DRIVE AN UNEXPLAINED-DISAGREEMENT WITHDRAW. When an `Attn`
  // line HAD a value but the contact door refused it for entity-ambiguity, `attn_key` is never
  // set — so a disagreement that might really be the F7 OVERRIDE shape gets scored as
  // "unexplained" and WITHDRAWS a correct name. Measured: `Attention:` / `Lim P.L.T.` /
  // `KONG CHENG…SDN BHD` with typed `Lim P.L.T.` withdrew `KONG CHENG RESTAURANTS SDN BHD`. The
  // absence of an explanation this reader COULD NOT READ is not evidence of a contest (review
  // law 2), so it holds instead: typed stands, exactly today's behaviour, zero loss.
  //
  // THE EXACT GUARANTEE, narrowed to what this code actually enforces. A string refused at the
  // contact door: (i) cannot OVERRIDE the typed value, and (ii) cannot drive an
  // UNEXPLAINED-DISAGREEMENT withdraw. It CAN still COLLAPSE with an agreeing typed row, and it
  // CAN still participate in a CONTEST on its own merits as a party candidate — an earlier
  // wording claimed it could "never withdraw", which is false: `Bill To:` / `Attention:` /
  // `AMATERUS GROUP SDN BHD` / `Customer : KONG CHENG…SDN BHD` with a CORRECT typed name reads
  // `contested` and withdraws, because TWO distinct labelled parties really are on the page.
  // That withdraw is fail-closed and stays; reordering the passes to suppress it would trade the
  // mirror case's safety for this case's convenience.
  if (receipt.contact_read_inconclusive) {
    receipt.attn_inconclusive_hold += 1;
    receipt.outcome = "attn_inconclusive_hold";
    return;
  }
  out.splice(out.indexOf(typed), 1);
  receipt.typed_disagreement += 1;
  receipt.outcome = "typed_disagreement";
}
