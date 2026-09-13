-- 0187_legal_v1_beta_publication — #621 / #628 (parent spec #612 §8; journeys A1/A2):
-- PUBLISH THE BETA v1 LEGAL TEXTS AT THE OWNER'S RECORDED DECISION, SO HOSTED ADMISSION CAN RUN.
-- =====================================================================================
-- WHAT 0185 LEFT, ON PURPOSE. 0185 generalised legal content into `clara.legal_documents` (kind
-- terms|dpa, integer version, status draft|published|superseded, a DB-recomputed body digest, ONE
-- published row per kind) and made three things true at once: the 0158 placeholder DPA became a
-- DRAFT and therefore unacceptable, no `terms` text existed at all, and `clara.open_checkout_intent`
-- / `clara.claim_paid_firm` refuse `legal_not_accepted` until BOTH kinds are accepted at their
-- current PUBLISHED versions. That is #621's AC4 honoured to the letter: the repository seeds no
-- legal wording, and reviewed wording is an explicit external release input.
--
-- THE CONSEQUENCE ON THE HOSTED ESTATE, measured 2026-09-13 after 0185/0186 landed (frontier
-- 181/0186): `/signup`'s legal stage shows both agreements as "not final" and cannot continue, so
-- no applicant can reach checkout and #628's hosted admission journey (A1) cannot be walked.
--
-- THE OWNER'S DECISION (recorded on issue #621, 2026-09-13, after the alternatives were put to
-- them): publish the BETA TEMPLATES as version 1 of each kind — the DPA text 0158 seeded, and a
-- one-sentence Terms text written in the same words — so that admission can run in test mode while
-- the lawyer-reviewed wording is prepared. Both bodies state on their face that they are pending
-- the owner's lawyer's review. This file does not pretend otherwise: an acceptance of a v1 text is
-- an acceptance of the beta template, and the reviewed wording publishes later as version 2 through
-- `clara.publish_legal_document`, superseding these rows exactly as 0185 designed. Nothing here
-- weakens that door or the acceptance mechanism; nothing here is a function-body change.
--
-- WHAT THIS FILE DOES — DATA ONLY, TWO ROWS, NO FUNCTION TOUCHED (so it rides no
-- writer-quiescence window and can be applied with the runtime machine running):
--   1. dpa: the version-1 DRAFT whose bytes are the 0158 placeholder (identified by its digest,
--      recomputed here from the exact text, never a literal) becomes `published`, `published_at`
--      stamped, `published_by` NULL — no human session stamped it; the decision is this file.
--      0185's transition trigger admits exactly this move (draft -> published with the stamp) and
--      refuses any rewrite of the text or identity, so the accepted bytes are the 0158 bytes.
--   2. terms: version 1 inserted directly as `published` with the beta sentence, a title, a source
--      path in the same folder 0158 named for the DPA, and an effective_from of the decision date.
--
-- IDEMPOTENCE AND OTHER CHAINS. ONE RULE FOR BOTH KINDS: the beta template is published only
-- where NOTHING of that kind is published yet. A chain where a reviewed DPA was already published
-- before 0185 (0185 carries such a row over as `published`) keeps that row and leaves the
-- placeholder draft as the draft it is; a chain where terms were already published through the
-- door keeps them, and the beta terms row is not inserted at all. Where terms rows exist but none
-- is published, the beta text takes the next version number, as the door would. The tail asserts
-- the one fact this file must leave behind on every chain: exactly one published row per kind,
-- and any row this file itself published carries the beta bytes.
--
-- ROLLBACK. Append-only, as ever: a later migration may supersede these rows (publish version 2)
-- or, to withdraw admission again, a new migration may move them published -> superseded with
-- no published successor (the trigger admits that move). Applied bytes are never rewritten.
-- =====================================================================================

do $prestate$
declare
  v_n integer;
  v_placeholder_sha text := encode(sha256(convert_to(
    'This is Clara''s beta data-processing agreement, pending review by the owner''s lawyer before launch.',
    'UTF8')), 'hex');
begin
  if to_regclass('clara.legal_documents') is null then
    raise exception '#621/#628 0187 prestate: clara.legal_documents is absent -- 0185 must apply first'
      using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara.publish_legal_document(text,text,text,text,timestamptz,text)') is null then
    raise exception '#621/#628 0187 prestate: clara.publish_legal_document is absent -- 0185 must apply first'
      using errcode = 'CLR10';
  end if;
  -- The dpa placeholder is either the v1 draft 0185 made of it, or a superseded/published row on a
  -- chain that already replaced it. It must exist in one of those shapes; a chain with no trace of
  -- it is not a Clara chain.
  select count(*) into v_n from clara.legal_documents where kind = 'dpa' and body_sha256 = v_placeholder_sha;
  if v_n <> 1 then
    raise exception '#621/#628 0187 prestate: expected exactly ONE dpa row carrying the 0158 placeholder digest, found %', v_n
      using errcode = 'CLR10';
  end if;
  select count(*) into v_n from clara.legal_documents where kind = 'terms' and status = 'published';
  raise notice '#621/#628 0187 prestate: clean -- one placeholder dpa row; % published terms row(s) before this file', v_n;
