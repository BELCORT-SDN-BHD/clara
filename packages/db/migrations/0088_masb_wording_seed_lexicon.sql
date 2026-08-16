-- 0088_masb_wording_seed_lexicon.sql -- owner task #43, file 2 of 2:
-- clara.claim_phrase_lexicon + clara.claim_policy_versions (ms/zh additions).
--
-- MIGRATION NUMBER claimed at MERGE: 0088, claimed against live frontier 0086 (0085/0086 -- B3's
-- reopen mirror -- landed first), immediately above file 1's claimed 0087. Authored UNNUMBERED
-- against repo frontier 0084 at build time; renumbered mechanically here, no content change.
-- Applies STRICTLY AFTER 0087_masb_wording_seed.sql (file 1 of 2) -- this file's own prestate
-- refuses to run unless that file's 22 statutory_wording rows are already present.
--
-- OWNER SIGN-OFF (2026-08-16): approved -- see file 1's header for the pointer; the three
-- dispositions this file is party to (the Issue-3 both-labels call below, true_and_fair/ms
-- staying held back, the ms-gated-at-4/5 asymmetry) are recorded verbatim in the PR body.
--
-- WHAT THIS LANDS. The remaining seedable half of owner task #43's packet that does not live in
-- clara.statutory_wording: the ms/zh additions to clara.claim_phrase_lexicon (0067 shipped en
-- fully and ms/zh name-token only, flagging the rest "an owner item of the #43 family" --
-- 0067:126-131) and the ms/zh clara.claim_policy_versions rows (0067 shipped en only,
-- 0067:142-148). Neither table has a verification_state/provenance quartet (0066 E6's schema),
-- so this file carries provenance in source_note only, per house style for tables the schema
-- does not give a dedicated provenance column.
--
-- THE AUDITED DOOR -- same as file 1: no writer function exists over either table (0067:208-223's
-- aclexplode probe covers both), so a migration-time INSERT under `set role clara_fn_owner` is
-- the sanctioned path, matching 0067's own seeding of the en rows in both tables verbatim.
--
-- PACKET PROVENANCE (same three documents as file 1; see that file's header for full sha256
-- values and the reproduction method). This file cites:
--   masb-wording-dossier-v1.md     sha256 714073a217d12e99a2cc3b6fff3aba7d9ce83bcb6357f65dbcc0849584722fdf
--   masb-dossier-amendment-2.md    sha256 69af238c84ae3617334e6f3ecd304d67da97c4db922cf04e0f8b57fd8875b86c
--
-- SEEDED HERE: 3 claim_phrase_lexicon rows (standard_full_name/ms, standard_full_name/zh,
-- compliance_sentence/zh) + 2 claim_policy_versions rows (fs_claim_policy v1/ms, v1/zh).
--
-- HELD BACK, ON PURPOSE: claim_phrase_lexicon compliance_sentence/ms. Amendment 2 Issue 2
-- upgrades the AUTHORITY of the v1 dossier's ms compliance stem (MASB's own BM glossary anchors
-- "explicit and unreserved statement of compliance" as "Kenyataan pematuhan yang jelas dan
-- tidak tersirat", mfrs_glossary_bm.txt:1271 entry 675) but directs the sentence to be
-- "REBUILT around that official phrase" WITHOUT supplying the rebuilt composite's final text
-- (amendment-2.md Issue 2, lines 20-28). Seeding a "rebuilt" sentence without the packet's own
-- verbatim rebuild would be this lane composing wording, which the build brief forbids
-- ("Seed content VERBATIM from the packet -- you compose no wording yourself"). Stays unresolved
-- until the packet (or the owner sitting) supplies the composed sentence verbatim.
--
-- DISCLOSED JUDGMENT CALL -- flagged for explicit owner confirmation at sign-off, not a silent
-- choice: amendment-2.md Issue 3 says "dakwaan pematuhan" (an ALLEGATION-connotation phrase in
-- Malay legal usage) is replaced by "kenyataan pematuhan" (MASB's own noun, same glossary
-- anchor), and separately counts this as "two of the eight claim-policy labels REDRAFTED... the
-- other six... stand as drafted". Read literally, "dakwaan pematuhan" occurs in TWO of the v1
-- dossier's four ms labels (not_applicable: "Tiada dakwaan pematuhan..."; stripped: "Dakwaan
-- pematuhan dialih keluar..."), not one -- so the "two of eight" count (which pairs one ms fix
-- with one zh fix) undercounts by one if the substitution is meant to reach both sentences.
-- Since claim_policy_versions.status_labels is ONE jsonb object requiring all four ruled states
-- atomically (ck_cpv_four_ruled_states), a partial hold-back is not possible for this row --
-- it is either seeded whole or held back whole. THIS FILE APPLIES THE PACKET'S OWN NAMED
-- SUBSTITUTION ("dakwaan pematuhan" -> "kenyataan pematuhan") TO BOTH ms OCCURRENCES, on the
-- reasoning that (a) every character seeded is packet-supplied text -- the v1 base sentence plus
-- the amendment's own specified replacement phrase, never an invented word, and (b) shipping the
-- allegation-connotation phrase in one label while removing it from its textual twin in the same
-- policy version would be an internally inconsistent artifact the amendment's own stated concern
-- argues against. This is a SCOPE judgment, not a content invention, and it is surfaced here
-- verbatim for the owner sitting to overrule if the "two of eight" count was the intended
-- boundary rather than an undercount.
--
-- HELD BACK, ON PURPOSE, FLAGGED BY INDEPENDENT REVIEW (2026-08-16): claim_phrase_lexicon
-- true_and_fair/ms. The build brief's enumeration rule for this file was "seed dossier §2's
-- lexicon table" (standard_full_name, compliance_sentence -- both locales), and true_and_fair/ms
-- was never IN that table; it surfaces only in dossier §4 ("True and fair view -- ms, a real and
-- consequential conflict"), which this lane read as context/conflicts, not a seed instruction.
-- That enumeration rule is defensible, but the resulting omission was invisible to the owner
-- sitting without this line -- so it is named here rather than left silent. What §4 actually
-- supports, at a HIGH authority level (higher than most of what this file DOES seed): Companies
-- Act 2016 s.249(1), the current in-force statute, says "benar dan patut" -- verified
-- byte-identical on both SSM's own host and the AGC Federal Legislation Portal (official_statute).
-- MICPA ATR 9 (2009) instead uses "benar dan saksama", but that template keys to s.174 of the
-- REPEALED Companies Act 1965, not the current Act -- superseded, and product copy should not
-- default to it. Seeding true_and_fair/ms is a scope decision (this lane's brief covered §1-§3
-- rows only; §4 is a conflicts-and-gaps section, not a wording table) that belongs to the owner
-- sitting, not a fabrication risk -- the text and its citation are both already fully verified.
--
-- CEREMONY POSTURE -- ADDITIVE AND INERT ON ARRIVAL, same as file 1. No D1 obligation.

set local statement_timeout = '5min';   -- PRECAUTIONARY: 5 rows.

create temp table _masb_seed2_pre(k text primary key, v text not null) on commit drop;
insert into _masb_seed2_pre values ('deploy_principal', session_user);

-- =====================================================================================
-- PRESTATE. File 1 must have landed (ORDERING OBLIGATION), and both target tables must sit at
-- their known 0067 baselines with zero ms/zh rows in the keys this file adds.
-- =====================================================================================
do $pre$
declare
  v_wording int; v_lexicon int; v_policies int;
  v_lexicon_msz int; v_policies_msz int;
begin
  select count(*) into v_wording from clara.statutory_wording;
  if v_wording <> 22 then
    raise exception 'masb lexicon seed requires file 1 (0087_masb_wording_seed.sql) applied first -- clara.statutory_wording carries % rows, expected 22',
      v_wording using errcode = 'CLR10';
  end if;
  if not exists (select 1 from clara.statutory_wording
                  where profile_key = 'mpers_company' and wording_key = 'sofp.title'
                    and locale = 'ms' and verification_state = 'verified') then
    raise exception 'masb lexicon seed: file 1''s mpers_company/sofp.title/ms row is missing or unverified -- ordering obligation not met'
      using errcode = 'CLR10';
  end if;

  if to_regclass('clara.claim_phrase_lexicon') is null or to_regclass('clara.claim_policy_versions') is null then
    raise exception 'masb lexicon seed requires clara.claim_phrase_lexicon and clara.claim_policy_versions (epsilon files 1-3 not applied)'
      using errcode = 'CLR10';
  end if;

  select count(*) into v_lexicon from clara.claim_phrase_lexicon;
  select count(*) into v_policies from clara.claim_policy_versions;
  if v_lexicon <> 6 or v_policies <> 1 then
    raise exception 'masb lexicon seed: baseline mismatch -- clara.claim_phrase_lexicon has % rows (expected 6, the 0067 baseline), clara.claim_policy_versions has % (expected 1)',
      v_lexicon, v_policies using errcode = 'CLR10';
  end if;

  select count(*) into v_lexicon_msz from clara.claim_phrase_lexicon where locale in ('ms', 'zh')
    and phrase_key in ('standard_full_name', 'compliance_sentence');
  select count(*) into v_policies_msz from clara.claim_policy_versions where locale in ('ms', 'zh');
  if v_lexicon_msz <> 0 or v_policies_msz <> 0 then
    raise exception 'masb lexicon seed: ms/zh rows already present (lexicon %, policies %) -- this file has run before',
      v_lexicon_msz, v_policies_msz using errcode = 'CLR10';
  end if;
end $pre$;

set role clara_fn_owner;

-- =====================================================================================
-- CLAIM_PHRASE_LEXICON -- ms/zh additions. standard_full_name carries the standard's own name
-- (ms retained untranslated, zh a best_practice_translation); compliance_sentence/zh is the
-- packet's complete, amendment-untouched zh compliance stem. compliance_sentence/ms is HELD
-- BACK (see header).
-- =====================================================================================
insert into clara.claim_phrase_lexicon (phrase_key, locale, version, phrase, match_kind, effective_from, source_note) values
  ('standard_full_name', 'ms', 1, 'Malaysian Private Entities Reporting Standard (MPERS)', 'substring_ci', date '2016-01-01',
   'Owner task #43, masb-wording-dossier-v1.md sha256 714073a217d12e99a2cc3b6fff3aba7d9ce83bcb6357f65dbcc0849584722fdf. Retained untranslated: SSM''s own official BM "Annual Submission" page keeps the English name untranslated inside Malay prose; confirmed absence of any MASB-endorsed BM name across both of MASB''s own BM glossaries. authority_level: official_other.'),
  ('standard_full_name', 'zh', 1, '马来西亚私人实体报告准则 (MPERS)', 'substring_ci', date '2016-01-01',
   'Owner task #43, masb-wording-dossier-v1.md sha256 714073a217d12e99a2cc3b6fff3aba7d9ce83bcb6357f65dbcc0849584722fdf. 准则 (not 标准) per Chinese accounting-standard naming convention (国际财务报告准则 = IFRS). No official MASB/SSM Chinese name exists. authority_level: best_practice_translation.'),
  ('compliance_sentence', 'zh', 1, '本财务报表已根据马来西亚私人实体报告准则（MPERS）编制，并公允列报其财务状况与经营成果。', 'substring_ci', date '2016-01-01',
   'Owner task #43, masb-wording-dossier-v1.md sha256 714073a217d12e99a2cc3b6fff3aba7d9ce83bcb6357f65dbcc0849584722fdf. Composite: 根据...编制 anchored to CICPA framework-compliance phrasing (non-Malaysian); 公允列报 anchored to the IFRS-Foundation-attributed Chinese IAS 1 mirror. authority_level: best_practice_translation, unchanged by either amendment.');

-- =====================================================================================
-- CLAIM_POLICY_VERSIONS -- ms/zh, fs_claim_policy v1. All eight label renderings are
-- best_practice_translation (dossier §3: "no lane found or could find an official/professional
-- anchor for these exact strings in either locale"). The ms not_applicable/stripped labels and
-- the zh eligible label carry the amendment-2 Issue 3 redraft -- see this file's header for the
-- disclosed judgment call on the ms redraft's scope.
-- =====================================================================================
insert into clara.claim_policy_versions (policy_key, version, locale, status_labels, effective_from, source_note) values
  ('fs_claim_policy', 1, 'ms', jsonb_build_object(
      'eligible', 'Semakan profil pembentangan telah lulus.',
      'not_applicable', 'Tiada kenyataan pematuhan terpakai bagi kelas laporan ini.',
      'stripped', 'Kenyataan pematuhan dialih keluar: pek ini menyimpang daripada struktur yang ditetapkan.',
      'failed', 'Penilaian pematuhan gagal; pek ini tidak boleh dikeluarkan.'),
    date '2016-01-01',
    'Owner task #43. Base text masb-wording-dossier-v1.md sha256 714073a217d12e99a2cc3b6fff3aba7d9ce83bcb6357f65dbcc0849584722fdf, §3. not_applicable/stripped REDRAFTED per masb-dossier-amendment-2.md sha256 69af238c84ae3617334e6f3ecd304d67da97c4db922cf04e0f8b57fd8875b86c Issue 3 ("dakwaan pematuhan" -> "kenyataan pematuhan", MASB glossary entry 675 anchor) -- applied to BOTH occurrences of the flagged phrase; see this file''s header "DISCLOSED JUDGMENT CALL". authority_level: best_practice_translation (all four).'),
  ('fs_claim_policy', 1, 'zh', jsonb_build_object(
      'eligible', '列报配置检查已通过。',
      'not_applicable', '此报告类别不适用合规声明。',
      'stripped', '合规声明已移除：此报表包偏离规定结构。',
      'failed', '合规评估未通过；此报表包不可出具。'),
    date '2016-01-01',
    'Owner task #43. Base text masb-wording-dossier-v1.md sha256 714073a217d12e99a2cc3b6fff3aba7d9ce83bcb6357f65dbcc0849584722fdf, §3. eligible REDRAFTED per masb-dossier-amendment-2.md sha256 69af238c84ae3617334e6f3ecd304d67da97c4db922cf04e0f8b57fd8875b86c Issue 3 ("列报概况" reads as a summary, not a configured profile -> "列报配置"); the other three stand as drafted. authority_level: best_practice_translation (all four).');

reset role;

-- =====================================================================================
-- TAIL CENSUS.
-- =====================================================================================
do $tail$
declare
  v_lexicon int; v_policies int;
  v_lexicon_new int; v_policies_new int;
  v_ms_compliance int;
  v_ms_labels jsonb; v_zh_labels jsonb;
begin
  select count(*) into v_lexicon from clara.claim_phrase_lexicon;
  select count(*) into v_policies from clara.claim_policy_versions;
  if v_lexicon <> 9 or v_policies <> 3 then
    raise exception 'masb lexicon seed tail: census lexicon %, policies % -- expected 9 / 3 (0067 baseline 6/1 plus this file''s 3/2)',
      v_lexicon, v_policies using errcode = 'CLR10';
  end if;

  select count(*) into v_lexicon_new from clara.claim_phrase_lexicon
   where locale in ('ms', 'zh') and phrase_key in ('standard_full_name', 'compliance_sentence');
  select count(*) into v_policies_new from clara.claim_policy_versions where locale in ('ms', 'zh');
  if v_lexicon_new <> 3 or v_policies_new <> 2 then
    raise exception 'masb lexicon seed tail: new-row census lexicon %, policies % -- expected 3 / 2',
      v_lexicon_new, v_policies_new using errcode = 'CLR10';
  end if;

  -- HELD BACK, proven absent by a positive read.
  select count(*) into v_ms_compliance from clara.claim_phrase_lexicon
   where phrase_key = 'compliance_sentence' and locale = 'ms';
  if v_ms_compliance <> 0 then
    raise exception 'masb lexicon seed tail: compliance_sentence/ms was seeded -- amendment-2.md Issue 2 supplies no verbatim rebuilt text; it must stay absent'
      using errcode = 'CLR10';
  end if;

  -- THE FOUR RULED STATES, read back and re-asserted present for both new policy rows (the
  -- CHECK already guarantees this at commit; this positively confirms the live values).
  select status_labels into v_ms_labels from clara.claim_policy_versions
   where policy_key = 'fs_claim_policy' and version = 1 and locale = 'ms';
  select status_labels into v_zh_labels from clara.claim_policy_versions
   where policy_key = 'fs_claim_policy' and version = 1 and locale = 'zh';
  if not (v_ms_labels ?& array['eligible','not_applicable','stripped','failed'])
     or not (v_zh_labels ?& array['eligible','not_applicable','stripped','failed']) then
    raise exception 'masb lexicon seed tail: ms/zh claim-policy rows do not carry all four ruled states'
      using errcode = 'CLR10';
  end if;
  if v_ms_labels->>'not_applicable' !~ 'kenyataan pematuhan' or v_ms_labels->>'stripped' !~ 'Kenyataan pematuhan' then
    raise exception 'masb lexicon seed tail: the ms redraft (dakwaan -> kenyataan pematuhan) did not land in both flagged labels'
      using errcode = 'CLR10';
  end if;

  if current_user <> (select v from _masb_seed2_pre where k = 'deploy_principal')
     or current_role <> (select v from _masb_seed2_pre where k = 'deploy_principal') then
    raise exception 'masb lexicon seed tail: role was not reset (user %, role %)', current_user, current_role
      using errcode = 'CLR10';
  end if;

  raise notice 'masb wording seed (file 2/2) OK: clara.claim_phrase_lexicon 6 -> 9 (standard_full_name/ms+zh, compliance_sentence/zh; compliance_sentence/ms HELD BACK per amendment-2 Issue 2); clara.claim_policy_versions 1 -> 3 (fs_claim_policy v1/ms+zh, all four ruled states present, the ms redraft landed in BOTH flagged labels per the disclosed judgment call). Deploy principal restored.';
end $tail$;
