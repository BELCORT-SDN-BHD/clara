"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import { businessDate, businessDateTime } from "@/lib/business-date";
import {
  acceptLegalDocument as defaultAcceptLegalDocument,
  type AcceptLegalDocument,
  type AcceptLegalDocumentOutcome,
} from "@/lib/registration/legal-doors";
import {
  allLegalAccepted,
  LEGAL_KINDS,
  type LegalDocumentFace,
  type LegalKind,
  type LegalStageState,
} from "@/lib/registration/legal-reads";
import { newOpKey } from "@/lib/registration/op-key";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldTitle } from "@/components/ui/field";
import { NotBuiltNote } from "@/components/common/not-built-note";
import { StateBanner } from "@/components/common/state";

/**
 * SIGNUP'S LEGAL STAGE — the step between an open firm registration and
 * checkout. It replaces the single-document DPA e-sign, and the replacement is
 * the point rather than a refactor: `dpa_documents` had no `kind` column, so
 * the old step could present exactly one agreement and its own copy had to
 * admit in print that Clara's terms of service existed, was not covered by the
 * signature, and would be asked for "before launch". Migration 0185 gives the
 * estate two kinds, a publication status and a per-caller acceptance, so both
 * agreements are now presented and accepted SEPARATELY — one acceptance each,
 * recorded by `accept_legal_document`, never one signature standing in for two
 * documents.
 *
 * WHAT THIS COMPONENT IS NOT ALLOWED TO DO, and each of these is a real defect
 * class this journey has already paid for once:
 *
 *  · IT NEVER PRESENTS UNPUBLISHED TEXT AS FINAL. A `draft` document is
 *    rendered as a LABELLED PREVIEW inside the estate's one "named, not
 *    delivered" signal, with NO acceptance control at all — the door would
 *    refuse it (`CLR09` / `not_published`), and a control that invited someone
 *    to accept an unfinished agreement would be a worse failure than the
 *    refusal it earns.
 *  · IT NEVER REMEMBERS A STAGE IN THE BROWSER. Which agreements are accepted
 *    is re-derived on EVERY load from the server read (`legal-server-reads.ts`,
 *    `allLegalAccepted`). The only client-held facts are the receipts THIS
 *    MOUNT got back from the door, each pinned to the exact (kind, version) it
 *    was returned for — and a successful acceptance also asks the router to
 *    re-read, so the authoritative answer converges immediately rather than at
 *    the next manual reload.
 *  · IT NEVER RECORDS THE SAME ACCEPTANCE TWICE. The op key is minted once per
 *    (kind, version) and reused by every retry of that attempt, so a lost
 *    response resubmitted lands on the door's own `already_accepted` replay —
 *    which the card says out loud rather than painting a second receipt.
 *  · IT NEVER SENDS A HASH IT COMPUTED. `bodySha256` travels verbatim from the
 *    bytes this render shows, which is what makes the door's `hash_mismatch`
 *    refusal mean anything at all.
 *
 * THE CONTINUE CONTROL IS A REAL FORM POST, not a link: `/checkout` is
 * POST-only by design (a GET there could be run by a prefetch or a pasted link,
 * and it opens a Stripe Session and spends a rate-wall attempt). It renders
 * ONLY when every kind is accepted; short of that the person reads a plain
 * sentence saying what is still outstanding, never a disabled-looking button.
 */

type Receipt = {
  readonly version: number;
  readonly acceptedAt: string;
  readonly replay: boolean;
};

/** What a card is currently saying back, beyond its server-derived face. */
type CardOutcome = Extract<AcceptLegalDocumentOutcome, { kind: "refused" } | { kind: "unavailable" }>;

