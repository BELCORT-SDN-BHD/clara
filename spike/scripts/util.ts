import pg from "pg";

export function baseUrl(): string {
  return process.env.SPIKE_BASE_URL ?? `http://localhost:${process.env.PORT ?? "3100"}`;
}

export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env and paste the Supabase session-mode connection string.");
    process.exit(1);
  }
  return url;
}

export function makeClient(): pg.Client {
  return new pg.Client({ connectionString: requireDatabaseUrl() });
}

export function describeTarget(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    return "(unparseable connection string)";
  }
}

export async function postJson(path: string, body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}
