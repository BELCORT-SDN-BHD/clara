// F-A8 PR-1 — domain fixtures for the Tier-1 door/derivation/owner-door battery.
//
// NOT a test file (`node --test` ignores it — no `.test.mjs` suffix). Companion to the
// structural measurement fixtures in f-a8-fixtures.mjs: THAT file measures catalog posture
// (grants, RLS, rosters); THIS file builds the domain objects (endpoints, attempts, artifacts,
// drafts) a Tier-1 behavioural cell needs, using the SAME two disciplines (must() throws on
// build failure; nothing here encodes an expectation — the test file asserts).
//
// Every fixture is built through the REAL shipped surface where one exists
// (mint_wake_credential, wake_submit_policy_draft, decide_policy_draft, override_policy_draft);
// the evidence substrate below the wake door (tier1_endpoints, web_attempts, fetch_artifacts)
// has no PR-1 writer reachable by a wake/human role yet (record_fetch_artifact is
// clara_runtime-only and PR-2's runtime job does not exist), so those rows are built directly
// as clara_fn_owner — exactly the shape record_fetch_artifact would insert, not a shortcut
// around it (every column a real call would populate is populated here too).

import { randomUUID, createHash } from "node:crypto";
import { asRoot, asWake, asHuman, ROLES } from "./rig-helpers.mjs";

/** THROW rather than return a degraded object (Annex C discipline 1, borrowed from f-a8-fixtures.mjs). */
function must(value, what) {
  if (value === null || value === undefined) throw new Error(`f-a8 tier1 fixture could not be built: ${what}`);
  return value;
}

/** A valid 64-hex digest derived from a seed string — collision-free per distinct seed. */
export const digest = (seed) => createHash("sha256").update(String(seed)).digest("hex");

/**
 * The first active owner-role membership the seed data carries, read live rather than
 * hardcoded — the resettable Alara/Borneo test fixtures (constraint 13), never BELCORT (not
 * present in the throwaway rig's seed data). Two independent owners of DISTINCT firms so a
 * cell can prove decide_policy_draft is gated on role_rank ALONE, never on minted_by_firm
 * (IL-D8: "no admin+ authorization list" — measured to have no firm-scoping check either).
 *
 * MEASURED under the full estate run (not visible in an isolated F-A8 battery): `order by
 * m.firm_id limit 2` with no further filter can pick up a THROWAWAY firm another test file
 * minted earlier in the same node --test process — random UUIDs sort arbitrarily against the
 * two real seed fixtures, and plenty of those throwaway firms carry an owner with no
 * bookkeeper at all. The `exists` clause below requires the candidate firm ALSO carry an
 * active bookkeeper, which is exactly what seedBookkeeper() below needs from it — this does
 * not change WHICH kind of firm is intended (Alara/Borneo), only makes the read reject a
 * same-shaped impostor instead of trusting firm_id order alone (spelling-is-not-identity).
 */
export async function seedOwners() {
  const r = await asRoot((c) => c.query(
    `select u.id as sub, m.firm_id from clara.users u
       join clara.firm_memberships m on m.user_id = u.id
      where m.role = 'owner' and m.status = 'active'
        and exists (
          select 1 from clara.firm_memberships bm
           where bm.firm_id = m.firm_id and bm.role = 'bookkeeper' and bm.status = 'active'
        )
      order by m.firm_id limit 2`,
  ));
  if (r.rowCount < 2) throw new Error("f-a8 tier1 fixture: fewer than two seeded owner+bookkeeper firms — the seed data has moved");
  return { primary: r.rows[0], other: r.rows[1] };
}

/** A bookkeeper (below owner rank) in the primary owner's own firm — for the CLR04 refusal cell. */
export async function seedBookkeeper(firmId) {
  const r = await asRoot((c) => c.query(
    `select u.id as sub from clara.users u
       join clara.firm_memberships m on m.user_id = u.id
      where m.firm_id = $1 and m.role = 'bookkeeper' and m.status = 'active' limit 1`,
    [firmId],
  ));
  return must(r.rows[0]?.sub, `no seeded bookkeeper in firm ${firmId}`);
}

