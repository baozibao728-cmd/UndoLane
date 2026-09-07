# Competition readiness — 2026-09-07

## Verdict

The local prototype and presentation assets are ready for a submission recording. **The Devpost submission itself is not complete.** A public source repository, a published demo video, and completed team/project fields still need delivery. No deployment or publication was performed in this phase.

The official [GIBC V2 rules](https://gibc-v2.devpost.com/rules), checked on 2026-09-07, require six submission components: project description, public source and setup documentation, a 2–5 minute accessible video, Built With, team details, and at least three screenshots. Materials must be in English; a video may use English subtitles. AI coding assistance must be disclosed. Track 03 evaluates Creativity, Execution, Impact, and Presentation. Eligibility and development-period compliance must be confirmed by the entrant.

## Changes in Phase 5

Modified:

- `apps/web/src/App.tsx`: Action-scoped Change summary, plain-language Human protection explanation, recorded workflow stages and tool labels.
- `apps/web/src/styles.css`: summary and timeline presentation, responsive sizing.
- `tests/web.spec.ts`: summary assertions and final state after separately undoing both Run Actions.
- `README.md`: English competition draft covering the problem, approach, architecture, innovation, demo, stack, limitations, and AI assistance.
- `AGENTS.md`: Phase 5 scope.
- `docs/screenshots/*.png`: refreshed seven browser captures.

Added:

- `.npmrc`: reproducible installation using the locked packages' prebuilt binaries.
- `docs/architecture.svg`, `docs/architecture.png`.
- `docs/Competition-Demo.md`: state table, 2:30 narration plan and Devpost description draft.
- `docs/Competition-Readiness.md`: this report.
- `docs/submission/README.md` and four submission PNGs.

No changes to Engine, MCP Server, Agent Runner, contracts, backend service, schema, or model support. The three main core-file SHA-256 hashes match the Phase 4 values:

| File | SHA-256 |
| --- | --- |
| engine/index.ts | `42C1D66AA7886B8B56D47FEC9CD683DC4CD5873F68671CA236CB52D2942D3AE3` |
| mcp-server/index.ts | `5AEF48BB06CC669994D12E477A269B14BCF2F4C3FC01CB1690B47261074C637C` |
| agent/runner.ts | `F8A7C4CE60B080826E21E684C5AFCD49205EA3FC940703638113A81AFE935ABB` |

## Verification

Environment: Windows x64, Node.js 24.16.0, npm 11.13.0, installed Google Chrome.

- Clean directory populated with source/configuration only, no copied node_modules: standard `npm ci` succeeds with the project `.npmrc`; 70 packages installed. The install audit reported zero known vulnerabilities at this time.
- Initial default installation attempted a native rebuild and failed without Visual Studio. The dependency already ships platform binaries; `.npmrc` disables lifecycle scripts. This configuration was verified on Windows x64, not independently on every OS/CPU. Recheck when updating native dependencies.
- `npm run typecheck`, `npm run build`, `npm test`: pass on the clean installation; 33 tests in four files.
- `npm run test:web`: 1 complete Chrome scenario passes on the clean installation, using real local HTTP, stdio MCP, and SQLite. It checks Human protection, stale preview rejection, commit retry, final state, reload, and mobile layout. It also undoes the remaining Action separately.
- `npm run dev` starts successfully; both the homepage and `/api/workspace` return HTTP 200 on port 5173.
- Demo replays use an isolated fresh workspace. The README explains how to select a new directory for each recording; there is no destructive reset button.
- Key-pattern scan of project text found no credential-shaped secrets. Provider code reads the key only from environment configuration. Only `.env.example` exists locally, with empty key/model values. `.gitignore` excludes `.env`, local databases, workspace history, and build/test output.
- No `.git` repository exists in the current project. Therefore prior commit history and a remote public repository could not be audited; ignore rules alone do not prove that a future publication excludes secrets.

## Submission assets

Four real interface PNGs and their captions are in [submission](submission/README.md). The Undo Review screenshot shows **one Action / two fields / one eligible / one protected**. It does not claim a four-field atomic undo. The architecture PNG is an additional fifth visual.

The README, video script, screenshot captions, and Devpost description draft are English. Older Chinese planning documents remain historical design references and contain unimplemented future scope; they should not be pasted as the competition product description.

## Remaining delivery and limits

1. Create and publish an accessible source repository, including `.npmrc` and the lockfile; check its actual published contents and access. No repository URL is invented here.
2. Record and publish the 2–5 minute video using the prepared script. Keep Fixture labeling visible. No final video has been created or uploaded.
3. Complete Devpost Built With, actual team identities, eligibility confirmation, and submission fields. Include Codex/ChatGPT assistance.
4. Live model configuration remains optional and unverified in this phase, as requested. Fixture results must not be represented as live inference.
5. Impact is demonstrated through a small deterministic recovery example. There is no user study, high-volume benchmark, cloud service, external SaaS guarantee, dependency graph, or artifact invalidation in the current submission.

These limits do not call for expanding the product in Phase 5. Finish the external delivery steps, review the materials, and stop feature development.
