/** Fetches what each native screen needs from the arena and the inspector, then builds it (screens.ts). */
import type { LeaderboardRow, RunDetail } from '@trader/shared';
import { arena } from '../arena';
import { inspection } from '../inspection';
import { doc, sources, topics } from '../research';
import { buildStrategyCatalog, findStrategy } from '../strategies';
import { PLATFORM_HISTORY } from '$lib/platform-history';
import {
	accountScreen, accountsScreen, agentScreen, agentsScreen, archiveScreen, documentScreen, graveyardScreen, portfolioScreen, rankingsScreen, runScreen,
	scenariosScreen, sourceScreen, statusScreen, strategiesScreen, strategyDetailScreen, tradeScreen, verdicts, type Sparks,
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
const backtestBoard = kept(300_000, () => arena.leaderboard('backtest'));
const portfolios = kept(30_000, () => arena.portfolios());
const sparks = (id: string): Promise<Sparks | null> => inspection.sparks(id).catch(() => null);

import type { NativeScreen as ScreenName } from '../native-contract';

export async function loadScreen(screen: ScreenName, q: URLSearchParams, journal: string): Promise<Screen> {
	const id = q.get('id') ?? '';
	switch (screen) {
		case 'rankings': {
			const stage = q.get('stage') ?? 'capital', scenario = q.get('scenario');
			const [rows, held] = await Promise.all([arena.leaderboard(stage === 'backtest' ? 'backtest' : 'demo', false, stage === 'capital' ? 'demo' : '', stage === 'virtual' ? scenario ?? 'standard' : 'standard'),
				stage === 'backtest' ? [] : portfolios().catch(() => [])]);
			return rankingsScreen(verdicts(rows, stage), stage, scenario, held);
		}
		case 'strategies': return strategiesScreen(buildStrategyCatalog(await agentList().catch(() => [])));
		case 'agents': return agentsScreen(await agentList());
		case 'agent': {
			const agent = await arena.agent(id);
			const liveRuns = agent.runs.filter(r => r.kind === 'demo' && r.status !== 'retired' && !r.id.includes(':delay='));
			const [runs, board, lines, tested] = await Promise.all([Promise.all(liveRuns.map(r => arena.run(r.id, 2000))), capitalBoard().catch((): LeaderboardRow[] => []), Promise.all(liveRuns.map(r => sparks(r.id))), backtestBoard().catch((): LeaderboardRow[] => [])]);
			return agentScreen({ agent, runs, capital: new Map(board.map(r => [r.runId, r])), backtests: new Map(tested.filter(r => r.agentId === agent.id).map(r => [r.runId, r])), sparks: new Map(liveRuns.flatMap((r, i) => (lines[i] ? [[r.id, lines[i]!] as const] : []))) });
		}
		case 'run': {
			const run: RunDetail = await arena.run(id, 2000);
			const [agent, board, b, line] = await Promise.all([arena.agent(run.agentId).catch(() => null), run.kind === 'backtest' ? Promise.resolve([]) : capitalBoard().catch((): LeaderboardRow[] => []), broker().catch(() => null), sparks(run.id)]);
			const comparison = run.kind === 'backtest' ? null : agent?.runs.filter(x => x.kind === 'backtest' && x.status !== 'retired' && x.epic === run.epic && x.leverage === run.leverage && x.codeHash === run.codeHash).sort((a, c) => c.updatedAt - a.updatedAt)[0] ?? null;
			const account = b?.status?.accounts.find(a => a.runs.includes(run.id))?.name ?? null, capital = board.find(r => r.runId === run.id) ?? null;
			// The chart behind each frequency: the backtest's periods as long as the virtual run and as its Capital cash.
			const periods = await Promise.all([run.evidence?.frequency, capital?.evidence?.frequency].flatMap(f => (f ? [arena.periods(f.runId, f.days).catch(() => null)] : [])));
			return runScreen({ run, agentName: agent?.name ?? run.agentId, capital, excluded: b?.status?.excluded.includes(run.id) ?? false, comparison, sparks: line, account, periods });
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
			// A portfolio judged as one record is opened like a document, so the app needs no screen of its own for it.
			if (id.startsWith('portfolio-')) {
				const held = (await portfolios()).find(p => `portfolio-${p.id}` === id);
				if (!held) throw Error('No such portfolio');
				return portfolioScreen(held);
			}
			if (id.startsWith('strategy-')) {
				const catalog = buildStrategyCatalog(await agentList().catch(() => []));
				const item = findStrategy(catalog, id.slice('strategy-'.length));
				if (!item) throw Error('No such strategy');
				return strategyDetailScreen(item);
			}
			return documentScreen(topics().find(t => t.slug === id)?.title ?? 'Research', doc(`research/topics/${id}.md`) ?? '');
		}
		case 'source': return sourceScreen(await arena.agent(id), q.get('version') ?? '');
	}
}
