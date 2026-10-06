<script lang="ts">
	import { ago, price, utc } from '$lib/format';

	let { data } = $props();
	const s = $derived(data.status);
	let level = $state('');
	const events = $derived(data.events.filter(e => !level || e.level === level));

	const STALE_QUOTE_MS = 5 * 60_000;
	const STALE_CANDLE_MS = 10 * 60_000;
</script>

<div class="stack">
	<header><h1>Status</h1></header>
	{#if data.error}<div class="card"><span class="status-dot status-critical"></span>{data.error}</div>{/if}

	{#if s}
		<div class="grid">
			<section class="card">
				<h2>Arena</h2>
				<div>Up since {utc(s.startedAt)} ({ago(s.startedAt, s.now)})</div>
				<div>{s.agents} agents · {s.demoRuns} demo runs · {s.memoryMb} MB</div>
				<div>
					<span class="status-dot {s.stream.connected ? 'status-good' : 'status-critical'}"></span>
					Price stream {s.stream.connected ? `connected ${ago(s.stream.connectedSince, s.now)}` : 'disconnected'} · {s.stream.reconnects} reconnects
				</div>
				{#if s.loadErrors.length}
					<div class="load-errors">
						{#each s.loadErrors as e}<div><span class="status-dot status-critical"></span><code>{e.file}</code>: {e.error}</div>{/each}
					</div>
				{/if}
			</section>
			<section class="card">
				<h2>TimesFM forecaster (lab PC GPU)</h2>
				<div>
					<span class="status-dot {s.forecaster.reachable ? 'status-good' : 'status-critical'}"></span>
					{s.forecaster.reachable ? 'Reachable' : 'Unreachable'} (checked {ago(s.forecaster.lastProbeAt, s.now)})
				</div>
				<div>Last forecast served {ago(s.forecaster.lastSuccessAt, s.now)}</div>
				<div>{s.forecaster.requests} requests · {s.forecaster.failures} failures</div>
				{#if s.forecaster.lastError}<div class="muted">Last error: {s.forecaster.lastError}</div>{/if}
			</section>
		</div>

		<section class="card">
			<h2>Instruments</h2>
			<table class="data">
				<thead><tr><th>Instrument</th><th class="num">Bid</th><th class="num">Ask</th><th>Last quote</th><th>Last 1m candle</th></tr></thead>
				<tbody>
					{#each Object.entries(s.quotes) as [epic, q]}
						<tr>
							<td>{epic}</td>
							<td class="num">{price(q.bid)}</td>
							<td class="num">{price(q.ask)}</td>
							<td>
								<span class="status-dot {q.quoteTime && s.now - q.quoteTime < STALE_QUOTE_MS ? 'status-good' : 'status-warning'}"></span>{ago(q.quoteTime, s.now)}
							</td>
							<td>
								<span class="status-dot {q.lastCandle && s.now - q.lastCandle < STALE_CANDLE_MS ? 'status-good' : 'status-warning'}"></span>{ago(q.lastCandle, s.now)}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
			<p class="muted small">Amber is normal while a market is closed (weekends; daily breaks around 17:00 New York).</p>
		</section>
	{/if}

	<section class="card">
		<div class="row" style="justify-content: space-between">
			<h2>Events</h2>
			<select bind:value={level} aria-label="Level">
				<option value="">All levels</option>
				<option value="info">Info</option>
				<option value="warn">Warnings</option>
				<option value="error">Errors</option>
			</select>
		</div>
		<div class="table-wrap" style="max-height: 520px">
			<table class="data">
				<thead><tr><th>Time</th><th>Level</th><th>Source</th><th>Message</th></tr></thead>
				<tbody>
					{#each events as e}
						<tr>
							<td class="muted nowrap">{utc(e.time)}</td>
							<td><span class="status-dot {e.level === 'error' ? 'status-critical' : e.level === 'warn' ? 'status-warning' : 'status-good'}"></span>{e.level}</td>
							<td class="muted">{e.source}</td>
							<td>{e.message}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
</div>

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
		gap: 12px;
	}
	.grid section {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.small {
		font-size: 12px;
		margin-top: 6px;
	}
	.nowrap {
		white-space: nowrap;
	}
	.load-errors {
		margin-top: 6px;
		font-size: 12px;
	}
</style>
