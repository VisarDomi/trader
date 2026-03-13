export function formatCurrency(value: number): string {
	if (value == null || !isFinite(value)) return '—';
	const abs = Math.abs(value);
	const sign = value < 0 ? '-' : '';
	if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
	if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(2)}K`;
	return `${sign}$${abs.toFixed(2)}`;
}

export function formatPercent(value: number): string {
	if (value == null || !isFinite(value)) return '—';
	return `${(value * 100).toFixed(2)}%`;
}

export function formatDuration(ms: number): string {
	if (ms == null || !isFinite(ms)) return '—';
	const seconds = Math.floor(ms / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ${minutes % 60}m`;
	const days = Math.floor(hours / 24);
	return `${days}d ${hours % 24}h`;
}

export function formatDate(timestamp: number): string {
	if (timestamp == null || !isFinite(timestamp)) return '—';
	return new Date(timestamp).toLocaleDateString('en-GB', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
}

export function formatNumber(value: number, decimals: number = 2): string {
	if (value == null || !isFinite(value)) return value === Infinity ? '∞' : '—';
	return value.toLocaleString('en-US', {
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals,
	});
}

export function pnlColor(value: number): string {
	if (value == null || !isFinite(value)) return 'var(--text-muted)';
	if (value > 0) return 'var(--profit)';
	if (value < 0) return 'var(--loss)';
	return 'var(--text-muted)';
}
