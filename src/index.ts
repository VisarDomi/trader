import { RunManager } from './run/RunManager.ts';
import { createServer } from './api/server.ts';
import { resolve } from 'path';

const PORT = Number(process.env.PORT ?? 3001);
const AGENTS_DIR = resolve(import.meta.dir, '..', 'agents');

const runManager = new RunManager(AGENTS_DIR);
const server = createServer(runManager, PORT);

console.log(`trader-backend listening on http://localhost:${server.port}`);
console.log(`  Agents directory: ${AGENTS_DIR}`);

// List available agents on startup
runManager.listAgents().then(agents => {
  if (agents.length === 0) {
    console.log('  No agents found. Add .ts files to agents/ directory.');
  } else {
    console.log(`  Found ${agents.length} agent(s):`);
    for (const a of agents) {
      console.log(`    - ${a.id}: ${a.config.name} v${a.config.version} (${a.config.instrument} ${a.config.primaryFeed})`);
    }
  }
}).catch(err => {
  console.error('  Failed to scan agents:', err);
});
