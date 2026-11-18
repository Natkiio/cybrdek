<script lang="ts">
	// A campaign's maps (#62). The GM uploads, renames, chooses the one players
	// see, deletes, and decides whether players may upload too. A player who's
	// allowed adds maps and removes their own while they aren't shown. The
	// database refuses anything else, whatever this panel shows.
	import Panel from '#lib/components/Panel.svelte';
	import {
		MAX_MAPS,
		prepareImage,
		removeMap,
		renameMap,
		setActiveMap,
		setPlayersUploadMaps,
		uploadMap,
		validMapName,
		type CampaignMap
	} from '#lib/map/campaign-maps.ts';

	let {
		campaignId,
		maps,
		onchange,
		isGm,
		userId,
		canUpload,
		playersUpload
	}: {
		campaignId: string;
		maps: CampaignMap[];
		onchange: () => void;
		isGm: boolean;
		userId: string | null;
		canUpload: boolean;
		playersUpload: boolean | null; // the GM's setting; null if unknown
	} = $props();

	const mine = (map: CampaignMap) => !!userId && map.uploaded_by === userId;
	// A player may remove their own map only until the GM first shows it.
	const removable = (map: CampaignMap) => mine(map) && !map.adopted && !map.active;

	let name = $state('');
	let file = $state<File | null>(null);
	let fileInput = $state<HTMLInputElement>();
	let status = $state('');
	let error = $state('');
	let busy = $state(false);
	let renaming = $state<string | null>(null);
	let newName = $state('');
	let confirmDelete = $state<string | null>(null);

	async function run(task: () => Promise<string | null>) {
		busy = true;
		error = '';
		const problem = await task();
		busy = false;
		status = '';
		if (problem) error = problem;
		else onchange();
	}

	function upload(event: SubmitEvent) {
		event.preventDefault();
		const chosen = file;
		const mapName = name;
		const problem = validMapName(mapName) ?? (chosen ? null : 'Choose an image.');
		if (problem || !chosen) {
			error = problem ?? '';
			return;
		}
		void run(async () => {
			status = 'SHRINKING THE IMAGE…';
			let prepared;
			try {
				prepared = await prepareImage(chosen);
			} catch (e) {
				return e instanceof Error ? e.message : String(e);
			}
			status = 'UPLOADING…';
			const result = await uploadMap(campaignId, mapName, prepared);
			if ('error' in result) return result.error;
			// The first map is the one players see, so the GM needn't do it by hand.
			if (isGm && !maps.some((m) => m.active)) await setActiveMap(campaignId, result.id);
			name = '';
			file = null;
			if (fileInput) fileInput.value = '';
			return null;
		});
	}
</script>

<Panel title="MAPS">
	{#if isGm && playersUpload !== null}
		<div class="setting">
			<span>PLAYERS CAN UPLOAD MAPS: <strong>{playersUpload ? 'YES' : 'NO'}</strong></span>
			<button
				type="button"
				aria-pressed={playersUpload}
				disabled={busy}
				onclick={() => run(() => setPlayersUploadMaps(campaignId, !playersUpload))}
			>
				{playersUpload ? 'TURN OFF' : 'LET PLAYERS UPLOAD'}
			</button>
		</div>
		<p class="dim small">Their maps join this list. Only you choose which one the table sees.</p>
	{/if}

	{#if maps.length}
		<ul>
			{#each maps as map (map.id)}
				<li>
					{#if renaming === map.id}
						<form
							class="rename"
							onsubmit={(event) => {
								event.preventDefault();
								void run(async () => {
									const problem = await renameMap(map.id, newName);
									if (!problem) renaming = null;
									return problem;
								});
							}}
						>
							<input aria-label="New name for {map.name}" maxlength="80" bind:value={newName} disabled={busy} />
							<button type="submit" disabled={busy}>SAVE</button>
							<button type="button" disabled={busy} onclick={() => (renaming = null)}>CANCEL</button>
						</form>
					{:else}
						<span class="name"
							>{map.name}{#if map.active}<span class="tag">SHOWN TO PLAYERS</span>{/if}{#if isGm && map.uploaded_by && map.uploaded_by !== userId}<span
									class="tag dimtag">FROM A PLAYER</span
								>{:else if !isGm && mine(map)}<span class="tag dimtag">YOURS</span>{/if}</span
						>
						<span class="dim">{map.width} × {map.height}</span>
						{#if isGm || removable(map)}
						<span class="actions">
							{#if isGm && !map.active}
								<button type="button" disabled={busy} onclick={() => run(() => setActiveMap(campaignId, map.id))}>SHOW THIS ONE</button>
							{/if}
							{#if isGm}
								<button type="button" disabled={busy} onclick={() => ((renaming = map.id), (newName = map.name))}>RENAME</button>
							{/if}
							{#if confirmDelete === map.id}
								<button
									type="button"
									class="danger"
									disabled={busy}
									onclick={() => run(async () => ((confirmDelete = null), await removeMap(campaignId, map.id)))}
								>
									YES, DELETE IT AND ITS PINS
								</button>
								<button type="button" disabled={busy} onclick={() => (confirmDelete = null)}>KEEP</button>
							{:else}
								<button type="button" disabled={busy} onclick={() => (confirmDelete = map.id)}>DELETE</button>
							{/if}
						</span>
						{/if}
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<p class="dim">
			{isGm ? "No maps yet. Upload one below; players see it once it's added." : 'No maps yet. Upload one below; the GM chooses which map the table sees.'}
		</p>
	{/if}

	{#if !canUpload}
		<!-- nothing to add: a player whose GM hasn't allowed uploads -->
	{:else if maps.length < MAX_MAPS}
		<form class="upload" onsubmit={upload}>
			<input aria-label="Map name" placeholder="Map name, e.g. The Docks" maxlength="80" bind:value={name} disabled={busy} />
			<input
				type="file"
				accept="image/*"
				aria-label="Map image"
				bind:this={fileInput}
				onchange={(event) => (file = event.currentTarget.files?.[0] ?? null)}
				disabled={busy}
			/>
			<button type="submit" disabled={busy}>UPLOAD MAP</button>
		</form>
		<p class="dim small">Big images are shrunk on this device first. Up to {MAX_MAPS} maps per campaign.</p>
	{:else}
		<p class="dim">
			This campaign has {MAX_MAPS} maps, the most it can have. {isGm ? 'Delete one to add another.' : 'Ask the GM to delete one first.'}
		</p>
	{/if}
	{#if status}<p class="ok" role="status">{status}</p>{/if}
	{#if error}<p class="error" role="alert">{error}</p>{/if}
</Panel>

<style>
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.6rem;
	}

	li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.3rem 0.75rem;
	}

	.name {
		color: var(--value);
	}

	.tag {
		margin-left: 0.5rem;
		color: var(--bright);
		font-size: 0.75rem;
	}

	.dimtag {
		color: var(--muted);
	}

	.setting {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.4rem 0.75rem;
	}

	.setting strong {
		color: var(--bright);
	}

	.actions,
	.rename {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.upload {
		display: grid;
		gap: 0.4rem;
		margin-top: 0.75rem;
	}

	input {
		min-width: 0;
	}

	button,
	input {
		min-height: 44px;
	}

	.danger {
		color: var(--red-soft);
		border-color: var(--red-soft);
	}

	.dim {
		color: var(--muted);
	}

	.small {
		font-size: 0.8rem;
	}

	.ok {
		color: var(--bright);
	}

	.error {
		color: var(--red-soft);
	}
</style>
