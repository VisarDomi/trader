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
				<div>{s.agents} agents · {s.demoRuns} virtual runs · {s.memoryMb} MB</div>
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

    {#if s.ticks}
      <section class="card stack">
        <h2>Recorded quote ticks</h2>
        <p>{s.ticks.highWater.toLocaleString()} received · {s.ticks.acknowledged.toLocaleString()} archived on the lab · {s.ticks.buffered} awaiting the next disk flush</p>
        <p>{s.ticks.instruments.length} instruments · {(s.ticks.bytes / 1e6).toFixed(1)} MB server spool · {s.ticks.lostTicks} dropped · {s.ticks.invalidMessages} invalid messages</p>
        <p class="muted">Actual bid/ask quotes retain broker time, arrival time and order. The lab keeps one losslessly compressed archive. The bounded server transfer spool expires acknowledged data after 10 minutes.</p>
        {#if s.ticks.lastError}<p class="negative">Recording error: {s.ticks.lastError}</p>{/if}
        {#if s.ticks.diskWarning}<p class="negative">The server recording spool exceeds its disk warning threshold. Check the lab archive.</p>{/if}
        {#if s.tickStorage}
          <p>Whole project: {(s.tickStorage.totalBytes / 1e9).toFixed(1)} / {(s.tickStorage.budgetBytes / 1e9).toFixed(0)} GB · two-year estimate {(s.tickStorage.pointTwoYearBytes / 1e9).toFixed(1)} GB · busier-market scenario {(s.tickStorage.stressTwoYearBytes / 1e9).toFixed(1)} GB</p>
          <p class="muted">Measured {s.tickStorage.ticksPerSecond.toFixed(1)} quotes/s, {s.tickStorage.bytesPerTick.toFixed(1)} compressed bytes/quote. The busier scenario uses four times the observed rate. Estimates update as market sessions accumulate.</p>
          {#if s.tickStorage.warning}<p class="negative">Storage growth needs attention to stay within the 100 GB budget.</p>{/if}
        {/if}
      </section>
    {/if}

    {#if data.execution}
      {@const e = data.execution}
      <section class="card stack">
        <h2>Virtual execution and Capital parity</h2>
        <p>{e.virtual.standardRuns} standard runs · {e.virtual.comparisonRuns} latency comparisons · capacity {e.virtual.runCap}</p>
        <p>{e.virtual.submitted} commands · {e.virtual.filled} executed · {e.virtual.rejected} rejected · {e.virtual.pending} pending</p>
        <p>Average command delay {e.virtual.meanDelayMs ?? '—'} ms · CPU {e.virtual.cpuCorePercent}% of one core · event loop p95 {e.virtual.eventLoopP95Ms} ms · last poll {e.virtual.lastPollMs} ms</p>
        <p>Capital HTTP: {e.network.requests} requests · latency p50/p95 {e.network.requestP50Ms ?? '—'}/{e.network.requestP95Ms ?? '—'} ms · pacing wait {Math.round(e.network.paceWaitMs / 1000)} s</p>
        <p>Payload: {Math.round(e.network.sentPayloadBytes / 1000)} KB sent · {Math.round(e.network.receivedPayloadBytes / 1000)} KB received · {Math.round(e.network.streamPayloadBytes / 1000)} KB streamed (excludes transport overhead)</p>
        <p>Matched opens {e.parity.openFills} · rejected {e.parity.failed} · closes awaiting a value {e.parity.unpricedCloses}</p>
        <p>Adverse open slippage p50/p95 {e.parity.adverseOpenSlippageBpsP50 ?? '—'}/{e.parity.adverseOpenSlippageBpsP95 ?? '—'} basis points · decision-to-confirm p95 {e.parity.decisionToConfirmP95Ms ?? '—'} ms ({e.parity.timedDeals} timed deals)</p>
        {#if e.parity.accountCashflows}
          <p>Capital account cashflows: {#each e.parity.accountCashflows.totals as flow}<span>{flow.type}: ${flow.amount.toFixed(2)} ({flow.n}) · </span>{/each}</p>
          <p>Unallocated to individual runs: {#each e.parity.accountCashflows.unallocated as flow}<span>{flow.type}: ${flow.amount.toFixed(2)} ({flow.n}) · </span>{/each} Capital omits deal IDs on these entries; they are retained at account level.</p>
        {/if}
        <details><summary>Model limits</summary><ul>{#each e.parity.limitations as limit}<li>{limit}</li>{/each}</ul></details>
      </section>
    {/if}

		<section class="card">
			<h2>Instruments</h2>
			<div class="table-wrap">
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
			</div>
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
