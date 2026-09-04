import { useTranslations } from "next-intl";

import type { ClaraPart } from "../../lib/parts/types";
import { isStatusResolverType } from "../../lib/parts/catalog";
import { toolStatusTone, type ToolCallStatus } from "../../lib/parts/toolStatus";
import { Badge } from "./PartBadge";
import { StateBanner } from "../common/state";
import { PartSummaryCard, type SummaryRow } from "./PartSummaryCard";
import { BankActCard, BankPackCard, EntryPostedCard, QuestionOpenedCard } from "./V14ReceiptCards";
import { AgentReceiptCard, FreeformResultCard } from "./V16Cards";
import { CloseProposalCard, FirmQuestionCard } from "./V16ActCards";
import { SweepReceiptCard } from "./SweepReceiptCard";
import { ClarifyCard } from "./ClarifyCard";
import type { SessionTokenAccessor } from "@/lib/session";

// The fail-closed part renderer (contract §3.1 / frontend-handoff-2026-08-23 §3.1,
// apps/dashboard/app/chat/parts.tsx's TranscriptParts precedent). MECHANISM ported,
// not the look: every one of the catalog's 26 live types renders SOMETHING visible
// (or the declared-nothing resolver case); an unrecognised kind renders the visible
// fallback chip below, never nothing — text-to-hydration, never text-to-code.
//
// This module ships the mechanism plus honest basic rendering: text/clarify/
// refusal/attachment render their own real content; a rich card gets a delegating
// branch and lives in its own file; every remaining identifier-only receipt-shaped
// type gets a labeled summary card of its ids (PartSummaryCard.tsx) — never a
// fabricated figure, never a fabricated status.

/** Mirrors apps/dashboard/app/chat/parts.tsx's FALLBACK_UNSUPPORTED_PREFIX
 *  byte-for-byte. The parity test (../../lib/parts/catalog.test.tsx) asserts every
 *  registered render type never reaches this. */
export const FALLBACK_UNSUPPORTED_PREFIX = "Unsupported part: ";

// ONE source of truth (fix-round finding 6): SummaryPartType is DERIVED from the
// array, not hand-duplicated alongside it — the two could otherwise drift (a type
// listing a member the array omits, or vice versa) with nothing to catch it.
//
// NINE, NOT TEN, SINCE P6-2 (裁-20): `sweep_receipt` left this bucket for a rich
// hydrated card of its own (./SweepReceiptCard.tsx). It is the only member that
// has ever left; the other nine still have no per-type read wired.
const SUMMARY_TYPES = [
  "je_review", "doc_review", "diff", "open_question",
  "bank_recon_receipt", "fixed_asset", "depreciation_run_receipt",
  "adjustment_run_receipt", "staff_advance",
] as const;

type SummaryPartType = (typeof SUMMARY_TYPES)[number];

function isSummaryPart(t: ClaraPart["type"]): t is SummaryPartType {
  return (SUMMARY_TYPES as readonly string[]).includes(t);
}

/** The narrow slice of next-intl's translator this module needs. Declared rather
 *  than imported because `summaryOf` is a plain function, not a component: it
 *  cannot call `useTranslations` itself, so the hook is called ONCE in
 *  `PartRenderer` and the translator passed down. */
type Translate = (key: string) => string;

/** Every identifier-only receipt-shaped part's {title, rows, note} — one function,
 *  one exhaustive switch, so a 9-branch JSX repetition doesn't have to exist.
 *
 *  裁-3 TIER (a), PAID HERE (P6-2). Until this change every title and every row
 *  label below was a hardcoded English string literal, and this file's own
 *  comment admitted it: "the ten summary titles above are still hardcoded
 *  English, an older debt this change does not silently widen and does not
 *  pretend to have paid." It violated the next-intl house law
 *  (apps/web/AGENTS.md, "every string routes through next-intl") and it is what
 *  would have redded the Q5 hardcoded-string lint the day that lint landed.
 *  裁-3's fixed-as-found tier says a debt already inside a file you are editing
 *  is paid now, not deferred — so all of it routes through `Clara.parts.summary`,
 *  the same namespace root the new cards use, and the next lane inherits no
 *  merge conflict for it.
 *
 *  WHAT IS DELIBERATELY *NOT* TRANSLATED: `part.provenance_tier` is a DB-owned
 *  verdict token ("verified"/"model_read") and `part.uncertainty.note` is the
 *  agent's own recorded text. Both render VERBATIM — translating a value the
 *  database owns would be re-wording a receipt. Only the labels around them are
 *  this app's words. */
