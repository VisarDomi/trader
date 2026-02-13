import type { Agent, AgentBlueprint, AgentConfig, Dimension } from './types.ts';
import { Glob } from 'bun';
import { resolve, dirname } from 'path';

export interface LoadedAgent {
  id: string;
  path: string;
  agent: Agent<unknown>;
  config: AgentConfig;
}

/**
 * Scans the agents directory for blueprint.ts and standalone agent files.
 *
 * Blueprint files (export default AgentBlueprint):
 *   - Must have: name, version, instrument, dimensions[], createAgent()
 *   - Generates one LoadedAgent per dimension entry
 *   - Agent ID = "<directory>/<dimension.id>"
 *
 * Standalone agent files (export default Agent):
 *   - Must have: config, init, onCandle, onFill
 *   - ID derived from file path (legacy behavior)
 *
 * Factory files and other non-matching exports are silently skipped.
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
        const loaded = await this.loadFile(path);
        agents.push(...loaded);
      } catch (err) {
        console.error(`Failed to load ${path}:`, err);
      }
    }

    return agents;
  }

  async loadById(id: string): Promise<LoadedAgent | null> {
    const all = await this.loadAll();
    return all.find(a => a.id === id) ?? null;
  }

  private async loadFile(relativePath: string): Promise<LoadedAgent[]> {
    const fullPath = resolve(this.agentsDir, relativePath);
    const mod = await import(fullPath);
    const exported = mod.default;

    // Try as blueprint first
    if (this.isValidBlueprint(exported)) {
      return this.loadBlueprint(exported, relativePath, fullPath);
    }

    // Try as standalone agent
    if (this.isValidAgent(exported)) {
      const id = relativePath.replace(/\.ts$/, '');
      return [{
        id,
        path: fullPath,
        agent: exported,
        config: exported.config,
      }];
    }

    // Neither — skip silently (factory files, helpers, etc.)
    return [];
  }

  private loadBlueprint(
    blueprint: AgentBlueprint<unknown>,
    relativePath: string,
    fullPath: string,
  ): LoadedAgent[] {
    // Directory name becomes the blueprint prefix
    // e.g. "trend-follower/blueprint.ts" → prefix "trend-follower"
    const dir = dirname(relativePath);
    const prefix = dir === '.' ? relativePath.replace(/\.ts$/, '') : dir;

    return blueprint.dimensions.map((dim: Dimension) => {
      const agent = blueprint.createAgent(dim);
      const id = `${prefix}/${dim.id}`;
      return {
        id,
        path: fullPath,
        agent,
        config: agent.config,
      };
    });
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

  private isValidBlueprint(obj: unknown): obj is AgentBlueprint<unknown> {
    if (!obj || typeof obj !== 'object') return false;
    const b = obj as Record<string, unknown>;
    return (
      typeof b.name === 'string' &&
      typeof b.version === 'string' &&
      typeof b.instrument === 'string' &&
      Array.isArray(b.dimensions) &&
      b.dimensions.length > 0 &&
      typeof b.createAgent === 'function'
    );
  }
}
