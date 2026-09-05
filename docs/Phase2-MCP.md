# Phase 2 — UndoLane MCP Tool Layer

Completed scope: five local stdio tools; no UI, real LLM, deployment, login, dependency graph or Phase 3. The full design remains the long-term reference. The current user instruction explicitly permits `undo_commit` via MCP, superseding the full plan's earlier decision to keep it out of the Agent tool set. There is no approval UI or identity system in this phase.

## Architecture

```text
MCP Client (Agent or deterministic integration test)
  → stdio JSON-RPC (official MCP SDK 2.0.0)
  → strict input schema + five registered tool handlers
  → UndoEngine public APIs
  → SQLite transactions + Action / Effect / compensation history
```

The official SDK's [v2 guide](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/README.md) documents the split Server/Client packages and local stdio support. Installed versions are pinned in package-lock.json. The MCP layer has no SQLite imports or SQL statements. It never constructs or inserts Effects itself: `applyAction` owns the atomic write and recording sequence. Original Phase 1 mutation methods and schema are unchanged.

Engine additions are read-only `listAssets()`, `getAsset(resourceId)` and `getUndoPlan(planId)`. Asset reads use a transaction for consistent field snapshots. `getAsset` reports the latest physical modification **per field**, including compensation records; it does not confuse the current forward owner with the last physical writer.

The server fixes `actor_kind=agent` and `actor_id=mcp-agent`; clients cannot supply identity, SQL, before values, effect IDs or restoration values. This is local attribution, not authenticated identity. `asset_patch` requires the exact observed field revision and a stable operation key. A successful retry returns the original Action/Effects even if later edits have occurred.

`undo_commit` loads the saved plan and hash through the engine, checks the target is an Agent Action and calls unchanged `commitUndo`. It selects all Eligible fields and uses the plan ID as the idempotency key. It does not generate a new preview at commit time. Plans and receipts remain usable across Server restarts. Human Actions cannot be targeted through these MCP undo tools.

## Run locally

Node.js 24, from the project root:

```sh
npm ci
npm run typecheck
npm test
npm run --silent mcp -- --db ./undolane.sqlite --seed-demo
```

The final command runs a persistent stdio server waiting for MCP input. `--seed-demo` initializes only an empty workspace with asset_a/b/c, Cake 01/02/03, null campaigns, draft status and empty notes. It uses engine bootstrap APIs and does not run an Agent Action. Existing workspaces are not reset. Omit this flag to serve an existing database or start empty. Database parent directories must already exist.

For an MCP host, launch Node directly so npm output cannot contaminate protocol stdout:

```json
{
  "mcpServers": {
    "undolane": {
      "command": "node",
      "args": [
        "D:/zhuomian/devpost/packages/mcp-server/stdio.ts",
        "--db", "D:/zhuomian/devpost/undolane.sqlite",
        "--seed-demo"
      ]
    }
  }
}
```

Use absolute paths for your own checkout and database. Server stdout contains only MCP protocol messages; diagnostics use stderr. No port is opened. Node 24 executes the TypeScript source directly; the existing `typecheck` plus real stdio execution is the validation path, without a separate build output tree.

## Tool contracts

Each successful result has identical JSON in `structuredContent` and `content[0].text`. Tools advertise input/output schemas through `tools/list`. Unknown input properties are rejected. Domain failures use `isError: true` with `{ "error": { "code": "STALE_PLAN", "message": "..." } }`; malformed arguments may be reported by the SDK as protocol validation errors or tool errors.

`revision` is always a **field map**, not a new resource revision:

```json
{ "display_name": 0, "campaign": 0, "status": 0, "note": 0 }
```

`present` is a boolean field map and distinguishes absent, null and empty string. `active_effect_id` and `last_mutation_id` are nullable ID field maps.

