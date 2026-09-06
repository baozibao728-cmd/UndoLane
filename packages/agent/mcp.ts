import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { fileURLToPath } from 'node:url';

export async function connectUndoLane(dbPath: string, seedDemo = false): Promise<Client> {
  const client = new Client({ name: 'undolane-agent-runner', version: '0.3.0' });
  try {
    await client.connect(new StdioClientTransport({ command: process.execPath,
      args: [fileURLToPath(new URL('../mcp-server/stdio.ts', import.meta.url)), '--db', dbPath,
        ...(seedDemo ? ['--seed-demo'] : [])],
    }));
    return client;
  } catch (error) { await client.close(); throw error; }
}
