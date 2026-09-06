# Phase 3 — Minimal LLM Agent Runner

Implementation and mock-provider verification are complete. **No real model was called**, per the user's follow-up instruction. Configure the provider locally when ready. No API Key was added to source or committed files; `.env.example` contains empty credential/model placeholders and `.env` is ignored.

## Architecture

```text
Natural-language task (CLI argument or terminal input)
  → bounded Agent Runner
  ↔ OpenAI-compatible Chat Completions HTTP provider
  → allowlisted tool calls through official MCP Client
  → existing stdio MCP Server
  → unchanged Undo Engine
  → SQLite Action / Effect / revision / ownership

Independent Demo controller:
  Human terminal input → Engine Human Action
  MCP undo_preview → MCP undo_commit → compensation records
```

`packages/agent` never imports the engine or SQLite, executes SQL, or loads database contents. Its MCP connection only passes the configured database path to the existing Server process. The model sees only assets_list, asset_get and asset_patch. Although the Phase 2 Server still has undo tools, the Runner does not advertise or dispatch them. The independent human/demo script performs undo.

No Agent Framework, additional Agent, frontend, deployment, auth, schema migration, dependency graph or artifact invalidation was added. The existing core and MCP tool contracts are unchanged. The MCP Client dependency is now a runtime dependency.

## Model interface and configuration

One provider implementation uses Node.js fetch with:

- `POST <UNDOLANE_BASE_URL>/chat/completions`
- `Authorization: Bearer <UNDOLANE_API_KEY>`
- `model`, `messages`, `tools`, `tool_choice: auto`, `stream: false`, `max_tokens: 2048`
- assistant `tool_calls` and corresponding `role: tool` messages with `tool_call_id`.

