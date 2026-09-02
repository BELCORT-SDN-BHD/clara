// Migration 0028 -- shared rig fixtures for the vendor identity binding battery (task #36).
// NOT a test file (does not end in `.test.mjs`): `node --test` ignores it. Split out of
// x36-vendor-binding-dwell.test.mjs so the ceremony test (propose/sign/revoke,
// x36-vendor-binding-ceremony.test.mjs) shares the exact same fixtures rather than drifting.

import { randomUUID } from "node:crypto";
import { rootQuery, withActor, humanQuery, namedCall, opk, ROLES } from "./rig-helpers.mjs";
import { COA } from "./rig-fixtures.mjs";

export async function has28() {
  try {
    const r = await rootQuery("select 1 from clara.schema_migrations where version ~ '^0028_'");
    return r.rows.length > 0;
  } catch { return false; }
}

// ---------------------------------------------------------------------------
// The three granted ceremony verbs, called through the real governed surface
// (shared by x36-vendor-binding-ceremony and x36-vendor-binding-resolver).
// ---------------------------------------------------------------------------

export async function propose(sub, { client, counterparty, opKey } = {}) {
  const specs = [{ name: "p_proposal", cast: "jsonb" }, { name: "p_op_key" }];
  const r = await humanQuery(sub, namedCall("propose_vendor_identity_binding", specs), [
    JSON.stringify({ client_id: client, counterparty_id: counterparty }),
    opKey ?? opk("vbprop"),
  ]);
  return r.rows[0].result;
}

export async function sign(sub, { binding, opKey } = {}) {
  const specs = [{ name: "p_binding" }, { name: "p_op_key" }];
  const r = await humanQuery(sub, namedCall("sign_vendor_identity_binding", specs),
    [binding, opKey ?? opk("vbsign")]);
  return r.rows[0].result;
}

export async function revoke(sub, { binding, reason, opKey } = {}) {
  const specs = [{ name: "p_binding" }, { name: "p_reason" }, { name: "p_op_key" }];
  const r = await humanQuery(sub, namedCall("revoke_vendor_identity_binding", specs),
    [binding, reason ?? "rig revoke", opKey ?? opk("vbrevoke")]);
  return r.rows[0].result;
}

// ---------------------------------------------------------------------------
// THE POST-TIME CONTROL INTERLOCK (裁-18b PR-1, finding C3) — and how a fixture
// that needs a LIVE binding gets one without weakening the door.
// ---------------------------------------------------------------------------
// sign_vendor_identity_binding used to "prove" the post-time binding re-check by the presence
// of the `0029_vendor_binding_executor` row in clara.schema_migrations. That row is in an
// APPEND-ONLY ledger, so it has been present since 0029 applied and can never stop being —
// while the control it stood for lived in clara.execute_rule_post, which 0118 DROPPED. The gate
// was therefore permanently TRUE. PR-1 replaces it with a CATALOG WITNESS: the approve path's
// own body, resolved by exact signature, carrying the ratified marker PR-3 will mint. Until PR-3
// lands, signing REFUSES — deliberately.
//
// So `has29()` is no longer the right question for any cell, and it is kept only where a cell
// genuinely asks about the LEDGER. The question a signing cell asks is postTimeControlLive().
export const POST_TIME_MARKER = "binding_post_time_recheck_v1";
export const APPROVE_CORE_SIG = "clara._approve_entry_core(jsonb,uuid,uuid,text,text)";

// ---------------------------------------------------------------------------
// SUCCESSION (裁-18b PR-3, .claude/rules/db-tests.md's succession pattern)
// ---------------------------------------------------------------------------
// PR-3 makes the post-time control REAL: it splices the re-check into the approve path and
// mints the witness row itself. From that frontier on, `withPostTimeControl` must NOT plant
// anything — the row it used to insert would collide with the real one on the primary key, and
// the body it used to recut is the very body the registry attests to.
//
// The succession witness is a CATALOG WITNESS probed by EXACT SIGNATURE: PR-3 creates
// clara.reset_binding_revocation, a body that exists on no earlier frontier. Not a
// schema_migrations version string (this file is UNNUMBERED on the branch and its number is
// claimed at merge), not the marker text in the approve path (a text projection — the very
// thing FOLD-1 replaced), and not the presence of a witness ROW (a fixture can plant one).
let postTimeDeployedCache = null;
export async function postTimeControlDeployed() {
  if (postTimeDeployedCache !== null) return postTimeDeployedCache;
  try {
    const r = await rootQuery(
      "select to_regprocedure('clara.reset_binding_revocation(uuid,text,text)') is not null as ok");
    postTimeDeployedCache = r.rows[0]?.ok === true;
  } catch { postTimeDeployedCache = false; }
  return postTimeDeployedCache;
}

