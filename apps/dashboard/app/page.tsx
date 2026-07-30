// Slice-1 placeholder. The real two-pane Agentic Accounting OS UI comes later
// (docs/design/DIRECTION.md). This only proves the app boots and reads config.
const env = process.env.NEXT_PUBLIC_CLARA_ENV ?? "development";

export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "3rem", maxWidth: 640, lineHeight: 1.5 }}>
      <h1 style={{ marginBottom: "0.5rem" }}>Clara</h1>
      <p>AI-native Accounting OS — rebuild. Dashboard skeleton (Slice 1).</p>
      <p>
        Environment: <code>{env}</code>
      </p>
      <p>
        <a href="/chat">Chat (Slice-4 plumbing page)</a>
      </p>
      <p>
        <a href="/documents">Documents (Slice-5 plumbing page)</a>
      </p>
      <p>
        <a href="/queue">Review queue (Wave-A daily loop)</a>
      </p>
      <p>
        <a href="/onboarding">Onboarding (Wave-B interviews: firm + client)</a>
      </p>
      <p>
        <a href="/clients/plan">Client plan (Wave-B plan-as-document — needs ?client_id=)</a>
      </p>
      <p>
        <a href="/opening">Carry-down workbench (Wave-B opening seeds)</a>
      </p>
      <p>
        <a href="/seeding">Seeding tick-list (Wave-B prior-GL ceremony)</a>
      </p>
      <p>
        <a href="/bank">Bank (Wave C-b: identity, statement ingest, matching)</a>
      </p>
    </main>
  );
}
