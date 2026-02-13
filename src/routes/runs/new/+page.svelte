<script lang="ts">
	import type { BlueprintMeta, BlueprintDimension } from '$lib/types';

	let { data, form } = $props();

	// Blueprint selection
	let selectedBlueprint = $state<BlueprintMeta | null>(null);

	// Dimension selections: key → Set of selected stringified values
	let dimSelections = $state<Record<string, Set<string>>>({});

	// Run parameters
	let mode = $state<'backtest' | 'paper' | 'live'>('backtest');

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
</script>

<div class="page-header">
	<h1>New Run</h1>
</div>

{#if data.error}
	<div class="error-state">{data.error}</div>
{:else}
	{#if form?.error}
		<div class="error-banner">{form.error}</div>
	{/if}

	<form method="POST" class="run-form">
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
			<div class="form-section">
				<h2>Run Configuration</h2>
				<div class="form-row">
					<div class="form-group">
						<label for="mode">Mode</label>
						<select name="mode" id="mode" required bind:value={mode}>
							<option value="backtest">Backtest</option>
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

			{#if mode === 'backtest'}
				<div class="form-section">
					<h2>Backtest Period</h2>
					<div class="form-row">
						<div class="form-group">
							<label for="startDate">Start Date</label>
							<input type="date" name="startDate" id="startDate" required value="2025-01-01" />
						</div>
						<div class="form-group">
							<label for="endDate">End Date</label>
							<input type="date" name="endDate" id="endDate" required value="2025-06-01" />
						</div>
					</div>
					<div class="form-row">
						<div class="form-group checkbox-group">
							<label>
								<input type="checkbox" name="tickMode" />
								Tick mode (higher accuracy SL/TP, slower)
							</label>
						</div>
					</div>
				</div>
			{/if}

			<div class="form-actions">
				<button type="submit" class="btn btn-primary" disabled={agentCount === 0}>
					{agentCount === 1
						? 'Start 1 Run'
						: `Start ${agentCount} Runs`}
				</button>
				{#if agentCount > 10}
					<span class="batch-warn">Runs execute sequentially — this may take a while</span>
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

	.checkbox-group label {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		color: var(--text-muted);
		cursor: pointer;
	}

	.checkbox-group input[type="checkbox"] {
		width: auto;
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
