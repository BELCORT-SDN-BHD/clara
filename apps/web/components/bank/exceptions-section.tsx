"use client";

// The /bank Exceptions tab: open agent-proposed line_exception proposals
// (a human "excepts" the named line via except_bank_line, which auto-
// accepts the matching proposal), and open bank_line_exceptions awaiting
// resolve_bank_line_exception (bank_corrective_line only — the direct
// door's own client-side restraint, see lib/bank/exception-doors.ts) or the
// AF-2 write-off composite (resolveAndBookBankLine, hand-draft leg).
// `matched_booking` is the named gap — it needs the settlement/open-item
// leg this build does not wire a picker for.

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { useHydratedPart } from "@/lib/parts/hooks";
import { useReadErrKind } from "@/lib/bank/error-kind";
import { listOpenBankLineExceptions, listOpenBankLineExceptionProposals } from "@/lib/bank/table-reads";
import { exceptBankLine, resolveBankLineException } from "@/lib/bank/exception-doors";
import { EXCEPTION_KINDS, type BankLineExceptionKind } from "@/lib/bank/exception-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SectionHeader } from "@/components/common/section-header";
import { NativeSelect } from "@/components/common/native-select";
import { ReadState } from "./read-state";
import { ActionRefusal } from "./action-refusal";
import { NotBuilt } from "./not-built";
import { WriteOffForm } from "./write-off-form";

