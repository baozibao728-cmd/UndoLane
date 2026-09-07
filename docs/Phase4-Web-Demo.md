# Phase 4 — Product Demo Layer

本阶段增加本地 React + Vite 产品 Demo，保留现有 Engine、MCP Server 和 Agent Runner。未进入下一阶段。

## 运行

需要 Node.js 24。项目根目录执行：

```sh
npm ci
npm run dev
```

打开 http://127.0.0.1:5173 。默认 Demo recipe 无需 Key：固定任务、mock provider，但调用真实 Agent Runner、stdio MCP 和 SQLite。页面明确标注它没有模型推理。

Live model 使用已有 `UNDOLANE_API_KEY`、`UNDOLANE_BASE_URL`、`UNDOLANE_MODEL` 环境变量，也可使用被 git 忽略的 `.env`；配置后重启服务。密钥仅在服务端读取。本阶段没有调用真实模型。

默认数据保存在 `.undolane-web/workspace.sqlite`；`web-history.json` 只保存运行进度、Action ID 和展示结果，SQLite 是业务状态最终依据。重启保留历史，未完成的运行标记为 interrupted，不自动重新执行。需要新的演示工作区时，在 PowerShell 设置 `$env:UNDOLANE_WEB_DATA='.undolane-web/take-02'` 后启动。端口可通过 `PORT` 修改。

## 架构与页面

React → 本地 Node HTTP 薄层 → 既有 Agent Runner → stdio MCP → Undo Engine → SQLite。

Human 编辑通过 Engine 创建 Human Action；Preview 和 Commit 经 MCP 调用原有逻辑。没有直接 SQL 写入、核心 schema 修改或新的撤销算法。进度使用短轮询，不引入 SSE。每次 asset_patch 仍产生一个 Action，Undo 按 Action 执行，不将整个 Run 合并为一次事务。

| 页面 | 路由 | 内容 |
| --- | --- | --- |
| Workspace Dashboard | `#/workspace` | 资源、筛选、状态、最近 Action、Human 编辑 |
| Agent Run | `#/runs/new`、`#/runs/:id` | 输入任务、Demo/Live 模式、真实工具完成事件、执行结果 |
| Action Detail | `#/actions/:id` | before/after、Eligible/Protected、revision 与 effect ownership |
| Undo Review | `#/undo/:actionId` | Preview、分类统计、Protected 当前值、Commit 和持久化结果 |

旧计划提交返回错误，必须重新 Preview；不会自动换计划后提交。重复 Commit 返回原有 receipt。Protected 原因保持 `A newer human edit owns this field`。

## 新增文件

- `apps/shared/types.ts`
- `apps/server/api.ts`、`service.ts`、`fixture-provider.ts`
- `apps/web/index.html`
- `apps/web/src/main.tsx`、`App.tsx`、`styles.css`、`visuals.tsx`、`vite-env.d.ts`
- `scripts/dev.ts`
- `vite.config.ts`、`vitest.config.ts`、`playwright.config.ts`
- `tests/web-service.test.ts`、`tests/web.spec.ts`
- 本文与 `docs/screenshots/01-workspace.png` 至 `07-mobile.png`（如下链接）。

修改现有 `package.json`、`package-lock.json`、`tsconfig.json`、`.gitignore`、`AGENTS.md`、`README.md`，用于依赖、启动、检查和说明。未修改 `packages/engine`、`packages/mcp-server`、`packages/agent`。

## 截图与视频

实际浏览器截图：

1. [Workspace](screenshots/01-workspace.png)
2. [Agent Run](screenshots/02-agent-run.png)
3. [Action Detail](screenshots/03-action-detail.png)
4. [Undo Review](screenshots/04-undo-review.png)
5. [Undo completed](screenshots/05-undo-completed.png)
6. [Stale Preview 拒绝](screenshots/06-stale-plan.png)
7. [Mobile](screenshots/07-mobile.png)

推荐以 Undo Review 作为主截图：同时显示 before/after、1 Eligible、1 Protected 和被保留的 `Hero — Final`。

建议录制约两分钟视频：

1. 展示三个 Asset，两个 approved、一个 unapproved。
2. 执行 `Prepare approved assets for Autumn Launch`，展示 assets_list → asset_get → asset_patch。默认 recipe 创建两个 Agent Action、四个 Effect；保留 Demo 模式标识。
3. 回工作台，将 asset_b 标题人工改为 `Hero — Final`。
4. 打开 asset_b 的 Action，展示 campaign Eligible、display_name Protected 及精确保护原因。
5. Preview → Commit，展示 “Undo completed / Protected changes preserved.”。
6. 回工作台证明 asset_b campaign 恢复 null、revision 为 2，而 Human 标题保留。asset_a 的 Action 可另行撤销。

## 验证与边界

```sh
npm run typecheck
npm run build
npm test
npm run test:web
```

33 项 Vitest 测试通过，包含持久化服务集成测试；1 项 Chrome 完整浏览器场景通过，覆盖工具步骤、Human 保护、Stale Preview、Commit、幂等重试、刷新持久化、空 status 保留和移动布局。浏览器测试使用本机 Google Chrome，数据隔离在 `test-results`，不调用真实模型。

这是一套本地 Web Demo。未增加部署、登录、大型 Agent Framework、多 Agent、Dependency Graph、Artifact invalidation、外部 SaaS、导出或比赛提交功能。模型适配器沿用 Phase 3，真实模型效果仍需用户本地配置后验证。