/** Mint a fresh 'proactive' wake credential for `firmId` through the REAL minter. */
export async function mintProactive(firmId) {
  return asRoot(async (c) => {
    const r = await c.query("select credential_id, secret from clara.mint_wake_credential('proactive', $1::uuid)", [firmId]);
    return must(r.rows[0], `mint_wake_credential('proactive', ${firmId})`);
  });
}

/** Insert a throwaway tier1_endpoints row (as clara_fn_owner — the table has zero app grants). */
export async function makeEndpoint({ tableKey = "fx_rates", independenceClass, code = randomUUID().slice(0, 8), maxAge = "1 day", origin } = {}) {
  return asRoot(async (c) => {
    await c.query("set role clara_fn_owner");
    try {
      const r = await c.query(
        `insert into clara.tier1_endpoints(table_key, endpoint_code, canonical_origin, path_template, expected_mime, independence_class, max_age)
           values ($1,$2,$3,'/rates','text/html',$4,$5::interval) returning id`,
        [tableKey, code, origin ?? `https://${must(independenceClass, "independenceClass")}.example`, independenceClass, maxAge],
      );
      return must(r.rows[0]?.id, "makeEndpoint insert");
    } finally {
      await c.query("reset role");
    }
  });
}

/** Insert a web_attempts row with a runtime-minted id (the shape record_web_attempt_event would leave). */
export async function makeAttempt({ tier = 1, tableKey = "fx_rates", endpointId = null } = {}) {
  const id = randomUUID();
  await asRoot((c) => c.query(
    "insert into clara.web_attempts(id, tier, table_key, endpoint_id) values ($1,$2,$3,$4)",
    [id, tier, tableKey, endpointId],
  ));
  return id;
}

/**
 * Insert a fetch_artifacts row — the exact shape record_fetch_artifact would leave, built
 * directly since PR-1 grants that verb to clara_runtime only and PR-2's caller does not exist
 * yet. `text` is the artifact's canonical_text; `canonVerdict` defaults 'ok'.
 */
export async function makeArtifact({ attemptId, endpointId = null, url, text, canonVerdict = "ok", seed = randomUUID() } = {}) {
  const id = randomUUID();
  const sha256 = digest(must(seed, "seed"));
  await asRoot(async (c) => {
    await c.query("set role clara_fn_owner");
    try {
      await c.query(
        `insert into clara.fetch_artifacts(id, attempt_id, endpoint_id, requested_url, final_url, byte_size, sha256,
             storage_path, canonicalizer_version, canonical_text, canonical_sha256, canon_verdict,
             bytes_verified_at, bytes_verified_by)
           values ($1,$2,$3,$4,$4, greatest(length($5),1), $6, 'internet/'||$6, 1, $5, $7, $8, now(), 'fixture')`,
        [id, must(attemptId, "attemptId"), endpointId, must(url, "url"), must(text, "text"), sha256, digest(sha256 + ":canon"), canonVerdict],
      );
    } finally {
      await c.query("reset role");
    }
  });
  return { id, sha256 };
}

/** The character-offset locator of `needle` within `text` — the model's own output shape. */
export function locatorFor(text, needle) {
  const start = text.indexOf(needle);
  if (start < 0) throw new Error(`f-a8 tier1 fixture: text does not contain "${needle}"`);
  return { start, end: start + needle.length };
}

