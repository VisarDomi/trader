/** Fetches what each native screen needs from the arena and the inspector, then builds it (screens.ts). */
import type { LeaderboardRow, RunDetail } from '@trader/shared';
import { arena } from '../arena';
import { inspection } from '../inspection';
import { doc, sources, topics } from '../research';
import { PLATFORM_HISTORY } from '$lib/platform-history';
import {
	accountScreen, accountsScreen, agentScreen, agentsScreen, archiveScreen, documentScreen, graveyardScreen, rankingsScreen, runScreen,
	scenariosScreen, sourceScreen, statusScreen, tradeScreen, verdicts, type Sparks,
} from './screens';
import type { Screen } from './wire';

/** Shared reads that several screens use, kept briefly so a burst of screens costs one arena read each. */
function kept<T>(ms: number, read: () => Promise<T>) {
	let at = 0, value: Promise<T> | null = null;
	return () => {
		if (!value || Date.now() - at > ms) { at = Date.now(); value = read(); value.catch(() => { value = null; }); }
		return value;
	};
}
const capitalBoard = kept(30_000, () => arena.leaderboard('demo', true, 'demo', 'standard'));
const broker = kept(15_000, () => arena.broker());
const agentList = kept(60_000, () => arena.agents());
const graveyard = kept(300_000, () => arena.graveyard());
const sparks = (id: string): Promise<Sparks | null> => inspection.sparks(id).catch(() => null);

export const SCREENS = ['rankings', 'agents', 'agent', 'run', 'trade', 'accounts', 'account', 'status', 'scenarios', 'graveyard', 'archive', 'journal', 'research', 'document', 'source'] as const;
export type ScreenName = typeof SCREENS[number];

export async function loadScreen(screen: ScreenName, q: URLSearchParams, journal: string): Promise<Screen> {
	const id = q.get('id') ?? '';
	switch (screen) {
		case 'rankings': {
			const stage = q.get('stage') ?? 'capital', scenario = q.get('scenario');
			const rows = await arena.leaderboard(stage === 'backtest' ? 'backtest' : 'demo', false, stage === 'capital' ? 'demo' : '', stage === 'virtual' ? scenario ?? 'standard' : 'standard');
			return rankingsScreen(verdicts(rows, stage), stage, scenario);
		}
		case 'agents': return agentsScreen(await agentList());
		case 'agent': {
			const agent = await arena.agent(id);
			const liveRuns = agent.runs.filter(r => r.kind === 'demo' && r.status !== 'retired' && !r.id.includes(':delay='));
			const [runs, board, lines] = await Promise.all([Promise.all(liveRuns.map(r => arena.run(r.id, 2000))), capitalBoard().catch((): LeaderboardRow[] => []), Promise.all(liveRuns.map(r => sparks(r.id)))]);
			return agentScreen({ agent, runs, capital: new Map(board.map(r => [r.runId, r])), sparks: new Map(liveRuns.flatMap((r, i) => (lines[i] ? [[r.id, lines[i]!] as const] : []))) });
		}
		case 'run': {
			const run: RunDetail = await arena.run(id, 2000);
			const [agent, board, b, line] = await Promise.all([arena.agent(run.agentId).catch(() => null), run.kind === 'backtest' ? Promise.resolve([]) : capitalBoard().catch((): LeaderboardRow[] => []), broker().catch(() => null), sparks(run.id)]);
			const comparison = run.kind === 'backtest' ? null : agent?.runs.filter(x => x.kind === 'backtest' && x.status !== 'retired' && x.epic === run.epic && x.leverage === run.leverage && x.codeHash === run.codeHash).sort((a, c) => c.updatedAt - a.updatedAt)[0] ?? null;
			const account = b?.status?.accounts.find(a => a.runs.includes(run.id))?.name ?? null;
			return runScreen({ run, agentName: agent?.name ?? run.agentId, capital: board.find(r => r.runId === run.id) ?? null, excluded: b?.status?.excluded.includes(run.id) ?? false, comparison, sparks: line, account });
		}
		case 'trade': {
			const d = await inspection.trade(id, q.get('trade') ?? '', q.get('stage') ?? 'virtual');
			return tradeScreen(d, d.subject.name);
		}
		case 'accounts': return accountsScreen(await broker());
		case 'account': {
			const [b, agents] = await Promise.all([broker(), agentList().catch(() => [])]);
			return accountScreen(b, id, new Map(agents.map(a => [a.id, a.name])));
		}
		case 'status': {
			const [status, execution, events, evidence] = await Promise.all([arena.status(), arena.execution(), arena.events(60), arena.evidence().catch(() => null)]);
			return statusScreen({ status, execution, events, evidence, heavyResourcesPaused: evidence?.dependency?.state === 'user-paused' });
		}
		case 'scenarios': return scenariosScreen(await arena.scenarios());
		case 'graveyard': return graveyardScreen(await graveyard(), PLATFORM_HISTORY);
		case 'archive': return archiveScreen(await graveyard(), id);
		case 'journal': return documentScreen('Journal', journal);
		case 'research': return documentScreen('Research', doc('research/report.md') ?? '', [
			{ title: 'Research topics', rows: topics().map(t => ({ id: t.slug, title: t.title, route: { screen: 'document', id: t.slug, title: t.title } })) },
			{ title: 'Source library', rows: sources().map(s => ({ id: s.id, title: s.title, subtitle: `${s.topic} · ${s.id}`, body: s.summary ?? '', ...(s.url ? { route: { screen: 'external', id: s.url } } : {}) })) }]);
		case 'document': {
			if (!/^[a-z0-9-]{1,60}$/.test(id)) throw Error('Invalid topic');
			return documentScreen(topics().find(t => t.slug === id)?.title ?? 'Research', doc(`research/topics/${id}.md`) ?? '');
		}
		case 'source': return sourceScreen(await arena.agent(id), q.get('version') ?? '');
	}
}
