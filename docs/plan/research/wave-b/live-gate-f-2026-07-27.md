# Gate F — FIRM onboarding ran live as a durable run: CLOSED (2026-07-27)

Pinned: **21 migrations · runtime v29 · `main` `79d6ee7`.**
Gate F (wave-b-contract §4): *"FIRM onboarding runs live as a durable run."*

**ROME PUBLIC ADVISORY SDN. BHD. is Clara's fourth firm**, born through the product's own
11-question durable interview — the owner's real second practice, real particulars, zero
fabricated answers.

## The provisioning (the three owner acts, as performed)

1. **Owner** created the Supabase auth account (`zhantaolau54@gmail.com`) — the agent is
   prohibited from creating accounts and never touched the password (a mint script the owner
   runs reads his own login file; only the session token reaches the agent).
2. Identity mirrored into `clara.users` (`4f179b75…`, `member_of = 0`) and **one** admission
   token minted — captured in-process to `~/.clara-rpa-admission-token.txt`, **never printed,
   never in chat, never in argv**.
3. **Owner** supplied the 11-Q particulars verbatim in-session.

## The run — `wrun_01KYFVGS660V99NX6NSPZ1THS0`

**22 parks driven end-to-end** over the live API: 11 questions, each with its
validated-echo confirm round (`legal_name` → … → `framework`), MIA answered `skip`
(skippable by design). Validator behaviour observed live: `entity_type` normalized
`Sdn Bhd → sdn_bhd`; the SSM answer used the bare 12-digit form `201501005365` (the
certificate prints `201501005365 (1130695-T)`; the combined print is not a validator
shape — finding F1's boundary, no bite here).

**The durability claim was demonstrated by accident, which is the best way:** the first
commit attempt failed — the agent's own Act-2 script had written psql's `INSERT 0 1`
command tag into the token file, and `create_firm` refused the polluted uuid at parse.
**Nothing was consumed, nothing was written, and the run RE-PARKED at the commit park**
with the same memoized `op_key` (the O7 exactly-once contract). A commit-only retry with
the clean token succeeded against the SAME run:

```
create_firm OK  firm=39008536-838f-478c-9eee-ff1e84b77aa9  plan=192af9e4-c312-4b40-8ae3-401953721bf1
TERMINAL {"outcome": "firm_created", "answered": 10}
```

The admission token never reached the runtime or the workflow checkpoint (P19): the
dashboard-role driver called `create_firm(name, token, op_key)` on the human lane and
delivered only the `{firmId, planId}` receipt into the hook, which the route rebuilds
field-by-field (F7/F8).

## Post-verification (read-only, live)

| check | result |
|---|---|
| firm row | `ROME PUBLIC ADVISORY SDN. BHD.` · high-stakes at the RM10,000 **default** (BELCORT's RM100k ruling is per-firm and did not leak) |
| firms total | **4** |
| membership | `zhantaolau54@gmail.com` · **owner** · active |
| admission tokens | **4 consumed / 0 free** — the minted token was consumed exactly once |
| onboarding plan | `open`, **11 items**: 10 `answered` + `first_client_onboarding:deferred`; skipped MIA correctly absent |
| event spine | `firm.created` ×1 under the new firm |
| RLS spot | the new firm sees **0** clients — nothing of BELCORT bleeds |

## Honest limits

- The ≥48h park-resume and kill-mid-interview drills were **not** re-run here; they are
  Gate O's closed evidence on this same durable substrate. F's contract line — a live
  durable run — is what this receipt evidences, including one unplanned park-and-resume
  across a failed commit.
- The commit prompt says "10 answers" (it counts confirmed non-skipped segments);
  the plan carries 11 items because the deferred first-client todo is minted at commit.
- The new firm is empty by design. Its first client (Rome Public Advisory's own book of
  clients) is post-Wave-B operating work.

**With F closed, every Wave-B gate that can close on today's real evidence has closed.**
