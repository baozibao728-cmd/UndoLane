import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { parseArgs } from 'node:util';
import { UndoEngine } from '../engine/index.ts';
import { createMcpServer } from './index.ts';

const { values } = parseArgs({ options: {
  db: { type: 'string', default: 'undolane.sqlite' },
  'seed-demo': { type: 'boolean', default: false },
} });
const engine = new UndoEngine(values.db);
// Explicit local fixture initialization only; tools never create bootstrap resources.
if (values['seed-demo'] && engine.listAssets().length === 0) {
  for (const [i, id] of ['asset_a', 'asset_b', 'asset_c'].entries()) {
    engine.createResource(id, { display_name: `Cake 0${i + 1}`, campaign: null, status: 'draft', note: '' });
  }
}
const handle = serveStdio(() => createMcpServer(engine), {
  onerror: error => console.error('MCP transport error:', error.message),
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  try { await handle.close(); } finally { engine.close(); }
}
process.stdin.once('end', () => { void stop(); });
process.once('SIGINT', () => { void stop(); });
process.once('SIGTERM', () => { void stop(); });
