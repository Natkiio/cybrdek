<script lang="ts">
	import Panel from '#lib/components/Panel.svelte';
	import type { GearItem } from '#lib/rulesets/red/gear.ts';
	import type { InstalledCyberware } from '#lib/rulesets/red/cyberware.ts';
	import { DECK_TYPES, PROGRAMS, HARDWARE, DECK_INSTALL_HOURS } from '#lib/rulesets/red/programs.ts';
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
		if (busy) return;
		if (existing && !attachable.some(g => g.id === existing)) {
			attachId = ''; error = 'Choose an unconfigured gear item.'; return;
		}
		if (existing) attachId = '';
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

<!-- The deck you have first (#101): its slots, programs and hardware; then
     adding to it; its settings and other decks fold away below. -->
<Panel title="CYBERDECK">
	<p class="dim small">
		Loaded means installed on the deck, not running in the NET. Installing or removing a program or hardware takes
		{DECK_INSTALL_HOURS} hour (Core pp. 201, 208).
	</p>
	<fieldset disabled={busy}>
		{#if decks.length > 1}
			<label>Deck <select aria-label="Configured deck" value={item?.id} onchange={e => { selectedId = e.currentTarget.value; error = ''; confirming = ''; }}>
				{#each decks as g (g.id)}<option value={g.id}>{g.name}</option>{/each}
			</select></label>
		{/if}

		{#if item && deck && slots}
			{@const quality = DECK_TYPES.find(t => t.id === deck.quality)}
			<div class="deck-head">
				<strong>{item.name}</strong>
				<span class="dim small">{quality?.name ?? deck.quality}</span>
			</div>
			<!-- One box per shared slot: filled ones are in use. -->
			<div class="meter" aria-hidden="true">
				{#each Array.from({ length: Math.max(slots.shared, slots.shared - slots.free) }, (_, i) => i) as i (i)}
					<span class="slot" class:used={i < slots.shared - slots.free} class:over={i >= slots.shared}></span>
				{/each}
			</div>
			<p class="capacity" role="status">{slots.programs} program slots + {slots.hardware} hardware slots used · {slots.free} shared slots free</p>
			{#if slots.overflow}<p class="error" role="alert">Over capacity by {slots.overflow}. Unload programs or remove hardware to repair this loadout.</p>{/if}
			{#each slots.warnings as warning}<p class="error">{warning}</p>{/each}

			<h3>PROGRAMS</h3>
			{#if deck.programs.length}
				<ul class="copies">{#each deck.programs as copy (copy.id)}
					{@const def = PROGRAMS.find(p => p.id === copy.defId)!}
					<li>
						<span class="what"><span class="name">{def.name}</span> <span class="dim small">{def.category} · {def.slots} slot</span></span>
						<span class="state" class:on={copy.loaded}>{copy.loaded ? 'LOADED' : 'UNLOADED'}</span>
						<button type="button" class="toggle" aria-label={`${copy.loaded ? 'Unload' : 'Load'} ${def.name}`} onclick={() => change({ ...deck!, programs: deck!.programs.map(c => c.id === copy.id ? { ...c, loaded: !c.loaded } : c) })}>{copy.loaded ? 'UNLOAD' : 'LOAD'}</button>
						{#if confirming === copy.id}
							<span class="confirm">
								<button type="button" class="danger" onclick={() => { confirming = ''; void change({ ...deck!, programs: deck!.programs.filter(c => c.id !== copy.id) }); }}>CONFIRM REMOVE</button>
								<button type="button" onclick={() => confirming = ''}>KEEP</button>
							</span>
						{:else}
							<button type="button" class="remove" aria-label={`Remove copy of ${def.name}`} title="Remove this copy" onclick={() => confirming = copy.id}>×</button>
						{/if}
					</li>
				{/each}</ul>
			{:else}
				<p class="dim small">No programs yet. Add one below.</p>
			{/if}
			<div class="add">
				<label>Add a program <select aria-label="Program to add" bind:value={programId}>{#each ['Booster', 'Defender', 'Attacker'] as category}<optgroup label={category}>{#each PROGRAMS.filter(p => p.category === category) as p}<option value={p.id}>{p.name} · {p.cost} eb</option>{/each}</optgroup>{/each}</select></label>
				<p class="small">{program.category}{program.target ? ` · ${program.target} target` : ''} · ATK {program.atk} · DEF {program.def} · REZ {program.rez} · {program.slots} slot</p>
				<p class="dim small">{program.summary} · Core p. {program.page}{#if Object.keys(program.numbers).length} · {Object.entries(program.numbers).map(([key, value]) => `${key}: ${value}`).join(' · ')}{/if}</p>
				<div class="actions"><button type="button" onclick={loadProgram}>ADD &amp; LOAD COPY</button><button type="button" onclick={() => change({ ...deck!, programs: [...deck!.programs, { id: crypto.randomUUID(), defId: programId, loaded: false }] })}>ADD UNLOADED COPY</button></div>
			</div>

			<h3>HARDWARE</h3>
			{#if deck.hardware.length}
				<ul class="copies">{#each deck.hardware as copy (copy.id)}
					{@const def = HARDWARE.find(h => h.id === copy.defId)!}
					<li>
						<span class="what"><span class="name">{def.name}</span> <span class="dim small">{def.slots} {def.slots === 1 ? 'slot' : 'slots'}</span></span>
						<button type="button" class="remove" aria-label={`Remove ${def.name}`} title="Remove this hardware" onclick={() => change({ ...deck!, hardware: deck!.hardware.filter(c => c.id !== copy.id) })}>×</button>
					</li>
				{/each}</ul>
			{:else}
				<p class="dim small">No hardware fitted.</p>
			{/if}
			<div class="add">
				<label>Fit hardware <select aria-label="Hardware to fit" bind:value={hardwareId}>{#each HARDWARE as h}<option value={h.id}>{h.name} · {h.slots} slots · {h.cost} eb</option>{/each}</select></label>
				<p class="dim small">{hardware.summary}{#if 'numbers' in hardware} · {Object.entries(hardware.numbers).map(([key, value]) => `${key}: ${value}`).join(' · ')}{/if} · Core p. 208</p>
				<div class="actions"><button type="button" onclick={() => change({ ...deck!, hardware: [...deck!.hardware, { id: crypto.randomUUID(), defId: hardwareId }] })}>FIT HARDWARE</button></div>
			</div>

			<details class="more">
				<summary>DECK SETTINGS</summary>
				<label>Deck quality <select aria-label="Deck quality" value={deck.quality} onchange={e => selectChange(e, 'quality')}>
					{#each DECK_TYPES as t}<option value={t.id}>{t.name} · {t.slots} slots · {t.cost} eb</option>{/each}
				</select></label>
				<p class="dim small">Capacity: {slots.shared} shared + {slots.hardwareOnly} hardware-only. A gear entry holds one configured deck. Equipment costs are references, not automatic purchases.</p>
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
				<p class="dim small">Links use equipment already on the sheet. Install cyberware in CYBERWARE &amp; HUMANITY; linking it here applies no Humanity loss.</p>
			</details>
		{/if}

		{#if decks.length}
			<details class="more">
				<summary>ADD ANOTHER DECK</summary>
				{@render newDeckControls()}
			</details>
		{:else}
			<p class="dim">No cyberdeck yet.</p>
			{@render newDeckControls()}
		{/if}
	</fieldset>
	{#if error}<p class="error" role="alert">{error}</p>{/if}
</Panel>

{#snippet newDeckControls()}
	<div class="actions">
		<button type="button" onclick={() => addDeck()}>+ CYBERDECK</button>
		{#if attachable.length}
			<select aria-label="Existing gear for deck" bind:value={attachId}><option value="">Choose existing gear…</option>{#each attachable as g (g.id)}<option value={g.id}>{g.name}</option>{/each}</select>
			<button type="button" disabled={!attachId} onclick={() => addDeck(attachId)}>CONFIGURE AS DECK</button>
		{/if}
	</div>
{/snippet}

<style>
	fieldset { border: 0; padding: 0; margin: 0; min-width: 0; display: grid; gap: 0.6rem; }
	label { display: grid; gap: 0.3rem; }
	select { min-width: 0; width: 100%; }
	button, select { min-height: 44px; }
	p { margin: 0; }
	ul { list-style: none; padding: 0; margin: 0; }
	.actions { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; }
	.dim { color: var(--muted); }
	.small { font-size: 0.8rem; }
	.error { color: var(--red-soft); }
	.capacity { color: var(--bright); font-size: 0.85rem; }
	h3 { color: var(--label); font-size: 0.8rem; letter-spacing: 0.12em; margin: 0.6rem 0 0; }

	.deck-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.4rem 0.75rem; }
	.deck-head strong { color: var(--bright); font-weight: normal; overflow-wrap: anywhere; }

	/* Slot meter: one box per shared slot. */
	.meter { display: flex; flex-wrap: wrap; gap: 4px; }
	.slot { width: 18px; height: 18px; border: 1px solid var(--frame-dim); }
	.slot.used { background: var(--bright); border-color: var(--bright); }
	.slot.over { background: var(--red); border-color: var(--red); }

	/* A copy: what it is, its state, a reversible toggle; removal sits apart. */
	.copies { display: grid; gap: 0.35rem; }
	.copies li { display: grid; grid-template-columns: minmax(0, 1fr) auto auto auto; align-items: center; gap: 0.4rem; border: 1px solid var(--frame-dim); background: var(--bg-2); padding: 0.25rem 0.25rem 0.25rem 0.6rem; overflow-wrap: anywhere; }
	.copies li:has(.confirm) { grid-template-columns: minmax(0, 1fr) auto auto; }
	.copies .confirm { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 0.4rem; justify-content: flex-end; }
	.what { min-width: 0; }
	.name { color: var(--value); }
	.state { font-family: var(--f-label); font-size: 0.5rem; letter-spacing: 0.12em; color: var(--muted); }
	.state.on { color: var(--bright); }
	.toggle { min-width: 5.5rem; }
	.remove { min-width: 44px; padding: 0; margin-left: 0.4rem; color: var(--red-soft); border-color: var(--red-dim); background: transparent; font-size: 1.1rem; }
	.danger { color: var(--red-soft); border-color: var(--red-dim); }

	.add { display: grid; gap: 0.4rem; padding: 0.5rem 0 0.25rem; border-top: 1px dashed var(--frame-dim); }

	.more { border-top: 1px solid var(--frame-dim); padding-top: 0.25rem; }
	.more > summary { cursor: pointer; min-height: 44px; display: flex; align-items: center; font-family: var(--f-label); font-size: 0.6rem; letter-spacing: 0.12em; color: var(--label); }
	.more[open] { display: grid; gap: 0.6rem; padding-bottom: 0.5rem; }
</style>
