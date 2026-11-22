<script lang="ts">
 import Architectures from '#lib/components/net/Architectures.svelte';
 import { gm } from '#lib/supabase/gm.svelte.ts';
 import { campaign } from '#lib/campaigns/current.svelte.ts';
</script>
<svelte:head><title>NET ARCHITECTURES // CYBRDEK</title></svelte:head>
<h1>NET ARCHITECTURES</h1>
<p><a href="/campaigns">CAMPAIGNS →</a> · {campaign.name}</p>
{#if !gm.ready}<p>CHECKING SESSION…</p>
{:else if !gm.userId}<p><a href="/account">Sign in</a> as a campaign member to see revealed floors, or as its GM to build an Architecture.</p>
{:else}{#key `${gm.userId}:${campaign.id}`}<Architectures campaignId={campaign.id} />{/key}{/if}
