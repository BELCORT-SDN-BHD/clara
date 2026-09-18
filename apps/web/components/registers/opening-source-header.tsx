"use client";

// #656 — WHERE THIS OPENING BASIS CAME FROM, said on the basis itself.
//
// One line beside the state badge. Before this ticket the workbench named the basis's STATE and
// nothing about its SOURCE, so an admin asked to approve an opening position could not tell —
// without opening the targets — whether the figures had been read off a document the firm holds
// or typed by a colleague. Those are different kinds of evidence and the approval ceremony treats
// them differently (`record_opening_target` refuses outright on a tied basis; the parsed writer is
// `clara_runtime`'s alone), so the face should say which one it is standing on.
//
// IT MINTS NOTHING. The sha and the document binding come off the seed row; the provenance count
// is a count of rows the database returned. There is no arithmetic and no inference here: a basis
// that carries a tie document says so, one that does not says THAT, and the word for a basis with
// no targets yet is "nothing read yet" rather than a reassuring silence.

import { useTranslations } from "next-intl";
import { shaShort } from "@/lib/registers/opening-source";
import type { OpeningSeedRow, OpeningTbTargetRow } from "@/lib/registers/opening-types";

export function OpeningSourceHeader({
  seed,
  targets,
}: {
  seed: OpeningSeedRow;
  targets: readonly OpeningTbTargetRow[];
}) {
  const t = useTranslations("OpeningCarryDown.source");

  if (seed.tie_document_id) {
    const read = targets.filter((x) => x.provenance_kind === "document").length;
    return (
      <p className="text-xs text-muted-foreground" data-testid="opening-source-header">
        {read > 0
          ? t("headerDocumentRead", { sha: shaShort(seed.tie_document_sha256), n: read })
          : t("headerDocumentUnread", { sha: shaShort(seed.tie_document_sha256) })}
      </p>
    );
  }

  const keyed = targets.filter((x) => x.provenance_kind === "keyed").length;
  return (
    <p className="text-xs text-muted-foreground" data-testid="opening-source-header">
      {keyed > 0 ? t("headerKeyed", { n: keyed }) : t("headerKeyedEmpty")}
    </p>
  );
}
