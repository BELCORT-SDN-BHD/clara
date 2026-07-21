// Bundling + encryption primitives: tar(+zstd) and age.
//
// age (age-encryption.org) encrypts to a RECIPIENT (public) key — the encrypt side
// needs NO secret at all, so the scheduled job holds zero key material for this step;
// the recipient file is committed to the repo. Decryption needs the IDENTITY (private)
// key, which stays in OWNER CUSTODY off-repo/off-R2 (see docs/ops/DR.md §9). age does
// NOT compress, so we zstd BEFORE age.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

/**
 * Read the age recipient(s) from the repo file — one `age1…`/`ssh-…` recipient per
 * non-comment line. Multiple recipients support rotation: encrypt to BOTH the old and
 * new recipient during a rotation window so historical bundles stay decryptable.
 * @returns {string[]} recipient strings
 */
export function readRecipients(recipientsFile) {
  if (!existsSync(recipientsFile)) throw new Error(`age recipients file not found: ${recipientsFile}`);
  const lines = readFileSync(recipientsFile, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  const real = lines.filter((l) => !/YOUR_|PLACEHOLDER|REPLACE/i.test(l));
  if (real.length === 0) {
    throw new Error(
      `age recipients file ${recipientsFile} contains only PLACEHOLDER(s). The owner must fill in the real ` +
        `age recipient public key before the first live run (docs/ops/DR.md §9).`,
    );
  }
  return real;
}

function recipientArgs(recipients) {
  return recipients.flatMap((r) => ["-r", r]);
}

/** tar a directory into a single zstd-compressed archive (GNU tar --zstd). */
export function tarZstdDir({ srcDir, outPath, tar = "tar", log = console.log }) {
  log(`bundle: tar --zstd ${srcDir} -> ${outPath}`);
  const r = spawnSync(tar, ["--zstd", "-cf", outPath, "-C", srcDir, "."], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (r.error) throw new Error(`tar failed to start: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`tar --zstd exited ${r.status}`);
  return outPath;
}

/** age-encrypt a file to one or more recipients (no secret needed). */
export function ageEncryptFile({ inPath, outPath, recipients, age = "age", log = console.log }) {
  log(`bundle: age encrypt -> ${outPath} (${recipients.length} recipient(s))`);
  const r = spawnSync(age, [...recipientArgs(recipients), "-o", outPath, inPath], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (r.error) throw new Error(`age failed to start: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`age encrypt exited ${r.status}`);
  return outPath;
}

/** age-encrypt an in-memory buffer to a file (used for the firm-docs byte mirror). */
export function ageEncryptBuffer({ input, outPath, recipients, age = "age" }) {
  const r = spawnSync(age, [...recipientArgs(recipients), "-o", outPath], {
    input,
    stdio: ["pipe", "inherit", "inherit"],
  });
  if (r.error) throw new Error(`age failed to start: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`age encrypt (buffer) exited ${r.status}`);
  return outPath;
}