end $prestate$;

set role clara_fn_owner;

-- 1 · dpa v1: draft -> published (only when no published dpa exists yet).
do $dpa$
declare
  v_n integer;
  v_placeholder_sha text := encode(sha256(convert_to(
    'This is Clara''s beta data-processing agreement, pending review by the owner''s lawyer before launch.',
    'UTF8')), 'hex');
begin
  select count(*) into v_n from clara.legal_documents where kind = 'dpa' and status = 'published';
  if v_n = 1 then
    raise notice '#621/#628 0187 dpa: a published dpa already exists -- leaving the placeholder draft as it is';
    return;
  end if;
  update clara.legal_documents
     set status = 'published', published_at = now()
   where kind = 'dpa' and status = 'draft' and body_sha256 = v_placeholder_sha;
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception '#621/#628 0187 dpa: expected to publish exactly one placeholder draft, updated %', v_n
      using errcode = 'CLR10';
  end if;
  raise notice '#621/#628 0187 dpa: version 1 (the 0158 beta template) is now published';
end $dpa$;

-- 2 · terms: the beta sentence, published as the next version (1 on every chain built from this
--     repository), only when nothing of the kind is published yet. The digest is derived by the
--     CHECK from these exact bytes.
do $terms$
declare
  v_n integer;
  v_version integer;
  v_body text := 'This is Clara''s beta terms of service, pending review by the owner''s lawyer before launch.';
begin
  select count(*) into v_n from clara.legal_documents where kind = 'terms' and status = 'published';
  if v_n = 1 then
    raise notice '#621/#628 0187 terms: a published terms text already exists -- leaving it as it is';
    return;
  end if;
  select coalesce(max(version), 0) + 1 into v_version from clara.legal_documents where kind = 'terms';
  insert into clara.legal_documents(
    kind, version, status, title, body, body_sha256, source_path, effective_from, published_at, published_by)
  values (
    'terms', v_version, 'published', 'Terms of Service (Clara beta)', v_body,
    encode(sha256(convert_to(v_body, 'UTF8')), 'hex'),
    'docs/ops/legal/clara-beta-terms.md', timestamptz '2026-09-13 00:00:00+08', now(), null);
  raise notice '#621/#628 0187 terms: version % (the beta template) is now published', v_version;
end $terms$;

reset role;

do $tail$
declare
  v_n integer;
  v_dpa_version integer;
  v_terms_version integer;
  v_beta_terms_sha text := encode(sha256(convert_to(
    'This is Clara''s beta terms of service, pending review by the owner''s lawyer before launch.', 'UTF8')), 'hex');
  v_beta_dpa_sha text := encode(sha256(convert_to(
    'This is Clara''s beta data-processing agreement, pending review by the owner''s lawyer before launch.', 'UTF8')), 'hex');
begin
  -- Exactly one published row per kind, whichever step ran.
  select count(*) into v_n from clara.legal_documents where kind = 'dpa' and status = 'published';
  if v_n <> 1 then
    raise exception '#621/#628 0187 tail: expected exactly one published dpa, found %', v_n using errcode = 'CLR10';
  end if;
  select count(*) into v_n from clara.legal_documents where kind = 'terms' and status = 'published';
  if v_n <> 1 then
    raise exception '#621/#628 0187 tail: expected exactly one published terms, found %', v_n using errcode = 'CLR10';
  end if;
  select version into v_dpa_version from clara.legal_documents where kind = 'dpa' and status = 'published';
  select version into v_terms_version from clara.legal_documents where kind = 'terms' and status = 'published';
  -- Any row THIS file published (published_at = this transaction's now()) carries the beta bytes.
  select count(*) into v_n from clara.legal_documents
   where status = 'published' and published_at = now()
     and body_sha256 not in (v_beta_terms_sha, v_beta_dpa_sha);
  if v_n <> 0 then
    raise exception '#621/#628 0187 tail: % row(s) published by this file do not carry the beta bytes', v_n
      using errcode = 'CLR10';
  end if;
  -- Every published row carries its publication instant (0185's CHECK), and no draft carries one.
  select count(*) into v_n from clara.legal_documents
   where (status = 'draft') <> (published_at is null);
  if v_n <> 0 then
    raise exception '#621/#628 0187 tail: % row(s) violate the draft/published stamp rule', v_n using errcode = 'CLR10';
  end if;
  -- Acceptances are untouched: this file adds none and removes none.
  select count(*) into v_n from clara.legal_acceptances;
  raise notice '#621/#628 0187 tail: OK -- published dpa version %, published terms version % (beta templates where this file published them, pending the owner''s lawyer''s review, by the owner''s 2026-09-13 decision); % existing acceptance row(s) untouched; reviewed wording publishes as the next version through clara.publish_legal_document',
    v_dpa_version, v_terms_version, v_n;
end $tail$;
