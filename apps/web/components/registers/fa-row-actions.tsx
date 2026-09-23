"use client";

// Per-row door dialogs for the fixed-asset register: complete particulars,
// revise (prospective), dispose. Each performs EXACTLY ONE governed call via
// the caller's shared `act` (the table's own useAsyncRead) — never a
// second write mechanism (AGENTS.md hard constraint 2 / the P3 house law).

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldTitle,
} from "@/components/ui/field";
import { MoneyInput } from "@/components/common/money-input";
import { NativeSelect } from "@/components/common/native-select";
import { FaDoorDialog } from "./FaDoorDialog";
import { toDialogRefusal } from "@/components/common/dialog-refusal";
import { faRefusalControlId } from "@/lib/registers/fa-refusal-field";
import { FaParticularsFields, EMPTY_PARTICULARS, particularsReadyToSubmit } from "./fa-particulars-fields";
import { fmtCents } from "@/lib/registers/money";
import {
  completeFixedAssetParticulars, completeIntent, reviseFixedAssetParticulars, reviseIntent,
  disposeFixedAsset, disposeIntent, FA_CHANGE_CLASSES, FA_IMPLEMENTED_CHANGE_CLASSES,
} from "@/lib/registers/fixed-assets";
import { useDepreciationDecisionKey } from "@/lib/registers/depreciation";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import type { FixedAssetRow, FaParticularsInput, FaChangeClass } from "@/lib/registers/fixed-assets";
import type { AccountRow } from "@/lib/registers/accounts";

type RowActionsProps = {
  clientId: string;
  asset: FixedAssetRow;
  accounts: AccountRow[];
  busy: boolean;
  /** useAsyncRead's own `act` — resolves `true`/`false` (never rejects). Each
   *  dialog below now RETURNS that boolean: FaDoorDialog's `onConfirm` contract
   *  is `() => Promise<boolean>` and it closes only on `true` (CB-AE2E-004).
   *  The reload `act` triggers is still what re-derives the register's real
   *  state; the boolean decides only whether the dialog — and the particulars
   *  the human typed into it — survives a refusal. */
  act: (fn: () => Promise<void>) => Promise<boolean>;
  /** #639 — THE CALLER'S STANDING FAILURE, so the refusal travels INTO the dialog with the human.
   *  `useAsyncRead` keeps the raw thrown error (a `DoorRefusal` instance, not a message), which is
   *  what makes both halves of AC7 possible here: the refusal renders beside the fields it is
   *  about, and its typed `axis` names the CONTROL to focus. Optional — a caller that has no such
   *  state passes nothing and the dialog behaves exactly as before. */
  error?: unknown;
};

/** Complete once (COMPLETE-ONCE — the door's own law): pending/active rows
 *  that have never had a method set. */
export function CompleteParticularsDialog({ clientId, asset, busy, act, error }: RowActionsProps) {
  const t = useTranslations("FixedAssetsDepreciation.actions");
  const [particulars, setParticulars] = useState<FaParticularsInput>(EMPTY_PARTICULARS);
  const idPrefix = `fa-complete-${asset.id}`;
  // #978 — ONE DECISION, ONE KEY, the same house shape #651 wired onto the run/authority/revise
  // doors. A CLOSED DIALOG ENDS THE DECISION: the next press is a new completion and mints a new
  // key (`onClosed` below), same as `ReviseParticularsDialog`.
  const decision = useDepreciationDecisionKey();

  return (
    <FaDoorDialog
      triggerLabel={t("complete")}
      title={t("completeTitle")}
      description={t("completeDescription")}
      confirmLabel={t("complete")}
      busy={busy}
      refusal={toDialogRefusal(error)}
      refusalFocusId={faRefusalControlId(idPrefix, error)}
      confirmDisabled={!particularsReadyToSubmit(particulars)}
      onClosed={() => decision.renew()}
      onConfirm={() =>
        act(async () => {
          const intent = completeIntent({ clientId, assetId: asset.id, particulars });
          await completeFixedAssetParticulars(sessionTokenAccessor, {
            clientId, assetId: asset.id, particulars, opKey: decision.key(intent),
          });
        })
      }
    >
      <FaParticularsFields idPrefix={idPrefix} value={particulars} onChange={setParticulars} />
    </FaDoorDialog>
  );
}