See the primary [Chat Completions API reference](https://developers.openai.com/api/reference/resources/chat) and [function calling guide](https://developers.openai.com/api/docs/guides/function-calling). The adapter intentionally uses the common Chat Completions tool-calling format; it does not depend on a model vendor SDK or the OpenAI Agents SDK.

All three variables are required:

| Variable | Meaning |
|---|---|
| `UNDOLANE_API_KEY` | Your private API credential |
| `UNDOLANE_BASE_URL` | API root including any version/compatibility prefix, e.g. `https://api.openai.com/v1` |
| `UNDOLANE_MODEL` | A model ID available to your account that supports function/tool calls |

Do not put `/chat/completions` in the base URL; the adapter appends it. Switching the configured endpoint/model is the intended route for OpenAI, Gemini-compatible endpoints, Featherless or Qwen. Compatibility with each actual endpoint/model has **not** been live-tested. Provider-specific extensions and streaming are outside this phase.

Set variables in your local shell, or copy `.env.example` to `.env` and fill it privately. npm Agent/Demo commands use Node's `--env-file-if-exists=.env`; existing environment values take precedence. API credentials are sent only in the HTTP header, not included in model messages, reports or MCP tool arguments. Error handling returns stable codes instead of provider response bodies/headers. Requests time out after 60 seconds. No automatic retries are performed in this minimal phase.

## Run

Node.js 24, from the project root:

```sh
npm ci
npm run typecheck
npm test
```

After configuring the three variables, run a task against an existing workspace:

```sh
npm run agent -- --db ./workspace.sqlite --task "Prepare approved assets for Autumn Launch"
```

Omit `--task` to enter it at the terminal. For the existing Phase 2 fixture, add `--seed-demo`; those fixture resources start as **draft**, so a task requesting only approved assets should leave them unchanged. Use the Phase 3 Demo for an approved/unapproved example.

## Full Demo

```sh
npm run demo:agent
```

This creates a uniquely named, retained SQLite file containing synthetic asset_a/b/c. A and B are approved; C is unapproved. It sends the natural-language task:

> Prepare autumn campaign assets. Only assets with status exactly approved are eligible. Set their campaign to "Autumn Launch" and prefix each display_name with "Autumn ". Leave status, note and all unapproved assets unchanged.

The model chooses its tool calls; there is no hardcoded live action plan. The script then checks actual database values and four recorded Effects. If the model did not complete that task, the Demo fails instead of showing a synthetic success.

The script pauses for the Human to enter asset_b.display_name; pressing Enter chooses `Hero — Final`. That edit uses actor_kind=human through the engine. It then previews and commits each Agent Action through MCP. Because Phase 2 asset_patch targets one resource, several patches can create several Actions; each plan is created immediately before its commit to respect workspace-level stale checks.

For a repeatable Human input without a terminal prompt:

```sh
npm run demo:agent -- --human-value "Hero — Final"
```

Or specify a **new** database file:

```sh
npm run demo:agent -- --db ./my-phase3-demo.sqlite --human-value "Hero — Final"
```

Existing files are rejected to avoid resetting prior work. The flag supplies the Human controller's text; it is not an Agent write. The demo keeps its database for inspection.

The expected verified result is four Agent Effects, three restored fields, one Protected title, preserved original Action/Effect history and `Hero — Final` retained. The script asserts database state rather than relying on the model's final response. Runtime output uses live mode because it calls the configured HTTP endpoint; tests replace that endpoint with a local mock and must not be reported as real-model validation.

## Runner behavior and limits

- Discover tool schemas through MCP; advertise only the three resource tools. Convert their schemas to Chat Completions function definitions. asset_patch's operation_key is removed from the model-facing schema and supplied by the runtime.
- Require a successful assets_list and observed per-field revisions before patching. Read results are retained only for the current run; this is not the deferred dependency/observation system.
- Set an operation key from run ID + tool call ID. Execute calls sequentially, preserving existing engine revision checks and Action/Effect recording. A successful write is recorded from the MCP response.
- Reject unknown tools, duplicate call IDs and repeat writes to a field within one run. This keeps the minimal scenario bounded and avoids accidental repeated mutations. Complex same-field edit workflows are deferred.
- At most 6 model responses and 12 tool calls. Permit one argument/revision correction; report the tool error back to the model. A revision conflict requires a new read. No direct SQL, arbitrary shell or alternative storage tools exist.
- Do not replay uncertain MCP writes automatically. A failed report retains `pendingWrite` with the exact operation key/arguments for a deliberate recovery using the existing idempotent MCP tool. Already-successful Action receipts remain in the report.
- A run is not one database transaction: each asset_patch is atomic; earlier completed Actions remain if a later model/tool call fails. The report includes those actual Actions.
- `status=completed` means the model loop finished, not that arbitrary natural-language intent was proven correct. `modelSummary` is the model's text; `actions` are actual MCP receipts. The Demo provides its own deterministic database acceptance checks.
- Run reports are printed, not stored in a new runs table. SQLite persists the core history and undo plans/receipts as before. Full resumable runs are outside this phase.

## Verification results

Windows / Node.js 24.16.0:

- `npm run typecheck`: passed.
- `npm test`: **32/32 passed**, 3 files (13 Engine + 8 MCP + 11 Agent tests).
- Agent tests use a scripted local HTTP mock implementing Chat Completions, the real OpenAI-compatible adapter, real stdio MCP Server subprocesses and real SQLite.
- Full Demo CLI tested with the mock endpoint and explicit Human text: three restores, one Protected field, Human title preserved.
- Tests cover tool schemas/allowlist, Agent Action and Effect recording, Human protection reason, conditional undo, observed revisions, intervening Human writes, provider failure after partial progress, call budgets, malformed/truncated model responses, duplicate writes, and missing configuration.
- Phase 1 and Phase 2 tests remain unchanged and pass.

This is **mock-provider integration evidence**, not real-model evidence. The user will configure credentials and perform the real-model run locally. No real provider request, model quality benchmark, UI, deployment or next phase was executed.

## Files

- `packages/agent/provider.ts`: HTTP adapter, configuration and model response validation.
- `packages/agent/mcp.ts`: official MCP Client connection to the local Server.
- `packages/agent/runner.ts`: bounded tool-calling loop and execution report.
- `packages/agent/cli.ts`: natural-language task entry point.
- `scripts/agent-demo.ts`: fixture setup, Agent run, manual Human edit and verified undo.
- `tests/agent.test.ts`: mock HTTP + real MCP/SQLite integration tests.
- `.env.example`: blank configuration template.

Phase 3 ends here under the user's revised acceptance scope: runnable live-provider code and mock verification, with actual credentials and real-model execution deferred to the user.
