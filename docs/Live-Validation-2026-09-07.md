# Single Live Model Validation — 2026-09-07

Run ID: `f44af7a5-882c-4629-9007-3b6195155b43`

Task: `Prepare approved assets for Autumn Launch`

Provider: configured MiMo V2.5 (`mimo-v2.5`). Exactly one Live run; no retries, code changes, or additional tasks.

## Observed result

The live execution, Human edit, and conditional undo completed without API, tool-call, or schema errors. However, this run did **not** exercise same-field Protected classification: the model changed only campaign fields, not display_name. The later Human title was outside the target Effects and remained untouched. This is not evidence of a Protected decision in this Live run.

- Model API calls: 6.
- Agent tool order: assets_list → asset_get → asset_get → asset_patch → asset_patch → assets_list.
- Agent records: 2 Actions, 2 Effects (asset_a.campaign and asset_b.campaign).
- Human records: 1 Action, 1 Effect (asset_b.display_name = Hero — Final).
- Undo: preview B → commit B → preview A → commit A. Each preview: 1 Eligible, 0 Protected, 0 Blocked. Both commits: undone. Two compensation records created; original Actions and Effects remain.
- Total tool calls including user-controlled undo: 10 MCP tool calls (6 Agent + 2 previews + 2 commits). Human edit uses the existing Engine API.
- Agent elapsed: 30.218 s. Total validation elapsed: 30.287 s, measured from initial workspace read through final SQLite verification; excludes preparing the validation script and writing this report.
- API / tool-call / schema errors: none.

## Final SQLite state

| Resource | display_name | campaign | status | note | campaign revision |
| --- | --- | --- | --- | --- | --- |
| asset_a | Cake 01 | null | approved | empty | 4 |
| asset_b | Hero — Final | null | approved | empty | 4 |
| asset_c | Cake 03 | null | unapproved | empty | 0 |

asset_b.display_name revision is 1 and ownership belongs to the Human Effect. Campaign revisions started at 2 from the previous test, increased to 3 on Agent writes and to 4 on undo. All other fields remain unchanged.

SQLite was inspected using a read-only connection. All mutations used existing HTTP → MCP → Engine paths, except the existing Human edit path, which invokes Engine directly. The model received its task through the existing Agent Runner and OpenAI-compatible provider.

Evidence: [raw snapshots, tool events, previews, receipts, and SQL verification](Live-Validation-2026-09-07.json).

Validation stopped after this one run. The requested same-field Protected demonstration remains unexercised; no task wording or application code was changed to force it.
