import type { Agent, AgentBlueprint, AgentConfig, Dimension } from './types.ts';
import { Glob } from 'bun';
import { resolve, dirname } from 'path';

export interface LoadedAgent {
  id: string;
  path: string;
  agent: Agent<unknown>;
  config: AgentConfig;
}

export interface BlueprintMeta {
  name: string;
  version: string;
  instrument: string;
  directory: string;
  agentCount: number;
  /** Unique values per dimension key (e.g. { timeframe: ['1m','5m'], trendPct: [0.0025, 0.005] }) */
  dimensionKeys: Record<string, unknown[]>;
  /** Full dimension list — each entry is one agent's dimension values */
  dimensions: Dimension[];
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

  async loadBlueprints(): Promise<BlueprintMeta[]> {
    const blueprints: BlueprintMeta[] = [];
    const glob = new Glob('**/*.ts');

    for await (const path of glob.scan({ cwd: this.agentsDir, absolute: false })) {
      try {
        const fullPath = resolve(this.agentsDir, path);
        const mod = await import(fullPath);
        const exported = mod.default;

        if (this.isValidBlueprint(exported)) {
          const dir = dirname(path);
          const directory = dir === '.' ? path.replace(/\.ts$/, '') : dir;

          // Extract unique values per dimension key (excluding 'id')
          const dimensionKeys: Record<string, unknown[]> = {};
          for (const dim of exported.dimensions) {
            for (const [key, value] of Object.entries(dim)) {
              if (key === 'id') continue;
              if (!dimensionKeys[key]) dimensionKeys[key] = [];
              if (!dimensionKeys[key].includes(value)) {
                dimensionKeys[key].push(value);
              }
            }
          }

          // Sort numeric values, leave strings in insertion order
          for (const key of Object.keys(dimensionKeys)) {
            const vals = dimensionKeys[key];
            if (vals.every(v => typeof v === 'number')) {
              vals.sort((a, b) => (a as number) - (b as number));
            }
          }

          blueprints.push({
            name: exported.name,
            version: exported.version,
            instrument: exported.instrument,
            directory,
            agentCount: exported.dimensions.length,
            dimensionKeys,
            dimensions: exported.dimensions,
          });
        }
      } catch (err) {
        console.error(`Failed to load blueprint from ${path}:`, err);
      }
    }

    return blueprints;
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
