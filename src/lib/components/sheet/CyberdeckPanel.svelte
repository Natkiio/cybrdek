<script lang="ts">
	import Panel from '#lib/components/Panel.svelte';
	import type { GearItem } from '#lib/rulesets/red/gear.ts';
	import type { InstalledCyberware } from '#lib/rulesets/red/cyberware.ts';
	import { DECK_TYPES, PROGRAMS, HARDWARE } from '#lib/rulesets/red/programs.ts';
	import { deckItems, newDeck, slotsOf, deckChangeProblem, isBodyweightSuit, type Cyberdeck } from '#lib/rulesets/red/cyberdeck.ts';
	let { gear, cyberware, onchange }: { gear: GearItem[]; cyberware: InstalledCyberware[]; onchange: (gear: GearItem[]) => void | Promise<void> } = $props();
	let selectedId = $state('');
	let attachId = $state('');
	let programId = $state(PROGRAMS[0].id);
	let hardwareId = $state<string>(HARDWARE[0].id);
	let busy = $state(false);
	let error = $state('');
	let confirming = $state('');
	const decks = $derived(deckItems(gear));
	const item = $derived(decks.find(g => g.id === selectedId) ?? decks[0]);
	const deck = $derived(item?.cyberdeck);
	const slots = $derived(item ? slotsOf(item, gear, cyberware) : null);
	const program = $derived(PROGRAMS.find(p => p.id === programId)!);
	const hardware = $derived(HARDWARE.find(h => h.id === hardwareId)!);
	const attachable = $derived(gear.filter(g => g?.kind === 'item' && !g.cyberdeck && (g.quantity ?? 1) === 1));
	const linkedElsewhere = (field: 'cyberwareId' | 'bodyweightSuitId', id: string) => decks.some(g => g.id !== item?.id && g.cyberdeck?.[field] === id);

	async function save(next: GearItem[]) {
		if (busy) return;
		busy = true; error = '';
		try { await onchange(next); }
		catch (e) { error = e instanceof Error ? e.message : 'Could not save the deck.'; }
		finally { busy = false; }
	}
	async function change(next: Cyberdeck) {
		if (!item || busy) return;
		const problem = deckChangeProblem(item, next, gear, cyberware);
		if (problem) { error = problem; return; }
		await save(gear.map(g => g.id === item.id ? { ...g, cyberdeck: next } : g));
	}
	async function selectChange(event: Event, field: 'quality' | 'cyberwareId' | 'bodyweightSuitId') {
		if (!deck || !item) return;
		const input = event.currentTarget as HTMLSelectElement;
		const id = item.id;
		await change({ ...deck, [field]: input.value || undefined });
		// A refused capacity change must also restore the native select's value.
		input.value = gear.find(g => g.id === id)?.cyberdeck?.[field] ?? '';
	}
	async function addDeck(existing?: string) {
		const id = existing || crypto.randomUUID();
		const next = existing ? gear.map(g => g.id === id ? { ...g, cyberdeck: newDeck() } : g)
			: [...gear, { id, kind: 'item' as const, name: 'Cyberdeck', quantity: 1, cyberdeck: newDeck() }];
		selectedId = id;
		await save(next);
	}
	function loadProgram() {
		if (deck) void change({ ...deck, programs: [...deck.programs, { id: crypto.randomUUID(), defId: programId, loaded: true }] });
	}
</script>

