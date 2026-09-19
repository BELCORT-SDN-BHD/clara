"use client";

// #659 / #899 (D18.c) — `AddClientControl`, EXTRACTED from `client-register-list.tsx` so the ONE
// client-creation control in this product can be mounted at both places a person reaches for it:
// the register at `/clients`, and Firm Home at `/`, which is the page a firm with zero clients
// actually lands on. Exactly one creation control exists in the product; never a second.
//
// THE MOVE CHANGES NOTHING ABOUT WHAT IT DOES. The two headers below are #649's and H-51's own
// reasoning and they travel WITH the code they describe — they are #649's AC1 evidence, not
// decoration.
//
// WHERE THE CELLS FOR THIS CONTROL LIVE, stated as it actually is (fix round 1, finding A8 — this
// paragraph previously claimed a repoint that never happened, which is the same class of stale
// claim `app/(firm)/page.tsx`'s own header forbids). `add-client-control.test.tsx` and
// `add-client-candidates.test.tsx` both still mount `ClientRegisterList`, deliberately: they are
// #649's AC1 evidence AT ITS OWN SURFACE, and repointing them at this module would have moved that
// evidence off the register page it was written to defend. What the extraction added is a NEW
// property — this control now mounts BESIDE a state machine on a page that re-reads itself on four
// triggers — and that property is proven where it is observable: by the non-remount cell in
// `add-client-control.test.tsx` and by `apps/web/e2e/home-board-walk.spec.ts`'s
// `p659.home.zero_client_create`. The residual is honest and named: no cell imports this module by
// its own path, so a rename would be caught by the type-checker rather than by a red cell.
//
// WHERE IT IS MOUNTED, AND WHY THAT IS A RULE RATHER THAN A PREFERENCE (appendix C §3, "Draft
// across local view changes"). This control's whole draft — the typed name, the identity
// candidates, the arity-1 acknowledgement, the standing refusal — is memory-only React state, kept
// deliberately across a failed confirm. Firm Home re-reads on FOUR triggers (focus,
// visibilitychange, a 30 s while-visible tick, and CLIENT_RECORD_CHANGED), so a control hung off
// the zero-client `Empty` BRANCH would be unmounted and silently emptied by the first re-read that
// returns a row — mid-edit, with no warning. Both call sites therefore mount it BESIDE the state
// machine, never inside it; only its COPY changes with the empty state.

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import { OnboardingDoorDialog } from "@/components/clara/OnboardingDoorDialog";
import { StateBanner } from "@/components/common/state";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { findDoAction, isDoActionPermitted, type DoActionEnv } from "@/lib/command/do-actions";
import { loadDoEnv, runDoAction } from "@/lib/command/do-dispatch";
import { isDoorRefusal } from "@/lib/doors";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { meetsFloor } from "@/lib/identity/caller-context";
import {
  arityFromRefusal,
  candidatesFromRefusal,
  isNameFamilyCollision,
  readClientIdentityCandidates,
  type ClientIdentityCandidate,
} from "@/lib/onboarding/identity";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { ClientIdentityCandidateList } from "./client-identity-candidates";


/**
 * ============================================================================
 * H-51 / CB-AE2E-024 — "Add client" ON THE REGISTER.
 * ============================================================================
 *
 * WHAT WAS MISSING. `/clients` is the page a person goes to when they want to add a client,
 * and it was the one surface with no affordance for it: the page renders a header and this
 * read-only table, and neither file imported a door. Two entry points DID exist — ⌘K's "Do"
 * row, and the firm-altitude Clara rail's own Begin card — but both are somewhere else.
 *
 * IT REUSES THE FLOW, IT DOES NOT MINT A THIRD ONE. The dispatch is ⌘K's own:
 * `loadDoEnv` reads what the DATABASE says this caller may do, `isDoActionPermitted` is the
 * SAME predicate the palette filters with (never a copy of it — 裁-107a), and `runDoAction`
 * performs the one governed call and reports where to look. So this inherits 裁-141's
 * pre-filter, the fail-closed-twice discipline, and `do-action-floors.test.ts`'s drift guard
 * for free, and adds no new call site for `begin_client_onboarding`.
 *
 * THE TWO GATES ARE DIFFERENT QUESTIONS, and each is asked of the right thing. The TRIGGER
 * asks "could this caller ever dispatch this?" — `meetsFloor` against the action's own
 * transcribed floor, which is the first conjunct of `isDoActionPermitted` called from the same
 * module, not a re-derivation of it. The CONFIRM asks the full question, name included, and
 * `runDoAction` asks it a third time before touching the door. The DATABASE is still the wall
 * behind all three: `begin_client_onboarding` is `security definer` with its own admin
 * `_human_ctx` floor and raises CLR04 for a caller under it, rendered here VERBATIM.
 */
