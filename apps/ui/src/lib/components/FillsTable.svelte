<script lang="ts">
	import { formatCurrency, formatDate, formatNumber, pnlColor } from '$lib/utils/format';
	import type { Fill } from '$lib/types';

	let { fills }: { fills: Fill[] } = $props();

	let sortField = $state<'timestamp' | 'pnl' | 'price'>('timestamp');
	let sortAsc = $state(false);

	let sorted = $derived(
		[...fills].sort((a, b) => {
			let va: number, vb: number;
			if (sortField === 'pnl') {
				va = a.pnl ?? 0;
				vb = b.pnl ?? 0;
			} else {
				va = a[sortField];
				vb = b[sortField];
			}
			return sortAsc ? va - vb : vb - va;
		})
	);

	function toggleSort(field: typeof sortField) {
		if (sortField === field) {
			sortAsc = !sortAsc;
		} else {
			sortField = field;
			sortAsc = false;
		}
	}
</script>

<div class="table-wrapper">
	<table>
		<thead>
			<tr>
				<th class="sortable" onclick={() => toggleSort('timestamp')}>
					Time {sortField === 'timestamp' ? (sortAsc ? '↑' : '↓') : ''}
				</th>
				<th>Action</th>
				<th>Side</th>
				<th>Size</th>
				<th class="sortable" onclick={() => toggleSort('price')}>
					Price {sortField === 'price' ? (sortAsc ? '↑' : '↓') : ''}
				</th>
				<th>Reason</th>
				<th class="sortable" onclick={() => toggleSort('pnl')}>
					PnL {sortField === 'pnl' ? (sortAsc ? '↑' : '↓') : ''}
				</th>
			</tr>
		</thead>
		<tbody>
			{#each sorted as fill}
				<tr>
					<td class="mono">{formatDate(fill.timestamp)}</td>
					<td>
						<span class="badge" class:badge-profit={fill.action === 'OPENED'} class:badge-loss={fill.action === 'CLOSED'}>
							{fill.action}
						</span>
					</td>
					<td>
						<span class:buy={fill.side === 'BUY'} class:sell={fill.side === 'SELL'}>
							{fill.side}
						</span>
					</td>
					<td>{formatNumber(fill.size, 4)}</td>
					<td class="mono">{formatNumber(fill.price)}</td>
					<td class="reason">{fill.reason.replace('_', ' ')}</td>
					<td style="color: {fill.pnl !== undefined ? pnlColor(fill.pnl) : 'var(--text-dim)'}">
						{fill.pnl !== undefined ? formatCurrency(fill.pnl) : '—'}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.table-wrapper {
		overflow-x: auto;
	}

	.sortable {
		cursor: pointer;
		user-select: none;
	}

	.sortable:hover {
		color: var(--text);
	}

	.buy { color: var(--profit); font-weight: 600; }
	.sell { color: var(--loss); font-weight: 600; }

	.reason {
		font-size: 11px;
		text-transform: lowercase;
		color: var(--text-dim);
	}
</style>
