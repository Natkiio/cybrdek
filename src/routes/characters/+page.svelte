<script lang="ts">
	import { onMount } from 'svelte';
	import Panel from '#lib/components/Panel.svelte';
	import type { Character } from '#lib/engine/types.ts';
	import { rulesets } from '#lib/rulesets/index.ts';
	import { characterFileName, exportCharacter, parseCharacterFile } from '#lib/storage/backup.ts';
	import { deleteCharacter, listCharacters, renameCharacter, saveCharacter } from '#lib/storage/characters.ts';

	let characters = $state<Character[]>([]);
	let loading = $state(true);
	let renamingId = $state<string | null>(null);
	let draftName = $state('');
	let confirmingDeleteId = $state<string | null>(null);
	let importInput = $state<HTMLInputElement>();
	let importErrors = $state<string[]>([]);
	let pendingImport = $state<Character | null>(null);
	let importMessage = $state('');

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

	function downloadCharacter(character: Character) {
		const blob = new Blob([exportCharacter(character)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = characterFileName(character);
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 0);
	}

	async function handleImport(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		importErrors = [];
		importMessage = '';
		pendingImport = null;
		if (!file) return;

		try {
			const result = parseCharacterFile(await file.text());
			if (!result.ok) {
				importErrors = result.errors;
				return;
			}

			if (characters.some((character) => character.id === result.character.id)) {
				pendingImport = result.character;
			} else {
				await finishImport(result.character);
			}
		} catch {
			importErrors = ['The selected file could not be read.'];
		}
	}

	async function finishImport(character: Character) {
		await saveCharacter(character);
		pendingImport = null;
		importMessage = `Imported ${character.name}.`;
		await loadCharacters();
	}

	function importAsCopy() {
		if (!pendingImport) return;
		void finishImport({ ...pendingImport, id: crypto.randomUUID(), name: `${pendingImport.name} (copy)` });
	}

	function replaceExisting() {
		if (pendingImport) void finishImport(pendingImport);
	}
</script>

<h1>CHARACTERS</h1>

<div class="roster-tools">
	<a href="/characters/new">+ NEW CHARACTER</a>
	<button type="button" onclick={() => importInput?.click()}>IMPORT</button>
	<input
		class="file-input"
		type="file"
		accept=".json,application/json"
		bind:this={importInput}
		onchange={(event) => void handleImport(event)}
	/>
</div>

{#if importErrors.length > 0}
	<Panel title="IMPORT FAILED">
		<p class="error-intro">The character was not imported:</p>
		<ul class="errors">
			{#each importErrors as error (error)}<li>{error}</li>{/each}
		</ul>
	</Panel>
{/if}

{#if pendingImport}
	<Panel title="DUPLICATE CHARACTER">
		<p><span class="label">{pendingImport.name}</span> already exists in this roster.</p>
		<div class="actions choice-actions">
			<button type="button" onclick={replaceExisting}>REPLACE EXISTING</button>
			<button type="button" onclick={importAsCopy}>IMPORT AS COPY</button>
			<button type="button" onclick={() => (pendingImport = null)}>CANCEL</button>
		</div>
	</Panel>
{/if}

{#if importMessage}<p class="import-success" role="status">{importMessage}</p>{/if}

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
						<button type="button" onclick={() => downloadCharacter(character)}>EXPORT</button>
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
	.roster-tools { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 0 0 1rem; }
	.roster-tools a, .open { display: inline-flex; align-items: center; min-height: 44px; border: 1px solid var(--red-dim); padding: 0.4rem 0.8rem; font-family: var(--f-label); font-size: 0.65rem; letter-spacing: 0.1em; }
	.roster-tools button { min-height: 44px; }
	.file-input { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
	.error-intro { margin-top: 0; color: var(--red-soft); }
	.errors { margin: 0; padding-left: 1.25rem; color: var(--label); }
	.import-success { color: var(--mint); margin: 0 0 1rem; }
	.roster { display: grid; gap: 0.75rem; }
	.character-row { border: 1px solid var(--frame-dim); padding: 0.75rem; }
	.identity h2, .identity p { margin: 0; }
	.identity input { width: 100%; min-height: 44px; margin-top: 0.25rem; }
	.actions { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin-top: 0.75rem; }
	.actions button { min-height: 44px; }
	.confirm { color: var(--red-soft); font-size: 0.85rem; }
	.danger { border-color: var(--red-dim); color: var(--red-soft); }
	.choice-actions { margin-top: 0.5rem; }

	@media (min-width: 560px) {
		.character-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
		.identity { min-width: 14rem; }
		.actions { justify-content: flex-end; margin-top: 0; }
	}
</style>
