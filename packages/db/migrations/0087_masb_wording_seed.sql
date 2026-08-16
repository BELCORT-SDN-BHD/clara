-- 0087_masb_wording_seed.sql -- owner task #43, file 1 of 2: clara.statutory_wording.
--
-- MIGRATION NUMBER claimed at MERGE (standing law, .claude/rules/db-migrations.md): 0087, claimed
-- against live frontier 0086 (0085/0086 -- B3's reopen mirror -- landed first). Authored
-- UNNUMBERED against repo frontier 0084 at build time; renumbered mechanically here, no content
-- change. Its ONE sibling, 0088_masb_wording_seed_lexicon.sql, MUST follow it -- that file's own
-- prestate refuses to run unless this file's 22 statutory_wording rows are already present.
--
-- OWNER SIGN-OFF (2026-08-16): approved. All three dispositions recorded in the PR body's
-- sign-off section -- the Issue-3 both-labels judgment call (file 2's header), benar-dan-patut /
-- true_and_fair-ms staying held back (not this sitting's item), and the en+zh-open/ms-gated
-- asymmetry, all signed as presented.
--
-- WHAT THIS LANDS. Owner task #43's verified MASB wording packet -- a research dossier plus two
-- binding amendments -- into clara.statutory_wording, the table 0065:171-212 shipped EMPTY BY
-- DESIGN ("wording awaits owner task #43... inventing wording is a FAIL of matrix D5") and
-- 0067:161-165's tail refused to let ship with a single row in it. This is that gate clearing,
-- for the rows the packet actually verified -- not a blanket clear: several packet rows are
-- explicitly HELD BACK below, unseeded, because the packet itself could not supply verbatim
-- final text for them (see "HELD BACK" beneath the row groups).
--
-- THE AUDITED DOOR. No writer function exists over clara.statutory_wording or its seven curated
-- siblings -- 0067:208-223's own aclexplode probe proves zero app-role-granted EXECUTE over any
-- body that writes them, and the registry file's RLS pass (0066 E9) hands app roles nothing on
-- these tables at all. The ONLY sanctioned path, ESTABLISHED by 0067 for statutory_profiles /
-- statutory_profile_versions / statutory_sections / statutory_slots and reused verbatim by
-- packages/db/tests/epsilon-world.mjs's seedVerifiedWording (line 79-94) and
-- packages/db/tests/zeta-fixtures.mjs's driftWording (line 173-188) for TEST rigs, is a plain
-- INSERT under `set role clara_fn_owner`, inside a migration, bracketed by a prestate that
-- refuses a false premise and a tail census that proves the outcome by re-reading the live
-- catalog. This file is that exact pattern, run for real wording rather than a rig simulation.
--
-- PACKET PROVENANCE (three documents; sha256 computed by this lane directly against the files,
-- reproducible from the scratchpad handed to this build). Where amendments conflict with the v1
-- dossier, the amendments win (build brief, law 1) -- so a row's cited packet_document is
-- whichever document's TEXT the seeded wording_text actually came from, not merely whichever
-- document last discussed the row.
--   masb-wording-dossier-v1.md     sha256 714073a217d12e99a2cc3b6fff3aba7d9ce83bcb6357f65dbcc0849584722fdf
--   masb-dossier-amendment-1.md    sha256 011a4fb7d962120f1c7fe8d5f356fca116d850ef45fcde686b7af4a92e1d543a
--   masb-dossier-amendment-2.md    sha256 69af238c84ae3617334e6f3ecd304d67da97c4db922cf04e0f8b57fd8875b86c
--
-- SEEDED HERE: 22 rows. mpers_company/en x10 (5 titles x 2 profile-version windows, both
-- official_masb, title-identical per amendment-1 item 2) - mpers_company/ms x4 (official_masb,
-- MASB's own BM glossary; NOT notes.title, held back -- see below) - mpers_company/zh x5
-- (best_practice_translation, the packet's disclosed durable ceiling) -
-- convention_sole_prop/en x3 (official_other / professional_practice).
--
-- HELD BACK, ON PURPOSE, NEVER SEEDED BY THIS FILE:
--  - mpers_company / notes.title / ms.  Amendment 2 Issue 1 read the actual MICPA ATR 9 BM text
--    and found the v1 dossier's citation FABRICATED-BY-PARAPHRASE (the claimed heading
--    "Nota-Nota kepada Penyata Kewangan" occurs nowhere in that document). DISPOSITION: demoted
--    to unresolved. Upgrade path stated in the packet: "a genuinely filed BM FS whose
--    notes-section heading is read directly."
--  - mpers_company / v2 (2027-01-01-) / ms, zh.  Amendment 1 obtained and confirmed the
--    MPERS(2025) EN titles only ("every mpers_company v2 wording row (sofp/soci/soce/scf/notes
--    titles, en) may now be seeded" -- amendment-1.md line 55-57); it never asserts ms/zh
--    identity across vintages, and the v1 dossier's own ms/zh rows are UNDATED to a vintage
--    (they read against 2016-2026 only in Section 1). Seeding a v2 ms/zh row would be this lane
--    inventing a vintage-carryover the packet never states.
--  - convention_sole_prop / ms, zh (all keys).  The v1 dossier states ms is "unresolved... do
--    not seed" (Borang B primary read never succeeded) and zh is "zero coverage... full gap".
--    Amendment 1 extended the retry and it still failed (host dead, not merely blocked).
--    Amendment 2's by-catch offers a professional_practice "Kunci Kira-Kira" CANDIDATE for
--    sp.sofp.title/ms, explicitly "offered to the owner sitting", not disposed as seedable.
--  - The claim_phrase_lexicon compliance_sentence/ms row and the claim_policy_versions ms/zh
--    rows are seeded by this file's sibling, 0088_masb_wording_seed_lexicon.sql -- see that
--    file's header for two further held-back items (compliance_sentence/ms, true_and_fair/ms)
--    and one disclosed judgment call (the claim-policy ms redraft's scope), both owner-signed.
--
-- VERIFICATION_STATE. Every row below lands 'verified': owner task #43's dossier-plus-two-
-- amendments process (independent research lanes, a codex cross-check that re-read primary
-- documents rather than trusting citations, and this lane's own re-verification of both
-- amendment quotes against the cited files before acceptance) IS the human-commissioned
-- verification act 0065's design comment asked for. verified_by is clara.agent_user_id() (the
-- fixed structural agent identity minted at 0002:334-335, 0002:549-551) because this is a
-- migration-time act attributed to no single firm-scoped human and no firm context exists for a
-- firm_id-null curator row; verified_at is the single `now()` of this file's one transaction.
-- source_sha256 is real (computed above), never padding -- contrast the RIG-only fixtures'
-- repeat('a',64)/repeat('b',64) placeholders, which this file must never resemble.
--
-- ROUTING METADATA (amendment 2 Issue 6, folded into source_note below rather than into
-- statutory_profile_versions.source_note, which 0067 already sealed and which carries no lawful
-- UPDATE -- append-only wall, 0066 E9, and statutory_profile_versions is not in the narrow
-- lifecycle list): MPERS(2016) applies to periods beginning on/after 2016-01-01
-- (mpers2016-full.txt:17018); its consolidated text incorporates the 2015 Amendments, mandatory
-- for periods beginning on/after 2017-01-01, early application permitted with disclosure
-- (mpers2016-full.txt:17037). MPERS(2025) supersedes MPERS(2016) at the 2027-01-01 boundary,
-- early application permitted with mandatory disclosure of the election (amendment-1.md item 6;
-- amendment-2.md Issue 4 -- the election MECHANISM itself is a registered product item for
-- Wave F, not a wording row).
--
-- CEREMONY POSTURE -- ADDITIVE AND INERT ON ARRIVAL. Pure INSERT into a table that already
-- exists, already carries forced RLS, an owner/human policy pair and a no-truncate + append-only
-- wall (0066 E9). No function body replaced, no trigger added, nothing backfilled. No D1
-- write-quiesce obligation.

set local statement_timeout = '5min';   -- PRECAUTIONARY: 22 rows, pure DDL-adjacent DML.

create temp table _masb_seed_pre(k text primary key, v text not null) on commit drop;
insert into _masb_seed_pre values ('deploy_principal', session_user);

-- =====================================================================================
-- PRESTATE. Measure every claim this file makes, abort on a false premise.
-- =====================================================================================
do $pre$
declare
  v_wording_before int;
  v1_from date; v1_to date; v2_from date; v2_to date; sp_from date; sp_to date;
begin
  if to_regclass('clara.statutory_wording') is null then
    raise exception 'masb seed requires clara.statutory_wording (epsilon files 1-3 not applied)'
      using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_class c join pg_namespace s on s.oid = c.relnamespace
                  where s.nspname = 'clara' and c.relname = 'statutory_wording'
                    and c.relrowsecurity and c.relforcerowsecurity) then
    raise exception 'masb seed: clara.statutory_wording is not force-RLS -- the epsilon registry hardening pass has not run'
      using errcode = 'CLR10';
  end if;

  -- IDEMPOTENCY GUARD (not a re-apply of an applied migration -- the runner's checksum wall
  -- already refuses that -- but a defence against this file ever being copy-pasted forward):
  -- the table must arrive EMPTY, exactly as 0067's own tail (line 161-165) left it.
  select count(*) into v_wording_before from clara.statutory_wording;
  if v_wording_before <> 0 then
    raise exception 'masb seed: clara.statutory_wording already carries % row(s) -- this file has run before, or another wording seed landed first',
      v_wording_before using errcode = 'CLR10';
  end if;

  -- THE PROFILE-VERSION WINDOWS, READ, not assumed -- 0067 born-two-versioned meeting exactly
  -- at 2027-01-01 (0067 tail line 181-191). This file's own windows below must match what
  -- shipped, or a wording row would silently apply to a period nobody bound it to.
  select applies_to_periods_beginning_from, applies_to_periods_beginning_to
    into v1_from, v1_to from clara.statutory_profile_versions
   where profile_key = 'mpers_company' and revision = 1;
  select applies_to_periods_beginning_from, applies_to_periods_beginning_to
    into v2_from, v2_to from clara.statutory_profile_versions
   where profile_key = 'mpers_company' and revision = 2;
  select applies_to_periods_beginning_from, applies_to_periods_beginning_to
    into sp_from, sp_to from clara.statutory_profile_versions
   where profile_key = 'convention_sole_prop' and revision = 1;
  if v1_from is distinct from date '2016-01-01' or v1_to is distinct from date '2026-12-31'
     or v2_from is distinct from date '2027-01-01' or v2_to is distinct from null
     or sp_from is distinct from date '2016-01-01' or sp_to is distinct from null then
    raise exception 'masb seed: shipped profile-version windows do not match this file''s premise (v1 % -> %, v2 % -> %, sole-prop % -> %)',
      v1_from, v1_to, v2_from, v2_to, sp_from, sp_to using errcode = 'CLR10';
  end if;

  -- The agent identity this file attributes verification to must itself be a real row.
  if not exists (select 1 from clara.users where id = clara.agent_user_id() and is_agent) then
    raise exception 'masb seed: clara.agent_user_id() has no corresponding clara.users row'
      using errcode = 'CLR10';
  end if;
end $pre$;

set role clara_fn_owner;

-- =====================================================================================
-- GROUP 1 -- mpers_company / en, BOTH profile-version windows, official_masb, TITLE-IDENTICAL
-- (amendment-1.md item 2: "the five statement titles are IDENTICAL to MPERS(2016)").
-- =====================================================================================
insert into clara.statutory_wording
    (profile_key, wording_key, locale, applies_to_periods_beginning_from, applies_to_periods_beginning_to,
     wording_text, source_manifest, source_sha256, verification_state, verified_by, verified_at, source_note)
values
  ('mpers_company','sofp.title','en',date '2016-01-01',date '2026-12-31','Statement of Financial Position',
    jsonb_build_object('task','43','packet_document','masb-wording-dossier-v1.md','authority_level','official_masb'),
    '714073a217d12e99a2cc3b6fff3aba7d9ce83bcb6357f65dbcc0849584722fdf','verified',clara.agent_user_id(),now(),
    'MPERS(2016) §3.17(a), §4.1 (Section 4 title), pp.24/27 -- masb.org.my/pages.php?id=614. Applies to periods beginning on/after 2016-01-01 (mpers2016-full.txt:17018).'),
  ('mpers_company','soci.title','en',date '2016-01-01',date '2026-12-31','Statement of Comprehensive Income',
    jsonb_build_object('task','43','packet_document','masb-wording-dossier-v1.md','authority_level','official_masb'),
    '714073a217d12e99a2cc3b6fff3aba7d9ce83bcb6357f65dbcc0849584722fdf','verified',clara.agent_user_id(),now(),
    'MPERS(2016) §3.17(b), Section 5 title, §5.2, pp.24/31.'),
  ('mpers_company','soce.title','en',date '2016-01-01',date '2026-12-31','Statement of Changes in Equity',
    jsonb_build_object('task','43','packet_document','masb-wording-dossier-v1.md','authority_level','official_masb'),
    '714073a217d12e99a2cc3b6fff3aba7d9ce83bcb6357f65dbcc0849584722fdf','verified',clara.agent_user_id(),now(),
    'MPERS(2016) Section 6 title (compound), §3.18, §6.4-6.5, pp.24/35-36.'),
  ('mpers_company','scf.title','en',date '2016-01-01',date '2026-12-31','Statement of Cash Flows',
    jsonb_build_object('task','43','packet_document','masb-wording-dossier-v1.md','authority_level','official_masb'),
    '714073a217d12e99a2cc3b6fff3aba7d9ce83bcb6357f65dbcc0849584722fdf','verified',clara.agent_user_id(),now(),
    'MPERS(2016) §3.17(d), Section 7 title, §7.1, pp.24/37.'),
  ('mpers_company','notes.title','en',date '2016-01-01',date '2026-12-31','Notes to the Financial Statements',
    jsonb_build_object('task','43','packet_document','masb-wording-dossier-v1.md','authority_level','official_masb'),
    '714073a217d12e99a2cc3b6fff3aba7d9ce83bcb6357f65dbcc0849584722fdf','verified',clara.agent_user_id(),now(),
    'MPERS(2016) §3.17(e), Section 8 title, §8.1/§8.4(a), pp.24/42-43.'),
  ('mpers_company','sofp.title','en',date '2027-01-01',null,'Statement of Financial Position',
    jsonb_build_object('task','43','packet_document','masb-dossier-amendment-1.md','authority_level','official_masb'),
    '011a4fb7d962120f1c7fe8d5f356fca116d850ef45fcde686b7af4a92e1d543a','verified',clara.agent_user_id(),now(),
    'MPERS(2025) §3.17(a), primary-read from mpers2025-full-b.pdf (2,256,579 bytes, obtained 2026-08-14) -- title-identical to MPERS(2016) (amendment-1.md item 2). Supersedes MPERS(2016) for periods beginning on/after 2027-01-01, early application permitted with disclosure (amendment-1.md item 6; issuance 2025-10-10).'),
  ('mpers_company','soci.title','en',date '2027-01-01',null,'Statement of Comprehensive Income',
    jsonb_build_object('task','43','packet_document','masb-dossier-amendment-1.md','authority_level','official_masb'),
    '011a4fb7d962120f1c7fe8d5f356fca116d850ef45fcde686b7af4a92e1d543a','verified',clara.agent_user_id(),now(),
    'MPERS(2025) §3.17(b): single statement of comprehensive income titling unchanged -- title-identical to MPERS(2016) (amendment-1.md item 2).'),
  ('mpers_company','soce.title','en',date '2027-01-01',null,'Statement of Changes in Equity',
    jsonb_build_object('task','43','packet_document','masb-dossier-amendment-1.md','authority_level','official_masb'),
    '011a4fb7d962120f1c7fe8d5f356fca116d850ef45fcde686b7af4a92e1d543a','verified',clara.agent_user_id(),now(),
    'MPERS(2025) §3.18/§6.4 retained, same conditions -- title-identical to MPERS(2016) (amendment-1.md item 2/3).'),
  ('mpers_company','scf.title','en',date '2027-01-01',null,'Statement of Cash Flows',
    jsonb_build_object('task','43','packet_document','masb-dossier-amendment-1.md','authority_level','official_masb'),
    '011a4fb7d962120f1c7fe8d5f356fca116d850ef45fcde686b7af4a92e1d543a','verified',clara.agent_user_id(),now(),
    'MPERS(2025) §3.17(d) -- title-identical to MPERS(2016) (amendment-1.md item 2).'),
  ('mpers_company','notes.title','en',date '2027-01-01',null,'Notes to the Financial Statements',
    jsonb_build_object('task','43','packet_document','masb-dossier-amendment-1.md','authority_level','official_masb'),
    '011a4fb7d962120f1c7fe8d5f356fca116d850ef45fcde686b7af4a92e1d543a','verified',clara.agent_user_id(),now(),
    'MPERS(2025) §3.17(e) -- title unchanged; the one content change (materiality-language update to what "notes" comprise) does not touch the title (amendment-1.md item 2).');

-- =====================================================================================
-- GROUP 2 -- mpers_company / ms, official_masb (MASB's own BM glossary), 2016-2026 window
-- ONLY. NOT notes.title -- Amendment 2 Issue 1 demoted it (see header).
-- =====================================================================================
insert into clara.statutory_wording
    (profile_key, wording_key, locale, applies_to_periods_beginning_from, applies_to_periods_beginning_to,
     wording_text, source_manifest, source_sha256, verification_state, verified_by, verified_at, source_note)
values
  ('mpers_company','sofp.title','ms',date '2016-01-01',date '2026-12-31','Penyata Kedudukan Kewangan',
    jsonb_build_object('task','43','packet_document','masb-wording-dossier-v1.md','authority_level','official_masb'),
    '714073a217d12e99a2cc3b6fff3aba7d9ce83bcb6357f65dbcc0849584722fdf','verified',clara.agent_user_id(),now(),
    'MPERS Glossary in Bahasa Malaysia, row 162 (cross-checked MFRS Glossary BM item 1706) -- masb.org.my/pdf/MPERSGlossaryinBahasaMalaysia.pdf.'),
  ('mpers_company','soci.title','ms',date '2016-01-01',date '2026-12-31','Penyata Pendapatan Komprehensif',
    jsonb_build_object('task','43','packet_document','masb-wording-dossier-v1.md','authority_level','official_masb'),
    '714073a217d12e99a2cc3b6fff3aba7d9ce83bcb6357f65dbcc0849584722fdf','verified',clara.agent_user_id(),now(),
    'MPERS Glossary BM row 161 (MFRS Glossary item 1705).'),
  ('mpers_company','soce.title','ms',date '2016-01-01',date '2026-12-31','Penyata Perubahan Ekuiti',
    jsonb_build_object('task','43','packet_document','masb-wording-dossier-v1.md','authority_level','official_masb'),
    '714073a217d12e99a2cc3b6fff3aba7d9ce83bcb6357f65dbcc0849584722fdf','verified',clara.agent_user_id(),now(),
    'MPERS Glossary BM row 160 (MFRS Glossary item 1703).'),
  ('mpers_company','scf.title','ms',date '2016-01-01',date '2026-12-31','Penyata Aliran Tunai',
    jsonb_build_object('task','43','packet_document','masb-wording-dossier-v1.md','authority_level','official_masb'),
    '714073a217d12e99a2cc3b6fff3aba7d9ce83bcb6357f65dbcc0849584722fdf','verified',clara.agent_user_id(),now(),
    'MPERS Glossary BM row 159 (MFRS Glossary item 1702; corroborated MICPA ATR 9).');

-- =====================================================================================
-- GROUP 3 -- mpers_company / zh, best_practice_translation (the packet's disclosed durable
-- ceiling: "MASB/SSM have never published operative Chinese text for any MPERS-family
-- standard" -- softened per amendment-2 Issue 5 to "no such text was FOUND", never a proof of
-- absence). 2016-2026 window only (v2 zh is HELD BACK -- see header).
-- =====================================================================================
insert into clara.statutory_wording
    (profile_key, wording_key, locale, applies_to_periods_beginning_from, applies_to_periods_beginning_to,
     wording_text, source_manifest, source_sha256, verification_state, verified_by, verified_at, source_note)
values
  ('mpers_company','sofp.title','zh',date '2016-01-01',date '2026-12-31','财务状况表',
    jsonb_build_object('task','43','packet_document','masb-wording-dossier-v1.md','authority_level','best_practice_translation'),
    '714073a217d12e99a2cc3b6fff3aba7d9ce83bcb6357f65dbcc0849584722fdf','verified',clara.agent_user_id(),now(),
    'IFRS-Foundation-attributed Chinese IAS 1 summary, mirrored at chinaacc.com; no official MASB/SSM Chinese source exists. CONFIRMED unchanged by amendment-2.md''s codex cross-check adjudication (vs. 资产负债表, the PRC-statutory "balance sheet" alternate).'),
  ('mpers_company','soci.title','zh',date '2016-01-01',date '2026-12-31','综合收益表',
    jsonb_build_object('task','43','packet_document','masb-wording-dossier-v1.md','authority_level','best_practice_translation'),
    '714073a217d12e99a2cc3b6fff3aba7d9ce83bcb6357f65dbcc0849584722fdf','verified',clara.agent_user_id(),now(),
    'Same source as sofp.title/zh. LEAST-SETTLED of the five titles (dossier §4: vs 全面收益表 HK-unverified, vs 綜合損益表 Taiwan-confirmed, vs PRC CAS-30''s 利润表 -- no separate OCI statement in PRC GAAP at all). CONFIRMED unchanged by amendment-2.md''s codex cross-check adjudication.'),
  ('mpers_company','soce.title','zh',date '2016-01-01',date '2026-12-31','权益变动表',
    jsonb_build_object('task','43','packet_document','masb-wording-dossier-v1.md','authority_level','best_practice_translation'),
    '714073a217d12e99a2cc3b6fff3aba7d9ce83bcb6357f65dbcc0849584722fdf','verified',clara.agent_user_id(),now(),
    'Cross-corroborated by Taiwan acgf.org.tw PDF and PRC CAS-30 (所有者权益变动表 variant). Most stable of the five zh terms.'),
  ('mpers_company','scf.title','zh',date '2016-01-01',date '2026-12-31','现金流量表',
    jsonb_build_object('task','43','packet_document','masb-wording-dossier-v1.md','authority_level','best_practice_translation'),
    '714073a217d12e99a2cc3b6fff3aba7d9ce83bcb6357f65dbcc0849584722fdf','verified',clara.agent_user_id(),now(),
    'Cross-corroborated: PRC CAS-30 Art.2 (fadada.com), Taiwan acgf.org.tw PDF, IFRS-summary mirror. Universally stable term.'),
  ('mpers_company','notes.title','zh',date '2016-01-01',date '2026-12-31','财务报表附注',
    jsonb_build_object('task','43','packet_document','masb-wording-dossier-v1.md','authority_level','best_practice_translation'),
    '714073a217d12e99a2cc3b6fff3aba7d9ce83bcb6357f65dbcc0849584722fdf','verified',clara.agent_user_id(),now(),
    'Taiwan acgf.org.tw PDF, corroborated by PRC CAS-30 (附注) and the IFRS-summary mirror.');

-- =====================================================================================
-- GROUP 4 -- convention_sole_prop / en. Structurally incapable of a compliance claim
-- (claim_capability='no_claim' on the profile itself, 0067 line 62-63) -- these are practitioner
-- convention, never MPERS wording, however sourced.
-- =====================================================================================
insert into clara.statutory_wording
    (profile_key, wording_key, locale, applies_to_periods_beginning_from, applies_to_periods_beginning_to,
     wording_text, source_manifest, source_sha256, verification_state, verified_by, verified_at, source_note)
values
  ('convention_sole_prop','sp.pl.title','en',date '2016-01-01',null,'Profit and Loss Account',
    jsonb_build_object('task','43','packet_document','masb-wording-dossier-v1.md','authority_level','official_other'),
    '714073a217d12e99a2cc3b6fff3aba7d9ce83bcb6357f65dbcc0849584722fdf','verified',clara.agent_user_id(),now(),
    'LHDN Public Ruling No. 5/2000 (Revised) §3.3.2: "...a true and fair profit & loss account and balance sheet to be prepared." Descriptive, not a styled mandate. Live alternate "Statement of Profit or Loss" (MFRS-habit) is an unadjudicated, equally legitimate toggle candidate (dossier §4) -- NOT seeded.'),
  ('convention_sole_prop','sp.sofp.title','en',date '2016-01-01',null,'Balance Sheet',
    jsonb_build_object('task','43','packet_document','masb-wording-dossier-v1.md','authority_level','official_other'),
    '714073a217d12e99a2cc3b6fff3aba7d9ce83bcb6357f65dbcc0849584722fdf','verified',clara.agent_user_id(),now(),
    'Same LHDN PR5/2000 §3.3.2 citation. Live alternate "Statement of Financial Position" (MFRS-habit) is an unadjudicated toggle candidate (dossier §4) -- NOT seeded.'),
  ('convention_sole_prop','sp.capital.title','en',date '2016-01-01',null,'Capital Account',
    jsonb_build_object('task','43','packet_document','masb-wording-dossier-v1.md','authority_level','professional_practice'),
    '714073a217d12e99a2cc3b6fff3aba7d9ce83bcb6357f65dbcc0849584722fdf','verified',clara.agent_user_id(),now(),
    'Practitioner convention; supported (not verbatim) by LHDN PR5/2000 §3.4.3 ("private money used in the business"), §3.4.4 ("personal drawings"), §3.4.7 (partnership-only analog). LHDN never uses "Capital Account" verbatim for a sole proprietor.');

reset role;

-- =====================================================================================
-- TAIL CENSUS. Every claim re-read from the live catalog, nothing inferred from this file's own
-- statements.
-- =====================================================================================
do $tail$
declare
  v_total int; v_en int; v_ms int; v_zh int;
  v_mpers_en_v1 int; v_mpers_en_v2 int; v_mpers_ms int; v_mpers_zh int; v_sp_en int;
  v_verified int; v_agent_verified int; v_at_null int; v_ms_notes int;
begin
  select count(*) into v_total from clara.statutory_wording;
  select count(*) into v_en from clara.statutory_wording where locale = 'en';
  select count(*) into v_ms from clara.statutory_wording where locale = 'ms';
  select count(*) into v_zh from clara.statutory_wording where locale = 'zh';
  if v_total <> 22 or v_en <> 13 or v_ms <> 4 or v_zh <> 5 then
    raise exception 'masb seed tail: census total %, en %, ms %, zh % -- expected 22 / 13 / 4 / 5',
      v_total, v_en, v_ms, v_zh using errcode = 'CLR10';
  end if;

  select count(*) into v_mpers_en_v1 from clara.statutory_wording
   where profile_key = 'mpers_company' and locale = 'en' and applies_to_periods_beginning_from = date '2016-01-01';
  select count(*) into v_mpers_en_v2 from clara.statutory_wording
   where profile_key = 'mpers_company' and locale = 'en' and applies_to_periods_beginning_from = date '2027-01-01';
  select count(*) into v_mpers_ms from clara.statutory_wording where profile_key = 'mpers_company' and locale = 'ms';
  select count(*) into v_mpers_zh from clara.statutory_wording where profile_key = 'mpers_company' and locale = 'zh';
  select count(*) into v_sp_en from clara.statutory_wording where profile_key = 'convention_sole_prop' and locale = 'en';
  if v_mpers_en_v1 <> 5 or v_mpers_en_v2 <> 5 or v_mpers_ms <> 4 or v_mpers_zh <> 5 or v_sp_en <> 3 then
    raise exception 'masb seed tail: group census mpers-en-v1 %, mpers-en-v2 %, mpers-ms %, mpers-zh %, sole-prop-en % -- expected 5/5/4/5/3',
      v_mpers_en_v1, v_mpers_en_v2, v_mpers_ms, v_mpers_zh, v_sp_en using errcode = 'CLR10';
  end if;

  -- notes.title/ms MUST be absent -- the held-back row, proven by a positive read rather than
  -- assumed from this file's own header prose.
  select count(*) into v_ms_notes from clara.statutory_wording
   where profile_key = 'mpers_company' and wording_key = 'notes.title' and locale = 'ms';
  if v_ms_notes <> 0 then
    raise exception 'masb seed tail: notes.title/ms was seeded -- amendment-2.md Issue 1 demoted it to unresolved; it must stay absent'
      using errcode = 'CLR10';
  end if;

  -- PROVENANCE, POSITIVELY: every row verified, by the agent identity, with a real (non-null)
  -- verified_at. The CHECK constraint already guarantees the quartet is complete for any
  -- 'verified' row; this re-affirms the SPECIFIC identity and non-degenerate timestamp.
  select count(*) into v_verified from clara.statutory_wording where verification_state = 'verified';
  select count(*) into v_agent_verified from clara.statutory_wording where verified_by = clara.agent_user_id();
  select count(*) into v_at_null from clara.statutory_wording where verified_at is null;
  if v_verified <> 22 or v_agent_verified <> 22 or v_at_null <> 0 then
    raise exception 'masb seed tail: verified %, agent-attributed %, null verified_at % -- expected 22 / 22 / 0',
      v_verified, v_agent_verified, v_at_null using errcode = 'CLR10';
  end if;

  if current_user <> (select v from _masb_seed_pre where k = 'deploy_principal')
     or current_role <> (select v from _masb_seed_pre where k = 'deploy_principal') then
    raise exception 'masb seed tail: role was not reset (user %, role %)', current_user, current_role
      using errcode = 'CLR10';
  end if;

  raise notice 'masb wording seed (file 1/2) OK: 22 rows landed in clara.statutory_wording -- mpers_company/en x10 (5 titles x 2 vintages, official_masb) + mpers_company/ms x4 (official_masb glossary, notes.title HELD BACK per amendment-2 Issue 1) + mpers_company/zh x5 (best_practice_translation, the packet''s disclosed durable ceiling) + convention_sole_prop/en x3 (official_other/professional_practice). ALL 22 verification_state=verified, attributed to clara.agent_user_id(), real non-null verified_at. Zero ms/zh v2 rows, zero convention_sole_prop ms/zh rows -- both held back per this file''s header. Deploy principal restored.';
end $tail$;
