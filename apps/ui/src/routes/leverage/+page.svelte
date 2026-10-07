<script lang="ts">
	import type { LeaderboardRow } from '@trader/shared';
	import { isControl, median, pct, pctPlain, sign, usd } from '$lib/format';

	let { data } = $props();

	const TIERS = [1, 2, 3, 5, 10, 20, 50, 100, 200];
	const LADDER = { slug: 'leverage-ladder', epics: ['US100', 'GOLD', 'EURUSD', 'BTCUSD'], marginPct: 10 };
	/** The share basket held by buy-hold at 1:1 (agents/buy-hold.ts). */
	const BASKET = ['NVDA', 'MSFT', 'AAPL', 'AMZN', 'AVGO', 'META', 'GOOGL', 'TSLA'];
	const BUY_HOLD = 'buy-hold';
	/** A run below this share of its starting capital has been wiped out. */
	const WIPED_OUT = 0.1;

	const live = $derived(data.demo.filter(r => r.leverage !== null && r.status !== 'retired'));

	const tiers = $derived(
		TIERS.map(leverage => {
			const rows = live.filter(r => r.leverage === leverage);
			const strategies = rows.filter(r => !isControl(r));
			const traded = strategies.filter(r => (r.metrics?.trades ?? 0) > 0);
			return {
				leverage,
				accounts: data.accounts.filter(a => a.leverage === leverage).map(a => a.name),
				runs: rows.length,
				mirrored: rows.filter(r => r.mirrored).length,
				agents: new Set(strategies.map(r => r.agentId)).size,
				traded: traded.length,
				medianReturn: median(traded.map(r => r.metrics!.totalReturn)),
				profitable: traded.filter(r => r.metrics!.totalReturn > 0).length,
				wipedOut: rows.filter(r => r.equity < WIPED_OUT * (r.metrics?.initialCapital ?? 10_000)).length,
			};
		}),
	);

	function ladderRow(variant: string, epic: string): (LeaderboardRow | undefined)[] {
		return TIERS.map(l => live.find(r => r.agentId === `${LADDER.slug}/${variant}` && r.epic === epic && r.leverage === l));
	}

	const basket = $derived.by(() => {
		const hold = live.filter(r => r.agentId === BUY_HOLD && r.leverage === 1);
		const shares = hold.filter(r => BASKET.includes(r.epic) && r.metrics);
		const index = (epic: string) => hold.find(r => r.epic === epic);
		return {
			shares: shares.length,
			ret: shares.length ? shares.reduce((s, r) => s + r.metrics!.totalReturn, 0) / shares.length : null,
			funding: shares.length ? shares.reduce((s, r) => s + r.metrics!.funding, 0) : null,
			indices: ['US100', 'US500'].map(epic => ({ epic, row: index(epic) })),
		};
	});
</script>

