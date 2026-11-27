<script lang="ts">
	import { PROGRAMS } from '#lib/rulesets/red/programs.ts';
	import { programState } from '#lib/rulesets/red/net-combat.ts';
	import type { Encounter } from '#lib/combat/encounter.ts';
	import SecurityReference from '#lib/components/net/SecurityReference.svelte';
	let {
		encounter,
		disabled,
		only = null,
		oncommand
	}: {
		encounter: Encounter;
		disabled: boolean;
		only?: string | null; // show just this combatant (the turn console's selection)
		oncommand: (fn: () => Encounter) => void | Promise<void>;
	} = $props();
	const participants = $derived(encounter.combatants.filter((c) => c.net && (!only || c.id === only)));
</script>

{#each participants as c (c.id)}
	<section aria-label={`NET state ${c.name}`}>
		<h3>{c.name} · {c.net?.kind === 'runner' ? `${c.hp} HP` : `${c.hp} REZ`}</h3>
		{#if c.net?.kind !== 'runner'}<SecurityReference
				type={c.net?.kind === 'ice' ? 'black-ice' : 'demon'}
				refId={c.net?.defId ?? null}
			/>{/if}
		{#if c.net?.kind === 'runner'}
			{#if c.net.fire}<p class="error">ON FIRE · 2 HP at end of Turn until extinguished.</p>{/if}
			{#if c.net.glue}<p class="error">
					Movement / safe Jack Out blocked. GM clears at the stated effect expiry.
				</p>
				<button
					type="button"
					{disabled}
					onclick={() =>
						oncommand(() => ({
							...encounter,
							combatants: encounter.combatants.map((x) =>
								x.id === c.id ? { ...x, net: { ...x.net!, glue: 0 } } : x
							)
						}))}>CLEAR HOLD</button
				>{/if}
			{#each c.net.conditions as condition, i}<p>
					{condition}
					<button
						type="button"
						{disabled}
						onclick={() =>
							oncommand(() => ({
								...encounter,
								combatants: encounter.combatants.map((x) =>
									x.id === c.id
										? {
												...x,
												net: {
													...x.net!,
													conditions: x.net!.conditions.filter((_, n) => n !== i)
												}
											}
										: x
								)
							}))}>CLEAR CONDITION</button
					>
				</p>{/each}
			<ul>
				{#each c.net.programs as p (p.id)}
					<li>
						{PROGRAMS.find((d) => d.id === p.defId)?.name} · {p.id.slice(0, 6)} · {p.rez} REZ · {p.phase}
						{#if PROGRAMS.find((d) => d.id === p.defId)?.category !== 'Attacker'}
							<button
								type="button"
								disabled={disabled || !['inactive', 'active', 'derezzed'].includes(p.phase)}
								onclick={() =>
									oncommand(() => programState(encounter, c.id, p.id, p.phase === 'inactive'))}
								>{p.phase === 'inactive' ? 'ACTIVATE' : 'DEACTIVATE'}</button
							>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>
{/each}

<style>
	button {
		min-height: 44px;
	}
	.error {
		color: var(--red-soft);
	}
	li,
	section {
		overflow-wrap: anywhere;
	}
	h3 {
		color: var(--value);
	}
	ul {
		padding-left: 1rem;
	}
</style>
