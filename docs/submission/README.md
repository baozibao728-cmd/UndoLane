# Devpost screenshots

These are real Chrome captures of the running product, with no composited values or simulated UI. Submit the following four PNGs in order:

1. [Workspace overview](01-workspace-overview.png) — **Let agents handle the batch. Keep the final say.** Three assets, editable fields, and recorded Action history live in one workspace.
2. [Agent execution timeline](02-agent-timeline.png) — **Every tool call leaves evidence.** A disclosed no-key recipe uses real MCP calls and creates two Actions / four Effects. Create effects is the persisted result of patch transactions, not another model tool.
3. [Undo Review](03-undo-review.png) — **Undo the campaign. Keep the human title.** The selected Action has one eligible field and one Protected edit; the explanation and retained value are visible.
4. [Undo completed](04-undo-completed.png) — **Agent mistake removed. Human work preserved.** The selected Action is partially undone, with one restored field and one preserved edit. The original history remains.

Use screenshot 3 as the cover if Devpost offers a choice. The counts are per Action, not the whole Run. Additional pipeline artwork: [architecture PNG](../architecture.png), [SVG source](../architecture.svg).

Regeneration: `npm run test:web` writes browser captures to `docs/screenshots`. The submission files are copies of `01-workspace`, `02-agent-run`, `04-undo-review`, and `05-undo-completed` respectively. No extra browser styling is injected for the captures.
