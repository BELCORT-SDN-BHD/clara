// 裁-21 PR-a rig helpers -- NOT a test file (the name does not end in `.test.mjs`, so
// `node --test` never collects it). Door wrappers, root-side snapshot readers and the
// rolled-back-transaction mutant harness for `coa-template-pr-a.test.mjs`.
//
// Every door is called with NAMED arguments through `namedCall` (rig-helpers.mjs's own idiom),
// so a parameter RENAME in the migration is a rig failure rather than a silent positional shift.

import { getPool, humanQuery, namedCall, rootQuery } from "./rig-fixtures.mjs";

// ---------------------------------------------------------------------------
// The doors
// ---------------------------------------------------------------------------

export async function forkTemplate(sub, { source = null, key, title, framework = "MPERS", basis, opKey }) {
  const r = await humanQuery(
    sub,
    namedCall("fork_coa_template", [
      { name: "p_source", cast: "uuid" },
      { name: "p_template_key", cast: "text" },
      { name: "p_title", cast: "text" },
      { name: "p_framework_hint", cast: "text" },
      { name: "p_basis", cast: "text" },
      { name: "p_op_key", cast: "text" },
    ]),
    [source, key, title, framework, basis, opKey],
  );
  return r.rows[0].result;
}

export async function upsertFamily(
  sub,
  {
    template,
    familyKey,
    label,
    inclusion,
    basis,
    sortOrdinal = 10,
    msicSections = [],
    msicDivisions = [],
    msicEdition = null,
    tradeNatures = [],
    entityTypes = [],
    opKey,
  },
) {
  const r = await humanQuery(
    sub,
    namedCall("upsert_coa_template_family", [
      { name: "p_template", cast: "uuid" },
      { name: "p_family_key", cast: "text" },
      { name: "p_label", cast: "text" },
      { name: "p_inclusion", cast: "text" },
      { name: "p_basis", cast: "text" },
      { name: "p_sort_ordinal", cast: "int" },
      { name: "p_msic_sections", cast: "text[]" },
      { name: "p_msic_divisions", cast: "text[]" },
      { name: "p_msic_edition", cast: "text" },
      { name: "p_trade_natures", cast: "text[]" },
      { name: "p_entity_types", cast: "text[]" },
      { name: "p_op_key", cast: "text" },
    ]),
    [
      template, familyKey, label, inclusion, basis, sortOrdinal,
      msicSections, msicDivisions, msicEdition, tradeNatures, entityTypes, opKey,
    ],
  );
  return r.rows[0].result;
}

export async function removeFamily(sub, { template, familyKey, opKey }) {
  const r = await humanQuery(
    sub,
    namedCall("remove_coa_template_family", [
      { name: "p_template", cast: "uuid" },
      { name: "p_family_key", cast: "text" },
      { name: "p_op_key", cast: "text" },
    ]),
    [template, familyKey, opKey],
  );
  return r.rows[0].result;
}

export async function upsertTemplateAccount(
  sub,
  {
    template, familyKey, code, name, type, accountClass = null, special = null, sortOrdinal = 10,
    taxSensitive = false, addBackClass = null, statutory = null, opKey,
  },
) {
  const r = await humanQuery(
    sub,
    namedCall("upsert_coa_template_account", [
      { name: "p_template", cast: "uuid" },
      { name: "p_family_key", cast: "text" },
      { name: "p_account_code", cast: "text" },
      { name: "p_name", cast: "text" },
      { name: "p_account_type", cast: "text" },
      { name: "p_account_class", cast: "text" },
      { name: "p_special_acc_type", cast: "text" },
      { name: "p_sort_ordinal", cast: "int" },
      { name: "p_tax_sensitive", cast: "boolean" },
      { name: "p_add_back_class", cast: "text" },
      { name: "p_statutory", cast: "text" },
      { name: "p_op_key", cast: "text" },
    ]),
    [template, familyKey, code, name, type, accountClass, special, sortOrdinal,
      taxSensitive, addBackClass, statutory, opKey],
  );
  return r.rows[0].result;
}

export async function removeTemplateAccount(sub, { template, code, opKey }) {
  const r = await humanQuery(
    sub,
    namedCall("remove_coa_template_account", [
      { name: "p_template", cast: "uuid" },
      { name: "p_account_code", cast: "text" },
      { name: "p_op_key", cast: "text" },
    ]),
    [template, code, opKey],
  );
  return r.rows[0].result;
}

export async function publishTemplate(sub, { template, opKey }) {
  const r = await humanQuery(
    sub,
    namedCall("publish_coa_template", [
      { name: "p_template", cast: "uuid" },
      { name: "p_op_key", cast: "text" },
    ]),
    [template, opKey],
  );
  return r.rows[0].result;
}

