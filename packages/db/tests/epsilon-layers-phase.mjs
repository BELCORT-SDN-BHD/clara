// Wave E lane EPSILON -- phase 1: the six template layers. NOT a test file.
//
// Proves: the shipped wording table is EMPTY and its verified-provenance CHECK bites; every
// publish/draft floor by role and by report class; publication freeze; and the E-R8 floor-1
// walls at BOTH the template and the spec layer -- no numeric literal, no protected placeholder
// bound to a supplied literal, no protected content TYPED with no binding declared at all, and
// no currency amount typed at the draft layer (with the ruled template-layer exemption asserted
// rather than assumed).

import {
  assert, randomUUID, rootQuery, withActor, ROLES,
  caught, reasonOf, errorDetail, freshActiveClient,
  publishHouseStyle, publishTemplate, draftSpec, layoutAst,
  placeholderCell, MPERS_SECTIONS,
} from "./epsilon-fixtures.mjs";
import { profileVersion, ensureEpsilonAdmin } from "./epsilon-world.mjs";

const SHIPPED_PROFILES = ["mpers_company", "convention_sole_prop"];

export async function shippedWordingCount() {
  return Number((await rootQuery(
    "select count(*)::int n from clara.statutory_wording where profile_key = any($1)",
    [SHIPPED_PROFILES])).rows[0].n);
}

