"use client";

// The propose/sign/retire authority ceremony body — split out of
// depreciation-authority-panel.tsx (file-size discipline, the house
// convention write-off-form.tsx's own header names).

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldTitle,
} from "@/components/ui/field";
import { NativeSelect } from "@/components/common/native-select";
import { toDialogRefusal } from "@/components/common/dialog-refusal";
import { workDetailHref } from "@/lib/navigation/tree";
import { businessDateTime } from "@/lib/business-date";
import { FaDoorDialog } from "./FaDoorDialog";
import {
  proposeDepreciationAuthority,
  signDepreciationAuthority,
  retireDepreciationAuthority,
  authorityIntent,
  useDepreciationDecisionKey,
  type FaAuthorityRef,
  type FaDepreciationAuthorityEnvelope,
} from "@/lib/registers/depreciation";
import { sessionTokenAccessor } from "@/lib/session-accessor";

// #979 (0251): `retired` is no longer dead code here — see lib/registers/depreciation.ts's
// `FaDepreciationAuthority.status` for why. The `secondary` variant matches the house style a
// retired counterparty alias already uses (components/registers/counterparty-identity-panel.tsx's
// own `aliasRetired` badge), so "retired" reads the same way everywhere it appears.
const STATUS_VARIANT = { proposed: "outline", live: "default", retired: "secondary" } as const;

export function AuthorityCeremony({
  clientId,
  data,
  busy,
  act,
  error,
}: {
  clientId: string;
  data: FaDepreciationAuthorityEnvelope;
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<boolean>;
  /** #651 — the panel's standing failure, so a sign refusal travels INTO the dialog with the human
   *  instead of standing behind the modal backdrop (CB-AE2E-004's own reasoning). The four
   *  instruction-reference refusals are exactly the kind this matters for: each one is asking the
   *  person to change ONE value in the form they are looking at. */
  error?: unknown;
}) {
  const t = useTranslations("FixedAssetsDepreciation.authority");
  const au = data.authority;

  return (
    <div className="flex flex-col gap-2">
      {data.fy_end.fallback ? <p className="text-xs text-warning">{t("fyEndFallback")}</p> : null}
      {!au ? (
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground">{t("none")}</p>
          <ProposeDialog clientId={clientId} busy={busy} act={act} />
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="secondary">{t(`cadence.${au.cadence}`)}</Badge>
            <Badge variant={STATUS_VARIANT[au.status]}>{t(`status.${au.status}`)}</Badge>
          </div>
          {au.status === "live" ? (
            <p className="text-xs text-muted-foreground">{data.ramp_earned ? t("rampEarned") : t("rampNotEarned")}</p>
          ) : null}
          {/* #979 (0251) — THE RETIREMENT'S OWN FACTS, so a bookkeeper deciding whether to
              propose a new authority sees that a prior one existed and was deliberately
              withdrawn, rather than a state indistinguishable from "never had one" (the owner's
              ruling on this ticket, verbatim). Shape borrowed from
              counterparty-identity-panel.tsx's own "{who} · {date}" line (AliasItem). */}
          {au.status === "retired" ? (
            <>
              <p className="text-xs text-muted-foreground" data-testid="fa-authority-retired-reason">
                {t("retiredReason", { reason: au.retired_reason ?? "" })}
              </p>
              <p className="text-xs text-muted-foreground" data-testid="fa-authority-retired-by">
                <span className="font-mono" title={au.retired_by ?? undefined}>
                  {(au.retired_by ?? "").slice(0, 8)}
                </span>
                {au.retired_at ? <>{" · "}{businessDateTime(au.retired_at)}</> : null}
              </p>
            </>
          ) : null}
          {/* #651 [0227] — THE WINDOW, AND THE HONEST SENTENCE UNDER IT. `authority_from` is the
              first day of the month this authority was signed and it never moves: the belt runs
              forward only from there, and anything earlier needs an explicit catch-up by hand.
              A person reading "nothing is due" on a client with two years of uncharged assets must
              be able to find that out HERE rather than from a refusal. #979 (0251): a RETIRED
              authority's own window floor renders too, in the past tense — it no longer reaches
              anything, but it is still the range it once governed. */}
          {(au.status === "live" || au.status === "retired") && au.authority_from ? (
            <p className="text-xs text-muted-foreground" data-testid="fa-authority-window">
              {au.status === "retired"
                ? t("retiredWindowFrom", { from: au.authority_from })
                : t("windowFrom", { from: au.authority_from })}
            </p>
          ) : null}
          {/* …and the instruction it was signed under, as a link to the row that carries it. */}
          {au.authority_ref ? (
            <p className="text-xs text-muted-foreground" data-testid="fa-authority-ref">
              {t(`instructionKind.${au.authority_ref.kind}`)}{" "}
              {au.authority_ref.kind === "accounting_work" ? (
                <Link
                  href={workDetailHref(clientId, au.authority_ref.id)}
                  className="font-mono break-all underline-offset-4 hover:underline"
                >
                  {au.authority_ref.id.slice(0, 8)}
                </Link>
              ) : (
                <span className="font-mono break-all" title={au.authority_ref.id}>{au.authority_ref.id.slice(0, 8)}</span>
              )}
            </p>
          ) : au.status === "live" ? (
            // An authority signed before 0227 carries no instruction and none can be invented.
            <p className="text-xs text-muted-foreground" data-testid="fa-authority-ref-absent">{t("instructionAbsent")}</p>
          ) : null}
          <div className="flex gap-2">
            {au.status === "proposed" ? <SignDialog clientId={clientId} authorityId={au.id} busy={busy} act={act} error={error} /> : null}
            {/* #979 (0251) — a RETIRED authority offers Propose (a fresh one), never a second
                Retire: `clara.retire_depreciation_authority` refuses CLR38 `authority_not_live`
                on an already-retired row (0041:3388-3391), so retiring twice was always a
                refusal waiting to happen — it just could not be REACHED before this ticket,
                because `status: "retired"` never reached this component (see this file's
                header). */}
            {au.status === "retired"
              ? <ProposeDialog clientId={clientId} busy={busy} act={act} />
              : <RetireDialog clientId={clientId} authorityId={au.id} busy={busy} act={act} />}
          </div>
        </div>
      )}
    </div>
  );
}

