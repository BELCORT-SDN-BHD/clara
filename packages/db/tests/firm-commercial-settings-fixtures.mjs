// #635 — fixtures for the firm commercial/legal/usage settings battery (migration 0233).
// NOT a test file (the name does not end in `.test.mjs`), so `node --test` ignores it.
//
// EVERY ASSERTION IN THE BATTERY GOES THROUGH `humanQuery` — a real `clara_authenticated`
// session with a real `request.jwt.claims.sub`. `rootQuery` appears HERE, and only here, to
// ARRANGE state the product's own doors cannot reach from a test:
//   · publishing a new legal version (the publish door is operator-firm-floored, and this
//     battery is not a test of the operator console);
//   · a CONSUMED `firm_registration_payments` row (the webhook lane writes it, and that lane
//     is `packages/runtime/src/stripeRoutes.ts`'s, deliberately outside this ticket's boundary);
//   · `llm_usage_events` / `llm_price_table` rows (0110's own batteries arrange them the same
//     way — there is no human writer for either, by design).
// Each such call is LABELLED at its site. Nothing under test is arranged by root DML.

import { randomUUID } from "node:crypto";
import {
  humanQuery, rootQuery, opk, insertUser, seedAdmission, createFirm, addMember,
} from "./rig-fixtures.mjs";

export const P635 = "p635";

/** A firm of its own, with an owner and whichever extra ranks the cell asks for.
 *  A FRESH firm per cell, because `clara.legal_acceptances` is keyed on the PERSON and
 *  `clara.legal_documents` is GLOBAL: two cells sharing a firm would share a legal standing
 *  and each would be reading the other's arrangement. */
export async function firmScene(tag, roles = []) {
  const owner = await insertUser(P635, `${tag}_owner`);
  const token = await seedAdmission(`${P635}-${tag}`);
  const name = `P635 ${tag} ${randomUUID().slice(0, 8)}`;
  const firm = await createFirm(owner, { name, token, opKey: opk(`firm_${tag}`) });
  const members = {};
  for (const role of roles) {
    const user = await insertUser(P635, `${tag}_${role}`);
    await addMember(owner, { firm, user, role, opKey: opk(`add_${tag}_${role}`) });
    members[role] = user;
  }
  return { tag, firm, name, owner, members };
}

/** The caller's own view of the two legal documents, through the SHIPPED read door — the same
 *  bytes and the same digest the acceptance door will be handed back. Never re-derived here. */
export async function currentLegalDocuments(sub) {
  const r = await humanQuery(
    sub, "select kind, version, status, body_sha256 from clara.get_current_legal_documents()",
  );
  return r.rows;
}

/** Accept one PUBLISHED kind as `sub`, through the shipped governed door (0185:684). */
export async function acceptKind(sub, kind, { opKey } = {}) {
  const docs = await currentLegalDocuments(sub);
  const doc = docs.find((d) => d.kind === kind && d.status === "published");
  if (!doc) throw new Error(`fixture: no PUBLISHED ${kind} document to accept`);
  const r = await humanQuery(
    sub,
    "select clara.accept_legal_document(p_kind => $1, p_version => $2, p_body_sha256 => $3, p_op_key => $4) as receipt",
    [doc.kind, doc.version, doc.body_sha256, opKey ?? opk(`acc_${kind}`)],
  );
  return r.rows[0].receipt;
}

/** Both kinds, by one person — the shape `clara._accounting_work_egress_live` requires. */
export async function acceptBothKinds(sub) {
  const terms = await acceptKind(sub, "terms");
  const dpa = await acceptKind(sub, "dpa");
  return { terms, dpa };
}

/** THE BASELINE this battery must leave behind: exactly one PUBLISHED row per kind, at the
 *  version 0187 seeded. Read before anything is published so the restore is a MEASUREMENT of
 *  what was found, never a transcription of what 0187 is believed to hold. */
export async function readLegalBaseline() {
  // LABELLED FIXTURE READ (root): `legal_documents` grants no application role anything at
  // all (0185:229-232), by design — there is no human read of the whole table.
  const r = await rootQuery(
    "select kind, version, status from clara.legal_documents order by kind, version",
  );
  return r.rows;
}

/** Publish a NEW version of one kind: supersede the current published row and insert the next.
 *  LABELLED FIXTURE DML (root). `clara.publish_legal_document` is floored on the OPERATOR firm
 *  (0185's publish door), and minting an operator firm to exercise a consequence of publication
 *  would put a second, irrelevant authority inside every one of these cells. */
export async function publishNextVersion(kind) {
  const cur = await rootQuery(
    "select coalesce(max(version), 0)::int as v from clara.legal_documents where kind = $1", [kind],
  );
  const version = cur.rows[0].v + 1;
  const body = `P635 rig ${kind} v${version} - fixture text, not a legal document.`;
  await rootQuery(
    "update clara.legal_documents set status = 'superseded' where kind = $1 and status = 'published'", [kind],
  );
  await rootQuery(
    `insert into clara.legal_documents(kind, version, status, title, body, body_sha256,
       source_path, effective_from, published_at)
     values ($1, $2, 'published', $3, $4, encode(sha256(convert_to($4,'UTF8')),'hex'), $5, now(), now())`,
    [kind, version, `P635 ${kind} v${version}`, body, `rig/p635/${kind}-v${version}.md`],
  );
  return version;
}

