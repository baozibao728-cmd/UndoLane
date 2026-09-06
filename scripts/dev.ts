import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { createServer as createViteServer } from 'vite';
import { createDemoService } from '../apps/server/service.ts';
import { handleApi } from '../apps/server/api.ts';

const port = Number(process.env.PORT ?? 5173);
const server = createServer((req, res) => {
  if (req.url?.startsWith('/api/')) void handleApi(service, req, res);
  else vite.middlewares(req, res);
});
const service = await createDemoService(resolve(process.env.UNDOLANE_WEB_DATA ?? '.undolane-web'));
const vite = await createViteServer({ configFile: resolve('vite.config.ts'), server: { middlewareMode: true, ws: { server } }, appType: 'spa' });
server.listen(port, '127.0.0.1', () => console.log(`UndoLane → http://127.0.0.1:${port}`));
let closing = false;
async function close() { if (closing) return; closing = true; server.close(); await vite.close(); await service.close(); }
process.once('SIGINT', () => { void close(); });
process.once('SIGTERM', () => { void close(); });
server.on('error', error => { console.error(error.message); void close(); process.exitCode = 1; });