function ProposeDialog({ clientId, busy, act }: { clientId: string; busy: boolean; act: (fn: () => Promise<void>) => Promise<boolean> }) {
  const t = useTranslations("FixedAssetsDepreciation.authority");
  const [cadence, setCadence] = useState<"monthly" | "annual">("monthly");
  // #651 fix-round 1 — ONE DECISION, ONE KEY: the same key for every attempt at THIS proposal,
  // a new one the moment the cadence changes.
  const decision = useDepreciationDecisionKey();
  return (
    <FaDoorDialog
      triggerLabel={t("proposeTrigger")}
      title={t("proposeTitle")}
      description={t("proposeDescription")}
      confirmLabel={t("proposeTrigger")}
      busy={busy}
      // A CLOSED DIALOG ENDS THE DECISION: the next press is a new one and mints a new key.
      onClosed={() => decision.renew()}
      onConfirm={() => act(async () => {
        const opKey = decision.key(authorityIntent("propose", { clientId, value: cadence }));
        await proposeDepreciationAuthority(sessionTokenAccessor, { clientId, cadence, opKey });
      })}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="fa-authority-cadence">{t("cadenceLabel")}</Label>
        <NativeSelect id="fa-authority-cadence" value={cadence} onChange={(e) => setCadence(e.target.value as "monthly" | "annual")}>
          <option value="monthly">{t("cadence.monthly")}</option>
          <option value="annual">{t("cadence.annual")}</option>
        </NativeSelect>
      </div>
    </FaDoorDialog>
  );
}

/** #651 [0227] — SIGNING NOW NAMES THE INSTRUCTION IT EXECUTES.
 *
 *  AC5's "under explicit instruction" stopped being a comment and became a door: the reference is
 *  REQUIRED and RESOLVED against `clara.accounting_work` / `clara.agent_tasks` in the SAME firm and
 *  client. A Knowledge preference, a calculation policy or a repeated debit resolves to nothing and
 *  is refused by name. All four refusals (`authority_ref_invalid` constraint object | kind | id,
 *  and `authority_ref_unresolved`) render VERBATIM with their code — this form re-words none of
 *  them, and validates only the one thing it can know without the database: that the id is shaped
 *  like a uuid. */
