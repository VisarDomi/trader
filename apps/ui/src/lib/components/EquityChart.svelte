<script lang="ts">
	import { onMount } from 'svelte';
	import type { EquityPoint } from '@trader/shared';

	let { data }: { data: EquityPoint[] } = $props();

	let container: HTMLDivElement;

	onMount(async () => {
		const { createChart, ColorType, LineStyle } = await import('lightweight-charts');

		const chart = createChart(container, {
			layout: {
				background: { type: ColorType.Solid, color: '#0f0f14' },
				textColor: '#a1a1aa',
			},
			grid: {
				vertLines: { color: '#1e1e24' },
				horzLines: { color: '#1e1e24' },
			},
			rightPriceScale: {
				borderColor: '#27272a',
			},
			timeScale: {
				borderColor: '#27272a',
				timeVisible: true,
			},
			crosshair: {
				horzLine: {
					color: '#6366f1',
					style: LineStyle.LargeDashed,
					labelBackgroundColor: '#6366f1',
				},
				vertLine: {
					color: '#6366f1',
					style: LineStyle.LargeDashed,
					labelBackgroundColor: '#6366f1',
				},
			},
		});

		const series = chart.addAreaSeries({
			lineColor: '#6366f1',
			topColor: 'rgba(99, 102, 241, 0.4)',
			bottomColor: 'rgba(99, 102, 241, 0.0)',
			lineWidth: 2,
		});

		const chartData = data.map(p => ({
			time: Math.floor(p.timestamp / 1000) as import('lightweight-charts').UTCTimestamp,
			value: p.equity,
		}));

		series.setData(chartData);
		chart.timeScale().fitContent();

		const observer = new ResizeObserver(() => {
			chart.applyOptions({
				width: container.clientWidth,
				height: container.clientHeight,
			});
		});

		observer.observe(container);

		return () => {
			observer.disconnect();
			chart.remove();
		};
	});
</script>

<div bind:this={container} class="chart-container"></div>

<style>
	.chart-container {
		width: 100%;
		height: 100%;
		min-height: 300px;
	}
</style>
