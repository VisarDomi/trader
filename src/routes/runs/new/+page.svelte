<script lang="ts">
	import type { AgentSummary } from '$lib/types';

	let { data, form } = $props();

	let mode = $state('backtest');
	let selectedAgent = $state(data.preselectedAgent);
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
		<div class="form-section">
			<h2>Agent</h2>
			<div class="form-group">
				<label for="agentId">Select Agent</label>
				<select name="agentId" id="agentId" required bind:value={selectedAgent}>
					<option value="">Choose an agent...</option>
					{#each data.agents as agent}
						<option value={agent.id}>{agent.config.name} ({agent.config.instrument})</option>
					{/each}
				</select>
			</div>
		</div>

		<div class="form-section">
			<h2>Mode & Capital</h2>
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
				<div class="form-group">
					<label for="leverage">Leverage (optional)</label>
					<input type="number" name="leverage" id="leverage" min="1" max="500" placeholder="Default" />
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

		<div class="form-section">
			<h2>Risk Limits</h2>
			<div class="form-row">
				<div class="form-group">
					<label for="maxDrawdown">Max Drawdown (e.g. 0.2 = 20%)</label>
					<input type="number" name="maxDrawdown" id="maxDrawdown" min="0.01" max="1" step="0.01" placeholder="No limit" />
				</div>
			</div>
		</div>

		<div class="form-actions">
			<button type="submit" class="btn btn-primary">Start Run</button>
		</div>
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
		max-width: 640px;
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
	}

	.form-actions {
		padding-top: 16px;
		border-top: 1px solid var(--border);
	}
</style>
