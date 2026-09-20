// #960 — fixtures for the firm's OWN processing-cap writer (migration 0270). NOT a test file
// (the name does not end in `.test.mjs`), so `node --test` ignores it.
//
// EVERY ASSERTION IN THE BATTERY GOES THROUGH `humanQuery` — a real `clara_authenticated`
// session carrying a real `request.jwt.claims.sub`. `rootQuery` appears HERE, and only here,
// and only to READ what the product's own doors deliberately do not publish (the stored row,
// the audit trail) or to clean a firm up afterwards. Nothing under test is ARRANGED by root
// DML: the whole point of #960 is that the row now has a human writer, so every arrangement
// in this battery goes through that writer.

import { randomUUID } from "node:crypto";
import {
  humanQuery, rootQuery, opk, insertUser, seedAdmission, createFirm, addMember,
} from "./rig-fixtures.mjs";

export const P960 = "p960";

/** The four caps, in the relation's own column order (0007 + 0090's fourth). */
export const CAPS = ["docs_per_day", "pages_per_day", "ocr_concurrency", "llm_witness_concurrency"];

/** The four values 0196 moved OFF the columns and INTO the trigger's first-insert arm. An
 *  independent source of truth for this battery: they are read from 0196's own header and from
 *  `clara._tf_firm_document_limits_upsert`'s live body, never re-derived from the door. */
export const FIRST_INSERT = {
  docs_per_day: 100, pages_per_day: 1000, ocr_concurrency: 2, llm_witness_concurrency: 2,
};

/** THE ESTATE'S CEILING, per cap — the spec's own four numbers, not a reading of the door.
 *
 *  WHY THESE FOUR. The estate runs ONE always-on `clara-runtime` machine (docs/ARCHITECTURE.md
 *  §"clara-runtime": `min_machines_running = 1`, explicitly not high availability), so a
 *  per-firm concurrency cap of 16 is already far above anything this deployment will actually
 *  run in parallel — it exists so that a firm cannot write a number that would queue unbounded
 *  vendor calls against a shared machine, not to express a throughput promise. The two daily
 *  caps are 100x the relation's own first-insert values: 10,000 documents and 100,000 pages in
 *  one UTC day is past what any Malaysian accounting firm ingests in a day and short of a
 *  number that would let one firm's backlog exhaust the shared ingest lane.
 *
 *  A FIRM CANNOT RAISE THEM: they live in a `clara_fn_owner`-owned function granted to nobody,
 *  reached only from the door's own SECURITY DEFINER body. */
export const CEILINGS = {
  docs_per_day: 10000, pages_per_day: 100000, ocr_concurrency: 16, llm_witness_concurrency: 16,
};

/** A firm of its own, with an owner and whichever extra ranks the cell asks for. A FRESH firm
 *  per cell, because `clara.firm_document_limits` is keyed on the FIRM: two cells sharing one
 *  would each be reading the other's arrangement. */
export async function firmScene(tag, roles = []) {
  const owner = await insertUser(P960, `${tag}_owner`);
  const token = await seedAdmission(`${P960}-${tag}`);
  const name = `P960 ${tag} ${randomUUID().slice(0, 8)}`;
  const firm = await createFirm(owner, { name, token, opKey: opk(`firm_${tag}`) });
  const members = {};
  for (const role of roles) {
    const user = await insertUser(P960, `${tag}_${role}`);
    await addMember(owner, { firm, user, role, opKey: opk(`add_${tag}_${role}`) });
    members[role] = user;
  }
  return { tag, firm, name, owner, members };
}

/** THE DOOR, as `sub`. Named arguments only — the same spelling a PostgREST caller sends. */
export async function setLimits(sub, caps, { opKey } = {}) {
  const r = await humanQuery(
    sub,
    `select clara.set_firm_document_limits(
       p_docs_per_day => $1, p_pages_per_day => $2, p_ocr_concurrency => $3,
       p_llm_witness_concurrency => $4, p_op_key => $5) as receipt`,
    [
      caps.docs_per_day ?? null, caps.pages_per_day ?? null, caps.ocr_concurrency ?? null,
      caps.llm_witness_concurrency ?? null, opKey ?? opk("set_caps"),
    ],
  );
  return r.rows[0].receipt;
}

/** THE STORED ROW, read as root. LABELLED FIXTURE READ: `clara.firm_document_limits` grants
 *  SELECT to `clara_authenticated` under an RLS policy scoped to the caller's own firm, so a
 *  human read is possible — but it is the CALLER's view, and these cells need the row as the
 *  database holds it, including `updated_by`/`updated_at`, for a firm the reader may not be in. */
export async function storedRow(firm) {
  const r = await rootQuery(
    `select docs_per_day, pages_per_day, ocr_concurrency, llm_witness_concurrency,
            updated_by, updated_at
       from clara.firm_document_limits where firm_id = $1`,
    [firm],
  );
  return r.rows[0] ?? null;
}

/** The audit rows this door wrote for `firm`, newest first. LABELLED FIXTURE READ: there is no
 *  human read of `clara.audit_log` in the estate, by design. */
export async function auditRows(firm) {
  const r = await rootQuery(
    `select actor, firm_id, fn, args, outcome from clara.audit_log
      where firm_id = $1 and fn = 'set_firm_document_limits' order by at desc, id desc`,
    [firm],
  );
  return r.rows;
}

/** Drop the firm's stored row — used by a cell that needs the no-row state AFTER a write. */
export async function clearRow(firm) {
  await rootQuery("delete from clara.firm_document_limits where firm_id = $1", [firm]);
}
