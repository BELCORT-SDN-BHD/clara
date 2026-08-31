import { createHash } from "node:crypto";
import ts from "typescript";

function normalize(node, file) {
  return node.getText(file).replace(/\s+/g, " ").trim();
}

function enclosingName(node) {
  let fallback = "<module>";
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isFunctionDeclaration(current) && current.name) return current.name.text;
    if (ts.isMethodDeclaration(current) && current.name) return normalize(current.name, current.getSourceFile());
    if ((ts.isArrowFunction(current) || ts.isFunctionExpression(current))
      && ts.isVariableDeclaration(current.parent)
      && ts.isIdentifier(current.parent.name)) {
      return current.parent.name.text;
    }
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) fallback = current.name.text;
  }
  return fallback;
}

function statementContainer(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isStatement(current)) return current;
  }
  return node.parent;
}

function occurrenceWithinStatement(node, file, signature) {
  const matches = [];
  const visit = (current) => {
    if (current.kind === node.kind && normalize(current, file) === signature) matches.push(current);
    ts.forEachChild(current, visit);
  };
  visit(statementContainer(node));
  return String(matches.indexOf(node));
}

export function describeParitySite(node, file, path, siteKind) {
  const signature = normalize(node, file);
  const statement = statementContainer(node);
  return {
    enclosing: enclosingName(node),
    fingerprint: createHash("sha256").update(normalize(statement, file)).digest("hex"),
    line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
    locator: occurrenceWithinStatement(node, file, signature),
    path,
    signature,
    siteKind,
  };
}

function requiredString(exemption, field) {
  if (typeof exemption?.[field] !== "string" || exemption[field].trim() === "") {
    throw new Error(`unclassifiable-site exemptions require a non-empty ${field}`);
  }
}

function exemptionIdentity(exemption) {
  return [
    exemption.siteKind,
    exemption.path,
    exemption.enclosing,
    exemption.signature,
    exemption.fingerprint ?? "*",
    exemption.locator ?? "*",
  ].join("\0");
}

function matches(exemption, site) {
  return exemption.siteKind === site.siteKind
    && exemption.path === site.path
    && exemption.enclosing === site.enclosing
    && exemption.signature === site.signature
    && (exemption.fingerprint === undefined || exemption.fingerprint === site.fingerprint)
    && (exemption.locator === undefined || exemption.locator === site.locator);
}

function describeExemption(exemption) {
  return `${exemption.path} ${exemption.enclosing} ${exemption.signature}`;
}

export function siteExemptionLedger(siteExemptions) {
  if (!Array.isArray(siteExemptions)) throw new Error("unclassifiable-site exemptions must be an array");
  const seen = new Set();
  const entries = siteExemptions.map((exemption) => {
    for (const field of ["siteKind", "path", "enclosing", "signature", "reason"]) requiredString(exemption, field);
    if (exemption.fingerprint !== undefined && !/^[0-9a-f]{64}$/.test(exemption.fingerprint)) {
      throw new Error(`unclassifiable-site exemption has invalid fingerprint at ${describeExemption(exemption)}`);
    }
    if (exemption.locator !== undefined && !/^\d+$/.test(exemption.locator)) {
      throw new Error(`unclassifiable-site exemption has invalid locator at ${describeExemption(exemption)}`);
    }
    const identity = exemptionIdentity(exemption);
    if (seen.has(identity)) throw new Error(`duplicate unclassifiable-site exemption ${describeExemption(exemption)}`);
    seen.add(identity);
    return { exemption, matches: 0 };
  });

  return {
    consume(site) {
      const candidates = entries.filter(({ exemption }) => matches(exemption, site));
      if (candidates.length === 0) return false;
      if (candidates.length !== 1) {
        throw new Error(`ambiguous unclassifiable-site exemptions at ${site.path}:${site.line}`);
      }
      candidates[0].matches += 1;
      if (candidates[0].matches !== 1) {
        throw new Error(`ambiguous unclassifiable-site exemption ${describeExemption(candidates[0].exemption)}`);
      }
      return true;
    },
    assertComplete() {
      for (const entry of entries) {
        if (entry.matches === 0) {
          throw new Error(`stale unclassifiable-site exemption ${describeExemption(entry.exemption)}`);
        }
      }
    },
  };
}
