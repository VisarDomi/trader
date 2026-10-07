<script lang="ts">
	import { LIFECYCLE } from '@trader/shared';
	import { markdown } from '$lib/markdown';
	// Bundled at build time: every push to main redeploys the dashboard with the latest journal.
	import journal from '../../../../backend/agents/JOURNAL.md?raw';

	const REPO = 'https://github.com/VisarDomi/trader/blob/main/apps/backend/agents';
	// The journal's first heading is its title; this page has its own.
	const html = markdown(journal.replace(/^# .*\n/, ''), REPO);
</script>

<div class="stack">
	<header class="stack" style="gap: 6px">
		<h1>Journal</h1>
		<p class="lede">
			Claude looks after the arena twice a week: it retires agents that have shown they lose, adds new ones, and fixes
			what breaks. Every visit is written down here, newest first.
		</p>
	</header>

	<section class="card policy">
		<h2>How agents move</h2>
		<ul>
			<li><strong>Backtest</strong> — a new agent is backtested first; only clearly broken ideas are stopped here, because good backtests are easy to fake.</li>
			<li><strong>Demo</strong> — every agent then trades live demo prices on paper, $10,000 per instrument. A run is judged after {LIFECYCLE.MIN_TRADES} trades and {LIFECYCLE.MIN_DAYS} days (slow agents: {LIFECYCLE.SLOW_MIN_DAYS} days).</li>
			<li><strong>Broker</strong> — the best demo runs also trade real demo orders on the nine "Arena" accounts. When those are full, a run that gets ahead takes the slot of a weaker one.</li>
			<li><strong>Leader</strong> — trade t-statistic of {LIFECYCLE.LEADER_TSTAT} or more and better than every random monkey on the same instrument.</li>
			<li><strong>Retired</strong> — t-statistic of {LIFECYCLE.RETIRE_TSTAT} or less once judged, no trades in {LIFECYCLE.SILENT_DAYS} days, or a busted account. A whole agent goes when most of its judged runs do.</li>
		</ul>
		<p class="secondary small">
			Full policy: <a href="{REPO}/LIFECYCLE.md" rel="noopener">LIFECYCLE.md</a> · retired runs:
			<a href="{REPO}/roster.json" rel="noopener">roster.json</a>
		</p>
	</section>

	<article class="card journal">
		{@html html}
	</article>
</div>

<style>
	.policy ul,
	.journal :global(ul) {
		margin: 6px 0 10px;
		padding-left: 20px;
	}
	.policy li,
	.journal :global(li) {
		margin: 3px 0;
	}
	/* Journal entries are "## date" headings (h3 here); each starts a section. */
	.journal :global(h3) {
		margin: 22px 0 6px;
		padding-top: 14px;
		border-top: 1px solid var(--hairline);
		font-size: 15px;
	}
	.journal :global(h3:first-child) {
		margin-top: 0;
		padding-top: 0;
		border-top: none;
	}
	.journal :global(h4) {
		margin: 14px 0 4px;
		font-size: 14px;
	}
	.journal :global(p) {
		margin: 6px 0;
	}
	.small {
		font-size: 12px;
	}
</style>
