# ADR 001 — Phase 1 conditional undo

Accepted: 2026-09-06. Long-term reference: [complete design](GIBC_V2_UndoLane_Project_Plan.md), especially sections 6 and 9. The user's Phase 1 instruction overrides the document's instruction to continue the roadmap.

## Scope

One local managed workspace, four independent string/nullable fields, TypeScript, Node.js 24, SQLite (better-sqlite3) and Vitest. No services or UI. `campaign: null` means unassigned in the fixture. `present=false,value=null` is missing; `present=true,value=null` is explicit null; an empty string is a third state. Status accepts draft, approved, unapproved or null. Scalar contracts leave room for additional resource types; the asset adapter currently rejects numbers and booleans.

## Ownership and history

An Action represents one human or agent forward operation. Each Effect records a single field's before/after state, revisions and previous_effect_id. Duplicate fields within an Action are rejected. Explicit same-value writes are recorded: a human writing the same value still takes ownership.

resource_fields.revision counts physical writes. Undo increments it and changes active_effect_id back to previous_effect_id. It does not reset revision to before_revision. last_mutation_id points to either a forward Effect or a compensation record; these two ID namespaces are intentionally a polymorphic reference. All IDs are UUIDs.

Undo is a separate undo_commit operation with one compensation record per restored Effect, not a new forward Effect. Immutable original Actions/Effects remain intact. SQL triggers prevent UPDATE/DELETE of history, plans and commits. Action undo status is derived in the receipt rather than written into original Action history.

The eligibility test requires ownership and matching present/value. A revision greater than the original after_revision is valid when a successor has been undone and ownership restored. Requiring equality to the original revision would incorrectly forbid subsequently undoing that predecessor. Commit instead checks the exact revision observed at preview.

## Preview and transaction

previewUndo stores an immutable plan with a 15-minute expiry and SHA-256 of the engine-created fixed-order JSON payload. Decisions use persisted state: already_undone first, then ownership protection, then consistency validation, otherwise eligible. blocked is reserved in the contract; there is no dependency implementation in this phase.

commitUndo(plan) defaults to all Eligible items. Its optional selection and operation key map to the future full-design commit interface. Only planId and planHash are read from the supplied plan; inverse values and decisions come from SQLite. Default operation key is planId.

BEGIN IMMEDIATE serializes writers. Check persisted hash and selection; return an existing receipt before stale checks for a valid retry. A reused key with a different plan/selection is rejected. A new key cannot execute the same plan twice. Check expiry, workspace revision and all target field snapshots/classifications. Any intervening managed write, even to an unrelated field, rejects the entire old plan. Conditional UPDATE also checks revision, active_effect_id, present and value. Insert receipt and compensations, apply inverse writes and increment workspace revision within that same transaction. Any error rolls back all changes. Empty selections create a receipt without incrementing physical state revisions.

## Persistence and limits

Versioned migration 001 initializes SQLite; unknown schema versions are rejected. WAL, foreign keys and a 5-second busy timeout are enabled. All engine entry points are scoped to the fixed local workspace. No multi-workspace or authentication guarantee is claimed; future workspace isolation requires composite foreign keys and scoped queries throughout.

The guarantee assumes all business writes use this engine. State reads are always from SQLite, and commit detects target-field tampering without a workspace bump, but direct SQL writers can bypass managed invariants. Database triggers are defensive history protection, not an authorization boundary.

Resource creation is fixture/bootstrap initialization rather than a reversible Action. No resource deletion, dependency graph, artifact invalidation, observation tracking, events/SSE, React, Fastify/HTTP, MCP, LLM, agent runtime, deployment, auth, external SaaS, multi-agent execution, or Phase 2 work is implemented.
