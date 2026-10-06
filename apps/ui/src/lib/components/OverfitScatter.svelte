<script lang="ts">
	import type { LeaderboardRow } from '@trader/shared';
	import { isControl, num } from '$lib/format';

	let { rows }: { rows: LeaderboardRow[] } = $props();

	interface Point {
		row: LeaderboardRow;
		bt: number;
		demo: number;
		control: boolean;
	}

	const points = $derived(
		rows
			.filter(r => r.metrics && r.metrics.trades > 0 && r.backtest?.metrics)
			.map(r => ({ row: r, bt: r.backtest!.metrics!.sharpe, demo: r.metrics!.sharpe, control: isControl(r) })),
	);

	let width = $state(800);
	const height = 420;
	const pad = { top: 16, right: 20, bottom: 44, left: 52 };
	const LIMIT = 6;

	const extent = $derived.by(() => {
		const vals = points.flatMap(p => [p.bt, p.demo]).filter(Number.isFinite);
		const hi = Math.min(LIMIT, Math.max(1, ...vals.map(Math.abs)));
		const step = hi > 3 ? 2 : 1;
		const lim = Math.ceil(hi / step) * step;
		return { lim, step };
	});

	const x = (v: number) => pad.left + ((clamp(v) + extent.lim) / (2 * extent.lim)) * (width - pad.left - pad.right);
	const y = (v: number) => pad.top + (1 - (clamp(v) + extent.lim) / (2 * extent.lim)) * (height - pad.top - pad.bottom);
	const clamp = (v: number) => Math.max(-extent.lim, Math.min(extent.lim, v));
	const ticks = $derived(
		Array.from({ length: (2 * extent.lim) / extent.step + 1 }, (_, i) => -extent.lim + i * extent.step),
	);

	let hover = $state<Point | null>(null);

	const drops = $derived([...points].sort((a, b) => b.bt - b.demo - (a.bt - a.demo)).slice(0, 25));
</script>

{#if points.length === 0}
	<div class="card muted">
		No agent × instrument has both a backtest and demo trades yet. The demo started recently; this view fills in as agents
		trade. Backtests are pushed from the lab PC.
	</div>
{:else}
	<figure class="card">
		<figcaption>
			<h3>Backtest Sharpe vs demo Sharpe</h3>
			<div class="legend" aria-label="Legend">
				<span><i class="dot s1"></i>Agents</span>
				<span><i class="dot s2"></i>Control agents (monkeys, buy &amp; hold)</span>
				<span><i class="line"></i>Demo = backtest</span>
			</div>
		</figcaption>
		<div class="plot" bind:clientWidth={width}>
			<svg {width} {height} role="img" aria-label="Scatter of backtest Sharpe against demo Sharpe">
				{#each ticks as t}
					<line class="grid" x1={x(t)} x2={x(t)} y1={pad.top} y2={height - pad.bottom} />
					<line class="grid" x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} />
					<text class="tick" x={x(t)} y={height - pad.bottom + 16} text-anchor="middle">{t}</text>
					<text class="tick" x={pad.left - 8} y={y(t) + 4} text-anchor="end">{t}</text>
				{/each}
				<line class="axis" x1={x(0)} x2={x(0)} y1={pad.top} y2={height - pad.bottom} />
				<line class="axis" x1={pad.left} x2={width - pad.right} y1={y(0)} y2={y(0)} />
				<line class="diag" x1={x(-extent.lim)} y1={y(-extent.lim)} x2={x(extent.lim)} y2={y(extent.lim)} />
				<text class="label" x={(pad.left + width - pad.right) / 2} y={height - 8} text-anchor="middle">Backtest Sharpe</text>
				<text class="label" transform="translate(14 {(pad.top + height - pad.bottom) / 2}) rotate(-90)" text-anchor="middle">Demo Sharpe</text>
				{#each points as p (p.row.runId)}
					<a href="/runs/{encodeURIComponent(p.row.runId)}" aria-label="{p.row.name} on {p.row.epic}">
						<circle
							class="hit"
							cx={x(p.bt)}
							cy={y(p.demo)}
							r="10"
							role="presentation"
							onmouseenter={() => (hover = p)}
							onmouseleave={() => (hover = null)}
						/>
						<circle class="dot {p.control ? 's2' : 's1'}" cx={x(p.bt)} cy={y(p.demo)} r="4" pointer-events="none" />
					</a>
				{/each}
			</svg>
			{#if hover}
				<div class="tooltip" style="left: {x(hover.bt) + 12}px; top: {y(hover.demo) - 8}px">
					<strong>{hover.row.name}</strong> · {hover.row.epic}<br />
					Backtest Sharpe {num(hover.bt)}<br />
					Demo Sharpe {num(hover.demo)} · {hover.row.metrics?.trades} trades
				</div>
			{/if}
		</div>
		<p class="muted note">Values beyond ±{extent.lim} are drawn at the edge. Demo Sharpe from a few days is very noisy.</p>
	</figure>

	<div class="card">
		<h3>Largest backtest → demo drops</h3>
		<table class="data">
			<thead>
				<tr><th>Agent</th><th>Instrument</th><th class="num">Backtest Sharpe</th><th class="num">Demo Sharpe</th><th class="num">Gap</th><th class="num">Demo trades</th></tr>
			</thead>
			<tbody>
				{#each drops as p (p.row.runId)}
					<tr>
						<td><a href="/agents/{p.row.agentId}">{p.row.name}</a></td>
						<td><a href="/runs/{encodeURIComponent(p.row.runId)}">{p.row.epic}</a></td>
						<td class="num">{num(p.bt)}</td>
						<td class="num">{num(p.demo)}</td>
						<td class="num">{num(p.demo - p.bt)}</td>
						<td class="num">{p.row.metrics?.trades}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<style>
	figure {
		margin: 0;
	}
	figcaption {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 8px;
	}
	.legend {
		display: flex;
		gap: 16px;
		font-size: 12px;
		color: var(--ink-2);
	}
	.legend span {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	i.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		display: inline-block;
	}
	i.dot.s1 {
		background: var(--series-1);
	}
	i.dot.s2 {
		background: var(--series-2);
	}
	i.line {
		width: 16px;
		height: 0;
		border-top: 1px solid var(--ink-muted);
		display: inline-block;
	}
	.plot {
		position: relative;
		width: 100%;
	}
	svg {
		display: block;
		overflow: visible;
	}
	.grid {
		stroke: var(--grid);
		stroke-width: 1;
	}
	.axis {
		stroke: var(--baseline);
		stroke-width: 1;
	}
	.diag {
		stroke: var(--ink-muted);
		stroke-width: 1;
	}
	.tick,
	.label {
		fill: var(--ink-muted);
		font-size: 11px;
		font-variant-numeric: tabular-nums;
	}
	.label {
		fill: var(--ink-2);
		font-size: 12px;
	}
	circle.dot {
		stroke: var(--surface);
		stroke-width: 2;
	}
	circle.dot.s1 {
		fill: var(--series-1);
	}
	circle.dot.s2 {
		fill: var(--series-2);
	}
	circle.hit {
		fill: transparent;
		cursor: pointer;
	}
	.tooltip {
		position: absolute;
		pointer-events: none;
		background: var(--surface);
		border: 1px solid var(--hairline);
		border-radius: 6px;
		padding: 6px 8px;
		font-size: 12px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
		white-space: nowrap;
		z-index: 2;
	}
	.note {
		font-size: 12px;
		margin-top: 4px;
	}
</style>
