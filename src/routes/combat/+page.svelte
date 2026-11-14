<script lang="ts">
	import DeviceCombat from '#lib/components/combat/DeviceCombat.svelte';
	import CampaignCombat from '#lib/components/combat/CampaignCombat.svelte';
	import { gm } from '#lib/supabase/gm.svelte.ts';
	import { campaign } from '#lib/campaigns/current.svelte.ts';
</script>

<svelte:head><title>COMBAT // CYBRDEK</title></svelte:head>
{#if !gm.ready}
	<p>CHECKING SESSION…</p>
{:else if gm.userId}
	{#key `${gm.userId}:${campaign.id}`}<CampaignCombat userId={gm.userId} campaignId={campaign.id} />{/key}
{:else}
	<DeviceCombat />
{/if}
