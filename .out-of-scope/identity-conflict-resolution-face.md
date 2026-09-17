# A client-scoped "resolution face" for counterparty identity conflicts

Clara does not offer a surface that "resolves" the conflicts `clara.get_counterparty_identity`
reports, and the retired vendor-binding ceremony is not re-opened through a client-scoped entrance.

## Why this is out of scope

The identity read (migration 0215, #647) reports two kinds of conflict: a vendor and a customer of
one client sharing a name, and two clients of one firm sharing a registration number or TIN. Its
AC4 states them and never resolves them, because both are legitimate states of the world
(CONTEXT.md, "Counterparty identity": two clients of one firm may carry the same registration number
or TIN without being linked). A face whose purpose is to make those conflicts go away would resolve
what the estate has ruled must stand.

The ambiguity that does need a person ("which party is this document about?") is handled the way
O37 of the refresh spec prescribes: the run asks for the missing fact through a Work question
rather than through a posting-rule approval. Where two records genuinely are one party, the merge
door and the identifier-correction door already exist on the client page.

The vendor-binding ceremony (`/settings/vendor-bindings`, migrations 0028 and 0154) is a retired
workflow (D6: retain historical receipts and in-flight legacy visibility only). Adding a second,
client-scoped entrance to its doors would extend a retired lane.

Decided by the owner on 2026-09-18 during the follow-up triage review.

## Prior requests

- #887: "Give the vendor-binding ambiguity (C08.3) a resolution face against current identity"
