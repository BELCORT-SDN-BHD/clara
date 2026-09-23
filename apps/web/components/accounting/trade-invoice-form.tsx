"use client";

// C1/C3/C6 — THE DIRECT ACCOUNTING ENTRY POINT for a trade invoice (#655): a client sales invoice
// or a supplier bill, and the signed AR/AP open item it births.
//
// IT IS A SIBLING of `staff-expense-claim-form.tsx`, NOT A WIDENING OF IT, and the difference is
// what the door takes. That form sends a CLAIM and the door derives the entry; this one sends the
// INVOICE **and** its journal, because which expense account a supplier bill debits is a coding
// judgement no derivation can make. So the two share their mechanism (the draft and its intent
// identity, the lost-response arm, the refusal-to-control mapping) and differ in exactly that — and
// the basis grid here is the SHIPPED `JournalBasisFields`, editable, rather than a disabled preview.
//
// THE FOUR THINGS THIS COMPONENT OWNS, each a rule from the refresh spec's shared control contract
// rather than a preference:
//
//   THE DRAFT AND ITS INTENT IDENTITY. `intentKey` is minted once, when the draft starts, and
//   travels with the draft in `sessionStorage` under user+firm+client — so a lost acknowledgement
//   resolves to the Work already admitted rather than admitting a second one, and a scope switch
//   cannot carry a draft into another client's books. The mechanism is `lib/work/journal-draft.ts`'s,
//   reused rather than re-derived; only the storage key differs.
//
//   THE LOST-RESPONSE ARM. A network failure is an UNKNOWN, not an error, and this form resolves it
//   by re-POSTing the same intent key exactly once. The second answer is authoritative: a
//   `replayed:true` 202 means the first attempt DID land.
//
//   A BUSINESS REFUSAL IS NEVER A TOAST. Every refusal renders as a `StateBanner` in the form,
//   carrying the runtime's own words AND ITS CODE, with the one next action that actually exists.
//
//   THE PARTY IS PICKED, NEVER CREATED. D12(a): an ambiguous counterparty is refused AT ADMISSION
//   with the candidate list carried verbatim, and this form renders those candidates INLINE as a
//   choice — never as a toast, never as a dialog. 2026-09-15 D11 stands: this lane CONSUMES 0215's
//   identity provenance and writes no alias, so a name nobody answers to is a refusal with a link
//   to the parties register, not a silent creation.
//
// THE DUE DATE IS NOT COMPUTED HERE (D12c). The form carries what the document STATES. The door
// derives `stated → counterparty_terms → absent` — only it holds the party's agreed terms — and the
// 202 hands the derived basis back, which is what the success banner renders.
//
// NO COMBOBOX, NO POPOVER, NO DIALOG. Both primitives are uninstalled (appendix D #18, #43) and
// this form does not need them: the party picker is a text filter over the counterparty reads the
// registers already use, rendered as a plain list. Nothing here installs a primitive.

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { JournalBasisFields, type FieldNode } from "@/components/accounting/journal-basis-fields";
import { useFirmScope } from "@/components/firm-scope-provider";
import { StateBanner } from "@/components/common/state";
import { MoneyInput } from "@/components/common/money-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { listCoaAccounts } from "@/lib/journals/api";
import { loadCounterparties, type CounterpartyRow } from "@/lib/registers/counterparty";
import {
  canOpenClientLeaf,
  counterpartyIdentityHref,
  workDetailHref,
  type NavigationScope,
} from "@/lib/navigation/tree";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import {
  probeTradeInvoiceDuplicates,
  submitTradeInvoiceWork,
  type SubmitTradeInvoiceWorkResult,
  type TradeInvoiceDuplicateMatch,
} from "@/lib/work/api";
import { formatCents } from "@/lib/bank/money";
import {
  defaultDraftStorage,
  newIntentKey,
  type DraftStorage,
  type JournalDraftScope,
} from "@/lib/work/journal-draft";
import {
  REFERENCE_MAX_CHARS,
  TRADE_INVOICE_KINDS,
  controlAccountClassFor,
  counterpartyKindFor,
  domainFor,
  emptyTradeInvoiceDraft,
  fieldForServerPath,
  firstInvalidTradeInvoiceField,
  toTradeInvoiceWire,
  validateTradeInvoiceDraft,
  type TradeInvoiceDraft,
  type TradeInvoiceFieldId,
  type TradeInvoiceIssue,
  type TradeInvoiceKind,
} from "@/lib/work/trade-invoice";
import {
  clearTradeInvoiceDraft,
  readTradeInvoiceDraft,
  writeTradeInvoiceDraft,
} from "@/lib/work/trade-invoice-draft";
import type { CoaAccountRow } from "@/lib/journals/types";
import type { SessionTokenAccessor } from "@/lib/session";

