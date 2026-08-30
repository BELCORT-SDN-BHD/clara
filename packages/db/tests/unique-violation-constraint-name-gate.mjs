// Readiness decision for the unique_violation constraint-name battery. NOT a test file.
//
// The only state that authorizes a pre-integration skip is a POSITIVE identity read of the
// exact body that UNNUMBERED_unique_violation_constraint_name.sql was authored to replace.
// Every other body executes the behavioural assertions, including an unknown future body.

export const UNIQUE_VIOLATION_CONSTRAINT_NAME_MIGRATION =
  "packages/db/migrations/UNNUMBERED_unique_violation_constraint_name.sql";
export const PROPOSE_VENDOR_IDENTITY_BINDING_SIG =
  "clara.propose_vendor_identity_binding(jsonb,text)";
export const KNOWN_OLD_PROSRC_SHA =
  "fe14f23984e00178e1dc084caf3224cfe4cb5b62fe080301b95e2fc4b671dc82";
export const KNOWN_NEW_PROSRC_SHA =
  "8c4000de1e85553ca833204eb9f552b098ef57839a461240c3af3e08e649713f";

/**
 * @param {(sql: string, params?: unknown[]) => Promise<{rows: Array<Record<string, unknown>>}>} query
 * @param {string | undefined} preload
 */
export async function readUniqueViolationConstraintNameGate(query, preload) {
  const catalog = await query(
    `select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as prosrc_sha,
            exists (select 1 from clara.schema_migrations where version ~ '^0028_') as has_0028
       from pg_proc p
      where p.oid = 'clara.propose_vendor_identity_binding(jsonb,text)'::regprocedure`,
  );
  const prosrcSha = catalog.rows[0]?.prosrc_sha ?? null;
  const has28 = catalog.rows[0]?.has_0028 === true;
  const oldBody = prosrcSha === KNOWN_OLD_PROSRC_SHA;
  const preintegration = preload === "1";
  const reason =
    `known old ${PROPOSE_VENDOR_IDENTITY_BINDING_SIG} body is still live ` +
    `(prosrc sha256 ${KNOWN_OLD_PROSRC_SHA}); ${UNIQUE_VIOLATION_CONSTRAINT_NAME_MIGRATION} ` +
    "has not replaced it yet";

  return {
    action: oldBody ? (preintegration ? "skip" : "fail") : "execute",
    reason,
    prosrcSha,
    has28,
  };
}
