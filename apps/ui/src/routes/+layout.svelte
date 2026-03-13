<script lang="ts">
	import '../app.css';

	let { data, children } = $props();
	let pathname = $derived($page.url.pathname);

	import { page } from '$app/stores';

	const nav = [
		{ href: '/', label: 'Leaderboard', icon: '🏆' },
		{ href: '/agents', label: 'Agents', icon: '🤖' },
		{ href: '/runs/new', label: 'New Run', icon: '▶' },
		{ href: '/status', label: 'Status', icon: '⚡' },
	];
</script>

<svelte:head>
	<title>Trader UI</title>
</svelte:head>

<div class="app">
	<aside class="sidebar">
		<a href="/" class="logo">
			<span class="logo-icon">📊</span>
			<span class="logo-text">Trader<span class="accent">UI</span></span>
		</a>

		<nav>
			{#each nav as item}
				<a
					href={item.href}
					class="nav-link"
					class:active={item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)}
				>
					<span class="nav-icon">{item.icon}</span>
					{item.label}
				</a>
			{/each}
		</nav>

		<div class="sidebar-footer">
			<div class="health">
				<span class="status-dot" class:ok={data.healthy} class:error={!data.healthy}></span>
				{data.healthy ? 'Backend online' : 'Backend offline'}
			</div>
		</div>
	</aside>

	<main class="content">
		{@render children()}
	</main>
</div>

<style>
	.app {
		display: flex;
		min-height: 100vh;
	}

	.sidebar {
		position: fixed;
		top: 0;
		left: 0;
		bottom: 0;
		width: var(--sidebar-width);
		background: var(--bg-card);
		border-right: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		padding: 20px 12px;
		z-index: 10;
	}

	.logo {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 12px;
		margin-bottom: 24px;
		text-decoration: none;
		color: var(--text);
	}

	.logo-icon { font-size: 20px; }

	.logo-text {
		font-size: 18px;
		font-weight: 700;
		letter-spacing: -0.5px;
	}

	.accent { color: var(--accent); }

	nav {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.nav-link {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 500;
		color: var(--text-muted);
		text-decoration: none;
		transition: all 0.15s;
	}

	.nav-link:hover {
		background: var(--bg-elevated);
		color: var(--text);
	}

	.nav-link.active {
		background: var(--accent);
		color: white;
	}

	.nav-icon { font-size: 16px; width: 20px; text-align: center; }

	.sidebar-footer {
		margin-top: auto;
		padding: 12px;
	}

	.health {
		display: flex;
		align-items: center;
		font-size: 12px;
		color: var(--text-dim);
	}

	.content {
		margin-left: var(--sidebar-width);
		flex: 1;
		padding: 32px;
		max-width: 1200px;
	}

	@media (max-width: 768px) {
		.sidebar {
			position: static;
			width: 100%;
			flex-direction: row;
			padding: 12px;
			border-right: none;
			border-bottom: 1px solid var(--border);
		}

		.sidebar-footer { display: none; }

		nav { flex-direction: row; gap: 4px; }

		.nav-link { padding: 8px 12px; font-size: 13px; }
		.nav-icon { display: none; }

		.logo { margin-bottom: 0; }

		.app { flex-direction: column; }

		.content {
			margin-left: 0;
			padding: 20px;
		}
	}
</style>
