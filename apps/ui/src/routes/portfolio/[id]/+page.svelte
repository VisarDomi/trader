<script lang="ts">
 import PortfolioCard from'$lib/components/PortfolioCard.svelte';
 import LiveRefresh from'$lib/components/LiveRefresh.svelte';
 let{data}=$props();
</script>
<svelte:head><title>{data.portfolio.name} · Trader</title></svelte:head>
<LiveRefresh recovering={!data.arena.up}/>
<div class="stack"><PortfolioCard portfolio={data.portfolio} detail/></div>
