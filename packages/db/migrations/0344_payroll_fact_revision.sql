-- =====================================================================================
-- 0344_payroll_fact_revision.sql — #1056: A PERSON CORRECTS A MISREAD PAYROLL FACT THROUGH THE
-- DOCUMENT REVISE CONTROL.
--
-- WHAT WAS MISSING. #945 (0296) taught the estate to READ a payroll summary and #946 (0297)
-- taught it to POST one unattended. Neither gave a person a way to CORRECT a figure the reader
-- took wrong. `clara.revise_document_fact` (0217, recut by 0268) is the estate's one human fact
-- door, and every part of it is invoice-shaped: its field wall is `clara._revisable_invoice_field`
-- (0217:473), its observation counts `invoice_facts` extractions (0217:441), and the extraction it
-- appends is an `invoice_facts` row. A payroll question therefore had no path through it at all --
-- `payroll.run.gross_pay` passes the canonical grammar (0296 registered the namespace) and is then
-- refused `field_path_not_revisable`; and even if that wall had admitted it, the correction would
-- have landed in a chain `clara._payroll_posting_verdict` does not read (0297:597 reads
-- `payroll_text_facts`), which is exactly the silent desynchronisation #1056 forbids.
--
-- WHAT THIS FILE DOES. It gives that one door a SECOND LANE rather than a second door. The
-- shared law -- the agent wall, the bookkeeper floor, the op-key reserve, the document lock, the
-- live-bank-statement pin, the grammar wall, the capability verdict, the value guards, the
-- stale-version refusal, the revision ledger row, the `document.fact_revised` event, #885's
-- retirement of the Work parked on the corrected document and the audit row -- is written once and
-- serves both lanes. Only the four things that are genuinely per-lane branch: which closed set
-- admits the path, which extraction chain is observed, what the appended extraction is, and what
-- a correction means for the reading's own derived state.
--
-- THE ACCOUNTING QUESTION #1056 ASKS OUT LOUD, and the answer this file takes.
--
--   "the desired behavior should say explicitly whether a correction re-runs the posting verdict
--    or is blocked once posted."
--
--   BOTH, and they are two different runs:
--
--   * AN UNPOSTED RUN -- the correction lands and MOVES THE READING. The posting verdict is
--     STABLE and derived from the NEWEST payroll pair banked for the document (0297:844 says so
--     in its own comment), so it is re-derived against the corrected figures the next time
--     anything asks it -- the Needs-you row `payroll_posting_blocked` included, which is why that
--     row "clears itself when the block does" (0297:1129). NOTHING POSTS. The unattended post is
--     reachable from `clara.persist_payroll_facts` alone (0297 §G's splice), and this lane
--     "deliberately has no 'post it anyway' door, because nothing in this lane is posted on a
--     guess" (apps/web/components/firm/needs-you-affordances.tsx:128-130). A correction is a
--     correction to the READING; it is not an instruction to post.
--
--   * AN ALREADY-POSTED RUN -- REFUSED, by name, pointing at the entry: `payroll_run_already_posted`.
--     This is the accounting answer, not a convenience: a posted entry is corrected by REVERSING
--     it and booking the corrected one, never by editing the evidence underneath it while it
--     stands. The posted entry pins the very reading it was drafted from
--     (`flags->'payroll_run'->>'extraction_id'`, 0297:960), so admitting a revision would leave an
--     approved entry citing a superseded extraction with nothing anywhere saying so -- the
--     desynchronisation the brief names, in its purest form. The refusal names the act that
--     clears it, and the estate already supports that act: `clara.reverse_entry`, after which
--     `reversed_by is null` stops holding and the month re-opens (0297:697's own note, "A
--     reversed entry is not a duplicate").
--
--     IT IS THE SAME FAMILY AS A PIN THIS DOOR ALREADY CARRIES. 0217:602 refuses a revision while
--     a live bank statement is bound to the document, for the same reason and in almost the same
--     words: something the estate has already derived from this reading is standing on it, and it
--     must be taken down first. This file states the payroll member of that family; it widens
--     nothing for the invoice lane, whose posted-entry behaviour is unchanged to the byte.
--
-- WHAT A HUMAN DECLARATION DOES TO THE FACT STATE, and what it deliberately does not.
--   * The corrected question becomes `established` with the human's own figure, and its `basis`
--     becomes `human_declared` -- a new member of a vocabulary that already exists for exactly
--     this purpose (`printed_value`, `printed_total_agrees_row_sum`, ..., 0296:630).
--   * `state_version` stays `v1`, because `clara._payroll_entry_plan` refuses any other value
--     (0297:415) and a corrected run that made the whole gate unreadable would be worse than the
--     defect. Provenance is disclosed instead, on the state itself: a top-level `human_declared`
--     array naming every question a person has declared. A reader of a corrected state can always
--     tell which figures the frozen evaluator produced and which a person did.
--   * `computed_cents`, `text_raw`, `vision_raw` and the whole `rows` object are CARRIED
--     UNCHANGED. A person correcting a run TOTAL has said nothing about the quoted employee rows,
--     and the estate does not persist them (0296 step 7 strips them by construction). So a run
--     whose rows genuinely disagree or genuinely fail their own identity STAYS BLOCKED on rungs 3
--     and 4 after the correction, because those rungs also read `rows.contested`,
--     `rows.unbalanced` and `rows.unchecked` (0297:607-634) and this file moves none of them.
--   * clara.evaluate_payroll_run_state_v1 IS NOT CALLED AND NOT TOUCHED. It is a registered,
--     FROZEN closure (0296 §D.1) and it takes the two full channel envelopes, which no longer
--     exist by the time a person reads the page. This file's own body takes the STORED state and
--     one declared figure; it is a different question and it gets a different body.
--
-- WHAT THIS FILE IS NOT. It does not re-post, it does not mint a Needs-you row kind, it does not
-- touch the payroll evaluator, the payroll persist door, the drafting body or the gate, and it
-- adds no new granted name: the two doors it recuts keep their signatures, their owners and their
-- ACLs to the byte, and every helper it mints is granted to nobody.
--
-- REDO-SAFE: every statement is `create or replace function`, and the prestate takes a REDO branch
-- when the two recut bodies already carry this file's own marker.
-- =====================================================================================

-- =====================================================================================
-- §A  PRESTATE -- the bodies this file recuts, at the shas MEASURED live before it was written,
--     and the neighbour bodies it relies on but does not touch.
-- =====================================================================================
do $p1056_pre$
declare
  v_sha text; v_mode text := 'FIRST'; v_src text; v_i int; v_k text;
  -- The two bodies this file RECUTS, at their live pre-images.
  v_recut text[] := array[
    'clara.revise_document_fact(uuid,text,jsonb,int,text,text)',
    '6c5b63a8cac64ad2eb8a2eb984bd86b1d0fc15fce340aa0b74d9b55509bf43e6',
    'clara.list_source_revisions(uuid)',
    '7ff7e9c9c4d43e4344d70f65e44b16f75dd9d8f0e6e0953261ba3fd820e1585f'];
  -- The neighbour bodies this file RELIES ON and does NOT recut (house practice: a prestate pins
  -- what it reads, not only what it writes, so the integrator can find a pin another lane moves).
  v_neighbour text[] := array[
    'clara._revisable_invoice_field(text)',
    '2d44b64fc0011b0c947cf4fceab9363e814e0fe04a62906d9849b05a164c0b23',
    'clara._monetary_invoice_field(text)',
    '1b5a3e32e949107a910bbc9a6e8239438078a63abb64bcbabd1b5b80872f7219',
    'clara._document_source_observation(uuid)',
    '9e2a7abb60e386f550413709da48c4502ff08084ba1818727936dd7f50fd0483',
    'clara._document_posting_entry(uuid,uuid)',
    '8ba5e67f7bc92a809e5fbea04b635331c764a48263c1fef4e06f8efe67ebcfd0',
    'clara._assert_field_path(text)',
    '1f85850ae4b664fd5cdc816394556d391a12be729324cf06f30f3ad03eada52e',
    'clara.evaluate_payroll_run_state_v1(jsonb,jsonb)',
    '0b11727c230ff03ec94b758a95e7a2035c5af09d323a6f6da284cdd9d91fc8cd',
    'clara.persist_payroll_facts(uuid,jsonb,jsonb,integer)',
    '63633a3f06edcb6effebb7b2ca9a8a82c805bb2ca33537e49a1660b66c22f7aa',
    'clara._payroll_entry_plan(uuid,jsonb)',
    '9889780c7abcf79d6c939b79706c521113e7aa6b77b138cee6af1457e4889d83',
    'clara._payroll_posting_verdict(uuid)',
    '23c644b7b4ad11cee43c1e02acb2599733cb1000a808d108a5519d4b3a0a4df0'];
begin
  -- (a) THE RECUT PAIR. Marker-tolerant in ONE direction only: a body that already carries this
  --     file's own marker is a REDO of this file, and a body at neither the pinned pre-image nor
  --     this file's post-image is drift that must stop the apply.
  v_i := 1;
  while v_i < array_length(v_recut, 1) loop
    select p.prosrc, encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_src, v_sha
      from pg_proc p where p.oid = v_recut[v_i]::regprocedure;
    if v_sha is distinct from v_recut[v_i + 1] then
      if position('#1056' in coalesce(v_src,'')) > 0 then
        v_mode := 'REDO';
      else
        raise exception '#1056 prestate: % has DRIFTED (sha %) -- it is neither the pre-image this file recuts nor a body carrying this file''s own marker',
          v_recut[v_i], v_sha using errcode = 'CLR10';
      end if;
    end if;
    v_i := v_i + 2;
  end loop;

  -- (b) THE NEIGHBOURS. Byte-exact, in both the FIRST and the REDO branch: this file reads each
  --     of them and recuts none, so a moved neighbour is a merge conflict, not a redo.
  v_i := 1;
  while v_i < array_length(v_neighbour, 1) loop
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = v_neighbour[v_i]::regprocedure;
    if v_sha is null then
      raise exception '#1056 prestate: % does not resolve -- its own migration must apply first',
        v_neighbour[v_i] using errcode = 'CLR10';
    end if;
    if v_sha is distinct from v_neighbour[v_i + 1] then
      raise exception '#1056 prestate: neighbour % has DRIFTED (sha %, expected %) -- this file reads it and must be re-derived against the live body before applying',
        v_neighbour[v_i], v_sha, v_neighbour[v_i + 1] using errcode = 'CLR10';
    end if;
    v_i := v_i + 2;
  end loop;

  -- (c) THE PAYROLL LANE'S OWN PREMISES, asked rather than assumed: the namespace the eleven
  --     questions live under is registered (0296 §B), and the two payroll extraction kinds are
  --     admitted by clara.document_extractions' own CHECK (0296:824-827).
  if clara._field_path_conforms('payroll.run.gross_pay') is not true then
    raise exception '#1056 prestate: the `payroll` field-path namespace is not registered -- 0296 must apply first'
      using errcode = 'CLR10';
  end if;
  foreach v_k in array array['payroll_text_facts','payroll_vision_facts'] loop
    if not exists (select 1 from pg_constraint c
                    where c.conname = 'ck_document_extractions_engine_kind_f_a1'
                      and position(quote_literal(v_k) in pg_get_constraintdef(c.oid)) > 0) then
      raise exception '#1056 prestate: clara.document_extractions does not admit engine_kind % -- 0296 must apply first',
        v_k using errcode = 'CLR10';
    end if;
  end loop;

  raise notice '#1056 prestate: OK (% apply) -- clara.revise_document_fact and clara.list_source_revisions are at their pinned pre-images (or already carry this file''s marker), the nine neighbour bodies this file reads are byte-exact, the `payroll` namespace is registered and both payroll extraction kinds are admitted.', v_mode;
end
$p1056_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §B  THE PAYROLL LANE'S OWN CLOSED SET -- clara._revisable_payroll_run_field(text).
--
--     THE ELEVEN RUN-LEVEL QUESTIONS AND NOTHING ELSE. It is `clara._payroll_answers_ok`'s own
--     run-level vocabulary (0296:281-285), re-stated here for the same reason 0217:465 re-states
--     `clara.persist_invoice_facts`' allowlist rather than reaching for it: a human revision has
--     to land in a row the payroll regime can carry, and these eleven are exactly the paths
--     `clara.persist_payroll_facts` writes a region for (0296 step 9).
--
--     NOTHING BELOW THE RUN LEVEL, and that is structural rather than cautious. The six
--     per-employee cells are summed and DISCARDED at read time -- "there is no branch in which a
--     per-employee cell reaches clara.document_extractions" (0296 step 7) -- so no region carries
--     one, there is no prior value to revise against, and a control over them would be a control
--     over a figure that is not on file.
-- =====================================================================================
create or replace function clara._revisable_payroll_run_field(p_path text) returns boolean
  language sql immutable set search_path = clara, pg_temp as $fn$
  select p_path in ('payroll.run.period','payroll.run.gross_pay',
    'payroll.run.epf_employee','payroll.run.epf_employer',
    'payroll.run.socso_employee','payroll.run.socso_employer',
    'payroll.run.eis_employee','payroll.run.eis_employer',
    'payroll.run.pcb','payroll.run.hrdf_levy','payroll.run.net_pay');
$fn$;
revoke all on function clara._revisable_payroll_run_field(text) from public;

comment on function clara._revisable_payroll_run_field(text) is
  '#1056: the payroll lane''s closed revisable set -- the ELEVEN run-level questions clara.persist_payroll_facts writes a region for (0296''s own clara._payroll_answers_ok vocabulary). Nothing below the run level: the six per-employee cells are summed and discarded at read time, so no region carries one and there is no prior value a revision could replace. Ungranted; reached from clara._revisable_fact_lane alone.';

-- =====================================================================================
-- §C  WHICH LANE A PATH BELONGS TO -- clara._revisable_fact_lane(text).
--
--     THE BRIEF'S OWN CHOICE, TAKEN THE SECOND WAY. #1056 offers two shapes: widen the invoice
--     predicate, "or a sibling predicate needs to exist and be wired into the document facts
--     table's revise-control decision". This is the sibling. Widening
--     `clara._revisable_invoice_field` would have made its NAME false, and it is not merely a
--     name: the door asks `clara._monetary_invoice_field` about the same path two statements
--     later, and the invoice sign conventions at 0268:679-686 are stated in terms of that same
--     family. A set that admits `payroll.run.pcb` while its monetary sibling does not is a pair
--     of closed sets that have started to disagree.
--
--     ONE ARBITER, TWO MEMBERSHIPS. The door asks this body once and branches on the answer, so
--     "is this path revisable at all" and "which chain does the revision land in" can never give
--     different answers. NULL means no lane admits it -- the door's `field_path_not_revisable`.
-- =====================================================================================
create or replace function clara._revisable_fact_lane(p_path text) returns text
  language sql immutable set search_path = clara, pg_temp as $fn$
  select case
           when clara._revisable_invoice_field(p_path) then 'invoice'
           when clara._revisable_payroll_run_field(p_path) then 'payroll'
         end;
$fn$;
revoke all on function clara._revisable_fact_lane(text) from public;

comment on function clara._revisable_fact_lane(text) is
  '#1056: the ONE arbiter of which fact chain a human revision of this path would land in -- `invoice`, `payroll`, or NULL for a path no chain can carry. clara.revise_document_fact asks it once and branches on the answer, so "is this revisable" and "which chain" can never disagree. It ASKS clara._revisable_invoice_field rather than restating it: neither closed set learns the other''s members. Ungranted.';

-- =====================================================================================
-- §D  WHICH PAYROLL READING IS CURRENT -- clara._payroll_source_observation(uuid).
--
--     THE PAYROLL TWIN of clara._document_source_observation (0217:441), and derived in exactly
--     one place for the same reason that one is: two transcribed copies would eventually disagree
--     about the same document.
--
--     IT ORDERS THE WAY THE GATE ORDERS, and that is the load-bearing line in this body.
--     clara._payroll_posting_verdict judges "the NEWEST payroll pair banked for this document",
--     by `version_n desc, extracted_at desc` and with no `superseded_by` term at all (0297:597-600).
--     This body repeats that ordering verbatim rather than borrowing 0217's kind-current shape
--     (newest NOT-superseded by `extracted_at, id`). If the two disagreed, the door would revise
--     one reading while the gate judged another -- which is the desynchronisation this whole file
--     exists to prevent, arriving by a different road.
--
--     `facts_version` IS A COUNT, for 0217:433's reason restated in the payroll lane's terms:
--     `version_n` is scoped to (document, engine_id, engine_kind) by the table's own four-column
--     unique, so the machine's first read and the first human revision would BOTH be version_n 1
--     under their own engine ids -- a comparator that could not tell them apart. The count of done
--     `payroll_text_facts` rows moves once per accepted revision, whoever wrote it, which is
--     exactly the quantity a stale-version refusal has to compare.
--
--     NO `payroll_vision_facts` TERM. The vision row is the independence receipt, never a reading
--     a person revises: `clara.persist_payroll_facts` banks the state and every region on the TEXT
--     row (0296 steps 7-9) and the gate reads the text row alone. A human declaration is about
--     what the page says, and there is one place in this estate that records that.
-- =====================================================================================
create or replace function clara._payroll_source_observation(p_document uuid)
  returns table (facts_extraction_id uuid, facts_version int)
  language plpgsql stable security definer set search_path = clara, pg_temp as $fn$
begin
  return query
    select
      (select e.id from clara.document_extractions e
        where e.document_id = d.id and e.firm_id = d.firm_id
          and e.engine_kind = 'payroll_text_facts' and e.status = 'done'
        order by e.version_n desc, e.extracted_at desc limit 1),
      (select count(*)::int from clara.document_extractions e
        where e.document_id = d.id and e.firm_id = d.firm_id
          and e.engine_kind = 'payroll_text_facts' and e.status = 'done')
    from clara.documents d where d.id = p_document;
end $fn$;
revoke all on function clara._payroll_source_observation(uuid) from public;

comment on function clara._payroll_source_observation(uuid) is
  '#1056: which payroll reading of this document is CURRENT, and how many there have been. The payroll twin of clara._document_source_observation, ordered the way clara._payroll_posting_verdict orders (version_n desc, extracted_at desc, no superseded_by term) so the door and the gate can never judge different readings of the same document. `facts_version` is a COUNT of done payroll_text_facts extractions, not a version_n: version_n is per engine, so the machine''s first read and a human''s first revision are both 1. Ungranted.';

-- =====================================================================================
-- §E  WHAT A HUMAN DECLARATION MAKES OF THE BANKED STATE --
--     clara._payroll_state_with_human_fact(jsonb, text, text, bigint).
--
--     WHY THIS BODY EXISTS AT ALL, rather than a second call to the evaluator. The reading that
--     `clara._payroll_posting_verdict` judges is not the regions on the page; it is the
--     `payroll_state` object banked in the extraction envelope (0297:597-600). So a correction
--     that moved only the region would show a person one figure and post from another -- the
--     silent desynchronisation #1056 exists to remove. The state has to move with the fact.
--
--     AND IT CANNOT BE THE EVALUATOR THAT MOVES IT. `clara.evaluate_payroll_run_state_v1` takes
--     the TWO FULL CHANNEL ENVELOPES, and the per-employee quotes inside them were stripped and
--     discarded at read time by construction (0296 step 7). They do not exist by the time a
--     person reads the page. It is also a REGISTERED, FROZEN closure (0296 §D.1), and a changed
--     formula there "is a _v2, never an edit". This body therefore asks a DIFFERENT question --
--     "what does this stored state become when a professional states one of its figures?" -- and
--     gets its own body, which touches the evaluator not at all.
--
--     WHAT IT REPLACES: the VERDICT on the one question, and nothing else.
--       state         -> `established`. Anything narrower would leave the run blocked on a rung
--                        naming a condition the person has just resolved:
--                        `clara._payroll_entry_plan` drafts from `established` ALONE (0297:451)
--                        and would report `run_totals_not_printed` about a figure a person had
--                        just typed.
--       printed_cents -> the declared figure; NULL for `payroll.run.period`, the one non-monetary
--                        question, exactly as clara.persist_payroll_facts writes it (0296 step 9).
--       printed_raw   -> the declared rendering, verbatim.
--       basis         -> `human_declared`, a new member of the vocabulary 0296 already keeps for
--                        exactly this purpose. It is the ONLY place a reader can tell a figure a
--                        person stated from a figure the frozen evaluator established, per fact.
--       reason        -> null. The evaluator's refusal reason is spent.
--
--     WHAT IT CARRIES, UNCHANGED, and why each one matters:
--       computed_cents  the column sum over the quoted employee rows. A person correcting a
--                       printed TOTAL has not re-read the rows, so the sum still says what it
--                       said -- and a reviewer comparing the two is exactly who needs it.
--       text_raw /      what each channel actually read. A declaration replaces the verdict, not
--       vision_raw      the evidence; the machine's own two readings stay on the record.
--       rows            the whole object: `agreed`, `contested`, `unbalanced`, `unchecked`. This
--                       is the load-bearing carry. Rungs 3 and 4 of the gate read `rows` DIRECTLY
--                       as well as the per-fact states (0297:607-634), so a run whose employee
--                       rows genuinely disagree or genuinely fail their own gross-minus-deductions
--                       identity STAYS BLOCKED after any number of run-level declarations. A
--                       person cannot clear a row problem from the run line, and this body does
--                       not let them appear to.
--       everything else including `state_version`, which stays `v1` because the drafting body
--                       refuses any other value (0297:415) and a corrected run that made the whole
--                       gate unreadable would be worse than the defect being corrected.
--
--     AND WHAT IT ADDS: `human_declared`, a sorted, duplicate-free array of every question a
--     person has stated on this reading. `state_version` cannot carry that disclosure, so the
--     state carries it beside the version. A machine-produced state never has the key at all.
--
--     THE THREE BUCKETS ARE RE-DERIVED, in the eleven questions' own order, by the evaluator's
--     own rule (`established` -> established, `not_printed` -> missing, anything else ->
--     disagreed; 0296:672-675). Patching one bucket and trusting the others is how a projection
--     starts disagreeing with the facts it projects.
-- =====================================================================================
create or replace function clara._payroll_state_with_human_fact(p_state jsonb, p_field text,
    p_raw text, p_cents bigint)
  returns jsonb language plpgsql immutable set search_path = clara, pg_temp as $fn$
declare
  v_run text[] := array['payroll.run.period','payroll.run.gross_pay',
    'payroll.run.epf_employee','payroll.run.epf_employer',
    'payroll.run.socso_employee','payroll.run.socso_employer',
    'payroll.run.eis_employee','payroll.run.eis_employer',
    'payroll.run.pcb','payroll.run.hrdf_levy','payroll.run.net_pay'];
  v_facts jsonb; v_prior jsonb; v_declared jsonb;
  v_est text[] := array[]::text[];
  v_dis text[] := array[]::text[];
  v_mis text[] := array[]::text[];
  v_f text; v_state text;
begin
  -- IT REFUSES RATHER THAN NO-OPS. A body that quietly returned the state unchanged would let the
  -- door append an extraction whose reading had not moved, which is the defect wearing a receipt.
  if p_state is null or p_state->>'state_version' is distinct from 'v1'
     or jsonb_typeof(p_state->'facts') <> 'object' then
    raise exception 'the banked payroll state is not a v1 fact state this door can revise'
      using errcode = 'CLR10', detail = '{"reason":"payroll_state_unreadable"}';
  end if;
  if not clara._revisable_payroll_run_field(p_field) then
    raise exception 'field path % is not a payroll run question', quote_literal(left(p_field, 160))
      using errcode = 'CLR10', detail = '{"reason":"field_path_not_revisable"}';
  end if;
  v_prior := p_state->'facts'->p_field;
  if v_prior is null or jsonb_typeof(v_prior) <> 'object' then
    raise exception 'the banked payroll state carries no fact for %', quote_literal(left(p_field, 160))
      using errcode = 'CLR10', detail = '{"reason":"payroll_fact_absent"}';
  end if;

  v_facts := (p_state->'facts') || jsonb_build_object(p_field, v_prior || jsonb_build_object(
    'state', 'established',
    'printed_raw', to_jsonb(p_raw),
    'printed_cents', to_jsonb(p_cents),
    'reason', null::text,
    'basis', 'human_declared'));

  foreach v_f in array v_run loop
    v_state := v_facts->v_f->>'state';
    if v_state = 'established' then v_est := v_est || v_f;
    elsif v_state = 'not_printed' then v_mis := v_mis || v_f;
    else v_dis := v_dis || v_f;
    end if;
  end loop;

  select coalesce(jsonb_agg(s.d order by s.d), '[]'::jsonb) into v_declared
    from (select t.e as d
            from jsonb_array_elements_text(
                   case when jsonb_typeof(p_state->'human_declared') = 'array'
                        then p_state->'human_declared' else '[]'::jsonb end) as t(e)
          union
          select p_field) s;

  return p_state || jsonb_build_object(
    'facts', v_facts,
    'established', to_jsonb(v_est),
    'disagreed', to_jsonb(v_dis),
    'missing', to_jsonb(v_mis),
    'human_declared', v_declared);
end $fn$;
revoke all on function clara._payroll_state_with_human_fact(jsonb, text, text, bigint) from public;

comment on function clara._payroll_state_with_human_fact(jsonb, text, text, bigint) is
  '#1056: what a banked payroll fact state becomes when a professional states one of its figures. It replaces the VERDICT on that one question -- state `established`, the declared figure and rendering, basis `human_declared` -- re-derives the three buckets by the evaluator''s own rule, and discloses itself in a sorted `human_declared` array. It carries `computed_cents`, both channel quotes and the WHOLE `rows` object unchanged, so a run whose quoted employee rows disagree or fail their own identity stays blocked on the gate''s rungs 3 and 4 however many run-level figures a person declares. It never calls clara.evaluate_payroll_run_state_v1 (a frozen closure that takes envelopes this estate no longer holds) and never touches it. Ungranted.';

reset role;

-- =====================================================================================
-- §Z  TAIL -- what this file left behind, re-read from the COMMITTED catalog.
-- =====================================================================================
do $p1056_tail$
declare v_n int; v_f text; v_fn text; v_role text;
begin
  -- (1) THE LANE ARBITER agrees with both closed sets, in both directions.
  foreach v_f in array array['payroll.run.period','payroll.run.gross_pay',
      'payroll.run.epf_employee','payroll.run.epf_employer',
      'payroll.run.socso_employee','payroll.run.socso_employer',
      'payroll.run.eis_employee','payroll.run.eis_employer',
      'payroll.run.pcb','payroll.run.hrdf_levy','payroll.run.net_pay'] loop
    if clara._revisable_fact_lane(v_f) is distinct from 'payroll' then
      raise exception '#1056 tail: % is not on the payroll lane', v_f using errcode = 'CLR10';
    end if;
  end loop;
  if clara._revisable_fact_lane('invoice.total') is distinct from 'invoice' then
    raise exception '#1056 tail: the invoice lane no longer answers for invoice.total' using errcode = 'CLR10';
  end if;
  if clara._revisable_fact_lane('payroll.row.gross_pay') is not null
     or clara._revisable_fact_lane('statement.closing_balance') is not null
     or clara._revisable_fact_lane('payroll.run.bonus') is not null then
    raise exception '#1056 tail: the lane arbiter admitted a path no chain can carry' using errcode = 'CLR10';
  end if;

  -- (2) NO NEW GRANT. Every name this file mints is reached from a definer body alone -- the
  --     0217:1425 shape, role by role rather than by an ACL emptiness that `revoke from public`
  --     itself makes false.
  foreach v_fn in array array[
    'clara._revisable_payroll_run_field(text)', 'clara._revisable_fact_lane(text)',
    'clara._payroll_source_observation(uuid)',
    'clara._payroll_state_with_human_fact(jsonb,text,text,bigint)'] loop
    if to_regprocedure(v_fn) is null then
      raise exception '#1056 tail: % does not resolve', v_fn using errcode = 'CLR10';
    end if;
    foreach v_role in array array['clara_authenticated','clara_agent_ro','clara_runtime','public'] loop
      if pg_catalog.has_function_privilege(v_role, v_fn, 'execute') then
        raise exception '#1056 tail: internal % is reachable by %', v_fn, v_role using errcode = 'CLR10';
      end if;
    end loop;
  end loop;

  raise notice '#1056 tail: OK -- clara._revisable_payroll_run_field holds the eleven run-level questions and nothing below the run level; clara._revisable_fact_lane answers `payroll` for those eleven, `invoice` for the invoice lane''s own unwidened closed set and NULL for everything else; both helpers are granted to nobody.';
end
$p1056_tail$;
