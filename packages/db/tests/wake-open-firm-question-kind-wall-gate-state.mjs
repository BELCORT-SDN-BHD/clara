export const WAKE_OPEN_FIRM_QUESTION_PREIMAGE_SHA =
  "3d6c6d8ada9ac43f326cb8ffb14da41e2dae77a1d8e1600564fe014ba331cf46";
export const WAKE_OPEN_FIRM_QUESTION_POSTIMAGE_SHA =
  "779ac164ae985e39ad0c8457be2e8b1768fb306888ed0bdec336924765078635";
export const WAKE_OPEN_FIRM_QUESTION_KIND_WALL_FILE =
  "packages/db/migrations/UNNUMBERED_wake_open_firm_question_kind_wall.sql";

/**
 * Read the exact live body identity used by the migration's own pre-image pin.
 *
 * Only a positive read of the known old SHA may produce the authoring-state outcome. Every
 * other body, including an unknown future body, executes the behavioural cells so their own
 * assertions decide. The preload is merely the second arm; it is never evidence by itself.
 */
export async function readWakeOpenFirmQuestionKindWallState(
  query,
  allowMissing = process.env.CLARA_ALLOW_MISSING_WAKE_OPEN_FIRM_QUESTION_KIND_WALL,
) {
  const catalog = await query(
    `select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as body_sha
       from pg_proc p
      where p.oid = 'clara.wake_open_firm_question(uuid,text,text,jsonb,text,jsonb,text)'::regprocedure`,
  );
  const bodySha = catalog.rows[0]?.body_sha;
  if (!bodySha) {
    throw new Error(
      "wake-open-firm-question-kind-wall premise unreadable: the exact " +
        "clara.wake_open_firm_question(uuid,text,text,jsonb,text,jsonb,text) body did not resolve",
    );
  }

  const oldBody = bodySha === WAKE_OPEN_FIRM_QUESTION_PREIMAGE_SHA;
  const skipReason = oldBody
    ? `exact known pre-image ${WAKE_OPEN_FIRM_QUESTION_PREIMAGE_SHA} is live because ${WAKE_OPEN_FIRM_QUESTION_KIND_WALL_FILE} is still UNNUMBERED`
    : null;

  if (oldBody && allowMissing !== "1") {
    throw new Error(
      `${skipReason}. Focused/post-migration runs fail loudly; only the explicit package-wide preintegration sweep may admit this authoring state.`,
    );
  }

  return { bodySha, oldBody, skipReason };
}