function summaryOf(
  part: Extract<ClaraPart, { type: SummaryPartType }>,
  t: Translate,
): { title: string; rows: SummaryRow[]; note?: string | null; link?: { href: string; label: string } | null } {
  switch (part.type) {
    case "je_review":
      // C6 — THE ONE UPGRADE THIS BRANCH CAN HONESTLY TAKE TODAY: a way out of the
      // thread. The card is ids-only by contract (PartSummaryCard renders no figure),
      // so a human reading "a journal entry was drafted" had the entry id and no route
      // to a single line or amount. The link is the SAME destination and the SAME
      // "no client, no link" guard `EntryPostedCard` already uses (./V14ReceiptCards.tsx):
      // the emitter can construct a part before `client_id` is filled, and
      // `/clients//journals` is a 404 dressed as an affordance.
      //
      // WHAT IS DELIBERATELY NOT BUILT HERE — a HYDRATED je_review card. Its own type
      // says it should "re-derive authoritative state via get_draft_review on hydrate"
      // (../../lib/parts/types.ts), and there is no such reader: `get_draft_review` has
      // ZERO implementations in apps/web, only three comments naming it. What DOES
      // exist is client-wide and bounded — `listJournalEntries` / `listJournalLines`
      // fetch every entry and every line for a client under `FETCH_CAP`, and that
      // module's own header warns a truncation "can drop lines from ANY entry", so a
      // card built on it could show a PARTIAL entry as if it were whole. And the
      // obvious content — debits, credits, a total — would be a figure this UI summed,
      // which hard constraint 2 forbids outright. A read-only link to the workbench
      // that holds the live read is the honest ceiling until a per-entry reader exists.
      return {
        title: t("jeReview"),
        rows: [[t("entry"), part.entry_id], [t("document"), part.document_id], [t("client"), part.client_id], [t("provenance"), part.provenance_tier]],
        note: part.exception ? t("amountException") : part.uncertainty?.note,
        link: part.client_id
          ? { href: `/clients/${encodeURIComponent(part.client_id)}/journals`, label: t("jeReviewLink") }
          : null,
      };
    case "doc_review":
      return { title: t("docReview"), rows: [[t("document"), part.document_id], [t("entry"), part.entry_id], [t("client"), part.client_id]] };
    case "diff":
      return { title: t("diff"), rows: [[t("entry"), part.entry_id], [t("client"), part.client_id]] };
    case "open_question":
      return { title: t("openQuestion"), rows: [[t("question"), part.question_id], [t("client"), part.client_id]] };
    case "bank_recon_receipt":
      return { title: t("bankReconReceipt"), rows: [[t("statement"), part.statement_id], [t("client"), part.client_id]] };
    case "fixed_asset":
      return { title: t("fixedAsset"), rows: [[t("asset"), part.asset_id], [t("client"), part.client_id], [t("label"), part.label]] };
    case "depreciation_run_receipt":
      return { title: t("depreciationRunReceipt"), rows: [[t("run"), part.run_id], [t("client"), part.client_id], [t("label"), part.label]] };
    case "adjustment_run_receipt":
      return { title: t("adjustmentRunReceipt"), rows: [[t("run"), part.run_id], [t("client"), part.client_id], [t("label"), part.label]] };
    case "staff_advance":
      return { title: t("staffAdvance"), rows: [[t("advance"), part.advance_id], [t("client"), part.client_id], [t("label"), part.label]] };
  }
}