/** Put the legal shelf back exactly as `readLegalBaseline()` found it. LABELLED FIXTURE DML. */
export async function restoreLegalBaseline(baseline) {
  const kinds = [...new Set(baseline.map((r) => r.kind))];
  for (const kind of kinds) {
    const keep = baseline.filter((r) => r.kind === kind).map((r) => r.version);
    await rootQuery(
      "delete from clara.legal_acceptances a where a.kind = $1 and not (a.version = any($2::int[]))",
      [kind, keep],
    );
    await rootQuery(
      "delete from clara.legal_documents d where d.kind = $1 and not (d.version = any($2::int[]))",
      [kind, keep],
    );
    for (const row of baseline.filter((r) => r.kind === kind)) {
      await rootQuery(
        "update clara.legal_documents set status = $3 where kind = $1 and version = $2",
        [kind, row.version, row.status],
      );
    }
  }
}

/** A CONSUMED `firm_registration_payments` row pointing at `firm`. LABELLED FIXTURE DML: the
 *  only writer of this relation is the Stripe webhook lane (`packages/runtime/src/stripeRoutes.ts`),
 *  which is boundary, not scope (#635 §5 / C-09). `consumed_dpa_signature` is a REAL
 *  `legal_acceptances` id (0185:552-556 repointed the FK there), so the row is well-formed
 *  against the LIVE constraint set rather than against 0163's original one. */
export async function consumedPayment(firm, { applicant, acceptanceId, customer = true, subscription = true }) {
  const tag = randomUUID().replaceAll("-", "").slice(0, 16);
  const registration = randomUUID();
  await rootQuery(
    "insert into clara.firm_registration_requests(id, applicant, firm_name, op_key) values ($1,$2,$3,$4)",
    [registration, applicant, `P635 payment ${tag}`, `p635_reg_${tag}`],
  );
  const event = `evt_p635${tag}`;
  await rootQuery(
    `insert into clara.stripe_events(event_id, type, livemode, session_id, registration_id,
       applicant, amount_total, currency, payment_status, mode, session_status)
     values ($1,'checkout.session.completed',false,$2,$3,$4,0,'myr','paid','payment','complete')`,
    [event, `cs_p635_${tag}`, registration, applicant],
  );
  const customerId = customer ? `cus_p635${tag}` : null;
  const subscriptionId = subscription ? `sub_p635${tag}` : null;
  const r = await rootQuery(
    `insert into clara.firm_registration_payments(registration_id, applicant, stripe_event_id,
       stripe_session_id, stripe_customer_id, stripe_subscription_id,
       consumed_at, consumed_firm_id, consumed_dpa_signature)
     values ($1,$2,$3,$4,$5,$6, now(), $7, $8) returning id, recorded_at`,
    [registration, applicant, event, `cs_p635_${tag}`, customerId, subscriptionId, firm, acceptanceId],
  );
  return { id: r.rows[0].id, recordedAt: r.rows[0].recorded_at, customerId, subscriptionId };
}

/** One engine (optionally priced) plus one usage row inside `period`'s month, for `firm`.
 *  LABELLED FIXTURE DML: `llm_usage_events` and `llm_price_table` have no human writer
 *  anywhere in the estate (0110), by design. */
export async function seedUsage(firm, {
  period, callKind, inputTokens = 1_000_000, outputTokens = 1_000_000,
  priced = true, scope = "firm", day = 15,
}) {
  const engine = `p635-${randomUUID().slice(0, 8)}`;
  const monthStart = `${period.slice(0, 7)}-01`;
  if (priced) {
    await rootQuery(
      `insert into clara.llm_price_table(engine_id, effective_from, effective_to,
         input_price_cents_per_million_tokens, output_price_cents_per_million_tokens, source_note)
       values ($1, $2::date, null, 100, 100, 'p635 rig fixture')`,
      [engine, monthStart],
    );
  }
  const at = `${period.slice(0, 7)}-${String(day).padStart(2, "0")} 03:00:00+00`;
  if (scope === "platform") {
    await rootQuery(
      `insert into clara.llm_usage_events(scope, call_kind, engine_id, outcome,
         input_tokens, output_tokens, created_at)
       values ('platform', $1, $2, 'success', $3, $4, $5::timestamptz)`,
      [callKind, engine, inputTokens, outputTokens, at],
    );
  } else {
    await rootQuery(
      `insert into clara.llm_usage_events(firm_id, call_kind, engine_id, outcome,
         input_tokens, output_tokens, created_at)
       values ($1, $2, $3, 'success', $4, $5, $6::timestamptz)`,
      [firm, callKind, engine, inputTokens, outputTokens, at],
    );
  }
  return engine;
}

/** The standing door, as `sub`. */
export async function legalStanding(sub) {
  const r = await humanQuery(sub, "select clara.get_firm_legal_standing() as result");
  return r.rows[0].result;
}

/** The commercial door, as `sub`. */
export async function commercialState(sub) {
  const r = await humanQuery(sub, "select clara.get_firm_commercial_state() as result");
  return r.rows[0].result;
}

/** The usage wrapper, as `sub`. */
export async function aiUsage(sub, period) {
  const r = await humanQuery(sub, "select * from clara.get_firm_ai_usage($1::date)", [period]);
  return r.rows;
}

/** One document entry out of the standing door's payload. */
export function documentOf(standing, kind) {
  return (standing?.documents ?? []).find((d) => d.kind === kind) ?? null;
}
