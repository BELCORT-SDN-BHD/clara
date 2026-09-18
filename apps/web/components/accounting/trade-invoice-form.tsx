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
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { JournalBasisFields, fieldElementId, type FieldNode } from "@/components/accounting/journal-basis-fields";
import { useFirmScope } from "@/components/firm-scope-provider";
import { StateBanner } from "@/components/common/state";
import { MoneyInput } from "@/components/common/money-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { loadCounterparties, type CounterpartyRow } from "@/lib/registers/counterparty";
import {
  canOpenClientLeaf,
  counterpartyIdentityHref,
  workDetailHref,
  type NavigationScope,
} from "@/lib/navigation/tree";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { submitTradeInvoiceWork, type SubmitTradeInvoiceWorkResult } from "@/lib/work/api";
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
  | { kind: "accepted"; workId: string; invoiceId: string | null; dueDate: string | null; dueDateSource: string | null }
  | { kind: "refused"; reason: string; field: TradeInvoiceFieldId | null; candidates: PartyCandidate[] }
  | { kind: "conflict"; workId: string | null }
  | { kind: "sourceConflict"; entryId: string | null }
  | { kind: "denied" }
  | { kind: "notFound" }
  | { kind: "unavailable"; message: string };

export function TradeInvoiceForm({ clientId }: { clientId: string }) {
  return <TradeInvoiceFormView clientId={clientId} scope={useFirmScope()} />;
}

/** Exported for the unit, a11y and keyboard harnesses; production gets scope from context and the
 *  session accessor and storage from their defaults. */
export function TradeInvoiceFormView({
  clientId,
  scope,
  session = sessionTokenAccessor(),
  storage = defaultDraftStorage(),
}: {
  clientId: string;
  scope: NavigationScope;
  session?: SessionTokenAccessor;
  storage?: DraftStorage | null;
}) {
  const t = useTranslations("TradeInvoice");
  const router = useRouter();
  const canRecord = canOpenClientLeaf(scope, "tradeInvoice");

  const draftScope: JournalDraftScope = useMemo(
    () => ({ userId: scope.userId, firmId: scope.firmId, clientId }),
    [scope.userId, scope.firmId, clientId],
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
    const box = readTradeInvoiceDraft(draftScope, storage);
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
    if (!restored) return;
    writeTradeInvoiceDraft(draftScope, { intentKey, draft, documentId: null }, storage);
  }, [restored, draftScope, intentKey, draft, storage]);

  // ---- the reads, each degrading INDEPENDENTLY (the partial-stale state) ------------------------
  const accountsRead = useAsyncRead<CoaAccountRow[]>(
    useCallback((signal) => listCoaAccounts(session, clientId, { signal }), [session, clientId]),
  );
  const partyKind = counterpartyKindFor(draft.kind);
  const partiesRead = useAsyncRead<CounterpartyRow[]>(
    useCallback(
      (signal) => loadCounterparties(session, clientId, partyKind, { signal }),
      [session, clientId, partyKind],
    ),
  );

  const accounts = accountsRead.data ?? [];
  const knownCodes = useMemo(
    () => (accountsRead.data === null ? null : new Set(accounts.map((a) => a.account_code))),
    [accountsRead.data, accounts],
  );
  const liveParties = useMemo(
    () => (partiesRead.data ?? []).filter((p) => p.merged_into === null && p.retired_at === null),
    [partiesRead.data],
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

  const focusField = useCallback((field: TradeInvoiceFieldId | null) => {
    if (field === null) return;
    const node = fields.current.get(field);
    if (node) { node.focus(); return; }
    const el = typeof document === "undefined"
      ? null
      : document.getElementById(tradeInvoiceFieldId(field)) ?? document.getElementById(fieldElementId(field as never));
    if (el && typeof (el as HTMLElement).focus === "function") (el as HTMLElement).focus();
  }, []);

  const patch = (next: Partial<TradeInvoiceDraft>) => setDraft((d) => ({ ...d, ...next }));

  const busy = outcome.kind === "submitting" || outcome.kind === "checking";

  async function send(key: string): Promise<SubmitTradeInvoiceWorkResult> {
    const wire = toTradeInvoiceWire(draft, knownCodes);
    if (wire === null) return { kind: "invalid_basis", field: null, reason: "invalid_basis" };
    return submitTradeInvoiceWork(session, {
      clientId, intentKey: key, kind: wire.kind, invoice: wire.invoice, basis: wire.basis,
    });
  }

  function applyResult(res: SubmitTradeInvoiceWorkResult) {
    if (res.kind === "accepted") {
      clearTradeInvoiceDraft(draftScope, storage);
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
      const candidates = Array.isArray((res as { detail?: { candidates?: unknown } }).detail?.candidates)
        ? ((res as { detail: { candidates: PartyCandidate[] } }).detail.candidates)
        : [];
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
    setOutcome({ kind: "submitting" });
    const first = await send(intentKey);
    if (first.kind === "lost" && !lostOnce.current) {
      // THE LOST-RESPONSE ARM. NO answer was observed, so the intent key is re-sent EXACTLY ONCE
      // and the second answer is authoritative. `lost` is not `unavailable`: a replayed 202 means
      // the first attempt DID land, and the form must not offer a distinct resubmit before it knows.
      lostOnce.current = true;
      setOutcome({ kind: "checking" });
      applyResult(await send(intentKey));
      return;
    }
    if (first.kind === "lost") { setOutcome({ kind: "unavailable", message: first.message }); return; }
    applyResult(first);
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
  if (!restored || accountsRead.status === "loading") {
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
          tone="success"
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
      {outcome.kind === "refused" ? (
        <StateBanner tone="error" title={t("refused.title")} code={outcome.reason}>
          {t(`refusals.${outcome.reason}`)}
          {outcome.candidates.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-2" aria-label={t("candidates.label")}>
              {outcome.candidates.map((c, i) => {
                const id = typeof c.counterparty_id === "string" ? c.counterparty_id : null;
                const name = typeof c.name === "string" ? c.name : "";
                const reg = typeof c.registration_no === "string" ? c.registration_no : null;
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
                    {reg ? <span className="text-xs text-muted-foreground">{reg}</span> : null}
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
      {partiesRead.status === "error" ? (
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
          ) : partiesRead.status === "ready" && matches.length === 0 ? (
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
            cents={draft.totalCents}
            mode="unsigned"
            disabled={busy}
            aria-invalid={issueFor("totalCents") ? true : undefined}
            onValueChange={(cents) => patch({ totalCents: cents })}
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
            accounts={accounts}
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
            clearTradeInvoiceDraft(draftScope, storage);
            setDraft(emptyTradeInvoiceDraft());
            setIntentKey(newIntentKey());
            setSubmitted(false);
            setOutcome({ kind: "idle" });
            lostOnce.current = false;
            router.refresh();
          }}
        >
          {t("discard")}
        </Button>
      </div>
    </form>
  );
}