/** Prospective revision: only offered on an active row that ALREADY has its
 *  particulars complete — seeded from the row's own current values so the
 *  human edits forward rather than re-typing everything. */
export function ReviseParticularsDialog({ clientId, asset, busy, act, error }: RowActionsProps) {
  const t = useTranslations("FixedAssetsDepreciation.actions");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  // #651 — AC1's HUMAN HALF. Every revision now names what KIND of change it is and why; the door
  // refuses CLR37 `fa_change_class_required` without it. `estimate` is the only selectable value,
  // and the other two are rendered as VISIBLY DISABLED options carrying the reason in words rather
  // than hidden — a person learns the rule instead of wondering where it went.
  const [changeClass, setChangeClass] = useState<FaChangeClass>("estimate");
  const [changeReason, setChangeReason] = useState("");
  const reasonBlank = changeReason.trim() === "";
  // #651 fix-round 1 (adversarial review ADV-651-8) — ONE DECISION, ONE KEY. A revision is a
  // supersede-forward INSERT: a retry after a lost response that minted a second key would be a
  // second revision of the same asset, not the same one. Editing any value in the form is a
  // different decision and earns a new key (`reviseIntent`).
  const decision = useDepreciationDecisionKey();
  const [particulars, setParticulars] = useState<FaParticularsInput>({
    method: (asset.method ?? "straight_line") as FaParticularsInput["method"],
    useful_life_months: asset.useful_life_months,
    rate_bps: asset.rate_bps,
    residual_cents: asset.residual_cents,
    start_date: asset.start_date ?? "",
    description: asset.description,
    ca_class: asset.ca_class,
    is_commercial_vehicle: asset.is_commercial_vehicle,
    is_new: asset.is_new,
  });

  return (
    <FaDoorDialog
      triggerLabel={t("revise")}
      title={t("reviseTitle")}
      description={t("reviseDescription")}
      confirmLabel={t("revise")}
      busy={busy}
      refusal={toDialogRefusal(error)}
      refusalFocusId={faRefusalControlId(`fa-revise-${asset.id}`, error)}
      // A CLOSED DIALOG ENDS THE DECISION: the next press is a new revision and mints a new key.
      onClosed={() => decision.renew()}
      confirmDisabled={!effectiveFrom || reasonBlank || !particularsReadyToSubmit(particulars)}
      onConfirm={() =>
        act(async () => {
          const intent = reviseIntent({
            clientId, assetId: asset.id, particulars, effectiveFrom,
            changeClass, changeReason: changeReason.trim(),
          });
          await reviseFixedAssetParticulars(sessionTokenAccessor, {
            clientId, assetId: asset.id, particulars, effectiveFrom,
            changeClass, changeReason: changeReason.trim(), opKey: decision.key(intent),
          });
        })
      }
    >
      <div className="flex flex-col gap-2">
        {/* FieldGroup / Field / FieldLabel / FieldDescription / FieldError — appendix D row 28:
            all new persistent inputs go through them, and they replace ad hoc label/error layout.
            Both values survive a refusal, because FaDoorDialog stays open on one and this state
            lives outside it. */}
        <FieldGroup>
          <Field>
            <FieldContent>
              <FieldLabel htmlFor={`fa-revise-eff-${asset.id}`}>
                <FieldTitle>{t("effectiveFromLabel")}</FieldTitle>
                <FieldDescription>{t("effectiveFromHelp")}</FieldDescription>
              </FieldLabel>
            </FieldContent>
            <Input id={`fa-revise-eff-${asset.id}`} type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </Field>

          <Field>
            <FieldContent>
              <FieldLabel htmlFor={`fa-revise-class-${asset.id}`}>
                <FieldTitle>{t("changeClassLabel")}</FieldTitle>
                <FieldDescription>{t("changeClassHelp")}</FieldDescription>
              </FieldLabel>
            </FieldContent>
            <NativeSelect
              id={`fa-revise-class-${asset.id}`}
              value={changeClass}
              onChange={(e) => setChangeClass(e.target.value as FaChangeClass)}
            >
              {FA_CHANGE_CLASSES.map((c) => (
                <option
                  key={c}
                  value={c}
                  // VISIBLY DISABLED, NOT HIDDEN. A policy change and an error correction are
                  // retrospective restatements; ticket #680 owns that lane, under #679's lock law.
                  // The door refuses both by name (CLR37 `fa_change_class_unsupported`) and that
                  // refusal still renders verbatim if this control is reached any other way.
                  disabled={!FA_IMPLEMENTED_CHANGE_CLASSES.includes(c)}
                >
                  {t(`changeClass.${c}`)}
                  {FA_IMPLEMENTED_CHANGE_CLASSES.includes(c) ? "" : ` — ${t("changeClassUnsupported")}`}
                </option>
              ))}
            </NativeSelect>
            <FieldDescription data-testid={`fa-revise-class-note-${asset.id}`}>
              {t("changeClassRestatementNote")}
            </FieldDescription>
          </Field>

          <Field data-invalid={reasonBlank ? true : undefined}>
            <FieldContent>
              <FieldLabel htmlFor={`fa-revise-reason-${asset.id}`}>
                <FieldTitle>{t("changeReasonLabel")}</FieldTitle>
                <FieldDescription>{t("changeReasonHelp")}</FieldDescription>
              </FieldLabel>
            </FieldContent>
            <Textarea
              id={`fa-revise-reason-${asset.id}`}
              value={changeReason}
              aria-invalid={reasonBlank || undefined}
              aria-describedby={reasonBlank ? `fa-revise-reason-${asset.id}-error` : undefined}
              onChange={(e) => setChangeReason(e.target.value)}
            />
            {reasonBlank ? (
              <FieldError id={`fa-revise-reason-${asset.id}-error`} data-testid={`fa-revise-reason-error-${asset.id}`}>
                {t("changeReasonRequired")}
              </FieldError>
            ) : null}
          </Field>
        </FieldGroup>
        <FaParticularsFields idPrefix={`fa-revise-${asset.id}`} value={particulars} onChange={setParticulars} />
      </div>
    </FaDoorDialog>
  );
}