/** Run `fn()` with the witness registry holding EXACTLY the row(s) in `rows` for the post-time
 *  control, then put whatever was there back. Post-PR-3 the registry holds the migration's own
 *  row, so a cell that wants to drive a wrong/stale witness has to take the real one out first
 *  — an INSERT would collide on the primary key, and an UPDATE cannot re-point `proc`
 *  (t_control_witnesses_identity_frozen refuses that by design).
 *
 *  Restore outranks the probe: a cell that leaves the real witness missing has silently turned
 *  every later signing cell in the suite into a refusal test. */
export async function withWitnessReplaced(rows, fn) {
  const saved = (await rootQuery(
    "select control, proc, prosrc_sha, minted_in_migration from clara.control_witnesses where control = $1",
    [POST_TIME_MARKER])).rows;
  await rootQuery("delete from clara.control_witnesses where control = $1", [POST_TIME_MARKER]);
  for (const row of rows) {
    await rootQuery(
      `insert into clara.control_witnesses(control, proc, prosrc_sha, minted_in_migration)
       values ($1, $2, $3, $4)`,
      [POST_TIME_MARKER, row.proc, row.sha, row.mintedIn ?? "rig-fixture:withWitnessReplaced"]);
  }
  let out; let probeError = null;
  try { out = await fn(); } catch (e) { probeError = e; }
  await rootQuery("delete from clara.control_witnesses where control = $1", [POST_TIME_MARKER]);
  for (const row of saved) {
    await rootQuery(
      `insert into clara.control_witnesses(control, proc, prosrc_sha, minted_in_migration)
       values ($1, $2, $3, $4)`,
      [row.control, row.proc, row.prosrc_sha, row.minted_in_migration]);
  }
  // THE RESTORE IS VERIFIED BY CONTENT, NOT BY COUNT. A row count says something is there; it
  // does not say the witness attests to the same bytes it did before this helper ran, and a
  // wrong sha put back would leave every later signing cell silently testing a closed gate.
  const back = (await rootQuery(
    "select control, proc, prosrc_sha, minted_in_migration from clara.control_witnesses where control = $1 order by proc",
    [POST_TIME_MARKER])).rows;
  const shape = (rs) => JSON.stringify(rs.map((x) =>
    [x.control, x.proc, x.prosrc_sha, x.minted_in_migration]).sort());
  if (shape(back) !== shape(saved)) {
    throw new Error(
      `withWitnessReplaced: RESTORE FAILED — the registry is not what this helper found `
      + `(${shape(back)} != ${shape(saved)}). Every later signing cell in this suite is now untrustworthy.`
      + (probeError ? ` The probe had also failed: ${probeError.message}` : ""));
  }
  if (probeError) throw probeError;
  return out;
}

/** Does the approve path carry the ratified post-time binding re-check? (Catalog + body marker,
 *  never a migration-name proxy — review law 3: a name is a projection of the thing.) */
export async function postTimeControlLive() {
  try {
    // IDENTITY, not text — the same question the door asks, asked the same way. A helper that
    // reports on a wall by a DIFFERENT instrument than the wall uses is how a fixture ends up
    // disagreeing with the door it is supposed to be about.
    const r = await rootQuery(
      `select coalesce(bool_or(
                encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') = w.prosrc_sha), false) as ok
         from clara.control_witnesses w
         join pg_proc p on p.oid = to_regprocedure(w.proc)
        where w.control = $1`, [POST_TIME_MARKER]);
    return r.rows[0]?.ok === true;
  } catch { return false; }
}

/** Recut `_approve_entry_core` with `edit(original)` applied, COMMITTED, and return its new
 *  prosrc sha. Used by withPostTimeControl and by the C3 text-vs-identity panel. */
export async function recutApproveCore(edit) {
  const original = (await rootQuery(
    "select pg_get_functiondef($1::regprocedure) as def", [APPROVE_CORE_SIG])).rows[0].def;
  const mutated = edit(original);
  if (mutated === original) throw new Error("recutApproveCore: the edit changed nothing");
  await rootQuery(`set role ${ROLES.fnOwner}; ${mutated}`);
  const sha = (await rootQuery(
    "select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as s from pg_proc p where p.oid = $1::regprocedure",
    [APPROVE_CORE_SIG])).rows[0].s;
  return { original, sha };
}

