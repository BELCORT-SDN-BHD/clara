# Agent-initiated withdrawal of client knowledge

Clara's runtime has no door to withdraw a knowledge record. `clara.withdraw_knowledge` is a human
act (`clara_authenticated` only), and no `withdraw_knowledge_for` runtime arm will be built.

## Why this is out of scope

A withdrawal is terminal for the record (CONTEXT.md, "Knowledge revision"): the revision it retires
stays readable, and a later statement of the same thing starts a new record with its own history.
The product already refuses to let an agent's inference become confirmed knowledge without a person;
symmetrically, the agent must not be the one who ends a confirmed record.

When a run finds a fact stale or contradicted, the product's route is a Work question for a person —
the reassessment consumer that #663 owns — so the withdrawal, if any, carries a human actor and a
stated reason. A runtime withdraw door would let a model's confidence retire a fact a person supplied.

Decided by the owner on 2026-09-15 and recorded in `docs/ARCHITECTURE.md` §5 B.

## Prior requests

- #785: "No runtime-callable door to withdraw a knowledge fact"
