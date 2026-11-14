<script lang="ts">
	// A player's whole character, read-only, for the GM dashboard (#53). Built
	// from the same rules helpers as the sheet; nothing here can change it.
	import type { PartyMember } from '#lib/campaigns/party.ts';
	import { rulesets } from '#lib/rulesets/index.ts';
	import { armoredStats } from '#lib/rulesets/red/armor.ts';
	import { CYBERWARE, cyberwareOf } from '#lib/rulesets/red/cyberware.ts';
	import { gearOf } from '#lib/rulesets/red/gear.ts';
	import { CRITICAL_INJURIES, injuriesOf } from '#lib/rulesets/red/injuries.ts';

	let { member }: { member: PartyMember } = $props();

	const character = $derived(member.character);
	const ruleset = $derived(rulesets.find((r) => r.id === character.rulesetId));
	const gear = $derived(gearOf(character.extra));
	const stats = $derived(armoredStats(character.stats, gear));
	const skills = $derived(
		(ruleset?.skills ?? [])
			.filter((s) => (character.skills[s.id] ?? 0) > 0)
			.map((s) => ({ name: s.name, level: character.skills[s.id], base: (stats[s.stat] ?? 0) + character.skills[s.id] }))
			.sort((a, b) => b.base - a.base || a.name.localeCompare(b.name))
	);
	const cyberware = $derived(
		cyberwareOf(character.extra).map((c) => CYBERWARE.find((d) => d.id === c.defId)?.name ?? 'Unknown cyberware')
	);
	const injuries = $derived(
		injuriesOf(character.extra).map((i) => CRITICAL_INJURIES[i.location][i.roll]).filter((d) => d !== undefined)
	);
</script>

<div class="sheet">
	<section>
		<h3>STATS</h3>
		<dl class="stats">
			{#each ruleset?.stats ?? [] as stat (stat.id)}
				<div>
					<dt>{stat.id}</dt>
					<dd>
						{stats[stat.id] ?? 0}{#if (stats[stat.id] ?? 0) !== (character.stats[stat.id] ?? 0)}<small> ({character.stats[stat.id]})</small>{/if}
					</dd>
				</div>
			{/each}
		</dl>
		<p class="dim small">Brackets: before armour penalties.</p>
	</section>

	{#if injuries.length}
		<section>
			<h3>CRITICAL INJURIES</h3>
			<ul>
				{#each injuries as injury, i (i)}<li><strong>{injury.name}.</strong> {injury.effect}</li>{/each}
			</ul>
		</section>
	{/if}

	<section>
		<h3>SKILLS</h3>
		{#if skills.length}
			<ul class="skills">
				{#each skills as skill (skill.name)}<li><span>{skill.name}</span><span class="value">{skill.base}</span></li>{/each}
			</ul>
			<p class="dim small">STAT + level, after armour penalties.</p>
		{:else}
			<p class="dim">No skills above 0.</p>
		{/if}
	</section>

	<section>
		<h3>GEAR</h3>
		{#if gear.length}
			<ul>
				{#each gear as item (item.id)}
					<li>
						{item.name}{#if item.kind === 'weapon' && item.damage}<span class="dim"> {item.damage}</span>{/if}{#if item.kind === 'armor'}<span class="dim"> SP {item.sp ?? 0}{item.equipped === false ? ', not worn' : ''}</span>{/if}{#if (item.quantity ?? 1) > 1}<span class="dim"> ×{item.quantity}</span>{/if}
					</li>
				{/each}
			</ul>
		{:else}
			<p class="dim">No gear.</p>
		{/if}
	</section>

	<section>
		<h3>CYBERWARE</h3>
		{#if cyberware.length}
			<ul>{#each cyberware as name, i (i)}<li>{name}</li>{/each}</ul>
		{:else}
			<p class="dim">None installed.</p>
		{/if}
	</section>
</div>

<style>
	.sheet {
		display: grid;
		gap: 0.75rem;
		margin-top: 0.75rem;
	}

	h3 {
		margin: 0 0 0.35rem;
		font-size: 0.85rem;
		color: var(--label);
	}

	.stats {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 0.3rem;
		margin: 0;
	}

	.stats div {
		text-align: center;
	}

	dt {
		color: var(--muted);
		font-size: 0.75rem;
	}

	dd {
		margin: 0;
		color: var(--value);
	}

	ul {
		margin: 0;
		padding-left: 1.1rem;
	}

	.skills {
		list-style: none;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
		gap: 0.15rem 1rem;
	}

	.skills li {
		display: flex;
		justify-content: space-between;
	}

	.value {
		color: var(--value);
	}

	.dim {
		color: var(--muted);
	}

	.small {
		font-size: 0.75rem;
		margin: 0.25rem 0 0;
	}
</style>
