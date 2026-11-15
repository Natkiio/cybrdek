<script lang="ts">
	import { untrack, onDestroy } from 'svelte';
	import Panel from '#lib/components/Panel.svelte';
	import { readDamageOffers, acceptDamage, dismissDamage, type DamageOffer } from '#lib/combat/damage-offers.ts';
	import { characterSync, syncCharacters } from '#lib/sync/characters.svelte.ts';
	let { campaignId, userId, fightVersion }: { campaignId: string; userId: string; fightVersion: string } = $props();
	let offers = $state.raw<DamageOffer[]>([]);
	let busy = $state(false);
	let error = $state('');
	let notice = $state('');
	let generation = 0;
	let active = true;
	onDestroy(() => { active = false; generation++; });

	async function load(mine: number, campaign: string, owner: string) {
		try {
			await syncCharacters(); // collect receipts accepted on another device first
			if (mine !== generation) return;
			const result = await readDamageOffers(campaign, owner);
			if (mine !== generation) return;
			if ('error' in result) error = result.error;
			else { offers = result; error = ''; }
		} catch { if (mine === generation) error = 'Could not check finished fights.'; }
	}
	$effect(() => {
		const owner = userId, campaign = campaignId;
		void fightVersion; void characterSync.revision;
		const mine = ++generation;
		untrack(() => { void load(mine, campaign, owner); });
		return () => { generation++; };
	});
	async function resolveOffer(offer: DamageOffer, apply: boolean) {
		if (busy) return;
		const owner = userId;
		busy = true; error = '';
		try {
			const changed = await (apply ? acceptDamage : dismissDamage)(owner, offer, () => active && owner === userId);
			if (!active) return;
			generation++; // invalidate offer reads begun before this atomic acceptance
			offers = offers.filter(o => !(o.encounterId === offer.encounterId && o.characterId === offer.characterId));
			notice = !changed ? 'That fight damage was already handled.' : apply
				? `Applied ${offer.damage} damage to ${offer.name} on this device. Changes sync to your account when connected.`
				: `Dismissed fight damage for ${offer.name}. HP is unchanged. Changes sync to your account when connected.`;
			void syncCharacters();
		} catch (e) { if (active) error = e instanceof Error ? e.message : 'Could not save your fight damage choice.'; }
		finally { if (active) busy = false; }
	}
</script>

{#if offers.length || error || notice}
	<Panel title="DAMAGE FROM FINISHED FIGHTS">
		<p>Take damage to update your HP, or dismiss if you already applied it. Armor changes stay in the fight.</p>
		{#each offers as offer (`${offer.encounterId}:${offer.characterId}`)}
			<div class="offer">
				<span>{offer.name} · {new Date(offer.endedAt).toLocaleDateString()}</span>
				<button type="button" disabled={busy} onclick={() => resolveOffer(offer, true)}>Take {offer.damage} damage from the fight</button>
				<button type="button" disabled={busy} onclick={() => resolveOffer(offer, false)}>Already applied / dismiss</button>
			</div>
		{/each}
		{#if error}<p class="error" role="alert">{error}</p>{/if}
		{#if notice}<p class="notice" role="status">{notice}</p>{/if}
	</Panel>
{/if}

<style>
	.offer { display: grid; gap: 0.4rem; margin-bottom: 0.7rem; overflow-wrap: anywhere; }
	button { min-height: 44px; }
	.error { color: var(--red-soft); }
	.notice { color: var(--bright); }
</style>
