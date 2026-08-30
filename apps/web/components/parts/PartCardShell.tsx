"use client";

// The shared shell every HYDRATED transcript card is built from (P6-2). Split
// out of the card modules themselves the way PartSummaryCard.tsx was split out
// of PartRenderer.tsx: five small pieces, reviewed once, instead of five copies
// drifting across four cards.
//
// WHY THESE FIVE AND NOT A "Card" COMPONENT. Each piece below is a decision that
// was got wrong somewhere in this estate before, and each is stated once so it
// cannot be got wrong differently in two cards:
//   `usableId`     — a persisted jsonb payload is NOT type-checked at the wire.
//   `MalformedPart`— a malformed part must be VISIBLE, never a silent null.
//   `HydrateState` — loading / no-such-row / read error / STICKY write refusal
//                    are four different states, and three of them are not "error".
//   `FactRows`     — a nullable column renders as ABSENT, never as "null".
//   `AgentProse`   — DB-stored model prose is rendered verbatim and LABELLED as
//                    the agent's words, so it reads as a claim, never a figure.
// The visual shell itself is still PartSummaryCard — these compose INTO it, so a
// hydrated card and an id-only summary card look like the same object.

import { useTranslations } from "next-intl";

import { Badge } from "./PartBadge";
import { StateBanner, EmptyState, LoadingState } from "@/components/common/state";
import type { PartHydrationState } from "@/lib/parts/hooks";

/** A wire field is USABLE only when it is a non-empty string. `typeof` rather
 *  than a truthiness check, and `.trim()` rather than `!== ""`: a persisted
 *  jsonb payload is not type-checked at the boundary, so a field can genuinely
 *  arrive as `null`, a number, or three spaces — and every one of those would
 *  interpolate into a PostgREST filter as a plausible-looking string. The
 *  union's `tsc` guards cannot catch this: they prove the TYPE is covered, not
 *  that a payload an older emitter persisted actually carries what the type
 *  promises. */
export function usableId(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/** The fail-closed render for a part whose own wire payload cannot address an
 *  object — the card renders THIS instead of hydrating.
 *
 *  REFUSING TO READ IS THE POINT, not the notice. `getRows`/`callDoor` build
 *  their filters by string interpolation, so a card that hydrated on a missing
 *  id would fire `id=eq.undefined` at the database and then render whatever came
 *  back as if it were the addressed row. Visible and named, so the failure is
 *  diagnosable from the screen; never a silent `null`, which would make a
 *  malformed part indistinguishable from one that rendered fine. */
export function MalformedPart({ kind, fields }: { kind: string; fields: string[] }) {
  const t = useTranslations("Clara.parts.common");
  return (
    <StateBanner tone="warning" code={kind}>
      {t("malformed", { fields: fields.join(", ") })}
    </StateBanner>
  );
}

/** The hydrate state, decided in ONE place for every card.
 *
 *  FOUR STATES, AND CONFLATING ANY TWO OF THEM IS A LIE:
 *   - a read error                  -> the error, with its CLR code verbatim
 *   - the loader has not resolved   -> loading
 *   - it resolved to no row         -> "not visible": the DB's honest answer
 *     that RLS admits no such row. NOT an error — the database raised none.
 *   - a row IS present and a WRITE still failed -> the sticky refusal
 *     (lib/parts/hooks.ts finding 1), rendered ABOVE the row rather than
 *     replacing it. The act failed; the object is still real, and hiding it
 *     would lose the very context the human needs to decide what to do next.
 *
 *  CALLER CONTRACT, AND IT IS LOAD-BEARING — every card's loader MUST resolve to
 *  an ENVELOPE (`{ row: T | null }`), never to `T | null` directly. This
 *  component tells "not resolved yet" from "resolved to nothing" by
 *  `state.data === null`, and `useHydratedPart` initialises `data` to `null`. A
 *  loader that itself resolves to `null` therefore makes the two states
 *  IDENTICAL, and the card sits on "Reading the latest…" forever for a row that
 *  RLS will never admit — a spinner that is really a permanent lie. Caught by
 *  v16-read-cards.test.tsx's own "not visible" cell before this shipped; the
 *  envelope is what makes the distinction exist at all, so it is a requirement
 *  on the loader rather than a convention.
 *
 *  Returns `null` when there is a row and nothing to report, so a card renders
 *  `<HydrateState/>` once and then its body, instead of re-deciding four cases. */
export function HydrateState({ state, hasRow }: { state: PartHydrationState<unknown>; hasRow: boolean }) {
  const t = useTranslations("Clara.parts.common");
  const code = state.clr ? `${state.clr.code}${state.clr.reason ? ` · ${state.clr.reason}` : ""}` : undefined;

  if (state.err) {
    return (
      <StateBanner tone="error" code={code}>
        {state.err}
      </StateBanner>
    );
  }
  if (hasRow) return null;
  return state.data === null ? <LoadingState>{t("loading")}</LoadingState> : <EmptyState>{t("notVisible")}</EmptyState>;
}

/** A labelled `<dl>` of DB-read facts, sharing PartSummaryCard's own row shape.
 *  An absent value drops the whole row — a nullable column renders as absent,
 *  never as the literal "null"/"undefined" (the v14 cards' own law, pinned by
 *  their tests). */
export function FactRows({ rows }: { rows: Array<[label: string, value: string | null | undefined]> }) {
  const present = rows.filter((r): r is [string, string] => r[1] != null && r[1] !== "");
  if (present.length === 0) return null;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
      {present.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="wrap-anywhere text-card-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The agent's own words, out of a typed `text` column, rendered VERBATIM and
 *  labelled as the agent's.
 *
 *  THIS IS THE DELIBERATE OTHER SIDE OF THE "never walk an open payload" line.
 *  An open `Record<string, unknown>` has no honest rendering; a `text` column
 *  the DB owns does, and the house already renders exactly these strings
 *  (CloseProposalPanel.tsx's narrative/rationale, firm-question-row.tsx's
 *  question_text, the refusal card's message). Hiding them would hide the
 *  reasoning a professional is meant to review. The LABEL is what keeps it
 *  honest: it says whose words these are, so prose reads as a claim rather than
 *  as a derived figure. */
export function AgentProse({ label, text }: { label: string; text: string | null | undefined }) {
  if (!text) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className="wrap-anywhere text-card-foreground">{text}</p>
    </div>
  );
}

/** One row of DB-owned string tokens as badges (failing rungs, relations read,
 *  drafted gate items). Deliberately renders the LIST and never a count: the
 *  tokens are what a professional checks, and a count would be a figure this UI
 *  derived rather than one the DB wrote. */
export function TokenList({ label, tokens, tone = "neutral" }: { label: string; tokens: string[]; tone?: "neutral" | "warning" | "info" }) {
  if (tokens.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <ul className="flex flex-wrap gap-1">
        {tokens.map((tok) => (
          <li key={tok}>
            <Badge tone={tone}>{tok}</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}
