<script lang="ts">
	import Panel from '#lib/components/Panel.svelte';
	import type { Character } from '#lib/engine/types.ts';
	import { listVersions, type CharacterVersion } from '#lib/sync/history.ts';

	let { id, onrestore }: { id: string; onrestore: (character: Character) => void } = $props();

	let versions = $state.raw<CharacterVersion[] | null>(null);
	let error = $state('');
	let confirming = $state<number | null>(null);

	async function load() {
		error = '';
		const result = await listVersions(id);
		if ('error' in result) error = result.error;
		else versions = result;
	}
</script>

<Panel title="PAST VERSIONS">
	{#if versions === null}
		<p class="dim">If an edit gets overwritten, you can bring back an earlier save.</p>
		<button type="button" onclick={load}>SHOW PAST VERSIONS</button>
	{:else if versions.length === 0}
		<p class="dim">No earlier saves yet.</p>
	{:else}
		<ul>
			{#each versions as version (version.versionId)}
				<li>
					<span>{new Date(version.savedAt).toLocaleString()}: {version.character.name}</span>
					{#if confirming === version.versionId}
						<button type="button" class="go" onclick={() => onrestore(version.character)}>CONFIRM RESTORE</button>
					{:else}
						<button type="button" onclick={() => (confirming = version.versionId)}>RESTORE</button>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
	{#if error}<p class="error" role="alert">{error}</p>{/if}
</Panel>

<style>
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.5rem;
	}

	li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	button {
		min-height: 44px;
	}

	.go {
		color: var(--mint);
		border-color: var(--mint-dim);
	}

	.dim {
		color: var(--muted);
	}

	.error {
		color: var(--red-soft);
	}
</style>
