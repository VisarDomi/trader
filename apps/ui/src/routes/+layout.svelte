<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';

	let { data, children } = $props();

	const nav = [
		{ href: '/', label: 'Leaderboard' },
		{ href: '/agents', label: 'Agents' },
		{ href: '/broker', label: 'Broker' },
		{ href: '/leverage', label: 'Leverage' },
		{ href: '/journal', label: 'Journal' },
		{ href: '/status', label: 'Status' },
	];

	function active(href: string): boolean {
		const path = page.url.pathname;
		if (href === '/') return path === '/' || path.startsWith('/runs');
		return path.startsWith(href);
	}
</script>

<svelte:head>
	<title>Trader</title>
</svelte:head>

<div class="app">
	<aside>
		<a href="/" class="logo">Trader <span class="muted">arena</span></a>
		<nav>
			{#each nav as item}
				<a href={item.href} class:active={active(item.href)}>{item.label}</a>
			{/each}
		</nav>
		<div class="health">
			{#if data.arena.up}
				<div>
					<span class="status-dot {data.arena.streamConnected ? 'status-good' : 'status-warning'}"></span>
					{data.arena.streamConnected ? 'Live feed connected' : 'Live feed reconnecting'}
				</div>
				<div>
					<span class="status-dot {data.arena.forecasterOk ? 'status-good' : 'status-warning'}"></span>
					{data.arena.forecasterOk ? 'TimesFM reachable' : 'TimesFM offline'}
				</div>
				<div class="muted">{data.arena.demoRuns} demo runs</div>
			{:else}
				<div><span class="status-dot status-critical"></span>Arena unreachable</div>
			{/if}
		</div>
	</aside>
	<main>
		{@render children()}
	</main>
</div>

<style>
	.app {
		display: flex;
		min-height: 100vh;
	}
	aside {
		width: var(--sidebar-width);
		flex-shrink: 0;
		border-right: 1px solid var(--hairline);
		background: var(--surface);
		padding: 18px 12px;
		display: flex;
		flex-direction: column;
		gap: 20px;
		position: sticky;
		top: 0;
		height: 100vh;
	}
	.logo {
		font-weight: 700;
		font-size: 16px;
		text-decoration: none;
		padding: 0 8px;
	}
	nav {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	nav a {
		text-decoration: none;
		color: var(--ink-2);
		padding: 6px 8px;
		border-radius: 6px;
	}
	nav a:hover {
		background: var(--surface-2);
	}
	nav a.active {
		background: var(--surface-2);
		color: var(--ink);
		font-weight: 600;
	}
	.health {
		margin-top: auto;
		font-size: 12px;
		color: var(--ink-2);
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 0 8px;
	}
	main {
		flex: 1;
		min-width: 0;
		padding: 24px 28px 48px;
	}
	@media (max-width: 800px) {
		.app {
			flex-direction: column;
		}
		aside {
			width: 100%;
			height: auto;
			position: static;
		}
		nav {
			flex-direction: row;
			flex-wrap: wrap;
		}
		main {
			padding: 16px;
		}
	}
</style>
