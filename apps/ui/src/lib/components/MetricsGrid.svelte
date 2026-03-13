<script lang="ts">
	import { formatCurrency, formatPercent, formatNumber, formatDuration, pnlColor } from '$lib/utils/format';
	import type { Metrics } from '@trader/shared';

	let { metrics, capital = 10000 }: { metrics: Metrics; capital?: number } = $props();

	const cards = $derived([
		{ label: 'Total Return', value: formatPercent(metrics.totalReturn), color: pnlColor(metrics.totalReturn) },
		{ label: 'Total PnL', value: formatCurrency(metrics.totalPnL), color: pnlColor(metrics.totalPnL) },
		{ label: 'Win Rate', value: formatPercent(metrics.winRate), color: metrics.winRate >= 0.5 ? 'var(--profit)' : 'var(--loss)' },
		{ label: 'Sharpe Ratio', value: formatNumber(metrics.sharpe), color: pnlColor(metrics.sharpe) },
		{ label: 'Max Drawdown', value: formatPercent(metrics.maxDrawdown), color: 'var(--loss)' },
		{ label: 'Profit Factor', value: formatNumber(metrics.profitFactor), color: metrics.profitFactor >= 1 ? 'var(--profit)' : 'var(--loss)' },
		{ label: 'Total Trades', value: String(metrics.totalTrades), color: 'var(--text)' },
		{ label: 'Wins / Losses', value: `${metrics.wins} / ${metrics.losses}`, color: 'var(--text)' },
		{ label: 'Avg Win', value: formatCurrency(metrics.averageWin), color: 'var(--profit)' },
		{ label: 'Avg Loss', value: formatCurrency(metrics.averageLoss), color: 'var(--loss)' },
		{ label: 'Avg Hold Time', value: formatDuration(metrics.averageHoldTime), color: 'var(--text-muted)' },
		{ label: 'Win Streak', value: String(metrics.longestWinStreak), color: 'var(--profit)' },
		{ label: 'Lose Streak', value: String(metrics.longestLoseStreak), color: 'var(--loss)' },
	]);
</script>

<div class="metrics-grid">
	{#each cards as card}
		<div class="metric-card">
			<div class="metric-label">{card.label}</div>
			<div class="metric-value" style="color: {card.color}">{card.value}</div>
		</div>
	{/each}
</div>

<style>
	.metrics-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 10px;
		margin-bottom: 28px;
	}

	.metric-card {
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 14px;
	}

	.metric-label {
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--text-dim);
		margin-bottom: 4px;
	}

	.metric-value {
		font-size: 18px;
		font-weight: 700;
		letter-spacing: -0.5px;
	}
</style>