/** Restore `_approve_entry_core` to `def` and verify by sha. */
export async function restoreApproveCore(def, expectedSha) {
  await rootQuery(`set role ${ROLES.fnOwner}; ${def}`);
  const sha = (await rootQuery(
    "select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as s from pg_proc p where p.oid = $1::regprocedure",
    [APPROVE_CORE_SIG])).rows[0].s;
  if (sha !== expectedSha) {
    throw new Error(`restoreApproveCore: RESTORE FAILED (sha ${sha} != ${expectedSha}) — every later cell is untrustworthy`);
  }
}

/** A byte-real, behaviour-NEUTRAL edit to the approve path (裁-18b PR-3 succession). It moves
 *  prosrc — so a witness minted against the previous bytes goes stale and its gate closes —
 *  without changing one thing the body does. This is how a post-succession cell drills
 *  "the control is not the reviewed body" now that ABSENCE is no longer reachable: the migration
 *  minted the witness, so the only way to a closed gate is DRIFT, which is the state a later
 *  lane creates by recutting a witnessed control and forgetting to re-witness it. */
export const driftApproveCore = (def) => {
  const needle = "\ndeclare";
  if (!def.includes(needle)) {
    throw new Error(
      "driftApproveCore: '\\ndeclare' is absent from the approve path's definition, so nothing "
      + "would drift and the cell would prove the opposite of what it claims.");
  }
  return def.replace(needle, `${needle}\n  -- rig fixture: byte drift, no behaviour; removed by restoreApproveCore`);
};

/** Insert exactly ONE behaviour-neutral byte into the live body. This is deliberately distinct
 * from the comment vector above: the byte delta itself is measured, so a helper rewrite cannot
 * quietly turn the claimed one-byte drift into a larger edit. */
export const oneByteDriftApproveCore = (def) => {
  const needle = "\nbegin\n";
  const hits = def.split(needle).length - 1;
  if (hits < 1) {
    throw new Error(
      "oneByteDriftApproveCore: top-level begin anchor is absent, so no byte would be inserted",
    );
  }
  const mutated = def.replace(needle, "\nbegin \n");
  if (Buffer.byteLength(mutated, "utf8") !== Buffer.byteLength(def, "utf8") + 1) {
    throw new Error("oneByteDriftApproveCore: mutation was not an exact one-byte insertion");
  }
  return mutated;
};

/** The rig's stand-in for PR-3's own recut: plant the marker as REAL CODE. What the gate reads is
 *  the resulting sha, not this text — the text only makes the stub honest to look at. */
export const plantMarker = (def) => {
  const needle = "\ndeclare";
  if (!def.includes(needle)) {
    throw new Error(
      `plantMarker: '\\ndeclare' is absent from the approve path's definition, so nothing would be `
      + "planted and the cell would prove the opposite of what it claims.");
  }
  return def.replace(needle,
    `${needle}\n  v_${POST_TIME_MARKER} boolean := true; -- rig fixture: planted and removed`);
};

/**
 * Run `fn()` with PR-3's marker PLANTED on the live approve path, then restore it byte-for-byte.
 *
 * WHY THIS AND NOT A ROOT `update … set status='live'`: the mechanism under test in a resolver
 * or autopost cell is the RESOLVER, not the signer — but a fixture that writes 'live' by hand
 * stops exercising the audited door altogether, and the estate's rule is that the security
 * mechanisms are the thing under test and are never bypassed for convenience. Planting the
 * marker changes exactly ONE fact: whether PR-3's control is deployed. Every other wall in
 * sign_vendor_identity_binding — the rank floor, 裁-18a, the standing re-read, the drift check,
 * the suppression wall and the re-run identity walls — still runs for real.
 *
 * Same three disciplines as withMutant: the needle must actually be present (a no-op "plant"
 * would make the caller prove the opposite of what it claims), the change is COMMITTED so a
 * different pooled connection can see it, and the restore is verified by prosrc sha256 before
 * any probe error is re-thrown.
 */
