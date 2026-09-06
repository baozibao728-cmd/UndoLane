import type { IncomingMessage, ServerResponse } from 'node:http';
import * as z from 'zod/v4';
import { AgentError } from '../../packages/agent/provider.ts';
import { UndoLaneError } from '../../packages/contracts/index.ts';
import type { DemoService } from './service.ts';

async function body(request: IncomingMessage) {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new AgentError('JSON_REQUIRED');
  let text = '';
  for await (const chunk of request) { text += String(chunk); if (Buffer.byteLength(text) > 64_000) throw new AgentError('REQUEST_TOO_LARGE'); }
  try { return JSON.parse(text) as unknown; } catch { throw new AgentError('INVALID_JSON'); }
}
const id = z.string().min(1).max(200);
export async function handleApi(service: DemoService, req: IncomingMessage, res: ServerResponse) {
  const send = (status: number, value: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
  try {
    const origin = req.headers.origin;
    if (origin && origin !== `http://${req.headers.host}`) throw new AgentError('ORIGIN_REJECTED');
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (req.method === 'GET' && path === '/api/workspace') return send(200, service.workspace());
    if (req.method === 'GET' && path.startsWith('/api/actions/')) return send(200, service.action(decodeURIComponent(path.slice(13))));
    if (req.method === 'GET' && path.startsWith('/api/runs/')) return send(200, service.run(decodeURIComponent(path.slice(10))));
    if (req.method === 'POST' && path === '/api/runs') {
      const data = z.strictObject({ task: z.string().trim().min(1).max(4000), mode: z.enum(['fixture', 'live']) }).parse(await body(req));
      return send(202, service.startRun(data.task, data.mode));
    }
    if (req.method === 'POST' && path === '/api/human-edits') return send(200, service.humanPatch(await body(req)));
    if (req.method === 'POST' && path === '/api/undo/preview') {
      const data = z.strictObject({ action_id: id }).parse(await body(req)); return send(200, await service.preview(data.action_id));
    }
    if (req.method === 'POST' && path === '/api/undo/commit') {
      const data = z.strictObject({ undo_plan_id: id }).parse(await body(req)); return send(200, await service.commit(data.undo_plan_id));
    }
    send(404, { error: { code: 'NOT_FOUND' } });
  } catch (error) {
    const code = error instanceof AgentError || error instanceof UndoLaneError ? error.code : error instanceof z.ZodError ? 'INVALID_INPUT' : 'SERVER_ERROR';
    const status = code === 'NOT_FOUND' ? 404 : ['STALE_PLAN', 'REVISION_CONFLICT', 'RUN_IN_PROGRESS', 'IDEMPOTENCY_MISMATCH'].includes(code) ? 409 : code === 'SERVER_ERROR' ? 500 : 400;
    send(status, { error: { code } });
  }
}
