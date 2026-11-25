import { arena, ArenaUnavailable } from '$lib/server/arena';
import { buildStrategyCatalog } from '$lib/server/strategies';

type BriefSummary = { id: string; verdict: string; verdictTone: -1 | 0 | 1 | null; tldr: string };

export async function load() {
	try {
		const agents = await arena.agents();
		const catalog = buildStrategyCatalog(agents);
		const briefs: Record<string, BriefSummary> = {};
		for (const s of catalog.researched) {
			for (const slug of s.slugs) briefs[slug] = { id: s.id, verdict: s.verdict, verdictTone: s.verdictTone, tldr: s.tldr };
		}
		return { agents, briefs, researchedCount: catalog.researched.length, error: null };
	} catch (err) {
		return { agents: [], briefs: {} as Record<string, BriefSummary>, researchedCount: 0, error: err instanceof ArenaUnavailable ? err.message : String(err) };
	}
}