/** The DOM id of one trade-invoice control. A separate namespace from the basis grid's
 *  (`journal-basis-…`) and from the claim form's, so no two vocabularies collide on one page. */
export function tradeInvoiceFieldId(field: string): string {
  return `trade-invoice-${field.replace(/\./g, "-")}`;
}

/** One candidate the door handed back with `party_ambiguous`, carried VERBATIM (D12a). */
type PartyCandidate = {
  counterparty_id?: unknown;
  name?: unknown;
  registration_no?: unknown;
  tin?: unknown;
};

type Outcome =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "checking" }
  /** #1007 · the person has been WARNED and has not chosen yet. NOTHING is admitted in this
   *  state: it exists precisely so that the recording waits for a human decision. */
  | { kind: "warned"; matches: TradeInvoiceDuplicateMatch[] }
  | { kind: "accepted"; workId: string; invoiceId: string | null; dueDate: string | null; dueDateSource: string | null }
  | { kind: "refused"; reason: string; field: TradeInvoiceFieldId | null; candidates: PartyCandidate[] }
  | { kind: "conflict"; workId: string | null }
  | { kind: "sourceConflict"; entryId: string | null }
  | { kind: "denied" }
  | { kind: "notFound" }
  | { kind: "unavailable"; message: string };

export function TradeInvoiceForm({ clientId }: { clientId: string }) {
  const router = useRouter();
  return (
    <TradeInvoiceFormView
      clientId={clientId}
      scope={useFirmScope()}
      navigate={(href) => router.push(href)}
    />
  );
}

/** Exported for the unit, a11y and keyboard harnesses; production gets scope from context and the
 *  session accessor and storage from their defaults. */