<Panel title="CYBERDECK">
	<p class="dim">Plan your loadout here. Loaded means installed on the deck; it does not mean running in the NET. Equipment costs are references, not automatic purchases.</p>
	<fieldset disabled={busy}>
		{#if decks.length}
			<label>Deck <select aria-label="Configured deck" value={item?.id} onchange={e => { selectedId = e.currentTarget.value; error = ''; confirming = ''; }}>
				{#each decks as g (g.id)}<option value={g.id}>{g.name}</option>{/each}
			</select></label>
		{/if}
		<div class="actions">
			<button type="button" onclick={() => addDeck()}>+ CYBERDECK</button>
			{#if attachable.length}
				<select aria-label="Existing gear for deck" bind:value={attachId}><option value="">Choose existing gear…</option>{#each attachable as g (g.id)}<option value={g.id}>{g.name}</option>{/each}</select>
				<button type="button" disabled={!attachId} onclick={() => addDeck(attachId)}>CONFIGURE AS DECK</button>
			{/if}
		</div>
		{#if item && deck && slots}
			<p class="capacity" role="status">{slots.programs} program slots + {slots.hardware} hardware slots used · {slots.free} shared slots free</p>
			<p class="dim">Capacity: {slots.shared} shared + {slots.hardwareOnly} hardware-only. A gear entry holds one configured deck.</p>
			{#if slots.overflow}<p class="error" role="alert">Over capacity by {slots.overflow}. Unload programs or remove hardware to repair this loadout.</p>{/if}
			{#each slots.warnings as warning}<p class="error">{warning}</p>{/each}
			<label>Deck quality <select aria-label="Deck quality" value={deck.quality} onchange={e => selectChange(e, 'quality')}>
				{#each DECK_TYPES as t}<option value={t.id}>{t.name} · {t.slots} slots · {t.cost} eb</option>{/each}
			</select></label>
			<label>Installed Cyberdeck link <select aria-label="Cyberdeck implant link" value={deck.cyberwareId ?? ''} onchange={e => selectChange(e, 'cyberwareId')}>
				<option value="">Not mounted in cyberware</option>
				{#if deck.cyberwareId && !cyberware.some(c => c.id === deck.cyberwareId)}<option value={deck.cyberwareId}>Missing implant</option>{/if}
				{#each cyberware.filter(c => c.defId === 'cyberdeck') as c (c.id)}<option value={c.id} disabled={linkedElsewhere('cyberwareId', c.id)}>Cyberdeck · {c.id.slice(0, 8)}</option>{/each}
			</select></label>
			<label>Worn Bodyweight Suit link <select aria-label="Bodyweight Suit link" value={deck.bodyweightSuitId ?? ''} onchange={e => selectChange(e, 'bodyweightSuitId')}>
				<option value="">No suit slot</option>
				{#if deck.bodyweightSuitId && !gear.some(g => g.id === deck.bodyweightSuitId)}<option value={deck.bodyweightSuitId}>Missing suit</option>{/if}
				{#each gear.filter(isBodyweightSuit) as g (g.id)}<option value={g.id} disabled={g.equipped === false || linkedElsewhere('bodyweightSuitId', g.id)}>{g.name}{g.equipped === false ? ' · not worn' : ''}</option>{/each}
			</select></label>
			<p class="dim">Links use equipment already on the sheet. Install cyberware in CYBERWARE &amp; HUMANITY; linking it here applies no Humanity loss.</p>
			<h3>HARDWARE</h3>
			<ul>{#each deck.hardware as copy (copy.id)}
				{@const def = HARDWARE.find(h => h.id === copy.defId)!}
				<li><span>{def.name} · {def.slots} slots</span><button type="button" aria-label={`Remove ${def.name}`} onclick={() => change({ ...deck!, hardware: deck!.hardware.filter(c => c.id !== copy.id) })}>REMOVE HARDWARE</button></li>
			{/each}</ul>
			<label>Hardware <select aria-label="Hardware to fit" bind:value={hardwareId}>{#each HARDWARE as h}<option value={h.id}>{h.name} · {h.slots} slots · {h.cost} eb</option>{/each}</select></label>
			<p class="dim">{hardware.summary}{#if 'numbers' in hardware} · {Object.entries(hardware.numbers).map(([key, value]) => `${key}: ${value}`).join(' · ')}{/if} · Core p. 208</p>
			<button type="button" onclick={() => change({ ...deck!, hardware: [...deck!.hardware, { id: crypto.randomUUID(), defId: hardwareId }] })}>FIT HARDWARE</button>
			<h3>PROGRAM COPIES</h3>
			<ul>{#each deck.programs as copy (copy.id)}
				{@const def = PROGRAMS.find(p => p.id === copy.defId)!}
				<li><span>{def.name} · {copy.loaded ? 'loaded' : 'unloaded'} · {def.slots} slot</span>
					<button type="button" aria-label={`${copy.loaded ? 'Unload' : 'Load'} ${def.name}`} onclick={() => change({ ...deck!, programs: deck!.programs.map(c => c.id === copy.id ? { ...c, loaded: !c.loaded } : c) })}>{copy.loaded ? 'UNLOAD' : 'LOAD'}</button>
					{#if confirming === copy.id}<button type="button" onclick={() => { confirming = ''; void change({ ...deck!, programs: deck!.programs.filter(c => c.id !== copy.id) }); }}>CONFIRM REMOVE</button><button type="button" onclick={() => confirming = ''}>KEEP</button>
					{:else}<button type="button" aria-label={`Remove copy of ${def.name}`} onclick={() => confirming = copy.id}>REMOVE COPY</button>{/if}
				</li>
			{/each}</ul>
			<label>Program <select aria-label="Program to add" bind:value={programId}>{#each ['Booster', 'Defender', 'Attacker'] as category}<optgroup label={category}>{#each PROGRAMS.filter(p => p.category === category) as p}<option value={p.id}>{p.name} · {p.cost} eb</option>{/each}</optgroup>{/each}</select></label>
			<p>{program.category}{program.target ? ` · ${program.target} target` : ''} · ATK {program.atk} · DEF {program.def} · REZ {program.rez} · {program.slots} slot</p>
			<p class="dim">{program.summary} · Core p. {program.page}</p>
			{#if Object.keys(program.numbers).length}<p class="dim">{Object.entries(program.numbers).map(([key, value]) => `${key}: ${value}`).join(' · ')}</p>{/if}
			<div class="actions"><button type="button" onclick={loadProgram}>ADD &amp; LOAD COPY</button><button type="button" onclick={() => change({ ...deck!, programs: [...deck!.programs, { id: crypto.randomUUID(), defId: programId, loaded: false }] })}>ADD UNLOADED COPY</button></div>
		{/if}
	</fieldset>
	{#if error}<p class="error" role="alert">{error}</p>{/if}
</Panel>

<style>
	fieldset { border: 0; padding: 0; margin: 0; min-width: 0; display: grid; gap: 0.6rem; }
	label { display: grid; gap: 0.3rem; }
	select { min-width: 0; width: 100%; }
	button, select { min-height: 44px; }
	ul { list-style: none; padding: 0; margin: 0; }
	li, .actions { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; }
	li { margin-bottom: 0.5rem; overflow-wrap: anywhere; }
	.dim { color: var(--muted); }
	.error { color: var(--red-soft); }
	.capacity { color: var(--mint); }
	h3 { color: var(--label); font-size: 0.85rem; }
</style>
