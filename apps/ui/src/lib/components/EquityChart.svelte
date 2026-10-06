<script lang="ts">
	import { onMount } from 'svelte';
	import type { EquityPoint } from '@trader/shared';

	/** One equity series (single series: the title names it, no legend box). */
	let { data, baseline = 10_000, height = 300 }: { data: EquityPoint[]; baseline?: number; height?: number } = $props();

	let container = $state<HTMLDivElement>();

	function token(name: string): string {
		return getComputedStyle(container!).getPropertyValue(name).trim();
	}

	onMount(() => {
		if (!container) return;
		let disposed = false;
		let cleanup = () => {};
		void import('lightweight-charts').then(({ createChart, AreaSeries, ColorType, LineStyle, CrosshairMode }) => {
			if (disposed) return;
			const el = container!;
			const chart = createChart(el, {
				height,
				layout: { background: { type: ColorType.Solid, color: token('--surface') }, textColor: token('--ink-muted'), fontFamily: token('--font') },
				grid: { vertLines: { visible: false }, horzLines: { color: token('--grid') } },
				rightPriceScale: { borderColor: token('--baseline') },
				timeScale: { borderColor: token('--baseline'), timeVisible: true },
				crosshair: {
					mode: CrosshairMode.Magnet,
					vertLine: { color: token('--ink-muted'), style: LineStyle.Solid, width: 1, labelBackgroundColor: token('--ink-2') },
					horzLine: { color: token('--ink-muted'), style: LineStyle.Solid, width: 1, labelBackgroundColor: token('--ink-2') },
				},
				handleScroll: false,
				handleScale: false,
			});
			const series = chart.addSeries(AreaSeries, {
				lineColor: token('--series-1'),
				lineWidth: 2,
				topColor: token('--series-1-wash'),
				bottomColor: 'rgba(0,0,0,0)',
				priceLineVisible: false,
				lastValueVisible: true,
				priceFormat: { type: 'price', precision: 0, minMove: 1 },
			});
			const seen = new Set<number>();
			const points = data
				.map(p => ({ time: Math.floor(p.t / 1000), value: p.equity }))
				.filter(p => (seen.has(p.time) ? false : (seen.add(p.time), true)))
				.sort((a, b) => a.time - b.time);
			series.setData(points as never);
			series.createPriceLine({ price: baseline, color: token('--baseline'), lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: false, title: '' });
			chart.timeScale().fitContent();
			const ro = new ResizeObserver(() => chart.applyOptions({ width: el.clientWidth }));
			ro.observe(el);
			cleanup = () => {
				ro.disconnect();
				chart.remove();
			};
		});
		return () => {
			disposed = true;
			cleanup();
		};
	});
</script>

{#if data.length < 2}
	<div class="empty muted" style="height: {height}px">Not enough equity points yet.</div>
{:else}
	<div bind:this={container} class="chart" style="height: {height}px"></div>
{/if}

<style>
	.chart {
		width: 100%;
	}
	.empty {
		display: grid;
		place-items: center;
		border: 1px solid var(--grid);
		border-radius: var(--radius);
	}
</style>