export async function withPostTimeControl(fn) {
  // SUCCESSION ARM (裁-18b PR-3). Once the real control ships there is nothing to plant: the
  // approve path carries the re-check and the migration minted the witness for those exact
  // bytes. Planting here would be strictly WORSE than a no-op — the insert collides on the
  // primary key, and recutting the body would make the door refuse the very calls this helper
  // exists to let through. So the helper gets out of the way and the caller signs through the
  // real door with the real control behind it.
  if (await postTimeControlDeployed()) return fn();

  const before = (await rootQuery(
    "select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as s from pg_proc p where p.oid = $1::regprocedure",
    [APPROVE_CORE_SIG])).rows[0].s;
  // TWO ACTS, in the order PR-3 will perform them: recut the approve path, then WITNESS the body
  // that was reviewed. Neither alone opens the gate — which is the whole of identity-by-sha, and
  // is why this fixture is a replay of the MECHANISM rather than a way past it.
  const { original, sha } = await recutApproveCore(plantMarker);
  await rootQuery(
    `insert into clara.control_witnesses(control, proc, prosrc_sha, minted_in_migration)
     values ($1, $2, $3, 'rig-fixture:withPostTimeControl')`,
    [POST_TIME_MARKER, APPROVE_CORE_SIG, sha]);
  if (!(await postTimeControlLive())) {
    await rootQuery("delete from clara.control_witnesses where control = $1", [POST_TIME_MARKER]);
    await restoreApproveCore(original, before);
    throw new Error("withPostTimeControl: witnessed the recut body and the gate still reads CLOSED");
  }
  // No `finally` (eslint no-unsafe-finally, and the reason behind it): a throw from a finally
  // block swallows the probe's own error, which is the one a reader needs. Capture, restore,
  // then decide — and a failed RESTORE outranks a failed probe.
  let out; let probeError = null;
  try { out = await fn(); } catch (e) { probeError = e; }
  await rootQuery("delete from clara.control_witnesses where control = $1", [POST_TIME_MARKER]);
  let restoreError = null;
  try { await restoreApproveCore(original, before); } catch (e) { restoreError = e; }
  const left = (await rootQuery(
    "select count(*)::int c from clara.control_witnesses where control = $1", [POST_TIME_MARKER])).rows[0].c;
  if (restoreError || left !== 0) {
    throw new Error(
      "withPostTimeControl: RESTORE FAILED — every later cell in this suite is now untrustworthy. "
      + (restoreError ? restoreError.message : `${left} witness row(s) survived`)
      + (probeError ? ` The probe had also failed: ${probeError.message}` : ""));
  }
  if (probeError) throw probeError;
  return out;
}

/** Sign through the REAL audited door, with PR-3's control present. Use wherever a cell needs a
 *  LIVE binding; use bare `sign()` wherever the cell is about a refusal. */
export async function signLive(sub, opts = {}) {
  return withPostTimeControl(() => sign(sub, opts));
}

/** Propose + sign a binding to 'live' over a fully-qualifying window. Returns the live binding's
 *  receipt. */
export async function seedLiveBinding(w, tag) {
  const cp = await seedPassingWindow(w, tag);
  const proposed = await propose(w.users.bob, { client: w.clients.A1, counterparty: cp.id });
  const signed = await signLive(w.users.alice, { binding: proposed.binding_id });
  return { cp, binding: signed };
}

/** The 0029 LEDGER row. Kept for the one cell that genuinely asks about the ledger; it is NOT
 *  the question "is the post-time control deployed" — see postTimeControlLive() above. */
export async function has29() {
  try {
    const r = await rootQuery(
      "select 1 from clara.schema_migrations where version='0029_vendor_binding_executor'",
    );
    return r.rows.length > 0;
  } catch { return false; }
}

// buildWorld's fixture COA (cash/AR/sales/expense/rounding) carries no payable-class
// account, but _assert_supplier_bill_shape_at requires one for any coding_kind='supplier_bill'
// entry's credit leg. Direct-inserted once per client (PK is client_id+account_code, so this
// is idempotent within a single buildWorld() run) rather than through upsert_account -- these
// helpers already direct-insert documents/entries/lines for the same isolation reason, and
// upsert_account's p_account_class plumbing is incidental to what this battery tests.
/**
 * Record the client's OWN hard identifier (裁-18b PR-1 fold, FOLD-7).
 *
 * WHY EVERY BINDING FIXTURE NEEDS THIS NOW. `_binding_extra_blocker` refuses a "vendor" hard id
 * that is the CLIENT'S own — a mislabelled customer block would otherwise bind the client to
 * itself. That wall cannot be evaluated for a client with no recorded identifier, and reading the
 * resulting no-match as "so it is not the client's" would be absence-as-evidence: the exact case
 * the wall exists to catch produces exactly that no-match. So the door refuses
 * `binding_client_identity_unproven` instead, and a client without a recorded SSM/TIN gets no
 * vendor binding at all. buildWorld records none (measured: zero rows estate-wide on a seeded
 * rig), so every battery that proposes a binding records one here.
 *
 * The value is random per call and therefore cannot collide with a fixture vendor's registration
 * — a collision would make the own-client wall fire for the wrong reason.
 */
