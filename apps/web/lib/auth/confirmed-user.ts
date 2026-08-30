/**
 * Shared positive confirmation predicate for server-side auth decisions.
 *
 * This is extracted from P4-4's invite-mail implementation so the signup fork
 * and the invite directory read cannot grow two definitions of "confirmed".
 * Missing/null is the ordinary unconfirmed shape. A malformed present value is
 * unreadable and throws: callers must fail closed rather than silently derive
 * "unconfirmed" from a value they did not understand.
 */
export class UnreadableAuthUserError extends Error {
  constructor() {
    super("auth user confirmation state is unreadable");
    this.name = "UnreadableAuthUserError";
  }
}

export function isConfirmedUser(user: unknown): boolean {
  if (typeof user !== "object" || user === null) {
    throw new UnreadableAuthUserError();
  }

  const record = user as Record<string, unknown>;
  if (
    !Object.hasOwn(record, "email_confirmed_at") ||
    record.email_confirmed_at === null
  ) {
    return false;
  }

  if (typeof record.email_confirmed_at === "string") {
    const timestamp = record.email_confirmed_at;
    const shaped = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.exec(
      timestamp,
    );
    const parsed = Date.parse(timestamp);
    if (shaped !== null && Number.isFinite(parsed)) {
      // Date.parse normalises impossible calendar dates. Round-trip the date
      // component separately so values such as 2026-02-30 cannot pass.
      const datePart = shaped[1] as string;
      const calendar = Date.parse(`${datePart}T00:00:00Z`);
      const [year, month, day] = datePart.split("-").map(Number);
      const roundTrip = new Date(calendar);
      if (
        Number.isFinite(calendar) &&
        roundTrip.getUTCFullYear() === year &&
        roundTrip.getUTCMonth() + 1 === month &&
        roundTrip.getUTCDate() === day
      ) {
        return true;
      }
    }
  }

  throw new UnreadableAuthUserError();
}
