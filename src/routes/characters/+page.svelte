<script lang="ts">
	import { onMount } from 'svelte';
	import Panel from '#lib/components/Panel.svelte';
	import type { Character } from '#lib/engine/types.ts';
	import { rulesets } from '#lib/rulesets/index.ts';
	import { deleteCharacter, listCharacters, renameCharacter } from '#lib/storage/characters.ts';

	let characters = $state<Character[]>([]);
	let loading = $state(true);
	let renamingId = $state<string | null>(null);
	let draftName = $state('');
	let confirmingDeleteId = $state<string | null>(null);

	onMount(() => {
		void loadCharacters();
	});

	async function loadCharacters() {
		loading = true;
		characters = await listCharacters();
		loading = false;
	}

	function roleName(character: Character): string {
		const ruleset = rulesets.find((candidate) => candidate.id === character.rulesetId);
		const roleId = character.extra.role;

		if (typeof roleId !== 'string') return 'UNASSIGNED';
		return ruleset?.roles.find((role) => role.id === roleId)?.name ?? 'UNASSIGNED';
	}

	function beginRename(character: Character) {
		renamingId = character.id;
		draftName = character.name;
		confirmingDeleteId = null;
	}

	function cancelRename() {
		renamingId = null;
		draftName = '';
	}

	async function saveRename(id: string) {
		const name = draftName.trim();
		if (!name) return;

		await renameCharacter(id, name);
		cancelRename();
		await loadCharacters();
	}

	function renameKeydown(event: KeyboardEvent, id: string) {
		if (event.key === 'Enter') {
			event.preventDefault();
			void saveRename(id);
		}

		if (event.key === 'Escape') cancelRename();
	}

	async function confirmDelete(id: string) {
		await deleteCharacter(id);
		confirmingDeleteId = null;
		await loadCharacters();
	}
</script>

<h1>CHARACTERS</h1>

<p class="new-character"><a href="/characters/new">+ NEW CHARACTER</a></p>

<Panel title="ROSTER">
	{#if loading}
		<p class="dim cursor">LOADING…</p>
	{:else if characters.length === 0}
		<p class="dim">No characters on file.</p>
	{:else}
		<div class="roster">
			{#each characters as character (character.id)}
				<article class="character-row">
					<div class="identity">
						{#if renamingId === character.id}
							<label class="label" for={`rename-${character.id}`}>HANDLE</label>
							<input
								id={`rename-${character.id}`}
								bind:value={draftName}
								onkeydown={(event) => renameKeydown(event, character.id)}
							/>
						{:else}
							<h2>{character.name}</h2>
						{/if}
						<p class="dim">{roleName(character)}</p>
					</div>

					<div class="actions">
						<a class="open" href={`/characters/${encodeURIComponent(character.id)}`}>OPEN</a>
						{#if renamingId === character.id}
							<button onclick={() => void saveRename(character.id)}>SAVE</button>
							<button onclick={cancelRename}>CANCEL</button>
						{:else if confirmingDeleteId === character.id}
							<span class="confirm">CONFIRM DELETE?</span>
							<button class="danger" onclick={() => void confirmDelete(character.id)}>YES</button>
							<button onclick={() => (confirmingDeleteId = null)}>NO</button>
						{:else}
							<button onclick={() => beginRename(character)}>RENAME</button>
							<button class="danger" onclick={() => (confirmingDeleteId = character.id)}>DELETE</button>
						{/if}
					</div>
				</article>
			{/each}
		</div>
	{/if}
</Panel>

<style>
	.new-character { margin: 0 0 1rem; }
	.new-character a, .open { display: inline-flex; align-items: center; min-height: 44px; border: 1px solid var(--red-dim); padding: 0.4rem 0.8rem; font-family: var(--f-label); font-size: 0.65rem; letter-spacing: 0.1em; }
	.roster { display: grid; gap: 0.75rem; }
	.character-row { border: 1px solid var(--frame-dim); padding: 0.75rem; }
	.identity h2, .identity p { margin: 0; }
	.identity input { width: 100%; min-height: 44px; margin-top: 0.25rem; }
	.actions { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin-top: 0.75rem; }
	.actions button { min-height: 44px; }
	.confirm { color: var(--red-soft); font-size: 0.85rem; }
	.danger { border-color: var(--red-dim); color: var(--red-soft); }

	@media (min-width: 560px) {
		.character-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
		.identity { min-width: 14rem; }
		.actions { justify-content: flex-end; margin-top: 0; }
	}
</style>
