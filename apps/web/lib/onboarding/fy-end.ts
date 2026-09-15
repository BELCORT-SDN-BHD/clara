// #649 AC2 / owner ruling D7 — the client's financial-year end, as a MONTH and a DAY.
//
// WHY THE DAY IS ASKED. `clara.clients` carries `fy_end_month` and `fy_end_day` under a CHECK that
// admits only both-NULL or both-set (`ck_clients_fy_end`, 0041:778), and the interview asks a
// MONTH and nothing else. The owner ruled (D7, 2026-09-15) that the missing half is ASKED rather
// than derived: last-day-of-month is a plausible guess and a guess on a professional's record is
// an invented accounting fact. So month-end is offered as a SUGGESTION the human clicks, and this
// module's `monthEndDay` exists to compute that suggestion — never to apply it.
//
// THIS MODULE IS FORM SHAPING, NOT A WALL. `clara.settle_client_onboarding_facts` and the
// `clara.set_client_fy_end` it calls are the wall: a NULL day is CLR10 `fy_end_day_required`, an
// impossible calendar day is CLR37, a month contradicting the plan's own answer is CLR10
// `fy_end_month_contradicts_plan`, and a live ANNUAL cadence is CLR38. Everything below only stops
// the form offering a round trip that is certain to be refused; nothing below is trusted by the
// database, and every refusal above is rendered verbatim when it arrives anyway.
//
// FEBRUARY SUGGESTS 28. The CHECK admits 29 (a leap-year year end is a real thing), so 29 is
// accepted if a human types it — the SUGGESTION is the ordinary case, and a suggestion that
// offered 29 every year would be the derivation D7 rejected, wearing a different hat.

/** The months, 1-12, in order — for the form's own list. */
export const FY_END_MONTHS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/** Day counts mirroring `ck_clients_fy_end`'s own arms: 30 for Apr/Jun/Sep/Nov, 29 for February
 *  (the CHECK's ceiling), 31 otherwise. */
export function maxDayForMonth(month: number): number {
  if (!Number.isInteger(month) || month < 1 || month > 12) return 31;
  if (month === 2) return 29;
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
}

/** The month-end day a human may CHOOSE with one click. February answers 28, not 29 — see the
 *  header. Returns `null` for a month outside 1-12, so a face never offers a suggestion it
 *  computed from nonsense. */
export function monthEndDay(month: number): number | null {
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (month === 2) return 28;
  return maxDayForMonth(month);
}

export type FyEndDraft = { month: string; day: string };
export type FyEndProblem =
  | { field: "month"; reason: "required" | "not_a_month" }
  | { field: "day"; reason: "required" | "not_a_day" | "not_in_month" };

export type FyEndValidation =
  | { ok: true; month: number; day: number }
  | { ok: false; problems: FyEndProblem[] };

const asInt = (raw: string): number | null => {
  const s = raw.trim();
  if (!/^\d{1,2}$/.test(s)) return null;
  const n = Number(s);
  return Number.isInteger(n) ? n : null;
};

/** Validate what the human typed. Returns EVERY problem, not the first: a form that reveals one
 *  error at a time makes a person submit twice to learn what it wanted.
 *
 *  `month` may be blank when the plan already answered it — the settle door then takes the plan's
 *  own answer — so the caller passes `monthOptional` in exactly that case and nowhere else. */
export function validateFyEnd(draft: FyEndDraft, { monthOptional = false } = {}): FyEndValidation {
  const problems: FyEndProblem[] = [];
  const monthRaw = draft.month.trim();
  const dayRaw = draft.day.trim();

  let month: number | null = null;
  if (monthRaw === "") {
    if (!monthOptional) problems.push({ field: "month", reason: "required" });
  } else {
    month = asInt(monthRaw);
    if (month === null || month < 1 || month > 12) {
      problems.push({ field: "month", reason: "not_a_month" });
      month = null;
    }
  }

  let day: number | null = null;
  if (dayRaw === "") {
    // THE DAY IS NEVER OPTIONAL (D7). There is no `dayOptional` and there must not be one.
    problems.push({ field: "day", reason: "required" });
  } else {
    day = asInt(dayRaw);
    if (day === null || day < 1 || day > 31) {
      problems.push({ field: "day", reason: "not_a_day" });
      day = null;
    } else if (month !== null && day > maxDayForMonth(month)) {
      problems.push({ field: "day", reason: "not_in_month" });
    }
  }

  if (problems.length > 0) return { ok: false, problems };
  // `month` is null here only when it was legitimately omitted; the settle door supplies the
  // plan's own answer in that case and this module names it with -1 to nobody — the caller sends
  // `null`, which is what the door's own `p_fy_end_month IS NULL` arm reads.
  return { ok: true, month: month ?? Number.NaN, day: day as number };
}

/** The value to send as `p_fy_end_month`: the typed number, or `null` when the human left it to
 *  the plan's own answer. Never a derived or remembered value. */
export function fyEndMonthParam(draft: FyEndDraft): number | null {
  const n = asInt(draft.month);
  return n !== null && n >= 1 && n <= 12 ? n : null;
}
