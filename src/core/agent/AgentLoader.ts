import type { Agent, AgentConfig } from './types.ts';
import { Glob } from 'bun';
import { resolve } from 'path';

export interface LoadedAgent {
  id: string;
  path: string;
  agent: Agent<unknown>;
  config: AgentConfig;
}

/**
 * Scans the agents directory for .ts files and loads them.
 *
 * Each agent file must default-export an object satisfying the Agent interface:
 *   export default { config, init, onCandle, onFill } satisfies Agent<S>;
 *
 * The agent ID is derived from the filename (without extension).
 * Files in .example/ are included for reference.
 */
export class AgentLoader {
  private readonly agentsDir: string;

  constructor(agentsDir: string) {
    this.agentsDir = resolve(agentsDir);
  }

  async loadAll(): Promise<LoadedAgent[]> {
    const agents: LoadedAgent[] = [];
    const glob = new Glob('**/*.ts');

    for await (const path of glob.scan({ cwd: this.agentsDir, absolute: false })) {
      try {
        const loaded = await this.loadAgent(path);
        if (loaded) agents.push(loaded);
      } catch (err) {
        console.error(`Failed to load agent ${path}:`, err);
      }
    }

    return agents;
  }

  async loadById(id: string): Promise<LoadedAgent | null> {
    const all = await this.loadAll();
    return all.find(a => a.id === id) ?? null;
  }

  private async loadAgent(relativePath: string): Promise<LoadedAgent | null> {
    const fullPath = resolve(this.agentsDir, relativePath);
    const mod = await import(fullPath);
    const agent = mod.default as Agent<unknown>;

    if (!this.isValidAgent(agent)) {
      console.warn(`Skipping ${relativePath}: does not satisfy Agent interface`);
      return null;
    }

    // Derive ID from path: "my-strategy.ts" → "my-strategy", "example/ema-crossover.ts" → "example/ema-crossover"
    const id = relativePath.replace(/\.ts$/, '');

    return {
      id,
      path: fullPath,
      agent,
      config: agent.config,
    };
  }

  private isValidAgent(obj: unknown): obj is Agent<unknown> {
    if (!obj || typeof obj !== 'object') return false;
    const a = obj as Record<string, unknown>;
    return (
      typeof a.config === 'object' &&
      a.config !== null &&
      typeof a.init === 'function' &&
      typeof a.onCandle === 'function' &&
      typeof a.onFill === 'function'
    );
  }
}
