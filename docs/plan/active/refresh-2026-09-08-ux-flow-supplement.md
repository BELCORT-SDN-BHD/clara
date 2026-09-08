# Clara refresh — Mobbin flow supplement

Date: 2026-09-08. This supplements [`refresh-2026-09-08-ux-research.md`](./refresh-2026-09-08-ux-research.md); it does not replace that report or make a design decision.

## Method and coverage limit

Every Mobbin call used the required task intent: **“Research coherent workflows and interaction patterns for an AI accounting workspace.”** Flow search returned metadata for every screen but rendered only evenly spaced preview images. I used targeted Mobbin screen searches to recover missing positions and visually inspected every screen described below. Chrome and the in-app browser were unavailable through CUA, so Mobbin's interactive flow viewer could not be opened in a separate browser tab. I did not fetch the raw image URLs or treat unrendered metadata as visual evidence.

The historical `ux-pattern-library.md` and `shadcn-mapping.md` under the owner's research folder were used only as pointers. Their parent README says their decisions were withdrawn. Findings here are limited to frames returned in this pass; static frames do not establish motion, elapsed time, keyboard behavior, or backend semantics.

## Newly inspected flow positions

### Linear — inviting team members

[Flow: Inviting team members](https://mobbin.com/flows/44413772-2ae1-4a33-85e7-df96010438b9), 5 positions total.

- Newly viewed [position 2](https://mobbin.com/screens/248bf908-4748-416c-8a99-7f096e966635): the existing Members list remains visible behind a small invitation dialog. The dialog starts with one email field and an explicitly optional team selector.
- Positions 1, 3, and 5 were already inspected in the main report. Position 4 did not surface in targeted screen search, so current visual coverage is **1, 2, 3, and 5 of 5**.

Changed finding: the invitation action keeps the member roster as context from the empty dialog through the final invited rows. For Clara, a firm-member invitation can be a short overlay on the member list, with role/client scope captured in the form and the resulting pending membership visible in the same destination. This still does not establish error, duplicate-email, expiry, revocation, or keyboard behavior.

### Linear — creating a saved view

[Flow: Creating a view](https://mobbin.com/flows/23c119ec-b9fc-4934-ab4a-107934dd858c), 8 positions total.

- Newly viewed [position 2](https://mobbin.com/screens/0ac97560-1aef-4907-a356-8c18c749437b): creating a view opens an editable “All issues” surface with an optional description, visible Personal save scope, Cancel/Save controls, and the live grouped list still present.
- Newly viewed [position 3](https://mobbin.com/screens/610d34b6-6ad8-45ab-80fb-2107b31ed01e): the name and description become “High Priority Tasks” and “Issues marked as ‘High Priority’” inline; the underlying list remains available rather than moving to a separate wizard.
- Newly viewed [position 4](https://mobbin.com/screens/ed670cda-0527-4716-a1a6-0159f12c4f42): the Add Filter menu opens over the list and exposes grouped attributes including Status, Assignee, Agent, Creator, Priority, Labels, Relations, Dates, Project, and Content.
- Newly viewed [position 7](https://mobbin.com/screens/0f263579-9bcb-4815-991e-ad45b408814d): the applied rule is expressed as a readable chip, “Priority is High”; the matching grouped rows are visible and the save scope is Workspace.
- Positions 1, 5, and 8 were already inspected in the main report. Position 6 did not surface, so current visual coverage is **1–5, 7, and 8 of 8**.

Changed finding for Clara Work: view creation is an in-context refinement of the real list. The useful contract is therefore: apply filters against visible rows, express active rules as readable chips, make Personal versus firm Workspace ownership explicit, then keep the saved result as the destination. This strengthens the case for one Work list with saved views such as Needs you, rather than separate queues that drift. It also implies that unsaved filter state, saved-view identity, and view scope are distinct states. The screenshots do not show filter validation, concurrent edits, sharing permissions, or unsaved-change recovery.

### v0 — creating a chat

[Flow: Creating a chat](https://mobbin.com/flows/e317900d-075f-429c-9fc1-c89916af38e7), 10 positions total.

- Newly viewed [position 2](https://mobbin.com/screens/adc9329d-ea5f-4c13-8638-880d562244c4): a long request is composed in place before submission; model choice and project target remain compact controls under the text.
- Newly viewed [position 3](https://mobbin.com/screens/43b300f5-3c4e-4a18-96ca-53499601759c): the plus menu expands progressive capabilities from the composer, including importing from GitHub or Figma, uploading from the computer, image generation, Skills, Design Systems, Instructions, MCPs, and Auto Permissions.
- Positions 1, 4, 7, and 10 were already inspected in the main report. Positions 5, 6, 8, and 9 did not surface in targeted searches, so current visual coverage is **1–4, 7, and 10 of 10**.

Changed finding for Clara chat and clarification: attachments and advanced capabilities can stay subordinate to the same composer instead of becoming separate entry flows. Clara can likewise accept documents and extra context inside a question or work discussion while keeping typed clarification controls visible in the conversation. The v0 frame is only evidence for progressive disclosure: its generic Skills, MCP, and Auto Permissions menu is not evidence that Clara should expose accounting authority as a user-selectable composer option. The missing middle frames mean this pass does not establish how v0 transitions from submission to thinking, handles partial output, recovers from an error, or switches between conversation and artifact.

### v0 — account settings

[Flow: Account settings](https://mobbin.com/flows/ae283364-74b7-4609-83e3-459be5c17b35), 9 positions total.

- Newly viewed [position 1](https://mobbin.com/screens/22b766f7-f6d6-4b61-b085-0d32acddd33e): an account menu provides Profile, Account Settings, Pricing, documentation/community links, credit balance, and lightweight preferences before entering the full settings area.
- Position 3 was the workspace-settings screen already inspected in the main report.
- Newly viewed [position 5](https://mobbin.com/screens/75755317-cfd3-46c3-b471-25f69dc28989): Integrations groups Figma, Vercel environment variables, and MCP connections on one page, with actions attached to each integration type.
- Newly viewed [position 6](https://mobbin.com/screens/46b03f70-d7f5-487d-9e5a-710d7752a5a0): Billing separates current plan, credit balance and expiry, payment method, and usage code into labeled sections.
- Newly viewed [position 7](https://mobbin.com/screens/5cc46b10-3c5a-4843-b6e3-0d937a120d6f): Members remains in the same workspace settings navigation and shows the current collaboration constraint in the content area.
- Newly viewed [position 8](https://mobbin.com/screens/f6a1fe3b-ecbc-4fd0-af7d-942537807582): Usage & Activity presents a date range, event/user/kind/model/cost columns, pagination, and a Download action.
- Newly viewed [position 9](https://mobbin.com/screens/19139895-ec1f-4b16-a58d-dc682670a601): API Keys has a simple empty state with one New Key action.
- Positions 2 and 4 did not surface, so current visual coverage is **1, 3, and 5–9 of 9**.

Changed finding: settings keeps account preferences and workspace administration in one navigable area while giving billing, membership, usage, integrations, and credentials their own responsibility-based pages. For Clara this supports one Settings destination with explicit Account, Firm workspace, Members and access, Billing, Agent preferences, and Usage/audit groupings. Client accounting configuration still belongs to the client workspace because it changes accounting behavior. The screenshots do not establish role enforcement or whether a control is available to every member.

## Implications for the Work and clarification contracts

1. **Work views are projections over one queue.** Linear's complete-enough sequence shows the user filtering the actual list, reading the rule as a chip, choosing the saved-view scope, and staying on the resulting list. Needs you should be a stored filter over Work, with the same work item and question identity available everywhere.
2. **A clarification belongs to its work object even when answered in chat.** v0 demonstrates one composer carrying text, files, and progressively disclosed capabilities; it does not require a second upload or assistant flow. Clara's typed answer renderer can preserve `question_id`, `work_id`, `client_id`, and answer-version context while allowing free text or documents in the same conversation.
3. **Membership and permissions remain administrative state.** Linear's invite overlay is efficient because it returns to a roster with visible pending membership. That pattern does not turn approval or accounting authority into chat preferences. Firm/member/client scope must be explicit in the resulting row and enforced by the backend.
4. **Preference, usage, and authority need separate settings concepts.** v0's pages make this separation legible. Clara can store interaction preferences and agent behavior in Settings while keeping accounting permissions, client policy, and audit usage distinct. A preference save is not evidence of permission to post or disclose data.

## Remaining gaps

- Linear invitation position 4 and saved-view position 6 remain unseen.
- v0 chat positions 5, 6, 8, and 9 remain unseen, so no end-to-end generation-state or recovery claim is supported.
- v0 account-settings positions 2 and 4 remain unseen.
- The 25-screen Linear onboarding flow received no new frame coverage in this bounded pass; the five previously inspected positions remain the evidence.
- No flow in this pass showed Clara's hardest states: a persisted accounting clarification answered concurrently in two surfaces, stale answer rejection, permission escalation, partial completion, failed document extraction, or reconnection after a durable job resumes.
- No animation claim is made from these static images.

The Mobbin flow links above are the source-of-record references for this supplement. Further completion requires an available interactive browser surface or a connector method that renders arbitrary flow positions directly.

## Root follow-up through Edge

The root session subsequently found the existing Edge surface and opened a separate Mobbin research tab. This supersedes the earlier browser-availability limitation for that interval, but does not imply all missing screens were inspected.

- [Linear saved view](https://mobbin.com/flows/23c119ec-b9fc-4934-ab4a-107934dd858c), position 6: visually inspected the filtered High Priority list while the save target remained Personal. Together with the preceding research this completes the eight static positions in that sequence, reinforcing the distinction between filtering and deciding who owns the saved view.
- [v0 creating a chat](https://mobbin.com/flows/e317900d-075f-429c-9fc1-c89916af38e7), positions 6, 8 and 9: the frame's accessible image label and visible location were checked alongside screenshots. Position 6 shows model selection within the existing composer; position 8 shows an artifact beside a conversation containing verification/tool progress and a task summary; position 9 shows a completion summary while retaining the artifact and follow-up composer. These support distinct progress/result roles and persistent object access. They do not prove the accuracy of v0's claimed verification or any backend recovery behaviour.
- Position 5 was navigated to, but browser control ended before its settled frame could be independently verified. It remains unverified. Linear invitation position 4, the onboarding gaps and v0 settings positions 2/4 also remain open.

These are inspected static Mobbin frames. Carousel transitions in the Mobbin viewer are not evidence of Linear or v0's own motion design. No app permission, accounting action, upload or reference-product mutation was performed.

## Continuation: remaining core flow frames inspected

On 2026-09-08 the Edge CUA session later returned `Debugger unattached`. A separate Playwright browser could open Mobbin's public flow viewer. The following frames were inspected as rendered element screenshots after checking their accessible image labels and waiting for each frame to occupy the centre of the viewer. No raw image URL fetch or reference-product mutation was used.

- [v0 creating a chat](https://mobbin.com/flows/e317900d-075f-429c-9fc1-c89916af38e7), position 5: several attachments sit above the same composed request; the compact model menu is open underneath it. This completes **10/10 static positions** across passes. It supports attachment/context continuity, not a need for Clara to expose model selection or authority switches.
- [v0 account settings](https://mobbin.com/flows/ae283364-74b7-4609-83e3-459be5c17b35), positions 2 and 4: Preferences contains suggestions, sound notifications, chat position, custom instructions and interface/theme controls; Memories has separate User/Team tabs and a file-oriented empty state. This completes **9/9 static positions**. Clara can borrow visible preference scope and administrative grouping; its accepted Knowledge contract does not become a requirement for accountants to maintain `MEMORY.md` files.
- [Linear inviting team members](https://mobbin.com/flows/44413772-2ae1-4a33-85e7-df96010438b9), position 4: the dialog is closed, three pending invited members appear in the roster, and a small confirmation says three invitations were sent. This completes **5/5 static positions**. A toast reports the transition while the persistent roster records the outcome.
- [Linear onboarding](https://mobbin.com/flows/64ae582c-747c-4c77-8629-812abcbef186), positions 2–6, 8–12, 14–18 and 20–24: combined with earlier 1/7/13/19/25, coverage is now **25/25 static positions**. Email admission moves through address, sent-link feedback and manual code entry. Workspace creation presents name/URL, region and company/role fields, then setup progress. A second sequence introduces theme and a working command menu, offers integration later, invites coworkers, offers optional updates and ends in the actual issue list with a contextual explanation.

The onboarding distinction matters: admission, workspace creation and learning the product are separate phases. Clara should make firm creation usable quickly, keep invitations/integrations and product education resumable, and collect client accounting facts as sourced client setup work. Linear's marketing/company-size fields and optional update subscription are not Clara accounting prerequisites. Required client facts may block dependent accounting operations without blocking unrelated navigation or complete work.

The complete static sequences now covered are Linear saved views (8/8), invitations (5/5), onboarding (25/25), v0 creating chat (10/10), account settings (9/9) and previously inspected v0 home (3/3). Vercel, Copilot Money, Pulse/project updates, Midday and Mercury remain the bounded samples identified in the main report; v0 creating a website remains 3/9. No source-product motion timing, backend durability, access enforcement, error recovery or full accessibility audit is inferred from these frames.

Owner exchange Q24/Q25: the owner endorsed a work-first client home (Needs you, running and recent completions plus concise financial context) and explicitly selected an Accounting navigation group, with Work tracking execution and Reports presenting outputs. These are owner-supported design inputs for the navigation decision; this research note does not itself close that decision.

### Linear Pulse: complete bounded sequence

[Pulse flow](https://mobbin.com/flows/f9748ad5-1ea0-4875-9aff-dc7ee2fa0ca6) has four frames. The connector rendered positions 1, 3 and 4; the public browser viewer supplied position 2. All four were visually inspected. The sequence moves from the main assistant surface through navigation into Pulse, an empty update feed with For me/Popular/Recent filters, and a populated project update with an on-track status, prose, a status transition and a reply composer. This supports attributable, object-linked Activity summaries, with actionable questions remaining in Work/Needs you. It does not prove that a generated summary is correct or that replies resume any backend job. Clara's updates should derive their completion claims from receipts and link to the underlying work and evidence.

### Vercel project overview: complete bounded sequence

[Project overview](https://mobbin.com/flows/5a5c97f3-f719-49c1-b42b-3c1dc9c9dd53) has six frames. The connector rendered 1/4/6; the browser supplied 2/3/5, with the centred image identified through rendered DOM labels and visible screenshots. Coverage is **6/6 static frames**. A searchable project switcher overlays the actual project list; selecting a project retains the shell while changing its local navigation. The overview anchors on the current production deployment, then exposes supporting settings, checklist and observability/analytics. Visit actions and deployment settings expand in place. An empty Active Branches region coexists with populated project information and metrics.

This corrects the main report's original overly broad “empty overview” label. For Clara, scope switching must remain explicit, local empty regions must not imply the entire client is empty, and a compact home summary must lead to the actual object/work. The selected client's pages and rail must display their scope rather than silently carrying a prior client's writable context. A checklist count is meaningful only against real requirements; Vercel's product suggestions are not a model for accounting readiness checks. No project settings were changed.

### Copilot Money dashboard: complete bounded sequence

**2026-09-09 follow-up:** the [first-party motion and chart study](refresh-2026-09-08-copilot-motion-research.md)
adds live public-page row-transition observations and official walkthrough/documentation evidence.
The historical paragraph below remains a static-frame account; it no longer represents the
entire Copilot research set. No exact chart/panel easing or authenticated-app behavior is inferred.

The connector rendered all **3/3 static frames** of the [Dashboard flow](https://mobbin.com/flows/784fafc4-81bb-4d1e-a75b-47aacbefba1b). This captured version presents an assets/debt trend with an explicit range, followed by a dashboard with a primary budget amount, To review, category amounts, upcoming items and a labelled current-versus-prior income comparison. It complements the two newer-looking individual reference screens already in the main report; no claim is made that one capture is the currently shipped app version. Useful structure is a legible number with its basis, supporting trend and a direct route to underlying records. Its consumer budget semantics, promotional section, bright palette and horizontal category cards are not Clara requirements. The Work queue remains a filterable list. Static captures cannot establish Copilot's animation philosophy or timing; Clara motion must be judged in a runnable prototype using its own tokens and reduced-motion behavior.

### Final research coverage boundary

Complete static sequences across the documented passes: Linear onboarding 25, invites 5, saved views 8, Pulse 4; v0 chat 10, settings 9, home 3; Vercel project overview 6; Copilot dashboard 3. Midday and Mercury remain inspected individual examples, while the unrelated v0 website-generation sequence remains three sampled frames. This is a task-focused research set rather than a claim to have audited every feature of every reference product. Exact financial measures/aggregation, comparable Clara layouts, responsive behavior and motion remain design/verification work; none is being passed off as completed reference-app testing.