/**
 * ============================================================================
 * #649 AC1 — THE IDENTITY CHECK, BEFORE THE RECORD.
 * ============================================================================
 *
 * ONE MORE ASK, ON THE SAME CLICK. Confirm now asks `clara.client_identity_candidates` before it
 * dispatches the birth door, and what comes back decides what happens next — the three arities the
 * owner ruled on 2026-09-15:
 *
 *   0       nothing in this firm answers to that name. The SAME click goes straight on to the
 *           door; a person who is not creating a duplicate is not interrupted.
 *   1       the door RETURNS the candidate and does not refuse — the estate's own predicate is
 *           `count(*) > 1` (0103:781-783), so one same-family party has never been "ambiguous"
 *           anywhere in this estate. The face shows it, with a real link, and Confirm re-enables
 *           only once the human ticks "this is a different business". That acknowledgement is the
 *           ONLY wall at arity 1, and this comment is where that is written down.
 *   >= 2    the DATABASE refuses, CLR10 `name_family_collision`, and the refusal is rendered
 *           VERBATIM with its code beside the same list — which the refusal itself carried, so the
 *           face never issues a second read of the fact it is reporting.
 *
 * THE TYPED NAME STAYS, always. Every arm above returns `false` from `onConfirm`, which is what
 * keeps `OnboardingDoorDialog` open (CB-AE2E-004) with the human's input intact.
 *
 * EDITING THE NAME RETIRES THE CHECK, never the input: `checkedFor` remembers WHICH name the
 * candidates answer for, so a changed name clears the candidates, the acknowledgement and the
 * refusal — a tick that stood for a different name would be an acknowledgement of nothing.
 */
