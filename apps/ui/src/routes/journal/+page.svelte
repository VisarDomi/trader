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

	</header>

	<section class="card policy">
		<h2>How agents move</h2>
		<ul>
			<li><strong>Backtest</strong> — a new agent is backtested first; only clearly broken ideas are stopped here, because good backtests are easy to fake.</li>
			<li><strong>Virtual engine</strong> — admitted agents trade live quotes with independent virtual capital. Every record is judged on one clock: its return on each weekday, flat days included, from {LIFECYCLE.MIN_TRADES} trades and {LIFECYCLE.MIN_DAYS} days.</li>
			<li><strong>Capital demo</strong> — candidates compete for real demo orders on the nine "Arena" accounts. The existing calibration cohort and user experiments remain labeled separately.</li>
			<li><strong>Candidate</strong> — daily t-statistic of {LIFECYCLE.CANDIDATE_TSTAT} or more and better than every random monkey on the same instrument. It may still be luck: about one no-edge record in six gets there within a year.</li>
			<li><strong>Confirmed</strong> — clears the bar that keeps luck under {LIFECYCLE.CONFIRM_FDR * 100}% of confirmed records, counted over every strategy record ever started and valid however often it is checked, and agrees with its backtest. Slow strategies need years.</li>
			<li><strong>Family</strong> — every record is also judged with its family as one record: the average of its members' daily returns at equal risk, retired members included while they ran. Slow strategies are judged sooner this way; a family verdict moves no slots.</li>
			<li><strong>Retired</strong> — daily t-statistic of {LIFECYCLE.RETIRE_TSTAT} or less after {LIFECYCLE.LOSER_MIN_TRADES} trades ({LIFECYCLE.SLOW_MIN_TRADES} over {LIFECYCLE.SLOW_MIN_DAYS} days for slow agents), no trades in {LIFECYCLE.SILENT_DAYS} days, or a busted account. A whole agent goes when most of its judged runs do.</li>
		</ul>
		<p class="secondary small">
			Full policy: <a href="{REPO}/LIFECYCLE.md" rel="noopener">LIFECYCLE.md</a> · retired runs:
			<a href="/graveyard">Graveyard</a> · <a href="{REPO}/roster.json" rel="noopener">roster.json</a>
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