/** Dispose — one un-dead draft per asset (the door's own CLR39
 *  `disposal_draft_outstanding` wall); `asset.disposal_draft_outstanding` is
 *  the register's own PROJECTION of that same predicate (`_fa_asset_json`).
 *  F7 (independent review, fix-required, 2026-08-28): the visibility note
 *  now renders on the REGISTER ROW itself (fixed-assets-register.tsx), not
 *  inside this dialog — a human deciding whether to open Dispose at all
 *  needs to see the freeze BEFORE opening it, which is the whole reason the
 *  projection exists. The trigger stays enabled either way (constraint:
 *  never pre-hide on a client-side guess — the door is still the wall). */
export function DisposeDialog({ clientId, asset, accounts, busy, act, error }: RowActionsProps) {
  const t = useTranslations("FixedAssetsDepreciation.actions");
  const [disposalDate, setDisposalDate] = useState("");
  const [proceedsCents, setProceedsCents] = useState<number | null>(null);
  const [proceedsValid, setProceedsValid] = useState(true);
  const [proceedsAccount, setProceedsAccount] = useState("");
  const [gainAccount, setGainAccount] = useState("");
  const [lossAccount, setLossAccount] = useState("");
  const [memo, setMemo] = useState("");
  const [costPortionCents, setCostPortionCents] = useState<number | null>(null);
  const [costPortionValid, setCostPortionValid] = useState(true);
  // #978 — ONE DECISION, ONE KEY. A CLOSED DIALOG ENDS THE DECISION: the next press is a new
  // disposal and mints a new key (`onClosed` below). `disposeIntent` deliberately excludes the
  // memo, so editing only the note stays the same decision, matching the door's own dedupe hash.
  const decision = useDepreciationDecisionKey();

  const assetAccounts = accounts.filter((a) => a.account_type === "asset" && a.account_class === null && a.is_active);
  const incomeAccounts = accounts.filter((a) => a.account_type === "income" && a.account_class === null && a.is_active);
  const expenseAccounts = accounts.filter((a) => a.account_type === "expense" && a.account_class === null && a.is_active);

  return (
    <FaDoorDialog
      triggerLabel={t("dispose")}
      triggerVariant="destructive"
      title={t("disposeTitle")}
      description={t("disposeDescription")}
      confirmLabel={t("dispose")}
      busy={busy}
      refusal={toDialogRefusal(error)}
      confirmDisabled={!disposalDate || !gainAccount || !lossAccount || !proceedsValid || !costPortionValid}
      onClosed={() => decision.renew()}
      onConfirm={() =>
        act(async () => {
          const intent = disposeIntent({
            clientId, assetId: asset.id, disposalDate, proceedsCents: proceedsCents ?? 0,
            proceedsAccount: proceedsAccount || null, gainAccount, lossAccount, costPortionCents,
          });
          await disposeFixedAsset(sessionTokenAccessor, {
            clientId,
            assetId: asset.id,
            disposalDate,
            proceedsCents: proceedsCents ?? 0,
            proceedsAccount: proceedsAccount || null,
            gainAccount,
            lossAccount,
            memo: memo || null,
            costPortionCents,
            opKey: decision.key(intent),
          });
        })
      }
    >
      <div className="flex flex-col gap-2">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor={`fa-disp-date-${asset.id}`}>{t("disposalDateLabel")}</Label>
            <Input id={`fa-disp-date-${asset.id}`} type="date" value={disposalDate} onChange={(e) => setDisposalDate(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`fa-disp-proceeds-${asset.id}`}>{t("proceedsCentsLabel")}</Label>
            <MoneyInput
              id={`fa-disp-proceeds-${asset.id}`}
              mode="signed"
              cents={proceedsCents}
              onValueChange={(change) => {
                setProceedsValid(change.ok);
                if (change.ok) setProceedsCents(change.cents);
              }}
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`fa-disp-proc-acct-${asset.id}`}>{t("proceedsAccountLabel")}</Label>
          <NativeSelect id={`fa-disp-proc-acct-${asset.id}`} value={proceedsAccount} onChange={(e) => setProceedsAccount(e.target.value)}>
            <option value="">—</option>
            {assetAccounts.map((a) => (
              <option key={a.account_code} value={a.account_code}>{a.account_code} — {a.name}</option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor={`fa-disp-gain-${asset.id}`}>{t("gainAccountLabel")}</Label>
            <NativeSelect id={`fa-disp-gain-${asset.id}`} value={gainAccount} onChange={(e) => setGainAccount(e.target.value)}>
              <option value="">—</option>
              {incomeAccounts.map((a) => (
                <option key={a.account_code} value={a.account_code}>{a.account_code} — {a.name}</option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`fa-disp-loss-${asset.id}`}>{t("lossAccountLabel")}</Label>
            <NativeSelect id={`fa-disp-loss-${asset.id}`} value={lossAccount} onChange={(e) => setLossAccount(e.target.value)}>
              <option value="">—</option>
              {expenseAccounts.map((a) => (
                <option key={a.account_code} value={a.account_code}>{a.account_code} — {a.name}</option>
              ))}
            </NativeSelect>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`fa-disp-memo-${asset.id}`}>{t("memoLabel")}</Label>
          <Input id={`fa-disp-memo-${asset.id}`} value={memo} onChange={(e) => setMemo(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`fa-disp-portion-${asset.id}`}>{t("costPortionLabel")}</Label>
          <MoneyInput
            id={`fa-disp-portion-${asset.id}`}
            mode="signed"
            cents={costPortionCents}
            onValueChange={(change) => {
              setCostPortionValid(change.ok);
              if (change.ok) setCostPortionCents(change.cents);
            }}
          />
          <p className="text-xs text-muted-foreground">{t("costPortionHint")}</p>
        </div>
        {proceedsCents !== null && (
          <p className="text-xs text-muted-foreground">{fmtCents(proceedsCents)}</p>
        )}
      </div>
    </FaDoorDialog>
  );
}
