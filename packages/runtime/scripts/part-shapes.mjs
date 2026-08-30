// Shared source instrument for P6-1's declared-part census. Comments are removed before the
// parser looks for exported object-type declarations, so prose can never stand in for code.

export function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

/** Return kind -> ordered field names for exported object-type declarations. */
export function declaredPartShapes(src) {
  const code = stripComments(src);
  const shapes = new Map();
  const declaration = /export\s+type\s+[A-Za-z0-9_]+\s*=\s*\{([^{}]*)\}/g;
  let match;
  while ((match = declaration.exec(code)) !== null) {
    const body = match[1];
    const kind = /\btype\s*:\s*"([a-z_]+)"/.exec(body);
    if (!kind) continue;
    shapes.set(
      kind[1],
      [...body.matchAll(/(?:^|[;{\s])([a-z_][a-z0-9_]*)\s*:/g)].map((field) => field[1]),
    );
  }
  return shapes;
}
