# Gate F provisioning — the three owner acts (OWNER-ONLY, not delegable)

Gate F is *"FIRM onboarding runs live as a durable run"* (wave-b-contract §4). The engineering
is built and deployed; the gate is blocked on **account provisioning**, which the agent is
prohibited from performing. This file is the exact sequence, so it is one sitting rather than a
discovery exercise.

## Why the agent cannot do any of it

`clara.create_firm` (0004:318) refuses every principal that exists today:

| principal | refusal |
|---|---|
| the owner's account (`tao@belcort.com`) | `actor already belongs to a firm` — CLR10 |
| the seed account | same |
| the **agent** identity | `the agent identity cannot own a firm` — CLR04, HIGH-11, **by name** |

And `firm_admissions` holds **zero unconsumed tokens** (3 of 3 consumed). The agent is
additionally barred from creating accounts or handling passwords in plain text.

---

## Act 1 — a Supabase auth account with NO firm membership

In the Supabase dashboard → **Authentication → Users → Add user**. Any address you control;
it does not have to be a real mailbox for the gate, but use one you can sign in as. **Do not
reuse `tao@belcort.com`** — that account already owns BELCORT and `create_firm` will refuse it.

Note the new user's **UUID** from the dashboard. You need it for Act 2.

> This is the step that makes Gate F yours: the agent may not create accounts, and may not
> handle the password in plain text at any point.

## Act 2 — mirror the identity into `clara.users`, and mint an admission token

`clara.users.id` **equals** `auth.users.id` by convention (0002:187) and there is **no trigger
or sync** — the row must be inserted. Admission tokens are operator-seeded: `firm_admissions`
has no governed mint verb, deliberately (0002:254 — "self-serve signup/billing is post-Slice-2").

Both are live writes, so run them yourself, in a terminal, connected as the ceremony role:

```sql
-- (a) mirror the identity. <UUID> and <EMAIL> come from Act 1.
insert into clara.users (id, display_name, email, is_agent)
values ('<UUID>', 'Rome Public Advisory — owner', '<EMAIL>', false);

-- (b) mint ONE admission token, and print it.
insert into clara.firm_admissions (token, note)
values (gen_random_uuid(), 'Gate F — Rome Public Advisory, minted <YYYY-MM-DD>')
returning token;
```

Keep that token where you keep the other `~/.clara-*` secrets. **Do not paste it into chat** —
it is a single-use bearer credential for creating a firm, and the agent does not need to see it:
the agent drives the journey through the product, where *you* supply it.

Sanity check before moving on — this must return exactly one row, and `member_of` must be null:

```sql
select u.id, u.email,
       (select count(*) from clara.firm_memberships m
         where m.user_id = u.id and m.status = 'active') as member_of,
       (select count(*) from clara.firm_admissions where consumed_at is null) as tokens_free
  from clara.users u where u.id = '<UUID>';
```

`member_of = 0` is the whole point: `create_firm` refuses anyone who already belongs to a firm.

## Act 3 — Rome Public Advisory's real particulars

The firm interview asks 11 questions and **the no-fabrication rule applies** — the agent will
not invent any of these. Have to hand:

- registered **name** exactly as on the SSM certificate
- **SSM registration number** (and the old ROC number if the certificate prints both)
- registered **address**
- **financial year end**
- **SST registration status** (and the number if registered)
- the **licence / practising details** the interview asks for

> ⚠️ **This is a different entity from ROME PROPERTIES (RPR)**, which is already a client in the
> books. Rome Public Advisory is your second *practice* — a FIRM, not a client. Confusing the two
> would onboard the wrong entity.

---

## Then hand back

Tell the agent when Acts 1–3 are done. It drives the rest through the product as a durable
run — sign in as the new account, supply the token in the UI, run the 11-Q interview,
dry-run, commit — and writes the receipt.

**One caveat worth knowing before you start:** the interview's SSM validator currently accepts
only company-shaped numbers, and the `framework` question offers only MPERS/MFRS (findings F1
and F2). If Rome Public Advisory is a **Sdn Bhd**, neither bites. If it is anything else, the
interview will fight you, and the fix needs an `interview_v2` ceremony because all three
interview files are freeze-locked.