export function SignupLegalStage({
  state,
  accept = defaultAcceptLegalDocument,
}: {
  state: LegalStageState;
  accept?: AcceptLegalDocument;
}) {
  const t = useTranslations("Signup");
  // The agreements' NAMES live in `Common`, once, because `/pending`'s checkout
  // refusal card has to name the same two documents (7.3 — one source of
  // truth for a value that appears in more than one place).
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const [receipts, setReceipts] = useState<Partial<Record<LegalKind, Receipt>>>({});
  const [outcomes, setOutcomes] = useState<Partial<Record<LegalKind, CardOutcome>>>({});
  const [pending, setPending] = useState<LegalKind | null>(null);
  // ONE KEY PER (kind, version) ATTEMPT, held for the life of the mount. A
  // retry after an "unavailable" answer is the SAME attempt and must carry the
  // SAME key; a document that moved to a new version is a NEW attempt and gets
  // a fresh one. (`signup-firm-form.tsx` and the retired DPA step used the same
  // idiom for the same reason — see `lib/registration/op-key.ts`.)
  const opKeys = useRef(new Map<string, string>());
  const opKeyFor = useCallback((kind: LegalKind, version: number): string => {
    const slot = `${kind}:${version}`;
    const held = opKeys.current.get(slot);
    if (held !== undefined) return held;
    const minted = newOpKey();
    opKeys.current.set(slot, minted);
    return minted;
  }, []);

  const kindName = useCallback(
    (kind: LegalKind): string =>
      kind === "terms" ? tCommon("legalKindTerms") : tCommon("legalKindDpa"),
    [tCommon],
  );

  async function handleAccept(doc: Extract<LegalDocumentFace, { face: "acceptable" }>) {
    setPending(doc.kind);
    setOutcomes((current) => ({ ...current, [doc.kind]: undefined }));
    const answer = await accept({
      documentKind: doc.kind,
      version: doc.version,
      bodySha256: doc.bodySha256,
      opKey: opKeyFor(doc.kind, doc.version),
    });
    setPending(null);
    if (answer.kind === "accepted") {
      setReceipts((current) => ({
        ...current,
        [doc.kind]: { version: answer.version, acceptedAt: answer.acceptedAt, replay: answer.replay },
      }));
      // HYDRATE-NEVER-TRUST (`lib/doors.ts`): the door reported what it did;
      // the authoritative state is re-read rather than assumed. The receipt
      // above is what the person sees immediately; this is what makes the
      // server's own answer the one the continue control is derived from.
      router.refresh();
      return;
    }
    if (answer.kind === "refused" && answer.stale) {
      // The version on screen is no longer the current one. Re-read so the card
      // below shows what the DB actually holds; the persistent Alert stays up
      // so the person is told WHY the text under them changed.
      router.refresh();
    }
    setOutcomes((current) => ({ ...current, [doc.kind]: answer }));
  }

  if (state.kind === "unavailable") {
    return (
      <Card>
        <CardHeader>
          <h1 className="text-base font-semibold">{t("legalStageTitle")}</h1>
          <CardDescription>{t("legalStageDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <StateBanner tone="error" title={t("legalUnavailableTitle")}>
            {t("legalUnavailableDescription")}
          </StateBanner>
          <Link href="/pending" className="text-sm text-primary underline">
            {t("legalBackToStatus")}
          </Link>
        </CardContent>
      </Card>
    );
  }

  /** A card counts as accepted when the SERVER said so, or when this mount
   *  holds the door's own receipt for the exact version on screen. Nothing
   *  else — no storage, no "we clicked it earlier". */
  const acceptedNow = (doc: LegalDocumentFace): boolean => {
    if (doc.face === "accepted") return true;
    if (doc.face === "absent") return false;
    const receipt = receipts[doc.kind];
    return receipt !== undefined && receipt.version === doc.version;
  };

  const everyKindAccepted =
    allLegalAccepted(state) ||
    LEGAL_KINDS.every((kind) => {
      const doc = state.documents.find((candidate) => candidate.kind === kind);
      return doc !== undefined && acceptedNow(doc);
    });

  return (
    <div className="flex w-full flex-col gap-4">
      <Card>
        <CardHeader>
          <h1 className="text-base font-semibold">{t("legalStageTitle")}</h1>
          <CardDescription>{t("legalStageDescription")}</CardDescription>
        </CardHeader>
      </Card>

      {state.documents.map((doc) => {
        const outcome = outcomes[doc.kind];
        const receipt = doc.face === "absent" ? undefined : receipts[doc.kind];
        const accepted = acceptedNow(doc);
        const acceptedAt =
          doc.face === "accepted" ? doc.acceptedAt : (receipt?.acceptedAt ?? null);
        return (
          <Card key={doc.kind}>
            <CardHeader>
              <h2 className="text-base font-semibold">
                {doc.face === "absent" ? kindName(doc.kind) : doc.title}
              </h2>
              <CardDescription>
                {doc.face === "absent"
                  ? t("legalAbsentTitle", { name: kindName(doc.kind) })
                  : doc.effectiveFrom === null
                    ? t("legalVersionLine", { version: doc.version })
                    : t("legalVersionLineDated", {
                        version: doc.version,
                        date: businessDate(new Date(doc.effectiveFrom)),
                      })}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {doc.face === "absent" ? (
                <NotBuiltNote>
                  <p>{t("legalAbsentDescription", { name: kindName(doc.kind) })}</p>
                </NotBuiltNote>
              ) : (
                <>
                  {doc.face === "draft" && (
                    <NotBuiltNote>
                      <p className="font-medium">{t("legalDraftTitle")}</p>
                      <p>{t("legalDraftDescription", { name: kindName(doc.kind) })}</p>
                    </NotBuiltNote>
                  )}
                  {doc.face === "superseded" && (
                    <StateBanner tone="neutral" title={t("legalSupersededTitle")}>
                      {t("legalSupersededDescription", { name: kindName(doc.kind) })}
                    </StateBanner>
                  )}
                  {/* THE TEXT ITSELF — a labelled, keyboard-scrollable region, so a
                      long agreement never pushes the acceptance control off the
                      screen and a screen-reader user can reach it by name. A draft
                      is labelled as a preview IN THE REGION'S OWN NAME, so the
                      "not final" fact reaches somebody who never sees the note. */}
                  <div
                    role="region"
                    aria-label={
                      doc.face === "draft"
                        ? t("legalDraftBodyLabel", { title: doc.title })
                        : t("legalBodyLabel", { title: doc.title })
                    }
                    tabIndex={0}
                    className="max-h-64 max-w-prose overflow-y-auto rounded-lg border border-border bg-muted/30 p-3 text-sm whitespace-pre-wrap"
                  >
                    {doc.body}
                  </div>

                  {outcome?.kind === "unavailable" && (
                    <StateBanner tone="error">{t("legalAcceptUnavailable")}</StateBanner>
                  )}
                  {outcome?.kind === "refused" && (
                    <StateBanner
                      tone="error"
                      title={outcome.stale ? t("legalStaleTitle") : undefined}
                      code={outcome.code}
                    >
                      {/* The DB's own sentence, verbatim — never re-worded. */}
                      {outcome.message}
                    </StateBanner>
                  )}

                  {accepted && acceptedAt !== null ? (
                    <StateBanner tone="info">
                      {t("legalAcceptedOn", {
                        when: businessDateTime(acceptedAt),
                        version: doc.version,
                      })}
                      {receipt?.replay === true ? ` ${t("legalAlreadyAccepted")}` : ""}
                    </StateBanner>
                  ) : doc.face === "acceptable" ? (
                    <Field>
                      <FieldContent>
                        <FieldTitle>{t("legalAcceptTitle", { name: kindName(doc.kind) })}</FieldTitle>
                        <FieldDescription>{t("legalAcceptDescription")}</FieldDescription>
                      </FieldContent>
                      <Button
                        type="button"
                        className="w-full"
                        disabled={pending === doc.kind}
                        onClick={() => void handleAccept(doc)}
                      >
                        {pending === doc.kind
                          ? t("legalAccepting")
                          : t("legalAccept", { name: kindName(doc.kind) })}
                      </Button>
                    </Field>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardContent className="flex flex-col gap-4">
          {everyKindAccepted ? (
            <form method="post" action="/checkout">
              <Button type="submit" className="w-full">
                {t("legalContinueToCheckout")}
              </Button>
            </form>
          ) : (
            <StateBanner tone="neutral">{t("legalContinueBlocked")}</StateBanner>
          )}
          <Link href="/pending" className="text-sm text-primary underline">
            {t("legalBackToStatus")}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