export async function retireTemplate(sub, { template, opKey }) {
  const r = await humanQuery(
    sub,
    namedCall("retire_coa_template", [
      { name: "p_template", cast: "uuid" },
      { name: "p_op_key", cast: "text" },
    ]),
    [template, opKey],
  );
  return r.rows[0].result;
}

export async function listTemplates(sub) {
  const r = await humanQuery(sub, "select * from clara.list_coa_templates()");
  return r.rows;
}

export async function getTemplate(sub, template) {
  const r = await humanQuery(sub, "select clara.get_coa_template($1::uuid) as result", [template]);
  return r.rows[0].result;
}

/** Family / account rows a given human can actually SELECT (RLS decides, no definer wrapper). */
export async function humanFamilyCodes(sub, template) {
  const r = await humanQuery(
    sub,
    "select family_key from clara.coa_template_families where template_id = $1::uuid order by family_key",
    [template],
  );
  return r.rows.map((x) => x.family_key);
}

export async function humanAccountCodes(sub, template) {
  const r = await humanQuery(
    sub,
    "select account_code from clara.coa_template_accounts where template_id = $1::uuid order by account_code",
    [template],
  );
  return r.rows.map((x) => x.account_code);
}

// ---------------------------------------------------------------------------
// Root-side readers (superuser bypasses RLS -- used for ground truth, never as a wall proof)
// ---------------------------------------------------------------------------

export async function platformTemplate() {
  const r = await rootQuery(
    "select * from clara.coa_templates where scope = 'platform' and template_key = 'my_sme_starter'",
  );
  return r.rows[0] ?? null;
}

export async function rawTemplate(id) {
  const r = await rootQuery("select * from clara.coa_templates where id = $1", [id]);
  return r.rows[0] ?? null;
}

/**
 * A FULL, ordered snapshot of a template's content rows -- the instrument the copy-not-reference
 * cell compares before and after an edit to a DIFFERENT template. Every column, so a changed
 * basis or sort_ordinal is caught, not just a changed key.
 */
export async function snapshotTemplate(id) {
  const fam = await rootQuery(
    `select family_key, label, inclusion, basis, sort_ordinal, msic_sections, msic_divisions,
            msic_edition, trade_natures, entity_types
       from clara.coa_template_families where template_id = $1 order by family_key`,
    [id],
  );
  const acc = await rootQuery(
    `select family_key, account_code, name, account_type, account_class, special_acc_type,
            sort_ordinal, tax_sensitive, add_back_class, statutory
       from clara.coa_template_accounts where template_id = $1 order by account_code`,
    [id],
  );
  const hdr = await rootQuery(
    `select scope, firm_id, template_key, version, title, framework_hint, basis, state,
            encode(content_sha256,'hex') as content_sha256, forked_from, created_by,
            published_by, published_at is not null as has_published_at,
            retired_at is not null as has_retired_at
       from clara.coa_templates where id = $1`,
    [id],
  );
  return JSON.stringify({ header: hdr.rows[0] ?? null, families: fam.rows, accounts: acc.rows });
}

export async function templateCounts(id) {
  const r = await rootQuery(
    `select (select count(*)::int from clara.coa_template_families where template_id = $1) as families,
            (select count(*)::int from clara.coa_template_accounts where template_id = $1) as accounts`,
    [id],
  );
  return r.rows[0];
}

// ---------------------------------------------------------------------------
// The mutant harness
// ---------------------------------------------------------------------------

/**
 * Run `fn(client)` inside ONE transaction that is ALWAYS rolled back. DDL is transactional in
 * PostgreSQL, so a mutant that DROPs a constraint, an index, a trigger or a policy is undone by
 * the rollback -- the shipping schema is never left mutated even when the probe inside
 * unexpectedly succeeds (which is exactly what a mutant cell is trying to make happen).
 *
 * The probe MUST run on the client this hands back: a mutation is invisible to any other
 * session until commit, and this transaction never commits.
 */
export async function withRolledBackTx(fn) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    return await fn(client);
  } finally {
    try {
      await client.query("rollback");
    } catch {
      /* best-effort: the transaction may already be aborted */
    }
    try {
      await client.query("reset role");
    } catch {
      /* best-effort */
    }
    try {
      await client.query("reset all");
    } catch {
      /* best-effort */
    }
    client.release();
  }
}

/** Did `fn()` raise? Returns the SQLSTATE, or null when the call SUCCEEDED. */
export async function raisedCode(fn) {
  try {
    await fn();
    return null;
  } catch (e) {
    return e.code ?? "(no code)";
  }
}

/** The `detail` reason a Clara refusal carries, so a cell can pin the NAME and not just the class. */
export async function refusalReason(fn) {
  try {
    await fn();
    return null;
  } catch (e) {
    if (!e.detail) return `(no detail) ${e.code ?? ""} ${e.message ?? ""}`;
    try {
      return JSON.parse(e.detail).reason ?? `(no reason key) ${e.detail}`;
    } catch {
      return `(unparseable detail) ${e.detail}`;
    }
  }
}
