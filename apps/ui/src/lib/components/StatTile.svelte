<script lang="ts">
	let { label, value, tone = '', hint = '' }: { label: string; value: string; tone?: string; hint?: string } = $props();
</script>

<div class="tile" title={hint}>
	<div class="label">{label}</div>
	<div class="value {tone}">{value}</div>
</div>

<style>
	.tile {
		background: var(--surface);
		border: 1px solid var(--hairline);
		border-radius: var(--radius);
		padding: 10px 14px;
		min-width: 120px;
	}
	.label {
		font-size: 12px;
		color: var(--ink-muted);
	}
	.value {
		font-size: 20px;
		font-weight: 600;
	}
</style>