export async function registerLayersPhase(t, world) {
  const { alice, bob, carol } = world.users;
  const admin = await ensureEpsilonAdmin(world);

  await t.test("layer 2 ships ZERO wording rows and its verified-provenance CHECK bites", async () => {
    assert.equal(await shippedWordingCount(), 0,
      "owner task #43 gates every wording row; inventing one is a FAIL of matrix D5");
    assert.deepEqual((await rootQuery(
      `select profile_key, revision, applies_to_periods_beginning_from::text f,
              applies_to_periods_beginning_to::text t
         from clara.statutory_profile_versions where profile_key='mpers_company' order by revision`)).rows,
      [{ profile_key: "mpers_company", revision: 1, f: "2016-01-01", t: "2026-12-31" },
       { profile_key: "mpers_company", revision: 2, f: "2027-01-01", t: null }],
      "the wording tables are BORN two-versioned at the ruled 2027-01-01 period-beginning boundary");

    // Each provenance element removed in turn: a 'verified' row without the full quartet is
    // refused. Under clara_fn_owner, which is the only writer layer 2 has at all.
    for (const missing of ["source_manifest", "source_sha256", "verified_by", "verified_at"]) {
      const columns = { source_manifest: "jsonb_build_object('s','x')", source_sha256: "repeat('a',64)",
        verified_by: `'${alice}'::uuid`, verified_at: "now()" };
      delete columns[missing];
      const names = Object.keys(columns);
      const error = await caught(() => withActor({ role: ROLES.fnOwner, transaction: true }, (db) =>
        db.query(
          `insert into clara.statutory_wording(profile_key,wording_key,locale,
             applies_to_periods_beginning_from,wording_text,verification_state,source_note${names.length ? "," + names.join(",") : ""})
           values('mpers_company',$1,'en','2016-01-01','forged','verified','rig'${names.length ? "," + names.map((n) => columns[n]).join(",") : ""})`,
          [`forged_${missing}_${randomUUID().slice(0, 8)}`])));
      assert.equal(error?.code, "23514", `a verified row missing ${missing} is refused: ${error?.message}`);
      assert.match(error.message, /ck_statutory_wording_verified_provenance/);
    }
    assert.equal(await shippedWordingCount(), 0, "no forged row survived");
  });

  await t.test("layer 3 house style is an OWNER floor and its assets must be content-addressed", async () => {
    for (const [who, label] of [[bob, "bookkeeper"], [carol, "viewer"]]) {
      const error = await caught(() => publishHouseStyle(who, { styleKey: `floor-${label}-${randomUUID().slice(0, 6)}` }));
      assert.equal(error?.code, "CLR04", `${label} cannot publish a house style: ${error?.message}`);
    }
    const badAsset = await caught(() => publishHouseStyle(alice, {
      styleKey: `assets-${randomUUID().slice(0, 6)}`, assets: { logo: "not-a-digest" },
    }));
    assert.equal(reasonOf(badAsset), "asset_not_content_addressed");
    assert.match(errorDetail(badAsset).fix ?? "", /sha256/i);
    const ok = await publishHouseStyle(alice, { styleKey: `style-ok-${randomUUID().slice(0, 6)}` });
    assert.ok(ok.house_style_version_id, "the owner publishes");
    world.epsilonStyle = ok.house_style_version_id;
  });

  await t.test("a published version is frozen: only the published->superseded closure, never a rewrite", async () => {
    const styleId = world.epsilonStyle;
    const before = (await rootQuery("select * from clara.house_style_versions where id=$1", [styleId])).rows[0];
    for (const [sql, label] of [
      ["update clara.house_style_versions set style_spec='{\"font\":\"other\"}'::jsonb where id=$1", "rewrite the spec"],
      ["update clara.house_style_versions set state='superseded' where id=$1", "supersede without closing the window"],
      ["delete from clara.house_style_versions where id=$1", "delete"],
    ]) {
      const error = await caught(() => withActor({ role: ROLES.fnOwner, transaction: true },
        (db) => db.query(sql, [styleId])));
      assert.equal(error?.code, "CLR08", `${label} is refused: ${error?.message}`);
    }
    assert.deepEqual((await rootQuery("select * from clara.house_style_versions where id=$1", [styleId])).rows[0],
      before, "the refused attempts left the published version byte-identical");

    // The LAWFUL closure, through the verb: a second publish supersedes the first.
    const key = (await rootQuery("select style_key from clara.house_styles h join clara.house_style_versions v on v.house_style_id=h.id where v.id=$1", [styleId])).rows[0].style_key;
    const second = await publishHouseStyle(alice, { styleKey: key, effectiveFrom: "2020-01-01" });
    const rows = (await rootQuery(
      "select id,revision,state,effective_to::text t from clara.house_style_versions where house_style_id=(select house_style_id from clara.house_style_versions where id=$1) order by revision",
      [styleId])).rows;
    assert.deepEqual(rows.map((r) => [r.revision, r.state, r.t]),
      [[1, "superseded", "2019-12-31"], [2, "published", null]],
      "exactly one published version, and the predecessor's window closed the day before");
    world.epsilonStyle = second.house_style_version_id;
  });

  await t.test("the template floor SPLITS by report class, and the class is fixed at birth", async () => {
    const mpers = await profileVersion("mpers_company", 1);
    const statutoryLayout = layoutAst(MPERS_SECTIONS);
    const refused = await caught(() => publishTemplate(bob, {
      templateKey: `stat-floor-${randomUUID().slice(0, 6)}`, reportClass: "statutory",
      claimCapability: "claims_compliance", profileVersionId: mpers,
      houseStyleVersionId: world.epsilonStyle, layout: statutoryLayout,
    }));
    assert.equal(refused?.code, "CLR04", `a bookkeeper cannot publish a statutory template: ${refused?.message}`);
    const managed = await publishTemplate(bob, {
      templateKey: `mgmt-floor-${randomUUID().slice(0, 6)}`, reportClass: "management",
      claimCapability: "no_claim", houseStyleVersionId: world.epsilonStyle,
      layout: layoutAst(["management_summary"]),
    });
    assert.equal(managed.report_class, "management", "a bookkeeper publishes a management template");
    const statutory = await publishTemplate(admin, {
      templateKey: `stat-ok-${randomUUID().slice(0, 6)}`, reportClass: "statutory",
      claimCapability: "claims_compliance", profileVersionId: mpers,
      houseStyleVersionId: world.epsilonStyle, layout: statutoryLayout,
    });
    assert.equal(statutory.claim_capability, "claims_compliance", "an admin publishes a statutory template");

    const key = (await rootQuery(
      "select template_key from clara.report_templates where id=(select report_template_id from clara.report_template_versions where id=$1)",
      [managed.report_template_version_id])).rows[0].template_key;
    const flipped = await caught(() => publishTemplate(admin, {
      templateKey: key, reportClass: "statutory", claimCapability: "claims_compliance",
      profileVersionId: mpers, houseStyleVersionId: world.epsilonStyle, layout: statutoryLayout,
      effectiveFrom: "2020-01-01",
    }));
    assert.equal(reasonOf(flipped), "report_class_immutable");
  });

  await t.test("a claim a profile cannot lend, and a statutory layout that omits a required section", async () => {
    const convention = await profileVersion("convention_sole_prop", 1);
    const conventionSections = (await rootQuery(
      "select section_key from clara.statutory_sections where profile_version_id=$1 order by ordinal",
      [convention])).rows.map((r) => r.section_key);
    const overreach = await caught(() => publishTemplate(admin, {
      templateKey: `conv-claim-${randomUUID().slice(0, 6)}`, reportClass: "statutory",
      claimCapability: "claims_compliance", profileVersionId: convention,
      houseStyleVersionId: world.epsilonStyle, layout: layoutAst(conventionSections),
    }));
    assert.equal(reasonOf(overreach), "claim_capability_exceeds_profile",
      "the sole-prop convention profile can never lend a compliance claim (matrix C5)");
    assert.equal(errorDetail(overreach).profile_claim_capability, "no_claim");

    const mpers = await profileVersion("mpers_company", 1);
    const short = await caught(() => publishTemplate(admin, {
      templateKey: `stat-short-${randomUUID().slice(0, 6)}`, reportClass: "statutory",
      claimCapability: "claims_compliance", profileVersionId: mpers,
      houseStyleVersionId: world.epsilonStyle,
      layout: layoutAst(MPERS_SECTIONS.filter((s) => s !== "statement_of_cash_flows")),
    }));
    assert.equal(reasonOf(short), "layout_omits_required_section",
      "the honest-FS law (matrix D7) bites at publish, not seven runs later");
    assert.deepEqual(errorDetail(short).missing_sections, ["statement_of_cash_flows"],
      "the refusal NAMES the missing section");

    const bound = await caught(() => publishTemplate(bob, {
      templateKey: `mgmt-profile-${randomUUID().slice(0, 6)}`, reportClass: "management",
      claimCapability: "no_claim", profileVersionId: mpers,
      houseStyleVersionId: world.epsilonStyle, layout: layoutAst(["summary"]),
    }));
    assert.equal(reasonOf(bound), "management_template_binds_profile");
  });

  await t.test("E-R8 floor 1: the layout AST has NO numeric literal node, in any layer", async () => {
    const publish = (block) => publishTemplate(bob, {
      templateKey: `numeric-${randomUUID().slice(0, 6)}`, reportClass: "management",
      claimCapability: "no_claim", houseStyleVersionId: world.epsilonStyle,
      layout: layoutAst(null, [{ section_key: "summary", blocks: [block] }]),
    });
    // THE NUMERIC WALL, at keys the grammar ALLOWS -- which is where a real smuggle aims, because
    // a made-up key is already refused by the closed schema. A number in a legal slot is exactly
    // "somebody typed a figure into a report".
    const numeric = [
      ["a figure typed into a text node", { node: "text", value: 125_000 }],
      ["a figure typed into a placeholder key", { node: "placeholder", key: 42 }],
      ["a figure typed into a note reference", { node: "note_ref", note_key: 7 }],
      ["a bare number among a row's cells", { node: "row", ordinal: 0, cells: [42] }],
    ];
    for (const [label, block] of numeric) {
      const error = await caught(() => publish(block));
      assert.equal(error?.code, "CLR10", `${label}: ${error?.message}`);
      assert.equal(reasonOf(error), "numeric_literal_forbidden", `${label}: ${error?.message}`);
    }
    // A structural field is admitted only as a whole number in range -- a scale of 2.5 is not a
    // layout instruction, it is a number wearing one's clothes.
    const fractional = await caught(() => publish(
      { node: "metric_ref", definition_key: "revenue_total", decimal_places: 2.5 }));
    assert.equal(reasonOf(fractional), "structural_integer_invalid", fractional?.message);
    // And a number smuggled at an INVENTED key is still refused -- by the closed schema, which
    // runs first. The layout is rejected either way; only the reason differs, and the reason a
    // closed grammar should give for an unknown field is unknown_field.
    for (const [label, block] of [
      ["a typed figure at an invented cell key", { node: "cell", column_span: 1, amount_cents: 125_000, content: { node: "text", value: "x" } }],
      ["a threshold hidden on a heading", { node: "heading", level: 1, target: 15, content: { node: "text", value: "x" } }],
    ]) {
      const error = await caught(() => publish(block));
      assert.equal(reasonOf(error), "unknown_field", `${label}: ${error?.message}`);
    }
    // The structural integers are ADMITTED -- an allow-list that admitted nothing would be a
    // validator that only ever passes empty layouts.
    const ok = await publishTemplate(bob, {
      templateKey: `structural-${randomUUID().slice(0, 6)}`, reportClass: "management",
      claimCapability: "no_claim", houseStyleVersionId: world.epsilonStyle,
      layout: layoutAst(null, [{ section_key: "summary", blocks: [
        { node: "statement_table", columns: 3, rows: [{ node: "row", ordinal: 0, cells: [
          { node: "cell", column_span: 2, row_span: 1, content: { node: "metric_ref", definition_key: "revenue_total", decimal_places: 2 } }] }] },
        { node: "heading", level: 2, content: { node: "text", value: "Summary" } }] }]),
    });
    assert.ok(ok.report_template_version_id, "column spans, row counts and font sizes are structural, and pass");
    assert.deepEqual(ok.layout.sections, ["summary"]);
    world.epsilonMgmtTemplate = ok.report_template_version_id;
  });

  await t.test("a protected placeholder may never be bound to a supplied literal", async () => {
    const protectedKeys = (await rootQuery(
      "select placeholder_key from clara.protected_placeholders order by placeholder_key")).rows.map((r) => r.placeholder_key);
    assert.deepEqual(protectedKeys.sort(), [
      "claim_wording", "currency_unit", "entity_legal_name", "note_references",
      "registration_identifiers", "reporting_period", "statement_titles", "totals",
    ], "the ruled protected list is seeded whole");

    const smuggles = [
      ["a cell binding the legal name to typed text",
        { node: "cell", column_span: 1, binds: "entity_legal_name", content: { node: "text", value: "ACME SDN BHD" } }],
      // A text node may never bind a protected placeholder AT ALL -- text is by construction a
      // supplied literal, so the value here is deliberately innocuous: the refusal must come from
      // the SHAPE of the binding, not from anything detectable in the string. (The same node with
      // a registration number in it is refused one wall earlier -- see the unconditional test
      // below -- which is why this arm cannot use one.)
      ["a text node binding the registration number",
        { node: "text", value: "as registered", binds: "registration_identifiers" }],
      ["a heading binding the claim wording to a literal",
        { node: "heading", level: 1, binds: "claim_wording", content: { node: "text", value: "Prepared in accordance with MPERS" } }],
      ["a cell binding a total to a different placeholder",
        { node: "cell", column_span: 1, binds: "totals", content: { node: "placeholder", key: "reporting_period" } }],
    ];
    for (const [label, block] of smuggles) {
      const error = await caught(() => publishTemplate(bob, {
        templateKey: `smuggle-${randomUUID().slice(0, 6)}`, reportClass: "management",
        claimCapability: "no_claim", houseStyleVersionId: world.epsilonStyle,
        layout: layoutAst(null, [{ section_key: "summary", blocks: [block] }]),
      }));
      assert.equal(reasonOf(error), "protected_placeholder_literal_binding", `${label}: ${error?.message}`);
      assert.match(errorDetail(error).fix ?? "", /placeholder node resolving from/,
        "the refusal names the DB source the author must bind instead");
    }
    // The lawful binding passes, and an UNPROTECTED key may still carry typed text.
    const ok = await publishTemplate(bob, {
      templateKey: `bound-${randomUUID().slice(0, 6)}`, reportClass: "management",
      claimCapability: "no_claim", houseStyleVersionId: world.epsilonStyle,
      layout: layoutAst(null, [{ section_key: "summary", blocks: [
        placeholderCell("entity_legal_name"),
        { node: "cell", column_span: 1, binds: "prepared_by_label", content: { node: "text", value: "Prepared by" } }] }]),
    });
    assert.ok(ok.report_template_version_id);
  });

  await t.test("protected content is refused with NO binding declared, at both layers", async () => {
    // The conditional-enforcement hole: `binds` is metadata the AUTHOR supplies, so an author who
    // hard-codes an entity name simply omits it. The wall below does not wait to be told.
    const publish = (block) => publishTemplate(bob, {
      templateKey: `typed-${randomUUID().slice(0, 6)}`, reportClass: "management",
      claimCapability: "no_claim", houseStyleVersionId: world.epsilonStyle,
      layout: layoutAst(null, [{ section_key: "summary", blocks: [block] }]),
    });
    for (const [label, value, family, shape] of [
      ["a hard-coded legal name", "ACME SDN BHD", "entity_legal_name", "legal_entity_suffix"],
      ["a hard-coded Berhad name", "Acme Holdings Berhad", "entity_legal_name", "legal_entity_suffix"],
      ["a hard-coded registration number", "Company No. 202301000123", "registration_identifiers", "digit_run_6plus"],
      ["a hard-coded compliance sentence",
        "These statements are prepared in accordance with the Malaysian Private Entities Reporting Standard.",
        "claim_wording", "claim_lexicon_phrase"],
      ["a hard-coded standard token", "Basis of preparation: MPERS", "claim_wording", "claim_lexicon_phrase"],
      ["a hard-coded assurance phrase", "and give a true and fair view of the state of affairs",
        "claim_wording", "claim_lexicon_phrase"],
    ]) {
      const error = await caught(() => publish({ node: "text", value }));
      assert.equal(error?.code, "CLR10", `${label}: ${error?.message}`);
      assert.equal(reasonOf(error), "protected_content_typed", `${label}: ${error?.message}`);
      const detail = errorDetail(error);
      assert.equal(detail.placeholder_key, family, `${label} names its protected family`);
      assert.equal(detail.shape, shape, `${label} names the shape that matched`);
      assert.match(detail.fix ?? "", /through a placeholder node/,
        `${label}: the refusal names the placeholder mechanism as the remedy`);
    }
    // LAWFUL REFERENCE SHAPES STAY LAWFUL. If this arm ever fails, the wall has started eating
    // the labels a real report needs, and the fix is the wall, not the label.
    const lawful = await publishTemplate(bob, {
      templateKey: `lawful-${randomUUID().slice(0, 6)}`, reportClass: "management",
      claimCapability: "no_claim", houseStyleVersionId: world.epsilonStyle,
      layout: layoutAst(null, [{ section_key: "summary", blocks: [
        { node: "text", value: "FY2025 comparatives" },
        { node: "text", value: "Note 12 to the accounts" },
        { node: "text", value: "Approved on 2026-08-13" },
        { node: "text", value: "See Section 2.14" }] }]),
    });
    assert.ok(lawful.report_template_version_id, "years, note references, dates and section refs pass");
  });

  await t.test("a typed currency amount is refused at the DRAFT layer, and the template layer is the ruled exemption", async () => {
    const client = await freshActiveClient(alice, `eps-currency-${randomUUID().slice(0, 6)}`);
    for (const [label, value, shape] of [
      ["a thousands-grouped amount", "RM 125,000", "thousands_grouped"],
      ["a bare grouped amount", "125,000", "thousands_grouped"],
      ["a currency-marked amount", "RM 5000 recognised in the period", "currency_marked"],
      ["a decimal amount", "1250.00 carried forward", "decimal_amount"],
    ]) {
      const error = await caught(() => draftSpec(alice, {
        client, specKey: `currency-${randomUUID().slice(0, 6)}`,
        templateVersionId: world.epsilonMgmtTemplate,
        layout: layoutAst(null, [{ section_key: "summary", blocks: [{ node: "text", value }] }]),
      }));
      assert.equal(error?.code, "CLR10", `${label}: ${error?.message}`);
      assert.equal(reasonOf(error), "string_encoded_numeral_forbidden", `${label}: ${error?.message}`);
      assert.equal(errorDetail(error).shape, shape, `${label} names the shape that matched`);
      assert.match(errorDetail(error).fix ?? "", /metric_ref or a placeholder/,
        `${label}: the refusal names the placeholder mechanism as the remedy`);
    }
    // Lawful at the draft layer too -- the currency wall must not eat a period label.
    const lawful = await draftSpec(alice, {
      client, specKey: `currency-ok-${randomUUID().slice(0, 6)}`,
      templateVersionId: world.epsilonMgmtTemplate,
      layout: layoutAst(null, [{ section_key: "summary", blocks: [
        { node: "text", value: "FY2025 vs FY2024, Note 12" }] }]),
    });
    assert.ok(lawful.report_spec_version_id);
    // THE RULED BOUNDARY, asserted rather than assumed: the currency wall is the DRAFT layer's.
    // Template, house-style and statutory-wording text is publish-gated behind a role floor, and
    // the ruling exempts it. A future pass that widens the wall to templates is changing a
    // RULING -- this arm is where it will find that out.
    const templateExempt = await publishTemplate(bob, {
      templateKey: `currency-exempt-${randomUUID().slice(0, 6)}`, reportClass: "management",
      claimCapability: "no_claim", houseStyleVersionId: world.epsilonStyle,
      layout: layoutAst(null, [{ section_key: "summary", blocks: [
        { node: "text", value: "RM 125,000 (illustrative)" }] }]),
    });
    assert.ok(templateExempt.report_template_version_id,
      "the publish-gated template layer is the ruled exemption from the draft-time currency wall");
  });

  await t.test("an unregistered validation scope refuses rather than choosing a wall", async () => {
    // Directly, because no verb can reach it: every caller passes a literal scope. The branch is
    // still the one that decides WHICH wall applies, so it gets a positive proof rather than a
    // reading of the source.
    const ast = { ast: "clara.layout/v1", sections: [{ section_key: "summary", blocks: [
      { node: "text", value: "Summary" }] }] };
    for (const [label, scope] of [["null", null], ["an invented scope", "draft"], ["blank", ""]]) {
      const error = await caught(() => rootQuery(
        "select clara._validate_layout_ast_v1($1::jsonb, $2)", [JSON.stringify(ast), scope]));
      assert.equal(error?.code, "CLR10", `${label}: ${error?.message}`);
      assert.equal(reasonOf(error), "validation_scope_unknown", `${label}: ${error?.message}`);
    }
    // And both registered scopes DO validate -- an assertion that only ever refused would pass
    // against a function that refused everything.
    for (const scope of ["template", "spec"]) {
      const row = (await rootQuery("select clara._validate_layout_ast_v1($1::jsonb, $2) shape",
        [JSON.stringify(ast), scope])).rows[0];
      assert.deepEqual(row.shape.sections, ["summary"], `scope ${scope} validates`);
    }
  });

  await t.test("the SAME two walls run again at the spec layer, so an override cannot reintroduce them", async () => {
    const client = await freshActiveClient(alice, `eps-spec-walls-${randomUUID().slice(0, 6)}`);
    for (const [label, block, reason] of [
      ["a numeric literal", { node: "text", value: 1234 }, "numeric_literal_forbidden"],
      ["a literal-bound placeholder", { node: "cell", column_span: 1, binds: "totals", content: { node: "text", value: "1,234" } }, "protected_placeholder_literal_binding"],
    ]) {
      const error = await caught(() => draftSpec(alice, {
        client, specKey: `override-${randomUUID().slice(0, 6)}`,
        templateVersionId: world.epsilonMgmtTemplate,
        layout: layoutAst(null, [{ section_key: "summary", blocks: [block] }]),
      }));
      assert.equal(reasonOf(error), reason, `${label} at the spec layer: ${error?.message}`);
    }
    const viewer = await caught(() => draftSpec(carol, {
      client, specKey: `viewer-${randomUUID().slice(0, 6)}`,
      templateVersionId: world.epsilonMgmtTemplate, layout: layoutAst(["summary"]),
    }));
    assert.equal(viewer?.code, "CLR04", "drafting a spec is key 1 -- a viewer holds no key");
  });

  await t.test("the shipped wording table is STILL empty after the whole layer phase", async () => {
    assert.equal(await shippedWordingCount(), 0,
      "read at the end as well as the start: the gate is a state, and a state can be moved");
  });
}
