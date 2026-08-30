// P6-1 deploy hold: the runtime declarer may merge ahead of the reader, but it may not deploy.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { checkPartsParity } from "../scripts/check-parts-parity.mjs";

const DECLARER = await readFile(
  fileURLToPath(new URL("../workflows/chatTurn.v16.parts.ts", import.meta.url)),
  "utf8",
);
const READER = await readFile(
  fileURLToPath(new URL("../../../apps/web/lib/parts/types.ts", import.meta.url)),
  "utf8",
);
const DOCKERFILE = await readFile(
  fileURLToPath(new URL("../Dockerfile", import.meta.url)),
  "utf8",
);

test("p6-1.parts-parity: v16 plus the live 22-kind reader is REFUSED with the exact four missing kinds", () => {
  const result = checkPartsParity({ declarerSource: DECLARER, readerSource: READER });
  assert.equal(result.reader.length, 22, "control: this branch still carries the pre-P6 reader");
  assert.equal(result.ok, false, "the deploy preflight refuses a reader behind the declarer");
  assert.deepEqual(result.missing, ["agent_receipt", "firm_question", "close_proposal", "freeform_result"]);
});

test("p6-1.parts-parity: v16 plus a 26-kind reader fixture is admitted", () => {
  const current = checkPartsParity({ declarerSource: DECLARER, readerSource: READER });
  const allKinds = [...current.reader, ...current.declared];
  const fixture = `export type ClaraPart =\n${allKinds.map((kind) => `  | { type: "${kind}" }`).join("\n")};\n`;
  const result = checkPartsParity({ declarerSource: DECLARER, readerSource: fixture, readerPath: "reader-26.fixture.ts" });
  assert.equal(result.reader.length, 26, "the positive fixture is genuinely the post-bump size");
  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
});

test("p6-1.parts-parity: the Docker build stage invokes the fail-closed preflight", () => {
  assert.match(
    DOCKERFILE,
    /^RUN node packages\/runtime\/scripts\/check-parts-parity\.mjs$/m,
    "removing the build-stage invocation must red this cell",
  );
});
