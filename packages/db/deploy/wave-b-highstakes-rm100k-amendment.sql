-- =====================================================================
-- FIRM POLICY AMENDMENT — high_stakes_amount_cents: RM10,000 → RM100,000
-- (owner ruling, 2026-07-27, given in-session with the exact figure)
--
-- WHAT THIS CHANGES. clara.is_high_stakes(entry) is a COMPOUND predicate
-- (0004:72, CoR 0009:1513): three categorical flags (opening / year-end /
-- tax-affecting) OR sum(debits) >= firms.high_stakes_amount_cents. This
-- amendment moves ONLY the amount threshold. The categorical flags are
-- untouched — an opening, year-end or tax-affecting entry stays high-stakes
-- at any amount.
--
-- WHY RAISE, NOT ABOLISH. The owner first asked to abolish. Setting the
-- column NULL was rejected on mechanics, not philosophy: `sum >= NULL` is
-- NULL, and NULL poisons the OR — is_high_stakes would return NULL for every
-- ordinary entry, and its ~20 consumers branch on `if is_high_stakes(...)`
-- AND `if not is_high_stakes(...)`, so NULL falls out of BOTH branches.
-- That is not "off", it is undefined behaviour across every approve /
-- autodraft / rule-post path. Raising the value keeps semantics intact
-- everywhere.
--
-- OPERATIONAL INTENT. At RM10,000 every routine monthly vendor of the pilot
-- books (accounting fee RM13,000; rentals RM13,000–41,040) was permanently
-- barred from bounded autopost. At RM100,000 those become eligible once the
-- ≥3-sighting floor is met, while six-figure bills (RM200,500–435,560 in the
-- same books) remain high-stakes and human-approved. Per-rule caps (admin-
-- signed, must be ≤ this ceiling) continue to bind underneath.
--
-- FOLLOW-UP OWED. There is NO governed verb for this column (verified —
-- the only path is this hand-run file). Migration 0022 should add an
-- audited owner-floor `set_firm_high_stakes_threshold` so this is never a
-- raw UPDATE again.
--
-- USAGE:  psql -v ON_ERROR_STOP=1 -f packages/db/deploy/wave-b-highstakes-rm100k-amendment.sql
-- Idempotence: a re-run REFUSES (precondition pins the old value) rather
-- than silently passing — deliberate, so a double-apply is visible.
-- =====================================================================

-- SCOPE: BELCORT ONLY. Live holds three firms — BELCORT (the owner's real practice:
-- RPR + Bee Creative + Rome Secretary, 36 entries) plus two slice-era RLS-isolation
-- fixtures (Alara Advisory Sdn Bhd, Borneo Books & Co). The first draft of this file
-- assumed single-tenant and its own precondition refused on "found 3" — the assertion
-- working as designed. The owner's ruling governs HIS firm; the fixtures deliberately
-- keep the RM10,000 default (they exist to prove isolation, and a policy edit nothing
-- asked for is how fixtures drift).

begin;

do $$
declare v_cur bigint; v_firm uuid; v_moved int;
begin
  -- Precondition: BELCORT exists, by exact name, currently at exactly RM10,000.
  select id, high_stakes_amount_cents into v_firm, v_cur
    from clara.firms where name = 'BELCORT';
  if v_firm is null then
    raise exception 'AMENDMENT ABORTED: no firm named BELCORT on this database';
  end if;
  if v_cur is distinct from 1000000 then
    raise exception 'AMENDMENT ABORTED: BELCORT high_stakes_amount_cents is % not 1000000 — the premise changed (or this already ran); re-read before applying', v_cur;
  end if;

  update clara.firms set high_stakes_amount_cents = 10000000 where id = v_firm;

  -- Verify BELCORT moved and BOTH fixtures did not.
  select high_stakes_amount_cents into v_cur from clara.firms where id = v_firm;
  if v_cur <> 10000000 then
    raise exception 'AMENDMENT FAILED: readback is %, expected 10000000', v_cur;
  end if;
  if exists (select 1 from clara.firms
              where id <> v_firm and high_stakes_amount_cents <> 1000000) then
    raise exception 'AMENDMENT OVERSHOT: a non-BELCORT firm moved off RM10,000';
  end if;

  -- Visibility, not a gate: how many of BELCORT's APPROVED entries change class
  -- under the new line (amount-only — categorical flags keep their rows high-stakes).
  select count(*) into v_moved
    from clara.journal_entries je
   where je.firm_id = v_firm and je.status = 'approved'
     and not (je.is_opening_balance or je.is_year_end or je.tax_affecting)
     and coalesce((select sum(l.debit_cents) from clara.journal_lines l
                    where l.entry_id = je.id), 0) between 1000000 and 9999999;
  raise notice 'OK  BELCORT high_stakes 1000000 -> 10000000 cents (RM10,000 -> RM100,000); fixtures untouched; % approved entr%(ies) reclassify as non-high-stakes under the amount test',
    v_moved, case when v_moved = 1 then 'y' else 'ie' end;
end $$;

commit;