function SignDialog({ clientId, authorityId, busy, act, error }: {
  clientId: string; authorityId: string; busy: boolean;
  act: (fn: () => Promise<void>) => Promise<boolean>; error?: unknown;
}) {
  const t = useTranslations("FixedAssetsDepreciation.authority");
  const [refKind, setRefKind] = useState<FaAuthorityRef["kind"]>("accounting_work");
  const [refId, setRefId] = useState("");
  // #651 fix-round 1 (ADV-651-8) — THE DOOR A LOST RESPONSE IS ACTUALLY MET ON. Signing twice with
  // two keys refuses CLR38 `authority_already_live`; with one key the retry returns the receipt
  // the first attempt earned. Correcting the cited instruction is a different decision.
  const decision = useDepreciationDecisionKey();
  const idBlank = refId.trim() === "";
  const idMalformed = !idBlank && !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(refId.trim());

  return (
    <FaDoorDialog
      triggerLabel={t("signTrigger")}
      title={t("signTitle")}
      description={t("signDescription")}
      confirmLabel={t("signTrigger")}
      busy={busy}
      // A CLOSED DIALOG ENDS THE DECISION: the next press is a new one and mints a new key.
      onClosed={() => decision.renew()}
      refusal={toDialogRefusal(error)}
      confirmDisabled={idBlank || idMalformed}
      onConfirm={() => act(async () => {
        const opKey = decision.key(authorityIntent("sign",
          { clientId, authorityId, value: `${refKind}:${refId.trim()}` }));
        await signDepreciationAuthority(sessionTokenAccessor, {
          clientId, authorityId, authorityRef: { kind: refKind, id: refId.trim() }, opKey,
        });
      })}
    >
      <FieldGroup>
        <Field>
          <FieldContent>
            <FieldLabel htmlFor={`fa-sign-kind-${authorityId}`}>
              <FieldTitle>{t("instructionKindLabel")}</FieldTitle>
              <FieldDescription>{t("instructionKindHelp")}</FieldDescription>
            </FieldLabel>
          </FieldContent>
          <NativeSelect
            id={`fa-sign-kind-${authorityId}`}
            value={refKind}
            onChange={(e) => setRefKind(e.target.value as FaAuthorityRef["kind"])}
          >
            <option value="accounting_work">{t("instructionKind.accounting_work")}</option>
            <option value="chat_task">{t("instructionKind.chat_task")}</option>
          </NativeSelect>
        </Field>
        <Field data-invalid={idBlank || idMalformed ? true : undefined}>
          <FieldContent>
            <FieldLabel htmlFor={`fa-sign-ref-${authorityId}`}>
              <FieldTitle>{t("instructionIdLabel")}</FieldTitle>
              <FieldDescription>{t("instructionIdHelp")}</FieldDescription>
            </FieldLabel>
          </FieldContent>
          <Input
            id={`fa-sign-ref-${authorityId}`}
            value={refId}
            aria-invalid={idBlank || idMalformed || undefined}
            aria-describedby={idBlank || idMalformed ? `fa-sign-ref-${authorityId}-error` : undefined}
            onChange={(e) => setRefId(e.target.value)}
          />
          {idBlank || idMalformed ? (
            <FieldError id={`fa-sign-ref-${authorityId}-error`} data-testid={`fa-sign-ref-error-${authorityId}`}>
              {idBlank ? t("instructionIdRequired") : t("instructionIdMalformed")}
            </FieldError>
          ) : null}
        </Field>
      </FieldGroup>
    </FaDoorDialog>
  );
}

function RetireDialog({ clientId, authorityId, busy, act }: { clientId: string; authorityId: string; busy: boolean; act: (fn: () => Promise<void>) => Promise<boolean> }) {
  const t = useTranslations("FixedAssetsDepreciation.authority");
  const [reason, setReason] = useState("");
  // #651 fix-round 1 — ONE DECISION, ONE KEY. A second retirement refuses `authority_not_live`.
  const decision = useDepreciationDecisionKey();
  return (
    <FaDoorDialog
      triggerLabel={t("retireTrigger")}
      triggerVariant="destructive"
      title={t("retireTitle")}
      description={t("retireDescription")}
      confirmLabel={t("retireTrigger")}
      busy={busy}
      // A CLOSED DIALOG ENDS THE DECISION: the next press is a new one and mints a new key.
      onClosed={() => decision.renew()}
      confirmDisabled={!reason.trim()}
      onConfirm={() => act(async () => {
        const opKey = decision.key(authorityIntent("retire", { clientId, authorityId, value: reason.trim() }));
        await retireDepreciationAuthority(sessionTokenAccessor, { clientId, authorityId, reason: reason.trim(), opKey });
      })}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="fa-authority-retire-reason">{t("reasonLabel")}</Label>
        <Textarea id="fa-authority-retire-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
    </FaDoorDialog>
  );
}