/** One end-to-end (endpoint, attempt, artifact) triple for a given rate/date pair. */
export async function makeSource({ code, independenceClass, tableKey = "fx_rates", date, rateText, url }) {
  // A fresh endpoint_code per call — tier1_endpoints carries a real UNIQUE(table_key,
  // endpoint_code); reusing a literal like "bnm" across many cells in the same run collides.
  const uniqueCode = `${code}-${randomUUID().slice(0, 8)}`;
  const endpointId = await makeEndpoint({ tableKey, independenceClass, code: uniqueCode });
  const attemptId = await makeAttempt({ tableKey, endpointId });
  const text = `USD/MYR mid rate as at ${date} is ${rateText} per the ${independenceClass} published page, and nothing else on this line carries a number.`;
  const artifact = await makeArtifact({ attemptId, endpointId, url: url ?? `https://${independenceClass}.example/rates`, text, seed: `${code}:${date}:${rateText}` });
  return { endpointId, attemptId, artifactId: artifact.id, sha256: artifact.sha256, text, locator: locatorFor(text, rateText) };
}

/** Two independent, agreeing sources for the same date/rate — the C.2a happy-path shape. */
export async function makeAgreeingPair({ date, rateText, tableKey = "fx_rates" } = {}) {
  const a = await makeSource({ code: "bnm", independenceClass: "bnm", tableKey, date, rateText });
  const b = await makeSource({ code: "xe", independenceClass: "xe", tableKey, date, rateText });
  return [a, b];
}

/** The `p_artifacts` jsonb array wake_submit_policy_draft expects, from makeSource() results. */
export function toArtifactArg(sources) {
  return sources.map((s) => ({ endpoint_id: s.endpointId, artifact_id: s.artifactId, locator: s.locator }));
}

/** Call wake_submit_policy_draft as the wake credential; returns the parsed jsonb result. */
export async function submitDraft({ secret, tableKey = "fx_rates", sources, rationale = "fixture rationale", model = { model: "fixture" }, opKey }) {
  return asWake(ROLES.wakeProactive, must(secret, "secret"), async (c) => {
    const r = await c.query(
      "select clara.wake_submit_policy_draft($1,$2::jsonb,$3::jsonb,$4,$5) as result",
      [tableKey, JSON.stringify(toArtifactArg(sources)), JSON.stringify(model), rationale, opKey ?? randomUUID()],
    );
    return must(r.rows[0]?.result, "wake_submit_policy_draft result");
  });
}

/** Read the live approval card sha256 for a draft — as clara_fn_owner (no human read surface in PR-1). */
export async function cardSha(draftId) {
  const r = await asRoot((c) => c.query(
    "select card_sha256 from clara.policy_approval_cards where draft_id = $1 order by minted_at desc limit 1",
    [draftId],
  ));
  return must(r.rows[0]?.card_sha256, `no approval card for draft ${draftId}`);
}

/** decide_policy_draft as a human actor (must hold owner rank in an active membership). */
export async function decide(sub, draftId, decision, note, revalidationArtifactId = null) {
  return asHuman(sub, async (c) => {
    const r = await c.query(
      "select clara.decide_policy_draft($1,$2,$3,$4,$5) as result",
      [draftId, decision, note, await cardSha(draftId), revalidationArtifactId],
    );
    return r.rows[0]?.result;
  });
}

/** override_policy_draft as a human owner actor. */
export async function override(sub, draftId, reason) {
  return asHuman(sub, async (c) => {
    const r = await c.query(
      "select clara.override_policy_draft($1,$2,$3) as result",
      [draftId, reason, await cardSha(draftId)],
    );
    return r.rows[0]?.result;
  });
}

/** A row from `clara.policy_drafts`, read as clara_fn_owner (no human read surface in PR-1). */
export async function readDraft(draftId) {
  const r = await asRoot((c) => c.query("select * from clara.policy_drafts where id = $1", [draftId]));
  return must(r.rows[0], `policy_drafts row ${draftId}`);
}

/** A row from `clara.fx_rates`, read as clara_fn_owner. */
export async function readFxRate(id) {
  const r = await asRoot((c) => c.query("select * from clara.fx_rates where id = $1", [id]));
  return must(r.rows[0], `fx_rates row ${id}`);
}
