<script lang="ts">
	import { enhance } from '$app/forms';
	import type { BlueprintMeta, BlueprintDimension, QueueEntry } from '$lib/types';

	let { data, form } = $props();

	// Blueprint selection
	let selectedBlueprint = $state<BlueprintMeta | null>(null);

	// Dimension selections: key → Set of selected stringified values
	let dimSelections = $state<Record<string, Set<string>>>({});

	// Run parameters
	// UI modes: historical/tick map to backtest with tickMode flag, paper/live pass through
	let uiMode = $state<'historical' | 'tick' | 'paper' | 'live'>('historical');
	let backendMode = $derived(uiMode === 'historical' || uiMode === 'tick' ? 'backtest' : uiMode);
	let isBacktest = $derived(uiMode === 'historical' || uiMode === 'tick');

	// Submission state
	let submitting = $state(false);

	// Queue state — initialized from server load, updated by polling
	let queueCurrent = $state<QueueEntry | null>(data.queue?.current ?? null);
	let queueItems = $state<QueueEntry[]>(data.queue?.queued ?? []);
	let queueLength = $derived((queueCurrent ? 1 : 0) + queueItems.length);

	// Polling — plain variable, not reactive (timer handles don't need reactivity)
	let pollTimer: ReturnType<typeof setInterval> | null = null;

	async function pollQueue() {
		try {
			const res = await fetch('/api/queue');
			if (!res.ok) return;
			const state = await res.json();
			queueCurrent = state.current;
			queueItems = state.queued;
			// Stop polling when queue is empty
			if (!state.current && state.queued.length === 0 && pollTimer) {
				clearInterval(pollTimer);
				pollTimer = null;
			}
		} catch {
			// Ignore polling errors
		}
	}

	function startPolling() {
		if (pollTimer) return;
		pollTimer = setInterval(pollQueue, 3000);
	}

	// Start polling on mount if queue has items, clean up on destroy
	$effect(() => {
		if ((data.queue?.current || data.queue?.queued?.length) && !pollTimer) {
			startPolling();
		}
		return () => {
			if (pollTimer) {
				clearInterval(pollTimer);
				pollTimer = null;
			}
		};
	});

	function selectBlueprint(bp: BlueprintMeta | null) {
		selectedBlueprint = bp;
		if (!bp) {
			dimSelections = {};
			return;
		}
		// Initialize: all values selected
		const sel: Record<string, Set<string>> = {};
		for (const [key, values] of Object.entries(bp.dimensionKeys)) {
			sel[key] = new Set(values.map(v => String(v)));
		}
		dimSelections = sel;
	}

	function toggleValue(key: string, value: unknown) {
		const str = String(value);
		const next = { ...dimSelections };
		const set = new Set(next[key]);
		if (set.has(str)) set.delete(str);
		else set.add(str);
		next[key] = set;
		dimSelections = next;
	}

	function selectAll(key: string) {
		if (!selectedBlueprint) return;
		const next = { ...dimSelections };
		next[key] = new Set(selectedBlueprint.dimensionKeys[key].map(v => String(v)));
		dimSelections = next;
	}

	function selectNone(key: string) {
		const next = { ...dimSelections };
		next[key] = new Set();
		dimSelections = next;
	}

	// Filter dimensions to only those matching all selected values
	let matchingDimensions = $derived.by(() => {
		if (!selectedBlueprint) return [];
		return selectedBlueprint.dimensions.filter((dim: BlueprintDimension) => {
			for (const [key, selected] of Object.entries(dimSelections)) {
				if (selected.size === 0) return false;
				const dimValue = dim[key];
				if (dimValue === undefined) continue;
				if (!selected.has(String(dimValue))) return false;
			}
			return true;
		});
	});

	// Matching agent IDs
	let matchingAgentIds = $derived(
		matchingDimensions.map((dim: BlueprintDimension) => `${selectedBlueprint!.directory}/${dim.id}`)
	);

	let agentCount = $derived(matchingAgentIds.length);

	// Dimension key display names
	function formatKey(key: string): string {
		return key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
	}

	function formatValue(key: string, value: unknown): string {
		if (typeof value === 'number') {
			// Small decimals are likely percentages
			if (value < 1 && value > 0) return `${(value * 100).toFixed(1)}%`;
			return String(value);
		}
		return String(value);
	}

	// Extract short agent name from full ID (e.g., "trend-follower/tf_1m_lev20" → "tf_1m_lev20")
	function shortAgentId(agentId: string): string {
		const parts = agentId.split('/');
		return parts[parts.length - 1] ?? agentId;
	}
