import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { connectUndoLane } from './mcp.ts';
import { OpenAICompatibleProvider, providerConfig, AgentError } from './provider.ts';
import { runAgent } from './runner.ts';

try {
  const { values } = parseArgs({ options: { task: { type: 'string' }, db: { type: 'string', default: 'undolane.sqlite' },
    'seed-demo': { type: 'boolean', default: false } } });
  const provider = new OpenAICompatibleProvider(providerConfig());
  let task = values.task;
  if (!task) {
    const terminal = createInterface({ input: stdin, output: stdout });
    try { task = await terminal.question('Task: '); } finally { terminal.close(); }
  }
  const client = await connectUndoLane(values.db, values['seed-demo']);
  try {
    console.error('LIVE MODEL mode: requests go to the configured provider.');
    const report = await runAgent(client, provider, task, event => console.error(JSON.stringify(event)));
    console.log(JSON.stringify(report, null, 2));
    if (report.status !== 'completed') process.exitCode = 1;
  } finally { await client.close(); }
} catch (error) {
  console.error(error instanceof AgentError ? error.code : 'AGENT_START_FAILED');
  process.exitCode = 1;
}
