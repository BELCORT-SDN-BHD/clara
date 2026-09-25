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

-- =====================================================================================
-- §F  IS ANYTHING POSTED STANDING ON THIS DOCUMENT -- clara._document_live_posted_entry(uuid).
--
--     THE ESTATE'S OWN QUESTION, ASKED ONCE PER LIVE FILING. `clara._document_posting_entry`
--     (0182:578) already answers "which live entry is bound to this document, for this client" --
--     a LIVE evidence link first, then an approved, un-reversed, document-bound entry -- and
--     `clara._payroll_posting_verdict`'s `same_document` duplicate scope asks it in exactly that
--     shape (0297:707). This body does not re-derive it; it asks it for every client this document
--     is live in, because `uq_document_filing_active` is per (document, client) and one document
--     may legitimately be filed to two clients of one firm (0182:566's own note). A client-scoped
--     lookup would MISS the sibling's binding and answer "free".
--
--     A REVERSED ENTRY IS NOT AN ANSWER, and that is what makes the refusal it feeds actionable
--     rather than terminal: `_document_posting_entry`'s own arms require `released_at is null` and
--     `reversed_by is null`, so reversing the entry makes this body answer NULL and the correction
--     becomes admissible -- the same asymmetry 0297:697 relies on when it says "a reversal
--     re-opens the month".
-- =====================================================================================
create or replace function clara._document_live_posted_entry(p_document uuid) returns uuid
  language sql stable security definer set search_path = clara, pg_temp as $fn$
  select x.entry
    from clara.document_filings f
    cross join lateral (select clara._document_posting_entry(f.client_id, p_document) as entry) x
   where f.document_id = p_document and f.retired_at is null and x.entry is not null
   order by f.filed_at desc, f.id desc
   limit 1;
$fn$;
revoke all on function clara._document_live_posted_entry(uuid) from public;

comment on function clara._document_live_posted_entry(uuid) is
  '#1056: the live posted entry standing on this document, under ANY of its live filings, or NULL. It ASKS clara._document_posting_entry once per live filing rather than re-deriving it, so the answer and clara._payroll_posting_verdict''s `same_document` duplicate scope can never disagree. A reversed or released entry is not an answer, which is what makes the refusal it feeds clearable by clara.reverse_entry. Ungranted.';

-- =====================================================================================
-- §G  THE RECUT -- clara.revise_document_fact GAINS THE PAYROLL LANE.
--
--     THE 0268 BODY, CARRIED VERBATIM except where a line is marked `#1056`. Every guard, in the
--     order 0217 set and 0268 re-ordered for the Work rungs, is present and unmoved: the agent
--     wall, the bookkeeper floor, the op-key requirement, the shape guard, the Work locks taken
--     BEFORE clara.documents (0268's own deadlock note), the document lock, the reserve, the live
--     bank-statement pin, the grammar wall, the capability verdict, the scalar/blank value guards,
--     the stale-source CLR19, the append, the carry-forward, the revision ledger row, the
--     `document.fact_revised` event, #885's Work supersession, the audit row and `_finish_op`.
--
--     THE SEVEN `#1056` POINTS, and nothing else moves:
--       1  the lane wall replaces the invoice-only field wall, asking clara._revisable_fact_lane;
--       2  the payroll posted-entry pin, the payroll member of the live-bank-statement family;
--       3  the observation is the lane's own;
--       4  a payroll figure is monetary unless it is the month, and it is bounded: non-negative
--          and inside the frozen evaluator's own magnitude window, so the door never admits a
--          figure the machine could not have read;
--       5  the appended extraction's KIND and its version_n, which for the payroll lane counts
--          across the kind rather than across this engine;
--       6  the envelope, which for the payroll lane carries the corrected `payroll_state` and a
--          `human` channel beside the human provenance keys;
--       7  the receipt names the lane, so a surface never has to infer it from the field path.
--
--     WHAT DOES NOT MOVE FOR THE INVOICE LANE: every branch above is guarded on `v_lane`, and the
--     invoice arm of each is the 0268 expression byte for byte. An invoice revision on a document
--     whose entry is posted is admitted exactly as it is today; #1056 rules on the payroll lane
--     alone, and widening the invoice lane's posted-entry behaviour would be a change nobody
--     asked for to a door six other batteries pin.
-- =====================================================================================
create or replace function clara.revise_document_fact(p_document uuid, p_field_path text, p_value jsonb,
    p_observed_version int, p_reason text, p_op_key text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare
  c record; wk record; d record; obs record; r record; prior record;
  v_dedupe jsonb; v_ext uuid; v_version int; v_format text; v_cap jsonb;
  v_raw text; v_cents bigint; v_monetary boolean; v_carried int := 0;
  v_prior_value jsonb; v_new_value jsonb; v_client uuid; v_revision uuid;
  v_locator_kind text; v_locator jsonb; v_found boolean;
  -- #885 · the Work rungs this call took BEFORE clara.documents, and what it did with them.
  v_locked uuid[]; v_superseded jsonb;
  -- #1056 · the lane this correction belongs to, and what the payroll lane needs beyond it.
  v_lane text; v_posted uuid; v_kind text; v_prior_env jsonb; v_envelope jsonb;
  v_payroll_state jsonb;
begin
  -- THE AGENT WALL, verbatim from clara.set_document_kind (0169:162-165). A revision of what a
  -- document SAYS is a human judgement; a wake credential makes none.
  select * into wk from clara.wake_context();
  if wk.credential_id is not null or exists(select 1 from clara.users u
      where u.id = clara.jwt_sub() and u.is_agent) then
    raise exception 'agent identity cannot revise a document fact' using errcode = 'CLR03';
  end if;
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  if p_document is null or p_field_path is null
     or p_reason is null or nullif(btrim(p_reason), '') is null then
    raise exception 'a document, a field path and a reason are required' using errcode = 'CLR10',
      detail = '{"reason":"revision_incomplete"}';
  end if;

  -- #885 · THE WORK RUNGS, TAKEN BEFORE clara.documents AND NOT AFTER IT. The declared global
  -- order is accounting_plans -> accounting_work -> agent_tasks -> agent_interruptions
  -- (0193:248), and the JOURNAL lane already takes clara.documents while holding the
  -- accounting_work rung (clara._lock_document_binding, 0197:329, from two BEFORE ROW triggers
  -- on clara.journal_entries and clara.entry_evidence_links). A correcting transaction that
  -- took clara.documents first and reached for a Work row afterwards would be the OTHER
  -- direction of that same edge -- the ABBA a posting transaction and a correction can deadlock
  -- on. So the Work rungs are taken FIRST, in the declared order, and clara.documents stays
  -- BELOW them; 0217's own documents lock is not moved by one line, it simply is no longer the
  -- first lock this body takes. The helper returns exactly the ids it LOCKED, and nothing else
  -- in this body may supersede a Work it did not lock.
  v_locked := clara._lock_source_corrected_work(p_document, c.firm);

  -- SERIALISED AGAINST EVERY OTHER WRITER OF THIS DOCUMENT'S READING, on the same row
  -- clara.set_document_kind takes (0169:184). Two concurrent revisions of the same document
  -- therefore queue here rather than racing the facts-version comparison below.
  select * into d from clara.documents where id = p_document for update;
  if not found or d.firm_id <> c.firm then
    raise exception 'document not in your firm' using errcode = 'CLR11',
      detail = '{"reason":"document_not_found"}';
  end if;

  v_dedupe := clara._reserve_op(c.firm, 'revise_document_fact', p_op_key,
    clara._hash(jsonb_build_object('document', p_document, 'field_path', p_field_path,
      'value', p_value, 'observed_version', p_observed_version, 'reason', p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- 0038's LIVE BANK STATEMENT PIN, the same family as set_document_kind's (0169:199-203): a
  -- statement, its lines and every match on them cite this document's reading. Void the statement
  -- first, then revise.
  if clara._bank_live_statement_on_document(p_document) then
    raise exception 'a live bank statement is bound to this document; void it before revising its facts'
      using errcode = 'CLR10', detail = '{"reason":"live_bank_statement_present"}';
  end if;

  -- THE GRAMMAR WALL FIRST (0191:554 -- CLR10 with its own detail), then the narrower lane wall.
  -- Order matters: a string that is not a path at all must be refused as a SYNTAX error, while
  -- `statement.closing_balance` is a perfectly canonical path that simply cannot live in an
  -- invoice-facts extraction.
  perform clara._assert_field_path(p_field_path);
  -- #1056 (1) · THE LANE WALL. One arbiter, asked once: `invoice`, `payroll`, or NULL for a path
  -- no chain in this estate can carry. The refusal is 0217's, to the byte -- widening the door
  -- must not change what a caller sees when it is still refused.
  v_lane := clara._revisable_fact_lane(p_field_path);
  if v_lane is null then
    raise exception 'field path % is not one this door can revise', quote_literal(left(p_field_path, 160))
      using errcode = 'CLR10', detail = jsonb_build_object('reason', 'field_path_not_revisable',
        'field_path', p_field_path)::text;
  end if;

  -- #1056 (2) · THE POSTED-ENTRY PIN, the payroll member of the live-bank-statement family above
  -- and the answer to the brief's own question about an already-posted run. A payroll entry is
  -- posted UNATTENDED from this very reading and pins the extraction it was drafted from
  -- (0297:960); letting the reading move underneath it would leave the books citing a superseded
  -- extraction with nothing anywhere saying so. A posted entry is corrected by REVERSING it, and
  -- the refusal names the entry so a person can go and do exactly that.
  --
  -- PAYROLL ONLY, deliberately. The invoice lane has carried no posted-entry pin since 0217 and
  -- #1056 rules on the payroll lane; changing the invoice lane here would be a behaviour change
  -- nobody asked for to a door six other batteries pin.
  if v_lane = 'payroll' then
    v_posted := clara._document_live_posted_entry(p_document);
    if v_posted is not null then
      raise exception 'this payroll run is already posted as entry %; reverse that entry before revising the figures it was booked from', v_posted
        using errcode = 'CLR10', detail = (
          select jsonb_build_object('reason', 'payroll_run_already_posted',
            'field_path', p_field_path, 'entry_id', j.id, 'status', j.status,
            'posting_date', to_char(j.posting_date, 'YYYY-MM-DD'), 'memo', j.memo)::text
            from clara.journal_entries j where j.id = v_posted);
    end if;
  end if;

  -- THE CAPABILITY REGISTRY'S OWN VERDICT (0191:460), asked rather than re-derived. An
  -- unclassified document reads `typed_facts: unsupported` with `kind_known:false`, which is the
  -- honest refusal for "there are no typed facts here to revise yet".
  v_format := clara._document_format(d.mime_type);
  v_cap := clara._document_capability(v_format, d.document_kind);
  if coalesce(v_cap->>'typed_facts', 'unsupported') <> 'supported' then
    raise exception 'typed facts are not supported for this document'
      using errcode = 'CLR10', detail = jsonb_build_object('reason', 'typed_facts_not_supported',
        'format', v_format, 'document_kind', d.document_kind,
        'typed_facts', v_cap->>'typed_facts')::text;
  end if;

  -- #1056 (3) · THE OBSERVATION IS THE LANE'S OWN. `clara._document_source_observation` counts
  -- the INVOICE chain and would answer 0 for a payroll summary, refusing `no_facts_to_revise`
  -- below about a document the estate has read perfectly well. Both bodies return the same two
  -- column names, so everything downstream of this branch is one expression.
  if v_lane = 'payroll' then
    select po.facts_extraction_id, po.facts_version into obs
      from clara._payroll_source_observation(p_document) po;
  else
    select dso.facts_extraction_id, dso.facts_version into obs
      from clara._document_source_observation(p_document) dso;
  end if;
  if obs.facts_version = 0 or obs.facts_extraction_id is null then
    raise exception 'this document carries no typed facts to revise'
      using errcode = 'CLR10', detail = '{"reason":"no_facts_to_revise"}';
  end if;

  -- THE VALUE, decoded before the staleness comparison so a malformed value is not reported as a
  -- version problem. A jsonb scalar only: an object or an array is not a value a fact region can
  -- carry, and silently stringifying one would store JSON text where a professional expects the
  -- figure they typed.
  if p_value is null or jsonb_typeof(p_value) not in ('string', 'number') then
    raise exception 'a revised fact value must be a JSON string or number'
      using errcode = 'CLR10', detail = '{"reason":"value_not_scalar"}';
  end if;
  v_raw := p_value #>> '{}';
  if nullif(btrim(coalesce(v_raw, '')), '') is null then
    raise exception 'a revised fact value must not be blank -- this door revises a value, it does not remove one'
      using errcode = 'CLR10', detail = '{"reason":"value_blank"}';
  end if;
  v_raw := btrim(v_raw);
  -- #1056 (4) · WHICH FIGURES ARE MONEY. On the payroll lane every run-level question is a figure
  -- except the month, which is the same asymmetry clara.persist_payroll_facts writes its regions
  -- under (0296 step 9's `v_f <> 'payroll.run.period'` arm).
  v_monetary := case when v_lane = 'payroll' then p_field_path <> 'payroll.run.period'
                     else clara._monetary_invoice_field(p_field_path) end;
  if v_monetary then
    v_cents := clara._normalize_invoice_cents(v_raw);
    -- STRICTER THAN clara.persist_invoice_facts ON `invoice.total`, DELIBERATELY. That writer
    -- admits an unparseable total because an OCR engine legitimately cannot read one and the
    -- fail-closed corroboration path handles it (0026:846-851). A HUMAN typing a total that does
    -- not normalise to cents is a typo, and accepting it would store a fact with no number in the
    -- one field the six-term identity is measured against.
    if v_cents is null then
      raise exception 'a revised monetary value must be readable as cents'
        using errcode = 'CLR10', detail = jsonb_build_object('reason', 'monetary_value_malformed',
          'field_path', p_field_path, 'attempted_value', v_raw)::text;
    end if;
    -- 0022's (b2) and 0023's (b3) sign conventions, re-stated at this boundary because an
    -- emitter convention is not a control: the identity SUBTRACTS the discount, so a negative one
    -- becomes a plus and a wrong total ties.
    if p_field_path in ('invoice.service_charge','invoice.discount','invoice.delivery',
                        'invoice.total_excl_tax','invoice.tax_total') and v_cents < 0 then
      raise exception 'a stated invoice component must not be negative'
        using errcode = 'CLR10', detail = jsonb_build_object('reason', 'component_must_not_be_negative',
          'field_path', p_field_path, 'attempted_cents', v_cents)::text;
    end if;
    -- #1056 (4) · THE PAYROLL WINDOW. Two guards, and together they keep every figure this door
    -- admits inside the one the FROZEN evaluator could itself have read, so a declared figure and
    -- a machine-read figure are always comparable:
    --   * NON-NEGATIVE. No run-level payroll question is ever negative on a payslip -- a gross,
    --     a statutory deduction, a levy and a net are all magnitudes -- and a negative one would
    --     flip the side of a leg clara._payroll_entry_plan draws from it (0297:394-404).
    --   * INSIDE THE EVALUATOR'S MAGNITUDE WINDOW. 0296's own normalisation admits at most
    --     thirteen integer digits and two decimals, i.e. 999_999_999_999_999 cents; the shared
    --     clara._normalize_invoice_cents carries no such bound. Without this the door would admit
    --     a figure the machine could never have produced.
    if v_lane = 'payroll' and v_cents < 0 then
      raise exception 'a payroll run figure must not be negative'
        using errcode = 'CLR10', detail = jsonb_build_object('reason', 'payroll_value_negative',
          'field_path', p_field_path, 'attempted_cents', v_cents)::text;
    end if;
    if v_lane = 'payroll' and v_cents > 999999999999999::bigint then
      raise exception 'a payroll run figure must be inside the range the payroll evaluator itself reads'
        using errcode = 'CLR10', detail = jsonb_build_object('reason', 'payroll_value_out_of_range',
          'field_path', p_field_path, 'attempted_cents', v_cents)::text;
    end if;
  end if;

  -- THE STALE-SOURCE REFUSAL (CLR19), with the attempted value echoed back so the surface can
  -- re-show what the human typed beside what the document now says. AC2: "preserves the attempted
  -- values and converges on the accepted revision".
  if p_observed_version is distinct from obs.facts_version then
    raise exception 'this revision was written against facts version %, the current version is %',
      coalesce(p_observed_version, -1), obs.facts_version
      using errcode = 'CLR19', detail = jsonb_build_object('reason', 'stale_source_version',
        'observed_version', p_observed_version, 'current_version', obs.facts_version,
        'current_extraction_id', obs.facts_extraction_id,
        'field_path', p_field_path, 'attempted_value', v_raw)::text;
  end if;

  -- THE APPENDED EXTRACTION. version_n is scoped to (document, engine_id, engine_kind) exactly as
  -- 0169:291-292 scopes the human classification's, so it counts THIS engine's revisions and
  -- collides with nothing the machine wrote.
  --
  -- #1056 (5) · ON THE PAYROLL LANE IT COUNTS ACROSS THE KIND INSTEAD, and that is not a
  -- preference. clara._payroll_posting_verdict picks the reading it judges by `version_n desc,
  -- extracted_at desc` (0297:599): a human row reusing the machine's own number would have to WIN
  -- a tie-break on the clock rather than win outright, and a second machine read would then
  -- silently outrank a correction made after it. The four-column unique on
  -- clara.document_extractions is (document, engine, version_n, kind), so a higher number under a
  -- different engine collides with nothing.
  v_kind := case when v_lane = 'payroll' then 'payroll_text_facts' else 'invoice_facts' end;
  if v_lane = 'payroll' then
    select coalesce(max(version_n), 0) + 1 into v_version from clara.document_extractions
     where document_id = p_document and engine_kind = 'payroll_text_facts';
  else
    select coalesce(max(version_n), 0) + 1 into v_version from clara.document_extractions
     where document_id = p_document and engine_id = 'clara-fact-human:v1' and engine_kind = 'invoice_facts';
  end if;

  select * into prior from clara.document_regions rg
   where rg.extraction_id = obs.facts_extraction_id and rg.field_path = p_field_path
   order by rg.created_at, rg.id limit 1;
  v_found := found;
  if v_found then
    v_prior_value := jsonb_strip_nulls(jsonb_build_object(
      'text', prior.text_content, 'cents', prior.monetary_cents));
    -- THE LOCATOR IS CARRIED, not invented: the human is correcting the value read AT THAT PLACE
    -- on the page, so the overlay keeps pointing at the same polygon and UI-17's highlight still
    -- lands where the figure is printed.
    v_locator_kind := prior.locator_kind;
    v_locator := prior.locator;
  else
    v_prior_value := null;
    -- A fact the reader never persisted has no place on the page to point at. An EMPTY polygon is
    -- the honest locator: clara.document_regions.locator is NOT NULL, and the page overlay skips a
    -- region whose polygon is missing or too short rather than drawing a degenerate shape.
    v_locator_kind := 'page_polygon';
    v_locator := jsonb_build_object('page', 1, 'polygon', '[]'::jsonb, 'source', 'human');
  end if;
  v_new_value := jsonb_strip_nulls(jsonb_build_object('text', v_raw, 'cents', v_cents));

  -- #885 (third fix round) · A KEYSTROKE IS NOT A CORRECTION. Refused BEFORE anything is
  -- written: no extraction, no revision row, no facts_version, and -- the reason this is not a
  -- cosmetic guard -- no retirement of the Work parked on this document and no question turned
  -- permanently unanswerable. A fact the reader never persisted has no prior value, and anything
  -- is a change against nothing.
  if v_prior_value is not null and not clara._fact_value_changed(v_prior_value, v_new_value) then
    raise exception 'this revision does not change what the document is recorded as saying'
      using errcode = 'CLR10', detail = jsonb_build_object('reason', 'value_unchanged',
        'field_path', p_field_path, 'value', v_new_value)::text;
  end if;

  -- #1056 (6) · THE ENVELOPE. The invoice arm is 0268's, unchanged. The payroll arm carries the
  -- SAME human provenance keys ON TOP OF the reading it revises, and adds the two things that
  -- make the corrected run readable by everything downstream:
  --   * `payroll_state` -- the corrected fact state. This is the key clara._payroll_posting_verdict
  --     reads (0297:597), so writing the state here is what makes the gate see the correction at
  --     all. It is derived from the state BANKED on the observed extraction, never re-evaluated.
  --   * `payroll.channel = 'human'` with the declared answer folded into the answers map, so the
  --     envelope's own account of what was read agrees with the regions written below. The
  --     channel is `human` and not `text` because a person is not an OCR channel, and a row
  --     claiming to be one would be this door lying about its own provenance.
  v_envelope := jsonb_build_object('source', 'human', 'actor', c.actor, 'reason', btrim(p_reason),
    'field_path', p_field_path, 'prior_value', v_prior_value, 'new_value', v_new_value,
    'revises_extraction_id', obs.facts_extraction_id,
    'observed_version', obs.facts_version, 'op_key', p_op_key);
  if v_lane = 'payroll' then
    select e.envelope into v_prior_env from clara.document_extractions e
     where e.id = obs.facts_extraction_id;
    v_payroll_state := clara._payroll_state_with_human_fact(
      v_prior_env->'payroll_state', p_field_path, v_raw, v_cents);
    v_envelope := coalesce(v_prior_env, '{}'::jsonb) || v_envelope || jsonb_build_object(
      'payroll_state', v_payroll_state,
      'payroll', jsonb_build_object('channel', 'human',
        'answers', coalesce(v_prior_env->'payroll'->'answers', '{}'::jsonb)
          || jsonb_build_object(p_field_path,
               jsonb_build_object('state', 'value', 'raw', v_raw))));
  end if;

  insert into clara.document_extractions(firm_id, document_id, engine_id, engine_kind,
      version_n, status, page_count, envelope)
    values (c.firm, p_document, 'clara-fact-human:v1', v_kind, v_version, 'done',
      coalesce(d.page_count, 0), v_envelope)
    returning id into v_ext;

  -- EVERY OTHER FACT CARRIED FORWARD. Without this the appended extraction would supersede the
  -- machine's whole reading with a single field (0089:280-285 supersedes the entire kind), and the
  -- arithmetic belt would then measure a document with no total. Each carried path passes the
  -- canonical grammar on the way in, so a path that predates 0191's splice cannot ride through
  -- this door.
  for r in select rg.* from clara.document_regions rg
            where rg.extraction_id = obs.facts_extraction_id
              and rg.field_path is distinct from p_field_path
            order by rg.created_at, rg.id loop
    perform clara._assert_field_path(r.field_path);
    insert into clara.document_regions(firm_id, extraction_id, locator_kind, locator,
        field_path, text_content, engine_confidence, monetary_raw, monetary_cents)
      values (c.firm, v_ext, r.locator_kind, r.locator, r.field_path, r.text_content,
        r.engine_confidence, r.monetary_raw, r.monetary_cents);
    v_carried := v_carried + 1;
  end loop;

  insert into clara.document_regions(firm_id, extraction_id, locator_kind, locator,
      field_path, text_content, engine_confidence, monetary_raw, monetary_cents)
    values (c.firm, v_ext, v_locator_kind, v_locator, p_field_path, v_raw, 1,
      case when v_monetary then v_raw end, v_cents);

  v_client := clara._document_sole_live_client(p_document);
  insert into clara.document_fact_revisions(firm_id, client_id, document_id, revision_kind,
      field_path, prior_value, new_value, observed_extraction_id, observed_version_n,
      resulting_extraction_id, reason, recorded_by, op_key)
    values (c.firm, v_client, p_document, 'fact', p_field_path, v_prior_value, v_new_value,
      obs.facts_extraction_id, obs.facts_version, v_ext, btrim(p_reason), c.actor, p_op_key)
    returning id into v_revision;

  -- #885 · THE CAUSE IS APPENDED FIRST, and 0217's own event is unchanged to the byte. A reader
  -- of the feed meets the correction and only then the cancellations it caused; the reverse order
  -- would show a Work retired for a reason the timeline had not yet recorded. (0217 wrote the
  -- audit row before this event; the audit row now has to NAME the supersessions, so it moves
  -- below them and this event moves above. Nothing else about either call changes.)
  perform clara._append_event(c.firm, 'document.fact_revised', v_client, c.actor, null, null,
    null, p_document, null,
    jsonb_build_object('revision_id', v_revision, 'field_path', p_field_path,
      'extraction_id', v_ext, 'observed_version', obs.facts_version,
      'facts_version', obs.facts_version + 1, 'source', 'human'));

  -- #885 · THE EFFECT. Every Work this call LOCKED that is still parked on a question about this
  -- document is retired with the correction as its reason -- the owner's 2026-09-17 ruling,
  -- re-confirmed 2026-09-20. It runs in THIS transaction: a runtime consumer would leave a window
  -- in which the stale question is still answerable, which is the one thing the ruling forbids. A
  -- SUCCESSOR is admitted on the same basis when that basis is the human's own (`user_direct`) and
  -- 0200's door accepts it; a DERIVED basis is not re-admitted (it was read off the reading that
  -- just moved) and a Work that door refuses is retired anyway, with the reason on the receipt --
  -- a bookkeeper's correction is never refused because of a Work they were not acting on.
  v_superseded := clara._supersede_source_corrected_work(p_document, c.firm, v_locked, c.actor,
    v_revision);

  perform clara._audit(c.firm, c.actor, null, null, 'revise_document_fact', null,
    jsonb_build_object('document', p_document, 'field_path', p_field_path,
      'lane', v_lane,
      'prior_value', v_prior_value, 'new_value', v_new_value,
      'observed_extraction', obs.facts_extraction_id,
      'observed_version', obs.facts_version, 'extraction', v_ext, 'revision', v_revision,
      'reason', p_reason, 'op_key', p_op_key,
      'superseded_work', v_superseded));

  -- #1056 (7) · THE RECEIPT NAMES THE LANE. A surface that has just corrected a payroll figure has
  -- to know that the number it should re-read is the PAYROLL facts version, and inferring that
  -- from the field path's first segment would be a second, drifting copy of this body's own
  -- decision.
  return clara._finish_op(c.firm, 'revise_document_fact', p_op_key,
    jsonb_build_object('document_id', p_document, 'revision_id', v_revision,
      'field_path', p_field_path, 'lane', v_lane,
      'prior_value', v_prior_value, 'new_value', v_new_value,
      'extraction_id', v_ext, 'observed_extraction_id', obs.facts_extraction_id,
      'observed_version', obs.facts_version, 'facts_version', obs.facts_version + 1,
      'carried_regions', v_carried,
      'superseded_work', v_superseded));
end $fn$;

reset role;

-- =====================================================================================
-- §Z  TAIL -- what this file left behind, re-read from the COMMITTED catalog.
-- =====================================================================================
do $p1056_tail$
declare v_n int; v_f text; v_fn text; v_role text; v_src text; v_needle text;
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
    'clara._payroll_state_with_human_fact(jsonb,text,text,bigint)',
    'clara._document_live_posted_entry(uuid)'] loop
    if to_regprocedure(v_fn) is null then
      raise exception '#1056 tail: % does not resolve', v_fn using errcode = 'CLR10';
    end if;
    foreach v_role in array array['clara_authenticated','clara_agent_ro','clara_runtime','public'] loop
      if pg_catalog.has_function_privilege(v_role, v_fn, 'execute') then
        raise exception '#1056 tail: internal % is reachable by %', v_fn, v_role using errcode = 'CLR10';
      end if;
    end loop;
  end loop;

  -- (3) THE RECUT DOOR'S DISPOSITION IS UNMOVED. A widened door that quietly changed owner,
  --     volatility, DEFINER-ness, search_path or ACL would be a security change wearing a feature's
  --     clothes, and `create or replace` is exactly the statement that can do it by omission.
  select count(*)::int into v_n from pg_proc p
   where p.oid = 'clara.revise_document_fact(uuid,text,jsonb,int,text,text)'::regprocedure
     and p.proowner::regrole::text = 'clara_fn_owner'
     and p.prosecdef and p.provolatile = 'v'
     and p.proconfig @> array['search_path=clara, pg_temp'];
  if v_n <> 1 then
    raise exception '#1056 tail: clara.revise_document_fact changed owner, volatility, DEFINER-ness or search_path'
      using errcode = 'CLR10';
  end if;
  foreach v_role in array array['clara_agent_ro','clara_runtime','public'] loop
    if pg_catalog.has_function_privilege(v_role,
        'clara.revise_document_fact(uuid,text,jsonb,int,text,text)', 'execute') then
      raise exception '#1056 tail: the fact door became callable by % -- it is a human door', v_role
        using errcode = 'CLR10';
    end if;
  end loop;
  if not pg_catalog.has_function_privilege('clara_authenticated',
      'clara.revise_document_fact(uuid,text,jsonb,int,text,text)', 'execute') then
    raise exception '#1056 tail: the fact door is no longer reachable by clara_authenticated'
      using errcode = 'CLR10';
  end if;

  -- (4) EVERY 0268 GUARD IS STILL IN THE RECUT BODY, re-read from the INSTALLED function rather
  --     than from this file. A recut that dropped one would be a wall this ticket removed by
  --     accident, and the next battery to notice would be a hosted incident.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.revise_document_fact(uuid,text,jsonb,int,text,text)'::regprocedure;
  foreach v_needle in array array[
    'agent identity cannot revise a document fact',
    'clara._human_ctx(clara.role_rank(''bookkeeper''))',
    'clara._lock_source_corrected_work(p_document, c.firm)',
    'from clara.documents where id = p_document for update',
    'clara._reserve_op(c.firm, ''revise_document_fact'', p_op_key',
    'clara._bank_live_statement_on_document(p_document)',
    'perform clara._assert_field_path(p_field_path);',
    'clara._document_capability(v_format, d.document_kind)',
    'no_facts_to_revise',
    'value_not_scalar', 'value_blank', 'value_unchanged',
    'stale_source_version',
    'clara._fact_value_changed(v_prior_value, v_new_value)',
    'clara._supersede_source_corrected_work(p_document, c.firm, v_locked, c.actor',
    'clara._append_event(c.firm, ''document.fact_revised''',
    'clara._finish_op(c.firm, ''revise_document_fact'', p_op_key'] loop
    if position(v_needle in v_src) = 0 then
      raise exception '#1056 tail: the recut fact door LOST the guard %', quote_literal(v_needle)
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (5) …AND IT GAINED EXACTLY THE SEVEN #1056 POINTS, each once.
  foreach v_needle in array array[
    'clara._revisable_fact_lane(p_field_path)',
    'clara._document_live_posted_entry(p_document)',
    'payroll_run_already_posted',
    'clara._payroll_source_observation(p_document)',
    'payroll_value_negative', 'payroll_value_out_of_range',
    'clara._payroll_state_with_human_fact(',
    '''payroll_text_facts'''] loop
    if position(v_needle in v_src) = 0 then
      raise exception '#1056 tail: the recut fact door is missing %', quote_literal(v_needle)
        using errcode = 'CLR10';
    end if;
  end loop;
  -- The invoice lane's own field wall is GONE from the door -- the arbiter asks it now, and two
  -- copies of the same question is how a widened door starts disagreeing with itself.
  if position('clara._revisable_invoice_field(p_field_path)' in v_src) <> 0 then
    raise exception '#1056 tail: the recut fact door still asks clara._revisable_invoice_field directly'
      using errcode = 'CLR10';
  end if;

  -- (6) THE INVOICE LANE'S POSTED-ENTRY BEHAVIOUR IS UNCHANGED. The pin is inside a `v_lane =
  --     ''payroll''` branch and nowhere else, which is the one-line difference between "the
  --     payroll lane gained a wall" and "every invoice correction in the estate just started
  --     refusing".
  if position('if v_lane = ''payroll'' then
    v_posted := clara._document_live_posted_entry(p_document);' in v_src) = 0 then
    raise exception '#1056 tail: the posted-entry pin is not guarded on the payroll lane'
      using errcode = 'CLR10';
  end if;

  raise notice '#1056 tail: OK -- clara._revisable_payroll_run_field holds the eleven run-level questions and nothing below the run level; clara._revisable_fact_lane answers `payroll` for those eleven, `invoice` for the invoice lane''s own unwidened closed set and NULL for everything else; all five helpers are granted to nobody; and clara.revise_document_fact keeps its owner, volatility, DEFINER-ness, search_path and clara_authenticated-only ACL, carries all seventeen 0268 guards this tail re-reads, gained the seven #1056 points, no longer asks the invoice field wall directly, and guards the posted-entry pin on the payroll lane alone.';
end
$p1056_tail$;