export function ExceptionsSection({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientBank.exceptions");
  const tc = useTranslations("ClientBank.common");

  const proposalsKind = useReadErrKind();
  const proposals = useHydratedPart(
    sessionTokenAccessor,
    useCallback((s) => proposalsKind.wrap(() => listOpenBankLineExceptionProposals(clientId, { session: s })), [clientId, proposalsKind]),
  );

  const exceptionsKind = useReadErrKind();
  const exceptions = useHydratedPart(
    sessionTokenAccessor,
    useCallback((s) => exceptionsKind.wrap(() => listOpenBankLineExceptions(clientId, { session: s })), [clientId, exceptionsKind]),
  );

  // --- except (mint) form ---
  const [lineId, setLineId] = useState("");
  const [kind, setKind] = useState<string>(EXCEPTION_KINDS[0] ?? "bank_error");
  const [reason, setReason] = useState("");

  function prefillFromProposal(proposalLineId: string, payload: Record<string, unknown>) {
    setLineId(proposalLineId);
    const rawReason = typeof payload.reason === "string" ? payload.reason : "";
    // N18 fix (independent review): an agent proposal's `payload.kind` is
    // UNTRUSTED — accepting it verbatim would let a value outside
    // EXCEPTION_KINDS (the door's own vocabulary) sit in `kind` state with
    // no matching <option> selected, then still get sent as-is to
    // exceptBankLine on submit. Fall back to the first known kind, and keep
    // the raw value HONESTLY VISIBLE (never silently dropped) by folding it
    // into the reason text rather than swallowing it.
    const rawKind = typeof payload.kind === "string" ? payload.kind : null;
    const knownKind = rawKind && (EXCEPTION_KINDS as readonly string[]).includes(rawKind) ? (rawKind as BankLineExceptionKind) : null;
    setKind(knownKind ?? EXCEPTION_KINDS[0] ?? "bank_error");
    setReason(knownKind || !rawKind ? rawReason : `[proposed kind: ${rawKind}] ${rawReason}`.trim());
  }

  async function submitExcept(e: React.FormEvent) {
    e.preventDefault();
    await exceptions.act(
      async () => { await exceptBankLine({ lineId, kind, reason }, { session: sessionTokenAccessor }); },
      () => { setLineId(""); setReason(""); void proposals.reload(); },
    );
  }

  // --- resolve (bank_corrective_line) form, per exception row ---
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [counterpartLineId, setCounterpartLineId] = useState("");
  const [note, setNote] = useState("");

  async function submitResolve(exceptionId: string) {
    await exceptions.act(
      async () => { await resolveBankLineException({ exceptionId, disposition: "bank_corrective_line", note, counterpartLineId }, { session: sessionTokenAccessor }); },
      () => { setResolvingId(null); setCounterpartLineId(""); setNote(""); },
    );
  }

  const [writingOffId, setWritingOffId] = useState<string | null>(null);

  // N11: route the DB's raw enum values through i18n at the render site,
  // never through a pure lib helper that returns hardcoded English (the
  // reviewed defect — lib/bank/exception-types.ts's own exceptionKindLabel
  // is kept for non-UI callers, never rendered directly here anymore).
  function kindLabel(k: string): string {
    if (k === "bank_error") return t("kindBankError");
    if (k === "disputed") return t("kindDisputed");
    return k; // never fabricate an English word for an unrecognized kind
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <SectionHeader level={2}>{t("proposalsHeading")}</SectionHeader>
          <CardDescription>{t("proposalsAttribution")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ReadState hasData={proposals.data !== null} err={proposals.err} errKind={proposalsKind.kind} isEmpty={proposals.data?.length === 0} onRetry={() => void proposals.reload()}>
            <ul className="flex flex-col gap-2">
              {(proposals.data ?? []).map((p) => (
                <li key={p.id} className="enter-content flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 text-sm">
                  <div>
                    <p className="font-medium text-foreground">{String(p.payload.kind ?? "")} — {String(p.payload.reason ?? "")}</p>
                    <p className="text-xs text-muted-foreground">{p.rationale}</p>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={() => prefillFromProposal(p.subject_id, p.payload)}>{t("useProposal")}</Button>
                </li>
              ))}
            </ul>
          </ReadState>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <SectionHeader level={2}>{t("exceptHeading")}</SectionHeader>
        </CardHeader>
        <CardContent>
          <form onSubmit={submitExcept} className="flex flex-col gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="except-line-id">{t("lineIdLabel")}</Label>
              <Input id="except-line-id" value={lineId} onChange={(e) => setLineId(e.target.value)} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="except-kind">{t("kindLabel")}</Label>
              <NativeSelect id="except-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
                {EXCEPTION_KINDS.map((k: BankLineExceptionKind) => <option key={k} value={k}>{kindLabel(k)}</option>)}
              </NativeSelect>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="except-reason">{t("reasonLabel")}</Label>
              <Textarea id="except-reason" value={reason} onChange={(e) => setReason(e.target.value)} required />
            </div>
            <ActionRefusal err={exceptions.err} clr={exceptions.clr} />
            <Button type="submit" disabled={exceptions.busy} className="self-start">
              {exceptions.busy ? tc("busy") : t("exceptSubmit")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <SectionHeader level={2}>{t("openHeading")}</SectionHeader>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {exceptions.data !== null && <ActionRefusal err={exceptions.err} clr={exceptions.clr} />}
          <ReadState hasData={exceptions.data !== null} err={exceptions.err} errKind={exceptionsKind.kind} isEmpty={exceptions.data?.length === 0} onRetry={() => void exceptions.reload()}>
            <ul className="flex flex-col gap-2">
              {(exceptions.data ?? []).map((ex) => (
                <li key={ex.id} className="enter-content flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
                  <p className="font-medium text-foreground">{kindLabel(ex.kind)} — {ex.reason}</p>
                  <div className="flex gap-1.5">
                    <Button type="button" size="sm" variant="outline" onClick={() => setResolvingId(resolvingId === ex.id ? null : ex.id)}>{t("resolveCorrective")}</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setWritingOffId(writingOffId === ex.id ? null : ex.id)}>{t("writeOff")}</Button>
                  </div>
                  {resolvingId === ex.id && (
                    <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/50 p-3">
                      <div className="grid gap-1.5">
                        <Label htmlFor={`counterpart-${ex.id}`}>{t("counterpartLineLabel")}</Label>
                        <Input id={`counterpart-${ex.id}`} value={counterpartLineId} onChange={(e) => setCounterpartLineId(e.target.value)} />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor={`note-${ex.id}`}>{t("noteLabel")}</Label>
                        <Textarea id={`note-${ex.id}`} value={note} onChange={(e) => setNote(e.target.value)} />
                      </div>
                      <Button type="button" size="sm" disabled={exceptions.busy} onClick={() => void submitResolve(ex.id)}>
                        {exceptions.busy ? tc("busy") : t("resolveSubmit")}
                      </Button>
                    </div>
                  )}
                  {writingOffId === ex.id && (
                    <WriteOffForm clientId={clientId} exceptionId={ex.id} onDone={() => { setWritingOffId(null); void exceptions.reload(); }} />
                  )}
                </li>
              ))}
            </ul>
          </ReadState>
          <NotBuilt missingVerb="resolve_and_book_bank_line(disposition='matched_booking', p_allocations=[...]) — the open-item settlement leg" />
        </CardContent>
      </Card>
    </div>
  );
}