export function AddClientControl({ onCreated }: { onCreated: () => void }) {
  const t = useTranslations("ClientsRegister");
  const tid = useTranslations("ClientIdentity");
  const router = useRouter();
  const nameFieldId = useId();
  const ackFieldId = useId();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<{ message: string; code: string | null } | null>(null);
  // The identity answer, and the NAME it answers for. `null` means "not asked yet for this name".
  const [checkedFor, setCheckedFor] = useState<string | null>(null);
  // WHAT THE READ DID, kept SEPARATELY from what it found -- because "the database answered
  // nothing" and "the read never ran" are different facts and only one of them is evidence.
  // Collapsing them (arity 0 for both) renders "Nothing in this firm answers to that name" for a
  // read that FAILED: absence of evidence sold as evidence of absence, which is the exact
  // inversion this file's own law forbids.
  const [checkOutcome, setCheckOutcome] = useState<"answered" | "walled" | "unavailable" | null>(null);
  const [candidates, setCandidates] = useState<ClientIdentityCandidate[]>([]);
  const [arity, setArity] = useState(0);
  const [acknowledged, setAcknowledged] = useState(false);
  // ONE READ, on mount — the same shape the palette makes on every open. A FAILED read yields
  // no env at all, which renders the honest "we could not find out" line rather than an
  // absence that would read as "your role grants nothing".
  const env = useAsyncRead(() => loadDoEnv(sessionTokenAccessor, null));

  const spec = findDoAction("beginClientOnboarding");
  if (spec === null) return null;

  if (env.loading) return null;
  if (env.error || env.data === null) {
    return <p className="text-xs text-warning">{t("addClientAuthorityUnreadable")}</p>;
  }
  if (!meetsFloor(env.data.ctx, spec.floor)) return null;

  const doEnv: DoActionEnv = { ...env.data, query: name };
  const typed = name.trim();
  // The candidates on screen answer for `checkedFor`. Anything else and they are stale by
  // construction, so nothing about them may gate this Confirm.
  const checkStands = checkedFor !== null && checkedFor === typed;
  const answered = checkStands && checkOutcome === "answered";
  const acknowledgementOwed = answered && arity === 1 && !acknowledged;
  const walled = checkStands && checkOutcome === "walled";
  // UNREACHABLE THROUGH THE LIVE DOOR, AND SAID ANYWAY (review round 2). `walled` and
  // `acknowledgementOwed` describe HOW the read answered, and neither of them describes an
  // ambiguity the read ANSWERED rather than refused — 0219 raises at arity >= 2 and never returns
  // it as a success. `onConfirm`'s own `arity >= 2` belt already keeps the door unreached, so what
  // this adds is the button telling the truth instead of looking live and doing nothing.
  const ambiguousAnswer = answered && arity >= 2;

  /** The identity read, and the three answers it can give. Returns `true` when the caller may go
   *  on to the door on THIS click. Never throws: every failure is a face, not an exception. */
  const runIdentityCheck = async (): Promise<boolean> => {
    try {
      const answer = await readClientIdentityCandidates(typed, { session: sessionTokenAccessor });
      setCheckedFor(typed);
      setCheckOutcome("answered");
      setCandidates(answer.candidates);
      setArity(answer.arity);
      setAcknowledged(false);
      return answer.arity === 0;
    } catch (err) {
      setCheckedFor(typed);
      setAcknowledged(false);
      if (isNameFamilyCollision(err)) {
        // THE WALL. The refusal carried the rows, so the list beside it is the DATABASE's own —
        // never a second read of the fact being reported.
        const rows = candidatesFromRefusal(err);
        setCheckOutcome("walled");
        setCandidates(rows);
        // THE DATABASE'S OWN ARITY (0219 carries it in the refusal detail), never `rows.length`:
        // a row this browser could not parse must not silently lower the number the human is told
        // about, which is the law `lib/onboarding/identity.ts` already states for the SUCCESS
        // path. The fallbacks run in that order -- the count second, the token's own floor (this
        // wall raises at two or more, never at one) last.
        setArity(arityFromRefusal(err) ?? (rows.length || 2));
        setRefusal({ message: (err as Error).message, code: isDoorRefusal(err) ? err.code : null });
        return false;
      }
      // Any other failure of the CHECK is reported as itself and blocks nothing beyond this
      // click: a read that could not run is not evidence that the name is free, and it is not
      // evidence that it is taken either. `checkOutcome` says which of the two happened, so no
      // arm below can mistake this for an answer of "nothing".
      setCheckOutcome("unavailable");
      setCandidates([]);
      setArity(0);
      if (isDoorRefusal(err)) setRefusal({ message: err.message, code: err.code });
      else setRefusal({ message: err instanceof Error ? err.message : String(err), code: null });
      return false;
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {refusal ? (
        <StateBanner tone="error" code={refusal.code ?? undefined}>{refusal.message}</StateBanner>
      ) : null}
      <OnboardingDoorDialog
        triggerLabel={t("addClientTrigger")}
        triggerVariant="default"
        title={t("addClientTitle")}
        description={t("addClientDescription")}
        confirmLabel={t("addClientConfirm")}
        busy={busy}
        confirmDisabled={!isDoActionPermitted(spec, doEnv) || acknowledgementOwed || walled || ambiguousAnswer}
        // EVERY FAILURE TRAVELS INTO THE DIALOG, through the wrapper's own slot. The page banner
        // below sits BEHIND the modal backdrop while this dialog stands (OnboardingDoorDialog's
        // own header says exactly that), so a refusal rendered only there is a refusal the human
        // cannot read -- and this surface has three kinds: the >= 2 wall, a check that could not
        // run at all, and the birth door's own. The slot also takes focus when it appears, which
        // the hand-rolled in-dialog banner this replaces never did.
        refusal={refusal ? { err: refusal.message, clr: refusal.code ? { code: refusal.code, reason: null } : null } : undefined}
        // CB-AE2E-004 (#549): resolves the OUTCOME. This dialog keeps its OWN `refusal`
        // state rather than a hydrated part's, so it reports success itself, and
        // OnboardingDoorDialog closes only on an explicit `true` — the not-permitted arm and
        // every caught refusal keep the dialog open with the typed name standing.
        onConfirm={async (): Promise<boolean> => {
          setBusy(true);
          setRefusal(null);
          try {
            // #649 AC1 — ASK THE DATABASE FIRST, once per typed name. A name already checked and
            // acknowledged does not pay for a second read; a changed name always does.
            if (!checkStands) {
              const clear = await runIdentityCheck();
              if (!clear) return false;
            } else if (arity >= 2) {
              return false;              // unreachable while Confirm is disabled; a belt, labelled.
            } else if (arity === 1 && !acknowledged) {
              return false;              // same.
            }
            const result = await runDoAction(spec, doEnv, sessionTokenAccessor);
            if (result.kind === "refused") {
              // `runDoAction` re-evaluates `isDoActionPermitted` against the same env before it
              // touches the door (裁-107a's third check). Returning silently made that
              // indistinguishable from a click that did nothing, on a governed act — so it says
              // so, and says the door was never called, which is the part that matters.
              //
              // BELT, AND LABELLED AS ONE — no cell, and the reason is measurable rather than
              // lazy. This Confirm is `disabled` on exactly `!isDoActionPermitted(spec, doEnv)`,
              // `clickButton` refuses a disabled node, and `doEnv` cannot change between the
              // click and the re-check (it is rebuilt per render from the same `env.data` and
              // the same typed `name`). So a `refused` result is unreachable from THIS surface
              // today, and the fold round's mutant panel measured that: deleting this line
              // leaves every cell green. It stays because the predicate is deliberately asked
              // three times and the third answer must never be swallowed — the day an env can
              // change under an open dialog, this is the arm that speaks.
              setRefusal({ message: t("addClientNotPermitted"), code: null });
              return false;
            }
            setName("");
            setCheckedFor(null);
            setCheckOutcome(null);
            setCandidates([]);
            setArity(0);
            setAcknowledged(false);
            // Hydrate-never-trust: the register RE-READS rather than splicing in a row built
            // from the door's own reply. The navigation is to the id the DATABASE returned.
            onCreated();
            if (result.kind === "navigated") router.push(result.href);
            return true;
          } catch (err) {
            // A DoorRefusal renders VERBATIM and is never retried.
            if (isDoorRefusal(err)) setRefusal({ message: err.message, code: err.code });
            else setRefusal({ message: err instanceof Error ? err.message : String(err), code: null });
            return false;
          } finally {
            setBusy(false);
          }
        }}
      >
        {/* AC6 — the name is a FIELD now (appendix D #28: every new persistent input goes
            through FieldGroup/Field with description and message slots), not a bare Input with
            an aria-label. `aria-label` is KEPT on the control as well, because
            `add-client-control.test.tsx` addresses it by that name and a visible label is not a
            reason to drop the accessible one it already had. */}
        <FieldGroup>
          <Field data-invalid={walled ? "true" : undefined}>
            <FieldLabel htmlFor={nameFieldId}>{t("addClientNameLabel")}</FieldLabel>
            <Input
              id={nameFieldId}
              aria-label={t("addClientNameLabel")}
              aria-invalid={walled ? true : undefined}
              placeholder={t("addClientNamePlaceholder")}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                // A CHECK BELONGS TO A NAME. Changing the name retires the candidates, the
                // acknowledgement and the refusal — never the typed text.
                setCheckedFor(null);
                setCheckOutcome(null);
                setCandidates([]);
                setArity(0);
                setAcknowledged(false);
                setRefusal(null);
              }}
            />
            <FieldDescription>{tid("nameFieldDescription")}</FieldDescription>
            {walled ? <FieldError>{tid("walledFieldError")}</FieldError> : null}
          </Field>
        </FieldGroup>

        {/* THE CANDIDATE FACE. Present at arity 1 (shown, acknowledged here) and at arity >= 2
            (shown beside the database's own verbatim refusal, which travels into this dialog
            through OnboardingDoorDialog's `refusal` slot and this page's banner). */}
        {checkStands && candidates.length > 0 ? (
          <ClientIdentityCandidateList arity={arity} candidates={candidates} />
        ) : null}

        {/* ARITY 1 — the only wall here, and it is the human's own act (appendix D #16:
            Checkbox for an explicit acknowledgement, inside a FieldSet). No shadcn Checkbox is
            installed in this project (appendix D lists it as "None"), so this is the native
            control the rest of the estate already uses for acknowledgements
            (components/bank/matching-section.tsx:201 is the same shape). */}
        {answered && arity === 1 ? (
          <FieldSet>
            <Field orientation="horizontal" data-invalid={acknowledgementOwed ? "true" : undefined}>
              <input
                id={ackFieldId}
                type="checkbox"
                aria-label={tid("acknowledgeLabel")}
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
              />
              <FieldLabel htmlFor={ackFieldId}>{tid("acknowledgeLabel")}</FieldLabel>
            </Field>
            <FieldDescription>{tid("acknowledgeDescription")}</FieldDescription>
          </FieldSet>
        ) : null}

        {/* ONLY WHEN THE DATABASE ACTUALLY ANSWERED. This line states a FACT about the firm's
            books, and a read that never ran knows no facts -- so it is gated on the OUTCOME, not
            on an arity that reads 0 for both "nothing matched" and "the read failed". */}
        {answered && arity === 0 ? (
          <p className="text-xs text-muted-foreground">{tid("noCandidates")}</p>
        ) : null}
      </OnboardingDoorDialog>
    </div>
  );
}
