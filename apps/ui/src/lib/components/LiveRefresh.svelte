<script lang="ts">
  import { onMount } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { RefreshLoop } from '$lib/refresh-loop';
  let { recovering=false }:{recovering?:boolean}=$props();
  onMount(()=>{
    const loop=new RefreshLoop(invalidateAll,()=>recovering,()=>document.visibilityState==='visible');
    const wake=()=>loop.wake();
    document.addEventListener('visibilitychange',wake);loop.start();
    return ()=>{loop.stop();document.removeEventListener('visibilitychange',wake);};
  });
</script>
