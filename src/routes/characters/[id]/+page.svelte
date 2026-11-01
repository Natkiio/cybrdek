<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import Panel from '#lib/components/Panel.svelte';
	import type { Character, SkillDef } from '#lib/engine/types.ts';
	import { rulesets } from '#lib/rulesets/index.ts';
	import { getCharacter } from '#lib/storage/characters.ts';

	type SkillGroup = { category: string; skills: SkillDef[] };

	let character = $state<Character | undefined>(undefined);
	let loaded = $state(false);

	const ruleset = $derived.by(() => {
		const storedCharacter = character;
		return storedCharacter
			? rulesets.find((candidate) => candidate.id === storedCharacter.rulesetId)
			: undefined;
	});
	const roleName = $derived.by(() => {
		const roleId = character?.extra.role;
		if (typeof roleId !== 'string') return 'UNASSIGNED';
		return ruleset?.roles.find((role) => role.id === roleId)?.name ?? 'UNASSIGNED';
	});
	const skillGroups = $derived.by<SkillGroup[]>(() => {
		if (!character || !ruleset) return [];
		const storedCharacter = character;

		return ruleset.skillCategories
			.map((category) => ({
				category,
				skills: ruleset.skills.filter(
					(skill) => skill.category === category && (storedCharacter.skills[skill.id] ?? 0) > 0
				)
			}))
			.filter((group) => group.skills.length > 0);
	});

	onMount(() => {
		void loadCharacter();
	});

	async function loadCharacter() {
		character = await getCharacter(page.params.id ?? '');
		loaded = true;
	}
</script>

<p><a class="roster-link" href="/characters">← ROSTER</a></p>

{#if !loaded}
	<Panel title="CHARACTER FILE">
		<p class="dim cursor">LOADING…</p>
	</Panel>
{:else if !character}
	<Panel title="CHARACTER FILE">
		<p class="not-found">NOT FOUND</p>
	</Panel>
{:else}
	<h1>{character.name}</h1>

	<Panel title="IDENTITY">
		<p><span class="label">HANDLE</span><br />{character.name}</p>
		<p><span class="label">ROLE</span><br />{roleName}</p>
	</Panel>

	<Panel title="STATS">
		{#if ruleset}
			<div class="stats">
				{#each ruleset.stats as stat (stat.id)}
					<div class="stat">
						<span class="label">{stat.id}</span>
						<span class="value">{character.stats[stat.id] ?? 0}</span>
					</div>
				{/each}
			</div>
		{:else}
			<p class="dim">RULESET NOT FOUND.</p>
		{/if}
	</Panel>

	<Panel title="SKILLS">
		{#if skillGroups.length === 0}
			<p class="dim">No trained skills on file.</p>
		{:else}
			<div class="skill-groups">
				{#each skillGroups as group (group.category)}
					<section>
						<h2>{group.category}</h2>
						<ul>
							{#each group.skills as skill (skill.id)}
								<li>{skill.name} <span class="value">{character.skills[skill.id]}</span></li>
							{/each}
						</ul>
					</section>
				{/each}
			</div>
		{/if}
	</Panel>
{/if}

<style>
	.roster-link { display: inline-flex; align-items: center; min-height: 44px; }
	.not-found { color: var(--red-soft); font-family: var(--f-label); letter-spacing: 0.1em; }
	.stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.5rem; }
	.stat { display: flex; justify-content: space-between; border-bottom: 1px solid var(--frame-dim); padding: 0.4rem 0; }
	.skill-groups { display: grid; gap: 1rem; }
	.skill-groups h2 { margin-bottom: 0.35rem; }
	ul { list-style: none; padding: 0; margin: 0; }
	li { display: flex; justify-content: space-between; gap: 1rem; border-bottom: 1px solid var(--frame-dim); padding: 0.3rem 0; }

	@media (min-width: 560px) {
		.stats { grid-template-columns: repeat(5, minmax(0, 1fr)); }
	}
</style>