</script>

<div class="page-header">
	<h1>New Run</h1>
</div>

{#if data.error}
	<div class="error-state">{data.error}</div>
{:else}
	<!-- Queue Panel — always visible when queue has items -->
	{#if queueLength > 0}
		<div class="queue-panel">
			<h2>Queue ({queueLength})</h2>
			<div class="queue-list">
				{#if queueCurrent}
					{@const pct = queueCurrent.progress && queueCurrent.progress.total > 0
						? Math.round((queueCurrent.progress.processed / queueCurrent.progress.total) * 100)
						: 0}
					<div class="queue-item running">
						<span class="queue-status-dot running"></span>
						<span class="queue-agent">{queueCurrent.agentName}</span>
						<span class="queue-id">{shortAgentId(queueCurrent.agentId)}</span>
						{#if queueCurrent.progress && queueCurrent.progress.total > 0}
							<span class="queue-pct">{pct}%</span>
						{:else}
							<span class="badge badge-accent">starting</span>
						{/if}
					</div>
					{#if queueCurrent.progress && queueCurrent.progress.total > 0}
						<div class="progress-bar">
							<div class="progress-fill" style="width: {pct}%"></div>
						</div>
					{/if}
				{/if}
				{#each queueItems as item, i}
					<div class="queue-item">
						<span class="queue-position">#{i + 1}</span>
						<span class="queue-agent">{item.agentName}</span>
						<span class="queue-id">{shortAgentId(item.agentId)}</span>
						<span class="badge badge-neutral">queued</span>
					</div>
				{/each}
			</div>
		</div>
	{:else if form?.success}
		<div class="queue-panel empty">
			<p>All runs completed. <a href="/">View leaderboard</a></p>
		</div>
	{/if}

	<!-- Submission result banner -->
	{#if form?.success && form.summary}
		{@const s = form.summary}
		<div class="result-banner">
			{#if s.queued > 0}
				<span class="result-queued">{s.queued} queued</span>
			{/if}
			{#if s.duplicates > 0}
				<span class="result-skipped">{s.duplicates} skipped (already queued)</span>
			{/if}
			{#if s.errors > 0}
				<span class="result-errors">{s.errors} failed</span>
			{/if}
		</div>
	{/if}

	{#if form?.error}
		<div class="error-banner">{form.error}</div>
	{/if}

	<form
		method="POST"
		class="run-form"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				await update();
				submitting = false;
				// Start polling after submission
				pollQueue();
				startPolling();
			};
		}}
	>
		<!-- Hidden agent IDs for form submission -->
		{#each matchingAgentIds as id}
			<input type="hidden" name="agentId" value={id} />
		{/each}

		<!-- Step 1: Blueprint -->
		<div class="form-section">
			<h2>Blueprint</h2>
			<div class="blueprint-grid">
				{#each data.blueprints as bp}
					{@const isSelected = selectedBlueprint?.directory === bp.directory}
					<button
						type="button"
						class="blueprint-card"
						class:selected={isSelected}
						onclick={() => selectBlueprint(isSelected ? null : bp)}
					>
						<span class="bp-name">{bp.name}</span>
						<div class="bp-meta">
							<span class="badge badge-neutral">{bp.instrument}</span>
							<span class="bp-dims">{bp.agentCount} agents</span>
						</div>
					</button>
				{/each}
			</div>
		</div>

		<!-- Step 2: Dimensions -->
		{#if selectedBlueprint}
			<div class="form-section">
				<h2>Dimensions</h2>
				<div class="dim-controls">
					{#each Object.entries(selectedBlueprint.dimensionKeys) as [key, values]}
						<div class="dim-group">
							<div class="dim-group-header">
								<span class="dim-key">{formatKey(key)}</span>
								<div class="dim-actions">
									<button type="button" class="dim-action" onclick={() => selectAll(key)}>All</button>
									<button type="button" class="dim-action" onclick={() => selectNone(key)}>None</button>
								</div>
							</div>
							<div class="dim-values">
								{#each values as value}
									{@const str = String(value)}
									{@const checked = dimSelections[key]?.has(str) ?? false}
									<label class="dim-chip" class:active={checked}>
										<input
											type="checkbox"
											checked={checked}
											onchange={() => toggleValue(key, value)}
										/>
										{formatValue(key, value)}
									</label>
								{/each}
							</div>
						</div>
					{/each}
				</div>

				<div class="match-count" class:zero={agentCount === 0}>
					{agentCount} of {selectedBlueprint.agentCount} agents selected
				</div>
			</div>
		{/if}

		<!-- Step 3: Mode & Capital -->
		{#if selectedBlueprint}
			<input type="hidden" name="mode" value={backendMode} />
			{#if uiMode === 'tick'}
				<input type="hidden" name="tickMode" value="on" />
			{/if}

			<div class="form-section">
				<h2>Run Configuration</h2>
				<div class="form-row">
					<div class="form-group">
						<label for="uiMode">Mode</label>
						<select id="uiMode" bind:value={uiMode}>
							<option value="historical">Historical</option>
							<option value="tick">Tick (higher accuracy, slower)</option>
							<option value="paper">Paper</option>
							<option value="live">Live</option>
						</select>
					</div>
					<div class="form-group">
						<label for="capital">Capital ($)</label>
						<input type="number" name="capital" id="capital" required value="10000" min="100" step="100" />
					</div>
				</div>
			</div>

			{#if isBacktest}
				<div class="form-section">
					<h2>Period</h2>
					<div class="form-row">
						<div class="form-group">
							<label for="startDate">Start Date</label>
							<input type="date" name="startDate" id="startDate" required value="2023-02-13" />
						</div>
						<div class="form-group">
							<label for="endDate">End Date</label>
							<input type="date" name="endDate" id="endDate" required value="2026-02-13" />
						</div>
					</div>
				</div>
			{/if}

			<div class="form-actions">
				<button type="submit" class="btn btn-primary" disabled={agentCount === 0 || submitting}>
					{#if submitting}
						Submitting {agentCount} runs...
					{:else if agentCount === 1}
						Start 1 Run
					{:else}
						Start {agentCount} Runs
					{/if}
				</button>
				{#if agentCount > 10 && !submitting}
					<span class="batch-warn">Runs queue up and execute one at a time</span>
				{/if}
			</div>
		{/if}
	</form>
{/if}

<style>
	.page-header h1 {
		font-size: 24px;
		font-weight: 700;
		letter-spacing: -0.5px;
		margin-bottom: 24px;
	}

	.run-form {
		max-width: 720px;
	}

	.form-section {
		margin-bottom: 28px;
	}

	.form-section h2 {
		font-size: 14px;
		font-weight: 600;
		color: var(--text-muted);
		margin-bottom: 12px;
		padding-bottom: 8px;
		border-bottom: 1px solid var(--border);
	}

	.form-group {
		margin-bottom: 12px;
	}

	.form-row {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
	}

	.form-row .form-group {
		flex: 1;
		min-width: 160px;
	}

	input, select {
		width: 100%;
	}

	.error-banner {
		background: var(--loss-bg);
		color: var(--loss-text);
		padding: 12px 16px;
		border-radius: 8px;
		font-size: 13px;
		margin-bottom: 20px;
		white-space: pre-line;
	}

	/* Result banner */
	.result-banner {
		display: flex;
		gap: 12px;
		padding: 12px 16px;
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: 8px;
		font-size: 13px;
		margin-bottom: 20px;
	}

	.result-queued {
		color: var(--win);
		font-weight: 600;
	}

	.result-skipped {
		color: var(--text-dim);
	}

	.result-errors {
		color: var(--loss);
		font-weight: 600;
	}

	/* Queue panel */
	.queue-panel {
		max-width: 720px;
		margin-bottom: 24px;
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 16px;
	}

	.queue-panel h2 {
		font-size: 14px;
		font-weight: 600;
		color: var(--text-muted);
		margin-bottom: 12px;
		padding-bottom: 8px;
		border-bottom: 1px solid var(--border);
	}

	.queue-panel.empty {
		text-align: center;
		padding: 20px;
	}

	.queue-panel.empty p {
		font-size: 13px;
		color: var(--text-muted);
		margin: 0;
	}

	.queue-panel.empty a {
		color: var(--accent);
		text-decoration: none;
	}

	.queue-panel.empty a:hover {
		text-decoration: underline;
	}

	.queue-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.queue-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		background: var(--bg-elevated);
		border-radius: 6px;
		font-size: 13px;
	}

	.queue-item.running {
		background: color-mix(in srgb, var(--accent) 8%, var(--bg-elevated));
		border: 1px solid color-mix(in srgb, var(--accent) 20%, transparent);
	}

	.queue-status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.queue-status-dot.running {
		background: var(--accent);
		animation: pulse 1.5s infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.4; }
	}

	.queue-position {
		font-size: 11px;
		color: var(--text-dim);
		font-weight: 600;
		min-width: 20px;
	}

	.queue-agent {
		font-weight: 600;
		color: var(--text);
	}

	.queue-id {
		font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
		font-size: 11px;
		color: var(--text-dim);
		flex: 1;
	}

	.queue-pct {
		font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
		font-size: 12px;
		font-weight: 700;
		color: var(--accent);
		min-width: 36px;
		text-align: right;
	}

	.progress-bar {
		height: 4px;
		background: var(--bg-elevated);
		border-radius: 2px;
		overflow: hidden;
		margin-top: -2px;
	}

	.progress-fill {
		height: 100%;
		background: var(--accent);
		border-radius: 2px;
		transition: width 0.5s ease;
	}

	/* Blueprint cards */
	.blueprint-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 10px;
	}

	.blueprint-card {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 16px;
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		cursor: pointer;
		text-align: left;
		color: var(--text);
		transition: all 0.15s;
	}

	.blueprint-card:hover {
		border-color: var(--border-hover);
		background: var(--bg-card-hover);
	}

	.blueprint-card.selected {
		border-color: var(--accent);
		background: var(--bg-card-hover);
	}

	.bp-name {
		font-size: 16px;
		font-weight: 700;
	}

	.bp-meta {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.bp-dims {
		font-size: 12px;
		color: var(--text-dim);
	}

	/* Dimension controls */
	.dim-controls {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.dim-group {
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 12px 16px;
	}

	.dim-group-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 10px;
	}

	.dim-key {
		font-size: 13px;
		font-weight: 600;
		color: var(--text-muted);
	}

	.dim-actions {
		display: flex;
		gap: 4px;
	}

	.dim-action {
		font-size: 11px;
		padding: 2px 8px;
		border-radius: 4px;
		border: 1px solid var(--border);
		background: none;
		color: var(--text-dim);
		cursor: pointer;
	}

	.dim-action:hover {
		color: var(--text);
		border-color: var(--border-hover);
	}

	.dim-values {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.dim-chip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 10px;
		border-radius: 4px;
		font-size: 12px;
		font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
		background: var(--bg-elevated);
		color: var(--text-dim);
		cursor: pointer;
		border: 1px solid transparent;
		transition: all 0.1s;
		margin: 0;
	}

	.dim-chip input[type="checkbox"] {
		display: none;
	}

	.dim-chip:hover {
		color: var(--text);
		border-color: var(--border-hover);
	}

	.dim-chip.active {
		background: var(--accent);
		color: white;
		border-color: var(--accent);
	}

	.match-count {
		margin-top: 12px;
		font-size: 13px;
		font-weight: 600;
		color: var(--accent);
	}

	.match-count.zero {
		color: var(--loss);
	}

	/* Form actions */
	.form-actions {
		padding-top: 16px;
		border-top: 1px solid var(--border);
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.batch-warn {
		font-size: 12px;
		color: var(--text-dim);
	}
</style>
