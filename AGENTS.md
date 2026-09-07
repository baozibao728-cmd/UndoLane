# UndoLane

- 长期产品与技术设计参考：`docs/GIBC_V2_UndoLane_Project_Plan.md`。开始项目工作前完整阅读。
- Phase 1–4 已完成。当前仅实现 Phase 5 — Competition Polish；完成后停止，未经用户新指令不进入下一阶段。
- Phase 4 只增加 React/Vite 工作台和本地 HTTP 薄层，不重构 Engine、MCP 或 Agent Runner。Fixture 与 Live 必须明确标注，Agent 写入仍走 MCP。
- Agent Runner 只通过 MCP 读取/修改资源，不导入 Engine 或 SQLite。模型只获得 assets_list、asset_get、asset_patch；Demo 的 Human 编辑和撤销由独立的本地脚本执行。
- MCP 层不得访问 SQLite；所有读取、Agent Action 写入和条件撤销通过 Undo Engine。当前用户明确要求提供 undo_commit 工具，覆盖完整设计中暂不向 Agent 开放该工具的安排。
- Phase 1 决策与边界见 `docs/ADR-001-undo-core.md`，本地命令见 `README.md`。
