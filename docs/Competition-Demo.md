# UndoLane — competition story and recording script

## The story

**Agent mistake removed. Human work preserved.**

A studio prepares a campaign with an agent. A person continues editing and perfects a title. The launch is then canceled: the batch should be undone, but the finished title is still useful.

The default fixed recipe demonstrates unwanted automation, not a fabricated natural model failure. Keep “Demo recipe · no model inference” visible. Do not claim an injected selection defect, thousands of assets, exports, or a dependency graph; those are not part of this build.

## State contract

| Moment | asset_a | asset_b | asset_c |
| --- | --- | --- | --- |
| Start | Cake 01; campaign null; approved | Cake 02; campaign null; approved | Cake 03; campaign null; unapproved |
| Agent Run | Autumn Cake 01; Autumn Launch | Autumn Cake 02; Autumn Launch | unchanged |
| Human edit | unchanged | Hero — Final; Autumn Launch | unchanged |
| Preview B | outside this plan | campaign Eligible; title Protected | outside this plan |
| Commit B | still Agent-owned | campaign null, revision 2; Hero — Final retained | unchanged |
| Separate Preview + Commit A | Cake 01; campaign null; both revisions 2 | Human title retained | unchanged |

Run: 2 Actions, 4 Effects. B's Action: 1 eligible, 1 protected. A's Action: 2 eligible. Across two independently reviewed commits: 3 restored, 1 preserved. Never label these as a single atomic Run undo.

## 2:30 video plan (English narration / captions)

| Time | On screen | Suggested narration |
| --- | --- | --- |
| 0:00–0:15 | Undo Review, protected title | “The agent changed my campaign assets. I have already finished this title. Can I undo its work without losing mine?” |
| 0:15–0:30 | Fresh workspace, 3 assets | “UndoLane is a managed workspace for ownership-aware undo. This tiny sample makes every change visible.” |
| 0:30–0:55 | Run the Autumn task; show timeline | “This no-key recipe drives the same Runner and real MCP tools. Two assets are read and patched. Two Actions and four Effects are saved.” |
| 0:55–1:10 | Edit B title to Hero — Final | “I keep working. Then the launch is canceled. The batch is now unwanted, but this title is worth keeping.” |
| 1:10–1:40 | Review B, point to both rows and orange card | “A whole-object snapshot restore would erase my title. UndoLane checks who owns each field now. The campaign is safe to undo. The newer human edit is protected.” |
| 1:40–1:55 | Commit B, show result | “The campaign is restored. My title stays. Undo adds compensation history instead of deleting what happened.” |
| 1:55–2:10 | Separately review/commit A, then Workspace | “Each tool Action is reviewed separately. Across these two commits, three Agent changes are reversed and one Human edit is preserved.” |
| 2:10–2:25 | Architecture PNG; optional stale-plan test clip | “Revisions keep increasing. Stale previews are rejected, and repeated commits return the same receipt. The database makes the decision, not the model.” |
| 2:25–2:30 | Final workspace and project name | “Agent mistake removed. Human work preserved.” |

Use 16:9 capture with readable browser text. Keep mode labels visible. If cutting waits, label time compression. Do not show API keys, terminal environment dumps, or an unverified public repository URL. A live-model segment is optional and must actually use a configured model.

## Five-second review check

The top summary answers how many fields the selected Action changed and how many are safe/protected. The table answers what changed. The orange card shows the current Human title and explains why it survives. This is a design goal supported by screenshot inspection, not a measured user study.

## Devpost description draft

### Inspiration

Automation saves repetitive work, but people do not stop editing after an agent finishes. We wanted recovery that respects the work done in between.

### What it does

UndoLane records agent edits field by field, previews their current undo eligibility, and restores eligible changes while preserving newer edits. A human-readable review connects each decision to real stored history.

### How we built it

React and Vite provide the workspace. A minimal TypeScript Agent Runner calls an official MCP client/server pair. SQLite stores field revisions, Actions, Effects, and compensation receipts. The engine uses field ownership and transactional revision checks; the model does not decide what to restore.

### Challenges and accomplishments

The important cases happen after the original edit: a Human changes the same field, a preview becomes stale, or a commit is retried. Automated tests exercise these cases against real SQLite and MCP. The browser demonstration preserves the Human title while undoing the campaign field.

### Impact and originality

We aim to reduce the manual reconciliation needed after unwanted automation in creative workflows. The contribution is the integrated, inspectable recovery experience, not the invention of selective undo or compensation transactions. We have not measured user productivity or large-scale throughput.

### What's next

Evaluate recovery with real creative teams and explore explicit dependency tracking. External SaaS, arbitrary filesystem rollback, deployment, accounts, and multi-agent features are outside this prototype.

### AI assistance

OpenAI Codex/ChatGPT assisted implementation, tests, interface design, and documentation. The default recording uses a disclosed fixture provider with real MCP/database writes, not live inference.