| Tool | Input | Structured output |
|---|---|---|
| `assets_list` | `{}` | `{resources:[{resource_id,display_name,campaign,status,revision,present}]}` |
| `asset_get` | `{resource_id}` | `{resource_id,display_name,campaign,status,note,revision,present,active_effect_id,last_mutation_id,recent_modifications}` |
| `asset_patch` | `{resource_id,operation_key,writes:[{field,value,expected_revision,present?}]}` | `{action_id,actor_kind:"agent",actor_id:"mcp-agent",effects:[Effect]}` |
| `undo_preview` | `{action_id}` | `{undo_plan_id,action_id,plan_hash,base_workspace_revision,expires_at,eligible,protected,blocked,already_undone,unsupported,items:[Decision]}` |
| `undo_commit` | `{undo_plan_id}` | `{undo_commit_id,undo_plan_id,action_id,restored:[effect_id],preserved:[effect_id],workspace_revision,status}` |

- `writes`: 1–4 distinct fields of the given resource. Values are string/null; status accepts draft/approved/unapproved/null. `present` defaults to true; false requires null. `expected_revision` must be a nonnegative safe integer. A conflict rolls back the whole Action.
- `Effect`: `{effect_id,action_id,resource_id,field,before_present,before_value,before_revision,after_present,after_value,after_revision,previous_effect_id}`. The new Effect owns the field on its successful write; current ownership is read via `asset_get`.
- `recent_modifications`: field map. Each entry is null for bootstrap state, `{kind:"effect",mutation_id,action_id,actor_kind,actor_id,effect}`, or `{kind:"compensation",mutation_id,undo_commit_id,effect_id,before_revision,after_revision}`.
- `Decision`: `{effect_id,resource_id,field,decision,can_undo,reason,current_value,current_present,revision,active_effect_id,restore_value,restore_present,previous_effect_id}`. Here `revision` is that item's field revision.
- Protected Human reason is exactly `A newer human edit owns this field`.
- `expires_at` is Unix milliseconds. `blocked` stays 0 because dependency analysis is deferred, not because dependencies have been verified absent.
- `status`: undone / partially_undone / unchanged. `restored` and `preserved` refer to Effect IDs. Workspace revision is separate from per-field revisions.
- `undo_preview` persists a new plan on each call; its annotations therefore describe a non-idempotent, non-destructive write. Listing/getting are read-only. Patch/commit are idempotent only for their documented key/plan semantics.

## Agent call sequence

These are the `params` of successive MCP `tools/call` requests. Read the returned field revision instead of hardcoding it for a previously edited database.

```json
{ "name": "assets_list", "arguments": {} }
```

```json
{ "name": "asset_get", "arguments": { "resource_id": "asset_a" } }
```

For a freshly seeded campaign at revision 0:

```json
{
  "name": "asset_patch",
  "arguments": {
    "resource_id": "asset_a",
    "operation_key": "autumn-campaign-001",
    "writes": [{ "field": "campaign", "value": "Autumn Launch", "expected_revision": 0 }]
  }
}
```

Use the actual returned `action_id`:

```json
{ "name": "undo_preview", "arguments": { "action_id": "<returned action_id>" } }
```

Review decisions, then use its actual `undo_plan_id`:

```json
{ "name": "undo_commit", "arguments": { "undo_plan_id": "<returned undo_plan_id>" } }
```

The campaign returns to null at revision 2. If a Human edit took ownership before preview, it is Protected and preserved. If any managed write occurred after preview, commit returns STALE_PLAN and the caller must review a new preview. A repeated commit of the same plan returns the original receipt, without another write.

## Verification

On Windows / Node 24.16.0: `npm run typecheck` passed; `npm test` passed **21/21 tests**, 2 files (13 unchanged Phase 1 tests + 8 MCP integration tests). Vitest and stdio Server subprocesses ran with permitted local process execution because the Codex sandbox restricts process spawning.

The MCP tests use the official Client against actual child-process stdio servers and temporary on-disk SQLite databases. Database inspection is read-only; Human changes use the engine. Coverage includes exactly five advertised tools and schemas, Agent Action/Effect creation, exact Human protection reason, partial undo and compensation history, durable retries across process restarts, stale-plan zero writes, invalid inputs/revision conflicts/identity spoofing, unknown IDs and rejection of Human Action undo.

Phase 2 ends here. No real model evaluation, frontend, deployment, authentication, dependency graph, artifact invalidation or additional tools were introduced.