export async function seedClientHardIdentifier(firm, client, { kind = "ssm", value = null } = {}) {
  const v = value ?? `CLI${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
  await rootQuery(
    `insert into clara.client_identifiers(firm_id,client_id,kind,value_normalized,added_by)
     values($1,$2,$3,$4,
       (select user_id from clara.firm_memberships where firm_id=$1 and status='active' limit 1))`,
    [firm, client, kind, foldAlnum(v)]);
  return foldAlnum(v);
}

export const AP_ACCOUNT = "2000";
export async function seedPayableAccount(firm, client) {
  await rootQuery(
    `insert into clara.coa_accounts(client_id,firm_id,account_code,name,account_type,account_class)
     values($1,$2,$3,'Accounts Payable','liability','payable')`,
    [client, firm, AP_ACCOUNT],
  );
}

// Matches ck_counterparties_name_normalized / ...registration_normalized EXACTLY:
// lower(regexp_replace(x, '[^a-zA-Z0-9]', '', 'g')) -- alphanumeric-only, no spaces.
const foldAlnum = (s) => s.toLowerCase().replace(/[^a-zA-Z0-9]/g, "");

/** A DETERMINISTIC, per-invoice economic fact set (裁-18b PR-1 fold, C2). Two documents that
 *  are scans of ONE invoice must share these; two genuinely different invoices must not. Derived
 *  from the printed invoice id purely so a window's three documents differ by construction —
 *  callers that mean to build "one invoice, three scans" pass a SHARED `economics` object. */
export function deriveEconomics(invoiceId) {
  let h = 0;
  for (const ch of String(invoiceId ?? "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const cents = 100000 + (h % 900000);
  const day = 1 + (h % 27);
  return {
    date: `2025-07-${String(day).padStart(2, "0")}`,
    currency: "MYR",
    totalCents: cents,
    total: (cents / 100).toFixed(2),
  };
}

export async function seedVendorCounterparty(firm, client, tag) {
  // The name must be unique per call, not merely per tag: the resolver battery
  // (x36-vendor-binding-resolver) exercises _resolve_counterparty's bare-name lookup
  // directly, which finds ANY existing counterparty sharing the exact name -- a tag-only
  // name would collide with a same-tagged row left over from a PRIOR run against a
  // not-freshly-reset scratch DB (fine on CI's always-fresh DB, but a real trap during
  // local iterative debugging against a persistent one). The random suffix makes this
  // collision-proof regardless of DB freshness.
  // THE LEADING TOKEN IS UNIQUE PER VENDOR (裁-18b PR-1, the wall-introducing-PR law). It used
  // to be a constant "EZACCOUNT", with the random part at the END — which made every vendor this
  // builder produced a member of ONE name family. PR-1 applies law 79's
  // clara.name_family_is_ambiguous at the proposal point, and it correctly refuses a family with
  // two members, so a same-token fixture would refuse every binding in this battery. Moving the
  // random part to the FRONT is the fixture becoming realistic, not the wall being relaxed:
  // real vendors do not all share a first word.
  const name = `EZ${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()} SECRETARY ${tag}`;
  const reg = `2023${randomUUID().replace(/-/g, "").slice(0, 8)}`;
  const r = await rootQuery(
    `insert into clara.counterparties(firm_id,client_id,kind,name,name_normalized,registration_no,registration_normalized,created_by)
     values($1,$2,'vendor',$3,$5,$4,$6,
       (select user_id from clara.firm_memberships where firm_id=$1 and status='active' limit 1))
     returning id`,
    [firm, client, name, reg, foldAlnum(name), foldAlnum(reg)],
  );
  return { id: r.rows[0].id, name, nameNorm: foldAlnum(name), reg, regNorm: foldAlnum(reg) };
}

/** A bare document with no extractions -- enough for the dwell cells that fail before F1/F2/F3
 *  ever look at extraction content. */
export async function seedBareDocument(firm, tag) {
  const sha = randomUUID().replace(/-/g, "").padEnd(64, "0").slice(0, 64);
  const r = await rootQuery(
    `insert into clara.documents(firm_id,sha256,original_filename,mime_type,byte_size,storage_path,bytes_verified_at,extraction_status,uploaded_by)
     values($1,$2,$3,'application/pdf',2048,$4,now(),'pending',null)
     returning id`,
    [firm, sha, `${tag}.pdf`, `firms/${firm}/docs/${sha}.pdf`],
  );
  return { id: r.rows[0].id, sha };
}

/** A minimal approved entry, direct-inserted (bypassing draft/approve) so the fixture is
 *  fast and the posting_date/approved_at/document_id are fully controlled. */
export async function seedApprovedEntry(firm, client, cp, doc,
  { postingDate, approvedAt = null, flags = null }) {
  const maker = (await rootQuery("select user_id from clara.firm_memberships where firm_id=$1 and status='active' limit 1", [firm])).rows[0].user_id;
  const resolution = (await rootQuery(
    `insert into clara.client_resolutions(firm_id,client_id,subject_kind,subject_id,confidence,method,evidence,resolved_by)
     values($1,$2,'document',$3,1.0,'human','{}'::jsonb,$4) returning id`,
    [firm, client, doc.id, maker],
  )).rows[0].id;
  const filing = (await rootQuery(
    `insert into clara.document_filings(firm_id,document_id,client_id,filed_by,basis,resolution_id)
     values($1,$2,$3,$4,'seed-0007',$5) returning id`,
    [firm, doc.id, client, maker, resolution],
  )).rows[0].id;
  // t_je_balance is a DEFERRED constraint trigger -- it fires at COMMIT of the transaction
  // that touched the row, not at statement end. rootQuery runs each statement as its own
  // autocommit transaction, so a draft insert followed by a *separate* rootQuery call for the
  // lines would commit the (line-less) draft first and fire the deferred check right then --
  // CLR07 unbalanced. Fix: run draft-insert -> lines-insert -> approve-update on ONE client
  // inside ONE explicit transaction (withActor transaction:true) so the deferred check only
  // ever fires once, after the lines exist -- mirroring the real draft/approve lifecycle.
  const entry = await withActor({ transaction: true }, async (pgClient) => {
    // `flags` is set ON THE DRAFT, deliberately (裁-18b PR-1 fold, M-12 / S-2). The real
    // duplicate_override is written by revise_entry(p_duplicate_override) while the entry is
    // still a draft, and clara._tf_entry_immutable refuses ANY flags write once the entry is
    // approved — so a cell that stamped an approved row would be refused CLR08 and would read as
    // "the wall already refuses" when it had never reached the wall at all. This fixture already
    // bypasses draft/approve for speed; carrying the flag through the same door it carries
    // posting_date through keeps it out of that trap.
    const r = await pgClient.query(
      `insert into clara.journal_entries(firm_id,client_id,status,posting_date,origin,document_id,
          filing_id,source_doc_sha256,maker_actor,coding_kind,flags)
       values($1,$2,'draft',$3,'agent',$4,$5,$6,$7,'supplier_bill',coalesce($8::jsonb,'{}'::jsonb))
       returning id`,
      [firm, client, postingDate, doc.id, filing, doc.sha, maker,
        flags === null ? null : JSON.stringify(flags)],
    );
    const id = r.rows[0].id;
    // A supplier-bill-shaped entry (coding_kind='supplier_bill') requires: no receivable leg,
    // no payable-class DEBIT leg, and a payable-class CREDIT that ties to gross (skipped here
    // since no verified entry_evidence exists) -- Dr expense / Cr payable, both real
    // coa_accounts rows. Every payable/receivable-class line also requires a counterparty.
    await pgClient.query(
      `insert into clara.journal_lines(entry_id,line_no,account_code,debit_cents,credit_cents,description,counterparty_id)
       values($1,1,$3,100000,0,'bill',$2),($1,2,$4,0,100000,'payable',$2)`,
      [id, cp, COA.expense, AP_ACCOUNT],
    );
    await pgClient.query(
      `update clara.journal_entries set status='approved',checker_actor=$2,approved_at=coalesce($3::timestamptz,now())
       where id=$1`,
      [id, maker, approvedAt],
    );
    // 0037 (Wave C-a): belt-1 is a DEFERRED constraint trigger -- at COMMIT, every
    // approved entry's per-(domain,counterparty) control nets must equal its
    // open_items rows exactly. This fixture bypasses the approve verbs entirely, so
    // the subledger hook never runs and the payable credit leg above would have no
    // item behind it. Write the congruent row the classifier would have produced
    // (coding_kind='supplier_bill' -> ap / 'bill' / +gross) inside the SAME
    // transaction. Guarded on the table existing so the battery stays bimodal-green
    // at every pre-0037 schema the deploy drill stops at.
    const hasSubledger = (await pgClient.query("select to_regclass('clara.open_items') as rel")).rows[0].rel != null;
    if (hasSubledger) {
      await pgClient.query(
        `insert into clara.open_items(firm_id,client_id,domain,counterparty_id,entry_id,item_kind,item_date,amount_cents,created_by)
         values($1,$2,'ap',$3,$4,'bill',$5::date,100000,$6)`,
        [firm, client, cp, id, postingDate, maker],
      );
    }
    return id;
  });
  return entry;
}

// The REAL X6 receipt shape (packages/runtime/lib/invoice-vendor-identity.mjs's
// readVendorIdentityFromLines) -- every one of these 16 counters is ALWAYS present
// (initialized to 0 in the receipt object literal), plus `outcome`/`candidates`. A genuine
// qualifying absent receipt requires absent=1 (incremented exactly once on that path) and
// matched=typed_collapsed=emitted=0 (P-round Finding C -- the allowlist-only partial shape
// this fixture used to emit was REJECTED outright by the post-P-round key/value checks,
// which is exactly the production defect Finding C fixed: a partial synthetic receipt was
// masking that every REAL envelope carries these keys).
export const FULL_ABSENT_RECEIPT = {
  matched: 0, absent: 1, ambiguous: 0, rejected_gate: 0, below_band: 0,
  height_missing: 0, unit_unresolved: 0, no_geometry: 0, label_continuation: 0,
  no_vendor_anchor: 0, vendor_anchor_far: 0, closer_to_customer: 0,
  typed_collapsed: 0, typed_disagreement: 0, typed_vs_ambiguous: 0, emitted: 0,
  candidates: [], outcome: "absent",
};

/** A DONE invoice_facts + DONE ocr extraction, wired so F1 (vendor name) and F2 (invoice
 *  prefix) are stable across the window and F3 (page-1 top-band OCR line naming the bound
 *  party's registration) holds. The invoice_facts envelope carries the FULL real
 *  vendor_identity receipt shape (FULL_ABSENT_RECEIPT) -- REQUIRED for
 *  _resolve_vendor_binding's own admission gate (Slot A), which the dwell/ceremony
 *  batteries never exercise (they only drive _derive_vendor_binding_proposal, which has no
 *  A.1 vendor_identity check at all) but the resolver/executor batteries do. */
// `corpus` (裁-18b PR-1 fold): OFF by default, so every EXISTING caller emits byte-identically
// what it always did. It is turned ON only by the three builders that construct a BINDING WINDOW
// — the corpus a proposal is derived from, which the fold round's two new walls judge. The
// resolver battery's post-binding probe documents deliberately do NOT set it: they are inputs to
// clara._resolve_vendor_binding, and adding an invoice.vendor_registration region there would
// change what Slot A reads. A shared fixture that quietly moves under another battery is how a
// green suite starts measuring something else.
export async function seedF123Evidence(firm, document, cp, invoiceId, vendorNameText = cp.name,
  extractedAt = null, { corpus = false, economics = null, printedRegistration } = {}) {
  // `extractedAt` (裁-18b PR-1): callers that BACKDATE approved_at must backdate the extraction
  // too, or the derivation's own `facts_restated` rung (extracted_at > approved_at) refuses
  // `evidence_restated` before any later gate is reached. Defaults to the previous behaviour.
  const factsExt = randomUUID();
  await rootQuery(
    `insert into clara.document_extractions(id,firm_id,document_id,engine_id,engine_kind,version_n,status,page_count,envelope,extracted_at)
     values($1,$2,$3,'clara-fixture:v1','invoice_facts',1,'done',1,$4::jsonb,coalesce($5::timestamptz, now()))`,
    [factsExt, firm, document, JSON.stringify({ vendor_identity: FULL_ABSENT_RECEIPT }), extractedAt],
  );
  const region = (path, text, cents = null) => rootQuery(
    `insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,text_content,monetary_cents,engine_confidence)
     values($1,$2,'page_polygon','{"page":1,"polygon":[0,0,1,1]}'::jsonb,$3,$4,$5,1.0)`,
    [firm, factsExt, path, text, cents]);
  await region("invoice.vendor_name", vendorNameText);
  await region("invoice.invoice_id", invoiceId);
  // 裁-18b PR-1 fold (C1 / N-1): THE PRINTED HARD IDENTIFIER. W18's second arm — "or a human
  // resolved it" — was STRUCK once the review measured that clara.client_resolutions proves
  // CLIENT attribution, carries no counterparty key at all, and is minted automatically by
  // file_document for every filed document. Every corpus member must now PRINT an identifier
  // that is the target's. This builder emitted none, so it leaned on exactly the arm that was
  // removed: a real vendor invoice prints its registration, and now so does the fixture.
  // `undefined` ⇒ the vendor's own when this is a corpus document, none otherwise; `null` ⇒ print
  // none even in a corpus (the A3c shape); a string ⇒ a MISMATCH.
  const printed = printedRegistration === undefined ? (corpus ? cp.reg : null) : printedRegistration;
  if (printed !== null && printed !== undefined) await region("invoice.vendor_registration", printed);
  // ...and (C2) the ECONOMIC FACTS the fingerprint is taken over. Three byte-different scans of
  // ONE invoice clear every other conjunct — distinct document ids, distinct sha256s, even
  // distinct printed invoice ids if the attacker alters them — so the wall fingerprints what the
  // attacker does NOT choose: the issuer id, the date, the currency and the amounts. A fixture
  // that prints no economics fingerprints the EMPTY set, three of them collide, and a lawful
  // window would be refused as one invoice photographed three times. Derived from the printed
  // invoice id so each document of a window differs without the caller having to think about it.
  const econ = economics ?? (corpus ? deriveEconomics(invoiceId) : null);
  if (econ) {
    await region("invoice.invoice_date", econ.date);
    await region("invoice.currency", econ.currency);
    await region("invoice.total", econ.total, econ.totalCents);
  }
  const ocrExt = randomUUID();
  await rootQuery(
    `insert into clara.document_extractions(id,firm_id,document_id,engine_id,engine_kind,version_n,status,page_count,envelope,extracted_at)
     values($1,$2,$3,'clara-fixture:v1','ocr',1,'done',1,$4::jsonb,coalesce($5::timestamptz, now()))`,
    [ocrExt, firm, document, JSON.stringify({ pages: [{ page_number: 1, height: 11 }] }), extractedAt],
  );
  // top-band: ymin (y1) = 0.5, height = 11 -> ratio 0.045, well under 0.25.
  await rootQuery(
    `insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,text_content,engine_confidence)
     values($1,$2,'page_polygon',$3::jsonb,'pages.1.lines.0',$4,1.0)`,
    [firm, ocrExt, JSON.stringify({ page_number: 1, polygon: [1, 0.5, 2, 0.5, 2, 0.9, 1, 0.9] }), `${cp.name} (${cp.reg})`],
  );
}

export async function deriveOrError(firm, client, cp) {
  try {
    const r = await rootQuery(
      "select clara._derive_vendor_binding_proposal($1,$2,$3) as r",
      [firm, client, cp],
    );
    return { ok: true, receipt: r.rows[0].r };
  } catch (e) {
    return { ok: false, message: e.message, code: e.code };
  }
}

/** Seed a full PASSING three-document window (the x36.1 shape) for a fresh counterparty
 *  tagged `tag`, so ceremony tests can propose/sign against a window guaranteed to clear
 *  every _derive_vendor_binding_proposal gate. Returns the counterparty fixture. */
export async function seedPassingWindow(w, tag) {
  const cp = await seedVendorCounterparty(w.firms.A, w.clients.A1, tag);
  // DISTINCT printed invoice ids sharing a strong prefix, and approved_at tracking the posting
  // dates (裁-18b PR-1, the wall-introducing-PR law). This builder used to give all three
  // documents ONE invoice id and approve them all at now(). PR-1 adds two walls above the frozen
  // window that correctly refuse both shapes — three scans of one invoice is one invoice, and a
  // corpus approved in a single minute has not been observed over fourteen days. The LCP of
  // …9001/…9002/…9003 is still well past F2's length and alpha floors, so every gate this
  // battery exercises is unchanged; the fixture just stopped describing an impossible vendor.
  const prefix = `EZSEC-IV-${randomUUID().replace(/-/g, "").slice(0, 5).toUpperCase()}-`;
  const dates = ["2025-08-25", "2025-08-29", "2025-10-13"];
  let i = 0;
  for (const d of dates) {
    const doc = await seedBareDocument(w.firms.A, `${tag}-${d}`);
    // corpus: true — this IS a binding window, so each document prints the vendor's own hard
    // identifier and its own economic facts (裁-18b PR-1 fold, C1 and C2). Without them a lawful
    // window is refused as unproven identity, or as one invoice photographed three times.
    await seedF123Evidence(w.firms.A, doc.id, cp, `${prefix}${9001 + i}`, cp.name, `${d}T00:00:00Z`,
      { corpus: true });
    await seedApprovedEntry(w.firms.A, w.clients.A1, cp.id, doc,
      { postingDate: d, approvedAt: `${d}T09:00:00Z` });
    i += 1;
  }
  return cp;
}