export function TradeInvoiceFormView({
  clientId,
  scope,
  navigate,
  session = sessionTokenAccessor,
  storage = defaultDraftStorage(),
  submit = submitTradeInvoiceWork,
  probe = probeTradeInvoiceDuplicates,
  loadAccounts,
  loadParties,
}: {
  clientId: string;
  scope: NavigationScope & { firm_id?: string; user_id?: string };
  navigate: (href: string) => void;
  session?: SessionTokenAccessor;
  storage?: DraftStorage | null;
  /** The ONE write this form makes, open as a seam for the reason the composer's is: a cell must be
   *  able to drive the DECISION — accepted, refused, conflicted, lost — without a socket. */
  submit?: typeof submitTradeInvoiceWork;
  /** #1007 · the ADVISORY read that runs before the write, open as a seam for the same reason the
   *  write is: a cell must be able to drive "this client already has one that looks like it"
   *  without a socket. It never refuses anything — see `onSubmit`. */
  probe?: typeof probeTradeInvoiceDuplicates;
  /** The two reads, INDEPENDENTLY injectable, because they degrade independently: the chart read
   *  failing and the party read failing are different states with different next actions, and a
   *  cell must be able to produce either one alone. */
  loadAccounts?: () => Promise<CoaAccountRow[]>;
  loadParties?: (kind: "vendor" | "customer") => Promise<CounterpartyRow[]>;
}) {
  const t = useTranslations("TradeInvoice");
  const canRecord = canOpenClientLeaf(scope, "tradeInvoice");

  // A draft filed under a GUESSED scope is worse than a draft that was never saved
  // (lib/work/journal-draft.ts's own rule), so a missing half means no persistence at all.
  const draftScope: JournalDraftScope | null = useMemo(
    () =>
      scope.firm_id && scope.user_id
        ? { userId: scope.user_id, firmId: scope.firm_id, clientId }
        : null,
    [scope.firm_id, scope.user_id, clientId],
  );

  const [draft, setDraft] = useState<TradeInvoiceDraft>(() => emptyTradeInvoiceDraft());
  const [intentKey, setIntentKey] = useState<string>(() => newIntentKey());
  const [submitted, setSubmitted] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });
  const [restored, setRestored] = useState(false);
  const fields = useRef(new Map<string, FieldNode>());
  const lostOnce = useRef(false);

  // ---- the draft, restored once per scope -----------------------------------------------------
  useEffect(() => {
    const box = draftScope === null ? null : readTradeInvoiceDraft(draftScope, storage);
    if (box) {
      setDraft(box.draft);
      setIntentKey(box.intentKey);
    } else {
      setDraft(emptyTradeInvoiceDraft());
      setIntentKey(newIntentKey());
    }
    setRestored(true);
    setSubmitted(false);
    setOutcome({ kind: "idle" });
    lostOnce.current = false;
  }, [draftScope, storage]);

  // ---- the draft, persisted on every edit -----------------------------------------------------
  useEffect(() => {
    if (!restored || draftScope === null) return;
    writeTradeInvoiceDraft(draftScope, { intentKey, draft, documentId: null }, storage);
  }, [restored, draftScope, intentKey, draft, storage]);

  // ---- the reads, each degrading INDEPENDENTLY (the partial-stale state) ------------------------
  const partyKind = counterpartyKindFor(draft.kind);
  // HELD IN REFS, so the two effects below depend on the FACTS they read for (the client, the
  // party kind) rather than on a closure identity that changes every render — which would re-fire
  // both reads on every keystroke. The ref always holds the CURRENT loader, so an injected seam is
  // honoured without being a dependency.
  const readAccounts = useRef<() => Promise<CoaAccountRow[]>>(() => listCoaAccounts(session, clientId));
  const readParties = useRef<(k: "vendor" | "customer") => Promise<CounterpartyRow[]>>(
    (kind) => loadCounterparties(session, clientId, kind));
  readAccounts.current = loadAccounts ?? (() => listCoaAccounts(session, clientId));
  readParties.current = loadParties
    ?? ((kind: "vendor" | "customer") => loadCounterparties(session, clientId, kind));

  const [accounts, setAccounts] = useState<CoaAccountRow[] | null>(null);
  const [accountsFailed, setAccountsFailed] = useState(false);
  const [parties, setParties] = useState<CounterpartyRow[] | null>(null);
  const [partiesFailed, setPartiesFailed] = useState(false);

  // TWO READS, TWO EFFECTS, TWO FAILURE FLAGS — the partial-stale state is not a styling choice:
  // a failed party read and a failed chart read have different next actions, and a single combined
  // status would make the form claim one when it hit the other.
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const rows = await readAccounts.current();
        if (live) { setAccounts(rows); setAccountsFailed(false); }
      } catch {
        if (live) { setAccounts([]); setAccountsFailed(true); }
      }
    })();
    return () => { live = false; };
  }, [clientId]);
  useEffect(() => {
    let live = true;
    setParties(null);
    void (async () => {
      try {
        const rows = await readParties.current(partyKind);
        if (live) { setParties(rows ?? []); setPartiesFailed(false); }
      } catch {
        if (live) { setParties([]); setPartiesFailed(true); }
      }
    })();
    return () => { live = false; };
  }, [clientId, partyKind]);

  const knownCodes = useMemo(
    () => (accounts === null || accountsFailed ? null : new Set(accounts.map((a) => a.account_code))),
    [accounts, accountsFailed],
  );
  const liveParties = useMemo(
    () => (parties ?? []).filter((p) => p.merged_into === null && p.retired_at === null),
    [parties],
  );
  const matches = useMemo(() => {
    const q = draft.counterpartyQuery.trim().toLowerCase();
    if (q === "") return liveParties.slice(0, 8);
    return liveParties
      .filter((p) => p.name.toLowerCase().includes(q)
        || (p.registration_no ?? "").toLowerCase().includes(q))
      .slice(0, 8);
  }, [liveParties, draft.counterpartyQuery]);
  const picked = useMemo(
    () => liveParties.find((p) => p.id === draft.counterpartyId) ?? null,
    [liveParties, draft.counterpartyId],
  );

  const issues = useMemo(
    () => validateTradeInvoiceDraft(draft, knownCodes),
    [draft, knownCodes],
  );
  const issueFor = (field: TradeInvoiceFieldId): TradeInvoiceIssue | undefined =>
    (submitted ? issues.find((i) => i.field === field) : undefined);

  const registerField = useCallback((field: string, node: FieldNode | null) => {
    if (node === null) fields.current.delete(field);
    else fields.current.set(field, node);
  }, []);

  /** THE MAP IS THE ONE LOOKUP. A control that registered no ref cannot be focused — which is a
   *  real defect this way, rather than one papered over by a document lookup that happens to work
   *  in a browser and silently does nothing in a harness. `journal-composer.tsx`'s own posture. */
  const focusField = useCallback((field: TradeInvoiceFieldId | null) => {
    if (field === null) return;
    fields.current.get(field)?.focus();
  }, []);

  const patch = (next: Partial<TradeInvoiceDraft>) => setDraft((d) => ({ ...d, ...next }));

  const busy = outcome.kind === "submitting" || outcome.kind === "checking";

  async function send(key: string, acknowledged?: readonly string[]): Promise<SubmitTradeInvoiceWorkResult> {
    const wire = toTradeInvoiceWire(draft, knownCodes);
    // A LOCAL refusal never carries candidates: only the door knows which parties answer to a
    // name, so the empty list here is a fact rather than a placeholder.
    if (wire === null) return { kind: "invalid_basis", field: null, reason: "invalid_basis", candidates: [] };
    return submit(session, {
      clientId, intentKey: key, kind: wire.kind, invoice: wire.invoice, basis: wire.basis,
      // #1007 · ABSENT unless the person was warned and chose to go ahead. An empty list would be
      // a claim that they acknowledged nothing, which is a different thing from not being warned.
      ...(acknowledged && acknowledged.length > 0 ? { acknowledgeDuplicates: [...acknowledged] } : {}),
    });
  }

  /**
   * #1007 · WHAT THIS CLIENT ALREADY HAS THAT LOOKS LIKE THIS ONE.
   *
   * It runs BEFORE the write and it can only ever produce a WARNING: the owner ruled on
   * 2026-09-20 that Clara warns and the person decides. So a probe that cannot answer — the read
   * is down, the session lapsed, the door refused — returns NOTHING TO SHOW rather than
   * propagating, and the recording goes through exactly as it would have. A failed advisory read
   * that blocked a lawful recording would be the refusal the owner ruled out, arriving by the
   * back door.
   */
  async function look(): Promise<TradeInvoiceDuplicateMatch[]> {
    const wire = toTradeInvoiceWire(draft, knownCodes);
    if (wire === null) return [];
    try {
      return await probe(session, { clientId, kind: wire.kind, invoice: wire.invoice });
    } catch {
      return [];
    }
  }

  /** The one write path, shared by the plain submit and by "record it anyway". */
  async function admit(acknowledged?: readonly string[]): Promise<void> {
    setOutcome({ kind: "submitting" });
    const first = await send(intentKey, acknowledged);
    if (first.kind === "lost" && !lostOnce.current) {
      // THE LOST-RESPONSE ARM. NO answer was observed, so the intent key is re-sent EXACTLY ONCE
      // and the second answer is authoritative. `lost` is not `unavailable`: a replayed 202 means
      // the first attempt DID land, and the form must not offer a distinct resubmit before it knows.
      lostOnce.current = true;
      setOutcome({ kind: "checking" });
      applyResult(await send(intentKey, acknowledged));
      return;
    }
    if (first.kind === "lost") { setOutcome({ kind: "unavailable", message: first.message }); return; }
    applyResult(first);
  }

  function applyResult(res: SubmitTradeInvoiceWorkResult) {
    if (res.kind === "accepted") {
      if (draftScope !== null) clearTradeInvoiceDraft(draftScope, storage);
      setOutcome({
        kind: "accepted",
        workId: res.workId,
        invoiceId: res.invoiceId,
        dueDate: res.dueDate,
        dueDateSource: res.dueDateSource,
      });
      return;
    }
    if (res.kind === "invalid_basis") {
      const field = fieldForServerPath(res.field);
      // D12(a): `party_ambiguous` carries its candidates VERBATIM, and they are rendered INLINE as
      // a choice rather than announced and thrown away.
      //
      // #981 · the list rides the refusal's GENERIC carrier (`detail.candidates`), which every
      // durable-Work refusal now has, and `submitTradeInvoiceWork` types that one key because
      // this component renders it. Read DEFENSIVELY all the same: a refusal that carries none
      // leaves the banner the door's sentence alone.
      const candidates: PartyCandidate[] = (res.candidates ?? [])
        .map((c) => ({
          counterparty_id: typeof c.counterparty_id === "string" ? c.counterparty_id : "",
          name: typeof c.name === "string" ? c.name : "",
          registration_no: typeof c.registration_no === "string" ? c.registration_no : null,
          // #982 — the TIN is CARRIED, not dropped. LHDN MyInvois requires the buyer TIN and BRN,
          // so a Malaysian document carries both and the TIN is sometimes the only identifier
          // that tells two candidates apart. The door has always put it in the refusal; this
          // mapping used to discard it, so it never reached the screen.
          tin: typeof c.tin === "string" ? c.tin : null,
        }))
        .filter((c) => c.counterparty_id !== "" && c.name !== "");
      setOutcome({ kind: "refused", reason: res.reason ?? "invalid_basis", field, candidates });
      focusField(field);
      return;
    }
    if (res.kind === "conflict") { setOutcome({ kind: "conflict", workId: res.workId }); return; }
    if (res.kind === "source_conflict") { setOutcome({ kind: "sourceConflict", entryId: res.entryId }); return; }
    if (res.kind === "denied") { setOutcome({ kind: "denied" }); return; }
    if (res.kind === "not_found") { setOutcome({ kind: "notFound" }); return; }
    setOutcome({ kind: "unavailable", message: res.message });
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    const found = validateTradeInvoiceDraft(draft, knownCodes);
    if (found.length > 0) {
      focusField(firstInvalidTradeInvoiceField(found));
      return;
    }
    // #1007 · THE WARNING COMES BEFORE THE WRITE, and only once per decision: the person who has
    // already been shown these matches and pressed "Record it anyway" is not asked twice.
    setOutcome({ kind: "submitting" });
    const matches = await look();
    if (matches.length > 0) {
      setOutcome({ kind: "warned", matches });
      return;
    }
    await admit();
  }

  // ---- the denied state: a viewer typing the address reaches THIS, never a blank ---------------
  if (!canRecord) {
    return (
      <StateBanner tone="warning" title={t("denied.title")}>
        {t("denied.body")}
      </StateBanner>
    );
  }

  // ---- loading: a skeleton FITTED TO THE FORM, never a placeholder zero -------------------------
  if (!restored || accounts === null) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" data-testid="trade-invoice-loading">
        <div className="h-9 w-64 animate-pulse rounded-md bg-muted" />
        <div className="h-9 w-full animate-pulse rounded-md bg-muted" />
        <div className="h-9 w-48 animate-pulse rounded-md bg-muted" />
        <div className="h-40 w-full animate-pulse rounded-md bg-muted" />
        <span className="sr-only">{t("loading")}</span>
      </div>
    );
  }

  const controlClass = controlAccountClassFor(draft.kind);
  const domain = domainFor(draft.kind);

  return (
    <form className="flex flex-col gap-6" onSubmit={onSubmit} noValidate>
      {/* THE PERSISTENT OUTCOME. Never a toast: a refusal a person has to act on must stay on the
          page beside the control that caused it, and it carries the door's OWN code. */}
      {outcome.kind === "accepted" ? (
        <StateBanner
          tone="info"
          title={t("accepted.title")}
          action={
            <Button size="sm" render={<Link href={workDetailHref(clientId, outcome.workId)} />}>
              {t("accepted.open")}
            </Button>
          }
        >
          {t("accepted.body")}
          {outcome.dueDateSource ? (
            <span className="mt-1 block text-sm">
              {t(`dueBasis.${outcome.dueDateSource}`, { date: outcome.dueDate ?? "" })}
            </span>
          ) : null}
        </StateBanner>
      ) : null}
      {outcome.kind === "checking" ? (
        <StateBanner tone="info" title={t("checking.title")}>{t("checking.body")}</StateBanner>
      ) : null}
      {/* #1007 · THE WARNING. Not a refusal and not a toast: the recording is waiting on a person,
          so it stays on the page, names what it found, and offers BOTH ways out. */}
      {outcome.kind === "warned" ? (
        <StateBanner
          tone="warning"
          title={t("duplicate.title")}
          action={
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                type="button"
                onClick={() => { void admit(outcome.matches.map((m) => m.invoiceId)); }}
              >
                {t("duplicate.recordAnyway")}
              </Button>
              <Button
                size="sm"
                type="button"
                variant="outline"
                onClick={() => setOutcome({ kind: "idle" })}
              >
                {t("duplicate.cancel")}
              </Button>
            </div>
          }
        >
          {t("duplicate.body", { count: outcome.matches.length })}
          <ul className="mt-3 flex flex-col gap-2" aria-label={t("duplicate.title")}>
            {outcome.matches.map((m) => (
              <li key={m.invoiceId} className="flex flex-wrap items-center gap-2">
                <span className="text-sm">
                  {t("duplicate.entry", {
                    reference: m.reference ?? t("duplicate.noReference"),
                    date: m.documentDate ?? "",
                    total: formatCents(m.totalCents),
                  })}
                </span>
                <span className="text-xs text-muted-foreground">
                  {m.signals.length > 1
                    ? t("duplicate.signals.both")
                    : t(`duplicate.signals.${m.signals[0] ?? "same_reference"}`)}
                </span>
                {m.workId ? (
                  <Button
                    size="sm"
                    variant="outline"
                    render={<Link href={workDetailHref(clientId, m.workId)} />}
                  >
                    {t("duplicate.open")}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </StateBanner>
      ) : null}
      {outcome.kind === "refused" ? (
        <StateBanner tone="error" title={t("refused.title")} code={outcome.reason}>
          {t(`refusals.${outcome.reason}`)}
          {outcome.candidates.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-2" aria-label={t("candidates.label")}>
              {outcome.candidates.map((c, i) => {
                const id = typeof c.counterparty_id === "string" ? c.counterparty_id : null;
                const name = typeof c.name === "string" ? c.name : "";
                const reg = typeof c.registration_no === "string" ? c.registration_no : null;
                const tin = typeof c.tin === "string" ? c.tin : null;
                return (
                  <li key={id ?? `candidate-${i}`} className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={id === null}
                      onClick={() => {
                        if (id === null) return;
                        patch({ counterpartyId: id, counterpartyQuery: name });
                        setOutcome({ kind: "idle" });
                      }}
                    >
                      {name}
                    </Button>
                    {reg ? (
                      <span className="text-xs text-muted-foreground">
                        {t("candidates.registration", { value: reg })}
                      </span>
                    ) : null}
                    {tin ? (
                      <span className="text-xs text-muted-foreground">
                        {t("candidates.tin", { value: tin })}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </StateBanner>
      ) : null}
      {outcome.kind === "conflict" ? (
        <StateBanner
          tone="warning"
          title={t("conflict.title")}
          code="intent_payload_conflict"
          action={outcome.workId ? (
            <Button size="sm" variant="outline" render={<Link href={workDetailHref(clientId, outcome.workId)} />}>
              {t("conflict.open")}
            </Button>
          ) : undefined}
        >
          {t("conflict.body")}
        </StateBanner>
      ) : null}
      {outcome.kind === "sourceConflict" ? (
        <StateBanner tone="warning" title={t("sourceConflict.title")} code="source_already_posted">
          {t("sourceConflict.body")}
        </StateBanner>
      ) : null}
      {outcome.kind === "denied" ? (
        <StateBanner tone="warning" title={t("denied.title")}>{t("denied.body")}</StateBanner>
      ) : null}
      {outcome.kind === "notFound" ? (
        <StateBanner tone="warning" title={t("notFound.title")}>{t("notFound.body")}</StateBanner>
      ) : null}
      {outcome.kind === "unavailable" ? (
        <StateBanner
          tone="error"
          title={t("unavailable.title")}
          action={<Button size="sm" type="submit">{t("unavailable.retry")}</Button>}
        >
          {t("unavailable.body", { message: outcome.message })}
        </StateBanner>
      ) : null}

      {/* THE PARTIAL-STALE STATE. The party read degrades INDEPENDENTLY of the chart read, and says
          which half is missing rather than blanking the form. */}
      {partiesFailed ? (
        <StateBanner tone="warning" title={t("partiesUnavailable.title")}>
          {t("partiesUnavailable.body")}
        </StateBanner>
      ) : null}

      <FieldSet>
        <FieldLegend>{t("kind.legend")}</FieldLegend>
        <FieldDescription>{t("kind.description")}</FieldDescription>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("kind.legend")}>
          {TRADE_INVOICE_KINDS.map((k: TradeInvoiceKind) => (
            <Button
              key={k}
              type="button"
              role="radio"
              aria-checked={draft.kind === k}
              variant={draft.kind === k ? "default" : "outline"}
              id={draft.kind === k ? tradeInvoiceFieldId("kind") : undefined}
              // SWITCHING THE KIND DISCARDS NOTHING BUT THE PARTY, and only because a vendor
              // cannot be the party of a sales invoice: the two kinds read DIFFERENT counterparty
              // sets, so keeping the id would carry a party the door would refuse by name.
              onClick={() => patch({ kind: k, counterpartyId: null })}
            >
              {t(`kind.${k}`)}
            </Button>
          ))}
          <Badge variant="outline">{t(`domain.${domain}`)}</Badge>
        </div>
      </FieldSet>

      <FieldGroup>
        <Field data-invalid={issueFor("counterparty") ? true : undefined}>
          <FieldLabel htmlFor={tradeInvoiceFieldId("counterparty")}>{t("party.label")}</FieldLabel>
          <FieldDescription>{t(`party.description.${partyKind}`)}</FieldDescription>
          <Input
            id={tradeInvoiceFieldId("counterparty")}
            ref={(node) => registerField("counterparty", node)}
            value={draft.counterpartyQuery}
            disabled={busy}
            aria-invalid={issueFor("counterparty") ? true : undefined}
            onChange={(e) => patch({ counterpartyQuery: e.target.value, counterpartyId: null })}
          />
          {picked ? (
            <p className="text-sm" data-testid="trade-invoice-party-picked">
              {t("party.picked", { name: picked.name })}
              {picked.payment_terms_days !== null
                ? ` · ${t("party.terms", { days: picked.payment_terms_days })}`
                : ` · ${t("party.noTerms")}`}
            </p>
          ) : parties !== null && matches.length === 0 ? (
            // THE NO-RESULTS STATE preserves the query and offers Clear — it never silently empties
            // what somebody typed. And it never offers "create": this lane writes no party.
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>
                {liveParties.length === 0 ? t("party.emptyClient") : t("party.noResults")}
              </span>
              <Button type="button" size="sm" variant="ghost"
                onClick={() => patch({ counterpartyQuery: "" })}>
                {t("party.clear")}
              </Button>
              <Link className="underline" href={counterpartyIdentityHref(clientId, "")}>
                {t("party.manage")}
              </Link>
            </div>
          ) : (
            <ul className="flex flex-col gap-1" aria-label={t("party.matchesLabel")}>
              {matches.map((p) => (
                <li key={p.id}>
                  <Button type="button" size="sm" variant="ghost"
                    onClick={() => patch({ counterpartyId: p.id, counterpartyQuery: p.name })}>
                    {p.name}
                    {p.registration_no ? (
                      <span className="ml-2 text-xs text-muted-foreground">{p.registration_no}</span>
                    ) : null}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {issueFor("counterparty") ? (
            <FieldError>{t(`issues.${issueFor("counterparty")?.code}`)}</FieldError>
          ) : null}
        </Field>

        <Field data-invalid={issueFor("documentDate") ? true : undefined}>
          <FieldLabel htmlFor={tradeInvoiceFieldId("documentDate")}>{t("documentDate.label")}</FieldLabel>
          <FieldDescription>{t("documentDate.description")}</FieldDescription>
          <Input
            id={tradeInvoiceFieldId("documentDate")}
            ref={(node) => registerField("documentDate", node)}
            type="date"
            value={draft.documentDate}
            disabled={busy}
            aria-invalid={issueFor("documentDate") ? true : undefined}
            onChange={(e) => patch({ documentDate: e.target.value })}
          />
          {issueFor("documentDate") ? (
            <FieldError>{t(`issues.${issueFor("documentDate")?.code}`)}</FieldError>
          ) : null}
        </Field>

        <Field data-invalid={issueFor("dueDate") ? true : undefined}>
          <FieldLabel htmlFor={tradeInvoiceFieldId("dueDate")}>{t("dueDate.label")}</FieldLabel>
          {/* D12c, said out loud: leaving it blank is a real answer, and the database may still
              derive one from the party's agreed terms. Nothing here computes a fallback. */}
          <FieldDescription>{t("dueDate.description")}</FieldDescription>
          <Input
            id={tradeInvoiceFieldId("dueDate")}
            ref={(node) => registerField("dueDate", node)}
            type="date"
            value={draft.dueDate}
            disabled={busy}
            aria-invalid={issueFor("dueDate") ? true : undefined}
            onChange={(e) => patch({ dueDate: e.target.value })}
          />
          {issueFor("dueDate") ? (
            <FieldError>{t(`issues.${issueFor("dueDate")?.code}`)}</FieldError>
          ) : null}
        </Field>

        <Field data-invalid={issueFor("reference") ? true : undefined}>
          <FieldLabel htmlFor={tradeInvoiceFieldId("reference")}>{t("reference.label")}</FieldLabel>
          <FieldDescription>{t("reference.description")}</FieldDescription>
          <Input
            id={tradeInvoiceFieldId("reference")}
            ref={(node) => registerField("reference", node)}
            value={draft.reference}
            maxLength={REFERENCE_MAX_CHARS}
            disabled={busy}
            aria-invalid={issueFor("reference") ? true : undefined}
            onChange={(e) => patch({ reference: e.target.value })}
          />
          {issueFor("reference") ? (
            <FieldError>{t(`issues.${issueFor("reference")?.code}`)}</FieldError>
          ) : null}
        </Field>

        <Field data-invalid={issueFor("totalCents") ? true : undefined}>
          <FieldLabel htmlFor={tradeInvoiceFieldId("totalCents")}>{t("total.label")}</FieldLabel>
          <FieldDescription>{t("total.description", { accountClass: controlClass })}</FieldDescription>
          <MoneyInput
            id={tradeInvoiceFieldId("totalCents")}
            ref={(node) => registerField("totalCents", node)}
            cents={draft.totalCents}
            mode="unsigned"
            disabled={busy}
            aria-invalid={issueFor("totalCents") ? true : undefined}
            // The house MoneyInput answers a PARSE RESULT, never a number: a refusal keeps the
            // last good value rather than silently writing a wrong one.
            onValueChange={(change) => {
              if (change.ok && change.cents !== null) patch({ totalCents: change.cents });
              else if (change.ok) patch({ totalCents: 0 });
            }}
          />
          {issueFor("totalCents") ? (
            <FieldError>{t(`issues.${issueFor("totalCents")?.code}`)}</FieldError>
          ) : null}
        </Field>

        <Field data-invalid={issueFor("taxFacts") ? true : undefined}>
          <FieldLabel htmlFor={tradeInvoiceFieldId("taxFacts")}>{t("taxFacts.label")}</FieldLabel>
          {/* CARRIED, NEVER VALIDATED (the #638 rule, restated in 0225): Clara records what the
              document states and recomputes nothing from it. */}
          <FieldDescription>{t("taxFacts.description")}</FieldDescription>
          <Textarea
            id={tradeInvoiceFieldId("taxFacts")}
            ref={(node) => registerField("taxFacts", node)}
            rows={2}
            value={draft.taxFactsJson}
            disabled={busy}
            aria-invalid={issueFor("taxFacts") ? true : undefined}
            onChange={(e) => patch({ taxFactsJson: e.target.value })}
          />
          {issueFor("taxFacts") ? (
            <FieldError>{t(`issues.${issueFor("taxFacts")?.code}`)}</FieldError>
          ) : null}
        </Field>

        <Field data-invalid={issueFor("postingDate") ? true : undefined}>
          <FieldLabel htmlFor={tradeInvoiceFieldId("postingDate")}>{t("postingDate.label")}</FieldLabel>
          <FieldDescription>{t("postingDate.description")}</FieldDescription>
          <Input
            id={tradeInvoiceFieldId("postingDate")}
            ref={(node) => registerField("postingDate", node)}
            type="date"
            value={draft.postingDate}
            disabled={busy}
            aria-invalid={issueFor("postingDate") ? true : undefined}
            onChange={(e) => patch({ postingDate: e.target.value })}
          />
          {issueFor("postingDate") ? (
            <FieldError>{t(`issues.${issueFor("postingDate")?.code}`)}</FieldError>
          ) : null}
        </Field>

        <Field data-invalid={issueFor("memo") ? true : undefined}>
          <FieldLabel htmlFor={tradeInvoiceFieldId("memo")}>{t("memo.label")}</FieldLabel>
          <Textarea
            id={tradeInvoiceFieldId("memo")}
            ref={(node) => registerField("memo", node)}
            rows={2}
            value={draft.memo}
            disabled={busy}
            aria-invalid={issueFor("memo") ? true : undefined}
            onChange={(e) => patch({ memo: e.target.value })}
          />
          {issueFor("memo") ? <FieldError>{t(`issues.${issueFor("memo")?.code}`)}</FieldError> : null}
        </Field>
      </FieldGroup>

      {/* THE BASIS. Its own labelled horizontal viewport, so 320px scrolls the GRID rather than the
          page (appendix C §4) — the shipped component, not a second lines editor. */}
      <FieldSet>
        <FieldLegend>{t("basis.legend")}</FieldLegend>
        <FieldDescription>{t("basis.description", { accountClass: controlClass })}</FieldDescription>
        <div className="overflow-x-auto" role="region" tabIndex={0} aria-label={t("basis.viewportLabel")}>
          <JournalBasisFields
            lines={draft.lines}
            onChange={(lines) => patch({ lines })}
            accounts={accounts ?? []}
            issues={submitted
              ? issues
                .filter((i) => i.field.startsWith("line") || i.field === "lines")
                .map((i) => ({ field: i.field as never, code: i.code as never }))
              : []}
            disabled={busy}
            registerField={registerField as never}
          />
        </div>
      </FieldSet>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? t("submit.busy") : t("submit.label")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            if (draftScope !== null) clearTradeInvoiceDraft(draftScope, storage);
            setDraft(emptyTradeInvoiceDraft());
            setIntentKey(newIntentKey());
            setSubmitted(false);
            setOutcome({ kind: "idle" });
            lostOnce.current = false;
            navigate(`/clients/${clientId}/accounting`);
          }}
        >
          {t("discard")}
        </Button>
      </div>
    </form>
  );
}
