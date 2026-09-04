import type * as z from 'zod/v4';
import type { Action, AssetSnapshot, Effect } from '../../packages/contracts/index.ts';
import type { AgentReport, ToolEvent } from '../../packages/agent/runner.ts';
import type { outputs } from '../../packages/mcp-server/schemas.ts';

export const demoTask = 'Prepare approved assets for Autumn Launch';
export type Mode = 'fixture' | 'live';
export type Plan = z.infer<typeof outputs.undo_preview>;
export type Receipt = z.infer<typeof outputs.undo_commit>;
export interface WebRun {
  id: string; task: string; mode: Mode; startedAt: string;
  status: 'running' | 'completed' | 'failed' | 'interrupted';
  events: Array<ToolEvent & { at: string }>; actionIds: string[];
  report?: AgentReport; errorCode?: string;
}
export interface ActionSummary { action: Action; effects: Effect[]; runId: string; mode: Mode; createdAt: string; receipt?: Receipt }
export interface Workspace {
  assets: AssetSnapshot[]; revision: number; runs: WebRun[];
  actions: ActionSummary[]; liveAvailable: boolean;
}
export interface ActionView { action: Action; effects: Effect[]; receipt?: Receipt }