export function PartRenderer({
  part,
  taskId,
  session,
  clarifyAnswerable = false,
  toolStatus,
}: {
  part: ClaraPart;
  /** The task that emitted this part (`MessageRow.task_id`, or the live stream's
   *  `activeTaskId`) — the only firm-visible identity joining a rendered clarify to its
   *  `agent_interruptions` row. */
  taskId?: string | null;
  session?: SessionTokenAccessor | null;
  /** C6 — a `tool_call`'s resolved outcome, composed by the caller from THIS
   *  message's sibling `tool_result`/`tool_error` parts (`ClaraMessageBubble` +
   *  `lib/parts/toolStatus.ts`). Undefined means no caller composed one; the chip
   *  then renders the bare tool name exactly as before, never a guessed status. */
  toolStatus?: ToolCallStatus;
  /** Set by ClaraThreadView for the LAST clarify part of the LIVE stream fold, and
   *  nothing else — see ClarifyCard's own header for why every other clarify is
   *  read-only rather than merely un-styled. */
  clarifyAnswerable?: boolean;
}) {
  // Called unconditionally, before any branch: a hook cannot sit behind an early
  // return. The nine summary branches are its only consumer — every rich card
  // below calls `useTranslations` in its own component, under its own namespace.
  const tSummary = useTranslations("Clara.parts.summary");
  const tAttachment = useTranslations("Clara.parts.attachment");
  const tClarify = useTranslations("Clara.parts.clarify");
  const tToolCall = useTranslations("Clara.parts.toolCall");

  if (part.type === "text") {
    return part.text.trim() ? <p className="max-w-prose text-sm text-foreground">{part.text}</p> : null;
  }

  if (part.type === "attachment") {
    // Real rendering (not the generic receipt-summary shape): mirrors
    // apps/dashboard/app/chat/parts.tsx's attachment chip — icon + ids. No filename
    // enrichment (that lookup is chat-page wiring, a later lane's job); honest
    // ids-only is still a real, non-generic render.
    return (
      <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3 text-sm">
        <div className="flex items-center gap-2">
          <span aria-hidden>📎</span>
          <span className="font-medium text-card-foreground">{tAttachment("title")}</span>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">{tAttachment("documentLabel")}</dt>
          <dd className="truncate text-card-foreground">{part.document_id}</dd>
          <dt className="text-muted-foreground">{tAttachment("intakeLabel")}</dt>
          <dd className="truncate text-card-foreground">{part.intake_id}</dd>
        </dl>
      </div>
    );
  }

  if (part.type === "tool_call") {
    // C6 — THE CHIP NOW CARRIES ITS OUTCOME, and it still never invents one. This
    // renderer is handed ONE part and cannot see siblings, which is why its previous
    // body called the resolution "a later lane's wiring"; the composition moved up to
    // `ClaraMessageBubble`, the only altitude that holds the sibling set, and arrives
    // here as `toolStatus`. Absent (no caller composed one, or the transcript records
    // no outcome) it falls back to exactly the old bare name chip.
    //
    // WHAT THIS FIXES CONCRETELY: `tool_result` and `tool_error` render `null` (they
    // are the catalog's two STATUS_RESOLVER_TYPES), so a tool that FAILED and a tool
    // that SUCCEEDED were the same grey chip — and fourteen of chatTurn_v17's tools
    // have no promotion arm at all, so that chip plus the model's prose was their
    // entire visible output.
    return (
      <Badge tone={toolStatus ? toolStatusTone(toolStatus) : "neutral"}>
        <span>{part.tool}</span>
        {toolStatus ? (
          // The tool NAME is the DB/runtime's own token and stays verbatim; the
          // OUTCOME word is this app's copy and routes through next-intl.
          // The separator is an EXPLICIT string, not the Badge's flex `gap-1`: the gap
          // is a visual space only, so without this the accessible text ran the two
          // together as "trial_balance· done". Same `·` idiom the refusal banner uses
          // for code · reason.
          <span className="font-normal">{" · "}{tToolCall(`status.${toolStatus}`)}</span>
        ) : null}
      </Badge>
    );
  }

  if (part.type === "clarify") {
    return <ClarifyCard part={part} taskId={taskId} session={session} answerable={clarifyAnswerable} />;
  }

  if (part.type === "clarify_closed") {
    return (
      <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3 text-sm">
        <Badge tone="info">{tClarify("firmVisible")}</Badge>
        <p className="text-card-foreground">
          {tClarify("closedPart", { status: part.reason, framing: part.framing })}
        </p>
      </div>
    );
  }

  if (part.type === "refusal") {
    // The deliberate no-hydrate exception (contract §3.2): a governed refusal
    // renders its code + message VERBATIM — there is no draft left to hydrate, and
    // the copy is never re-worded (apps/dashboard/app/chat/parts.tsx:209-218).
    //
    // P3 polish: the SHELL is now the shared <StateBanner> every governed
    // refusal in the workbench uses, so a refusal Clara reports in the rail and
    // the same refusal reported by a door on the Bank tab look identical. Only
    // the shell moved — the code/reason/message are still the DB's own bytes.
    return (
      <StateBanner
        tone="error"
        code={
          <>
            {part.code}
            {part.reason ? ` · ${part.reason}` : ""}
          </>
        }
      >
        {part.message}
      </StateBanner>
    );
  }

  if (isSummaryPart(part.type)) {
    const { title, rows, note, link } = summaryOf(part as Extract<ClaraPart, { type: SummaryPartType }>, tSummary);
    return <PartSummaryCard title={title} rows={rows} note={note} link={link} />;
  }

  // The four chatTurn_v14 receipt kinds (MBB-4). Each has a REAL card of its own in
  // ./V14ReceiptCards.tsx rather than a row in SUMMARY_TYPES above, because each
  // carries content the generic ids-only shape cannot show: the receipt vector, the
  // question's own text, the governed verb, the grounding digest. They render what
  // the wire carries and stop — no read function is keyed on a post receipt, an
  // op_key or a pack digest, so there is nothing to hydrate them from.
  if (part.type === "entry_posted") return <EntryPostedCard part={part} />;
  if (part.type === "question_opened") return <QuestionOpenedCard part={part} />;
  if (part.type === "bank_act") return <BankActCard part={part} />;
  if (part.type === "bank_pack") return <BankPackCard part={part} />;

  // The four chatTurn_v16 kinds (P6-2, ruling Q8), plus 裁-20's sweep upgrade.
  // Unlike the v14 four, every one of these names a LIVE read, so each is a
  // HYDRATED card: identifiers on the wire, authoritative state re-derived from
  // the DB on mount and after every act. Split across two files by whether the
  // kind carries a governed act door — see ./V16Cards.tsx's header for why that
  // is the reviewability seam and for the three rules all five hold to.
  if (part.type === "agent_receipt") return <AgentReceiptCard part={part} />;
  if (part.type === "freeform_result") return <FreeformResultCard part={part} />;
  if (part.type === "firm_question") return <FirmQuestionCard part={part} />;
  if (part.type === "close_proposal") return <CloseProposalCard part={part} />;
  // 裁-20: needed NO wire change — `sweep_receipt` has been on the live union
  // since the port and simply rendered through SUMMARY_TYPES until now.
  if (part.type === "sweep_receipt") return <SweepReceiptCard part={part} />;

  // RESERVED, AND DELIBERATELY NOT A BRANCH — the tax-draft card (裁-44). Its
  // part shape belongs to the `ft3-taxprep-design` lane, alongside the
  // `tax_prep` wake body, its needs-you card and its allowlist rows; 裁-62 rules
  // the tax module INERT at beta (every treatment refuses
  // `treatment_code_unsigned`, so Clara cannot draft a computation at all) and
  // 裁-70 puts the client-page "Tax" tab in P6-T. A card for a part nothing
  // emits is the same defect as a control for a door that does not exist, so
  // nothing ships here — and inventing its fields to get ahead would break the
  // reader-is-never-the-declarer law twice over, the declarer being another
  // lane's design AND another package's code.

  // tool_result / tool_error resolve their call's chip — render nothing (the one
  // place this is declared is the catalog's STATUS_RESOLVER_TYPES).
  if (isStatusResolverType(part.type)) return null;

  // Explicit fallback: an unknown/unsupported part type is made VISIBLE, never
  // silently dropped. The catalog's AllCovered/NoExtra guard keeps this branch
  // unreachable for any type in the live ClaraPart union at compile time; it exists
  // for a wire payload that does not typecheck against that union at all (a stale
  // client, a future server, or malformed data).
  const unknown = part as { type?: unknown };
  return (
    <Badge tone="warning">
      {FALLBACK_UNSUPPORTED_PREFIX}
      {typeof unknown.type === "string" ? unknown.type : "?"}
    </Badge>
  );
}
