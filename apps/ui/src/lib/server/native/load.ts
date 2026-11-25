/** Fetches what each native screen needs from the arena and the inspector, then builds it (screens.ts). */
import type { LeaderboardRow, RunDetail } from '@trader/shared';
import { arena } from '../arena';
import { inspection } from '../inspection';
import { doc, sources, topics } from '../research';
import { buildStrategyCatalog, findStrategy, findStrategyDocForSlug } from '../strategies';
import { PLATFORM_HISTORY } from '$lib/platform-history';
import {
	accountScreen, accountsScreen, agentScreen, agentsScreen, archiveScreen, documentScreen, graveyardScreen, portfolioScreen, rankingsScreen, runScreen,
	scenariosScreen, sourceScreen, statusScreen, strategyDetailScreen, tradeScreen, verdicts, type Sparks,
} from './screens';
import type { Screen } from './wire';
import type { NativeScreen as ScreenName } from '../native-contract';

const invalidators: (() => void)[] = [];

/** Stale-while-revalidate cache: after the first read, stale callers get the cached value immediately while one refresh runs in the background. */
function swr<T>(ms: number, read: () => Promise<T>) {
	let at = 0, ready: T | undefined, hasReady = false, inflight: Promise<T> | null = null;
	const start = () => {
		if (inflight) return inflight;
		const p = read().then(
			v => { ready = v; hasReady = true; at = Date.now(); if (inflight === p) inflight = null; return v; },
			err => { if (inflight === p) inflight = null; throw err; },
		);
		inflight = p;
		return p;
	};
	invalidators.push(() => { at = 0; hasReady = false; ready = undefined; inflight = null; });
	return (): Promise<T> => {
		if (hasReady) {
			if (Date.now() - at > ms) void start().catch(() => {});
			return Promise.resolve(ready!);
		}
		return start();
	};
}

const broker = swr(15_000, () => arena.broker());
const brokerStatusOnly = swr(10_000, () => arena.broker(0));
const agentList = swr(60_000, () => arena.agents('none'));
const graveyard = swr(300_000, () => arena.graveyard());
const portfolios = swr(30_000, () => arena.portfolios());

const rankingCache = new Map<string, ReturnType<typeof swr<LeaderboardRow[]>>>();
invalidators.push(() => rankingCache.clear());
function cachedRankings(stage: string, scenario: string | null): Promise<LeaderboardRow[]> {
	const key = `${stage}|${scenario ?? ''}`;
	let entry = rankingCache.get(key);
	if (!entry) {
		const ttl = stage === 'backtest' ? 120_000 : 15_000;
		entry = swr(ttl, () =>
			arena.leaderboard(
				stage === 'backtest' ? 'backtest' : 'demo',
				false,
				stage === 'capital' ? 'demo' : '',
				stage === 'virtual' ? scenario ?? 'standard' : 'standard',
			),
		);
		rankingCache.set(key, entry);
	}
	return entry();
}

/** Clear cached reads immediately after a stage or broker mutation so the next refresh sees the new state. */
export function invalidateNativeCache(): void {
	for (const fn of invalidators) fn();
}

const sparks = (id: string, limit?: number): Promise<Sparks | null> => inspection.sparks(id, limit).catch(() => null);
const sparksBatch = (ids: readonly string[], limit = 60): Promise<Record<string, Sparks>> =>
	inspection.sparksBatch(ids, limit).catch(() => ({}));

export async function loadScreen(screen: ScreenName, q: URLSearchParams, journal: string): Promise<Screen> {
	const id = q.get('id') ?? '';
	switch (screen) {
		case 'rankings': {
			const stage = q.get('stage') ?? 'capital', scenario = q.get('scenario');
			const [rows, held] = await Promise.all([
				cachedRankings(stage, scenario),
				stage === 'backtest' ? [] : portfolios().catch(() => []),
			]);
			return rankingsScreen(verdicts(rows, stage), stage, scenario, held);
		}
		case 'agents': {
			const agents = await agentList();
			return agentsScreen(agents, buildStrategyCatalog(agents));
		}
		case 'agent': {
			// Single-round-trip bundle from Arena (no N+1 run fetches, no all-agent leaderboards, no equity curves/logs/source).
			const bundle = await arena.agentBundle(id, 60);
			const liveIds = bundle.liveRuns.map(r => r.id);
			const sparkMap = liveIds.length ? await sparksBatch(liveIds, 60) : {};
			return agentScreen({
				agent: bundle.agent,
				runs: bundle.liveRuns,
				capital: new Map(bundle.capital.map(r => [r.runId, r])),
				backtests: new Map(bundle.backtests.map(r => [r.runId, r])),
				sparks: new Map(Object.entries(sparkMap)),
				strategy: findStrategyDocForSlug(bundle.agent.slug),
				realService: bundle.realService ?? null,
			});
		}
		case 'run': {
			const run: RunDetail = await arena.run(id, 500);
			const [agent, board, b, line] = await Promise.all([
				arena.agent(run.agentId, { source: false, shadows: false }).catch(() => null),
				run.kind === 'backtest' ? Promise.resolve([]) : arena.leaderboard('demo', true, 'demo', 'standard', [run.agentId]).catch((): LeaderboardRow[] => []),
				brokerStatusOnly().catch(() => null),
				sparks(run.id, 500),
			]);
			const comparison = run.kind === 'backtest' ? null : agent?.runs.filter(x => x.kind === 'backtest' && x.status !== 'retired' && x.epic === run.epic && x.leverage === run.leverage && x.codeHash === run.codeHash).sort((a, c) => c.updatedAt - a.updatedAt)[0] ?? null;
			const account = b?.status?.accounts.find(a => a.runs.includes(run.id))?.name ?? null, capital = board.find(r => r.runId === run.id) ?? null;
			const mirrored = !!account || (b?.status?.promoted?.includes(run.id) ?? false);
			const realHolder = b?.status?.realService?.assignment?.runId ?? b?.status?.real?.[0] ?? null;
			const real = (b?.status?.real?.includes(run.id) ?? false) || realHolder === run.id;
			// The chart behind each frequency: the backtest's periods as long as the virtual run and as its Capital cash.
			const periods = await Promise.all([run.evidence?.frequency, capital?.evidence?.frequency].flatMap(f => (f ? [arena.periods(f.runId, f.days).catch(() => null)] : [])));
			return runScreen({ run, agentName: agent?.name ?? run.agentId, capital, excluded: b?.status?.excluded.includes(run.id) ?? false, mirrored, real, realHolder, realService: b?.status?.realService ?? null, comparison, sparks: line, account, periods });
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
		case 'source': return sourceScreen(await arena.agent(id, { source: true, shadows: false }), q.get('version') ?? '');
	}
}
