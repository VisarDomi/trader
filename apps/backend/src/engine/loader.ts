/**
 * Discovers agents in the agents/ directory.
 *
 *   agents/rsi-reversion.ts            -> agent "rsi-reversion"
 *   agents/breakout/index.ts           -> agent "breakout" (may import siblings)
 *   agents/x.ts with variants {a, b}   -> agents "x/a" and "x/b"
 *
 * Files and directories starting with "_" are ignored (templates, helpers),
 * as are *.test.ts files.
 *
 * Each agent gets a code hash over its source files. When the code changes the
 * hash changes, and the arena starts a fresh demo track for the new version.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import type { DefinedAgent } from '../sdk/index.ts';
import { isDefinedAgent } from '../sdk/index.ts';

export interface LoadedAgent {
  /** "slug" or "slug/variant". */
  id: string;
  slug: string;
  variant: string | null;
  file: string;
  def: DefinedAgent;
  params: Record<string, unknown>;
  codeHash: string;
  source: string;
}

export interface LoadError {
  file: string;
  error: string;
}

const IGNORED_PREFIX = '_';
const TEST_SUFFIX = '.test.ts';
const TS_SUFFIX = '.ts';
const INDEX_FILE = 'index.ts';
const HASH_LENGTH = 12;

export const DEFAULT_AGENTS_DIR = resolve(import.meta.dir, '..', '..', 'agents');

interface AgentEntry {
  slug: string;
  entry: string;
  sources: string[];
}

function discover(dir: string): AgentEntry[] {
  const entries: AgentEntry[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith(IGNORED_PREFIX) || name.startsWith('.')) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      const entry = join(full, INDEX_FILE);
      try {
        statSync(entry);
      } catch {
        continue;
      }
      const sources = readdirSync(full)
        .filter(f => f.endsWith(TS_SUFFIX) && !f.endsWith(TEST_SUFFIX))
        .sort()
        .map(f => join(full, f));
      entries.push({ slug: name, entry, sources });
    } else if (name.endsWith(TS_SUFFIX) && !name.endsWith(TEST_SUFFIX)) {
      entries.push({ slug: basename(name, TS_SUFFIX), entry: full, sources: [full] });
    }
  }
  return entries;
}

function hashSources(files: string[]): { hash: string; source: string } {
  const h = createHash('sha256');
  const parts: string[] = [];
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    h.update(basename(f)).update('\0').update(text).update('\0');
    parts.push(files.length > 1 ? `// ===== ${basename(f)} =====\n${text}` : text);
  }
  return { hash: h.digest('hex').slice(0, HASH_LENGTH), source: parts.join('\n') };
}

export async function loadAgents(dir: string = DEFAULT_AGENTS_DIR): Promise<{ agents: LoadedAgent[]; errors: LoadError[] }> {
  const agents: LoadedAgent[] = [];
  const errors: LoadError[] = [];
  for (const { slug, entry, sources } of discover(dir)) {
    try {
      const mod = await import(entry);
      const def = mod.default;
      if (!isDefinedAgent(def)) {
        errors.push({ file: entry, error: 'default export is not defineAgent({...})' });
        continue;
      }
      const { hash, source } = hashSources(sources);
      const variants = def.variants && Object.keys(def.variants).length > 0 ? Object.entries(def.variants) : null;
      if (!variants) {
        agents.push({ id: slug, slug, variant: null, file: entry, def, params: { ...def.params }, codeHash: hash, source });
      } else {
        for (const [variant, overrides] of variants) {
          agents.push({
            id: `${slug}/${variant}`,
            slug,
            variant,
            file: entry,
            def,
            params: { ...def.params, ...overrides },
            codeHash: hash,
            source,
          });
        }
      }
    } catch (err) {
      errors.push({ file: entry, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { agents, errors };
}