<div class="stack">
	<header class="stack" style="gap: 6px">
		<h1>Leverage</h1>
		<p class="lede">
			Every demo run trades at the leverage of one Capital.com demo account, from 1:1 to 1:200, and is mirrored on that account.
			Leverage is a ceiling: margin is the position size divided by the leverage, and a position is closed when equity falls
			below half its margin. At 1:1, crypto and shares pay no overnight fee (indices, commodities and FX still do). Crypto and
			shares go no higher than 1:20 (marked * on the leaderboard).
		</p>
		<p class="secondary small">
			Most agents risk about 1% of equity against a stop, so they use only the leverage the stop needs, rarely more than 1:10.
			For them a 1:200 account behaves like a 1:20 one. Each account holds the agents whose sizing suits it, ordered by how much
			leverage they used in backtests. The ladder below uses the leverage on purpose.
		</p>
	</header>

	{#if data.error}<div class="card"><span class="status-dot status-critical"></span>{data.error}</div>{/if}

	<section class="card">
		<h2>Accounts</h2>
		<div class="table-wrap">
			<table class="data">
				<thead>
					<tr>
						<th>Leverage</th>
						<th>Account</th>
						<th class="num">Live runs</th>
						<th class="num">Mirrored</th>
						<th class="num">Strategies</th>
						<th class="num" title="Median demo return of strategy runs that have traded (controls excluded)">Median return</th>
						<th class="num">Profitable</th>
						<th class="num" title="Runs below 10% of their starting capital">Wiped out</th>
					</tr>
				</thead>
				<tbody>
					{#each tiers as t (t.leverage)}
						<tr>
							<td><a href="/?leverage={t.leverage}">1:{t.leverage}</a></td>
							<td class:muted={t.accounts.length === 0}>{t.accounts.join(', ') || 'no account'}</td>
							<td class="num">{t.runs}</td>
							<td class="num">{t.mirrored}</td>
							<td class="num">{t.agents}</td>
							<td class="num {sign(t.medianReturn)}">{pct(t.medianReturn)}</td>
							<td class="num">{t.traded ? `${t.profitable} / ${t.traded}` : '—'}</td>
							<td class="num">{t.wipedOut || ''}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>

	<section class="card">
		<h2>The leverage ladder</h2>
		<p class="secondary small">
			The same signal on every leverage, each position putting up {LADDER.marginPct}% of equity as margin: 0.1× equity at 1:1,
			1× at 1:10, 20× at 1:200. <strong>Hold</strong> stays long and buys again after a margin call; <strong>trend</strong> is
			long while the 20-day return is positive and short while it is negative, with no stop. Demo return, max drawdown below.
		</p>
		{#each ['hold', 'trend'] as variant}
			<h3>{variant}</h3>
			<div class="table-wrap">
				<table class="data ladder">
					<thead>
						<tr>
							<th>Instrument</th>
							{#each TIERS as l}<th class="num">1:{l}</th>{/each}
						</tr>
					</thead>
					<tbody>
						{#each LADDER.epics as epic}
							<tr>
								<td>{epic}</td>
								{#each ladderRow(variant, epic) as r, i}
									{#if r}
										<td class="num">
											<a href="/runs/{encodeURIComponent(r.runId)}" class={sign(r.metrics?.totalReturn)}>{pct(r.metrics?.totalReturn)}</a>
											<div class="muted small">{r.metrics ? pctPlain(r.metrics.maxDrawdown, 0) : ''}</div>
										</td>
									{:else}
										<td class="num muted" title={TIERS[i]! > 20 && epic === 'BTCUSD' ? 'crypto stops at 1:20' : 'not running'}>—</td>
									{/if}
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/each}
	</section>

	<section class="card">
		<h2>Shares instead of the index, at 1:1</h2>
		<p class="secondary small">
			A 1:1 index position still pays the overnight fee (about 8% a year on a long US100). The eight largest Nasdaq-100
			companies, about half of the index, pay none at 1:1: the price is the cash to buy them outright. Both are held by
			Buy &amp; Hold on the 1:1 account at 0.9× equity, $10,000 each.
		</p>
		<div class="table-wrap">
			<table class="data">
				<thead><tr><th>Holding</th><th class="num">Return</th><th class="num">Overnight fees</th></tr></thead>
				<tbody>
					<tr>
						<td>{BASKET.join(', ')} <span class="muted">(equal weight, {basket.shares} of {BASKET.length} live)</span></td>
						<td class="num {sign(basket.ret)}">{pct(basket.ret)}</td>
						<td class="num">{usd(basket.funding)}</td>
					</tr>
					{#each basket.indices as { epic, row }}
						<tr>
							<td>{epic}</td>
							<td class="num {sign(row?.metrics?.totalReturn)}">{pct(row?.metrics?.totalReturn)}</td>
							<td class="num {sign(row?.metrics?.funding)}">{usd(row?.metrics?.funding)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
</div>

<style>
	.small {
		font-size: 12px;
	}
	h3 {
		margin: 14px 0 6px;
		font-size: 14px;
		text-transform: capitalize;
	}
	table.ladder td,
	table.ladder th {
		min-width: 64px;
	}
</style>
