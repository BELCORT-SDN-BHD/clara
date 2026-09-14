# Human read of the assembled knowledge pack

Clara does not grant any human role EXECUTE on `clara.get_knowledge_pack`. The pack stays a
`clara_runtime`-only door.

## Why this is out of scope

The knowledge pack is the bounded set of a client's live knowledge records assembled for ONE stated
purpose, with the firm's current knowledge version as its watermark — supplied data for the model,
never instructions (CONTEXT.md, "Knowledge pack"). A human who needs to see what Clara knows about a
client reads the register itself: `clara.list_client_knowledge`, `clara.get_knowledge_record` and
`clara.get_knowledge_history` show every record with its kind, trust level, source and full revision
history, which the pack deliberately flattens for the model's consumption.

Opening the pack to humans would add a second human read of the same rows with weaker provenance,
and would invite support tooling or UI built on the model's view rather than the register's. The
register is the human surface; the pack is the model's.

Decided by the owner on 2026-09-15 and recorded in `docs/ARCHITECTURE.md` §5 B.

## Prior requests

- #783: "Decide whether get_knowledge_pack should have a human EXECUTE grant"
