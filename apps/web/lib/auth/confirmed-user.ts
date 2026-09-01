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
    const shaped = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(
      timestamp,
    );
    const parsed = Date.parse(timestamp);
    if (shaped !== null && Number.isFinite(parsed)) {
      const [, yearText, monthText, dayText, hourText, minuteText, secondText,
        offsetHourText, offsetMinuteText] = shaped;
      const hour = Number(hourText);
      const minute = Number(minuteText);
      const second = Number(secondText);
      const offsetHour = offsetHourText === undefined ? 0 : Number(offsetHourText);
      const offsetMinute = offsetMinuteText === undefined ? 0 : Number(offsetMinuteText);
      if (
        hour > 23 || minute > 59 || second > 59 ||
        offsetHour > 23 || offsetMinute > 59
      ) {
        throw new UnreadableAuthUserError();
      }

      // Date.parse normalises impossible calendar dates and `24:00` into a
      // different instant. The explicit clock bounds above reject the latter;
      // round-trip the date separately so values such as 2026-02-30 cannot pass.
      const datePart = `${yearText}-${monthText}-${dayText}`;
      const calendar = Date.parse(`${datePart}T00:00:00Z`);
      const year = Number(yearText);
      const month = Number(monthText);
      const day = Number(dayText);
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
