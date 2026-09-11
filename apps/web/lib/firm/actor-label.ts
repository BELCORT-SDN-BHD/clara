// #728 (hosted-walk finding 2) — the fixed agent identity, mirrored from `clara.agent_user_id()`
// (packages/db/migrations/0002_foundation.sql:334-335, `'00000000-0000-4000-8000-000000c1a7a0'::uuid`).
//
// WHY THE WEB NEEDS ITS OWN COPY OF THIS UUID. `MemberName` (components/common/member-name.tsx)
// resolves an actor through `clara.firm_members_visible` (a JOIN of `firm_memberships` and
// `users`), and the agent identity carries NO `firm_memberships` row for any firm it never
// formally joined — confirmed against every write path that inserts a `firm_memberships` row
// (`create_firm`, `add_member`, and every onboarding-lane variant): none of them ever names
// `clara.agent_user_id()`. So the roster read genuinely does not carry this uuid, and the
// walked defect ("00000000on behalf of Tao") is exactly `MemberName`'s own honest fallback for an
// id NOT in the roster — the shortened raw id — applied to an id every human colleague on the
// team already knows by name. `isAgentActor` lets `MemberName` (and any other reader of an
// activity/receipt actor) special-case this ONE uuid without guessing a name for anything else.
export const AGENT_USER_ID = "00000000-0000-4000-8000-000000c1a7a0";

export function isAgentActor(userId: string | null | undefined): boolean {
  return userId === AGENT_USER_ID;
}
