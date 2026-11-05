<script lang="ts">
	import Panel from '#lib/components/Panel.svelte';
	import { rollDie } from '#lib/engine/dice.ts';
	import {
		CYBERWARE,
		CYBERWARE_CATEGORY_LABELS,
		cyberwareDef,
		effectiveEmp,
		HL_DICE_LABELS,
		installProblem,
		maxHumanity,
		possibleHosts,
		psychosisLevel,
		PSYCHOSIS_LABELS,
		regainHumanity,
		removeProblem,
		rollHumanityLoss,
		slotsUsedBy,
		freeSlots,
		type CyberwareCategory,
		type InstalledCyberware
	} from '#lib/rulesets/red/cyberware.ts';

	let {
		installed,
		humanity,
		baseEmp,
		onchange
	}: {
		installed: InstalledCyberware[];
		humanity: number;
		baseEmp: number;
		onchange: (change: { cyberware?: InstalledCyberware[]; humanity: number }) => void;
	} = $props();

	const d6 = () => rollDie(6);
	const categories = Object.keys(CYBERWARE_CATEGORY_LABELS) as CyberwareCategory[];

	let category = $state<CyberwareCategory>('neuralware');
	let defId = $state('');
	let hostA = $state('');
	let hostB = $state('');
	let losses = $state<(number | null)[]>([null, null]);
	let message = $state('');
	let confirmingRemove = $state<string | null>(null);

	const def = $derived(cyberwareDef(defId));
	const items = $derived(CYBERWARE.filter((d) => d.category === category));
	const pieces = $derived(def?.paired ? 2 : 1); // paired options are fitted, and paid for, twice
	const hosts = $derived(def ? possibleHosts(installed, def) : []);
	const hostIds = $derived(def?.paired ? [hostA, hostB].filter(Boolean) : hostA ? [hostA] : []);
	const problem = $derived(def ? installProblem(installed, def, hostIds) : null);
	const lossesFor = $derived(losses.slice(0, pieces));
	const lossesValid = $derived(lossesFor.every((n) => n !== null && Number.isInteger(n) && n >= 0));

	const maximum = $derived(maxHumanity(baseEmp, installed));
	const emp = $derived(effectiveEmp(baseEmp, humanity));
	const level = $derived(psychosisLevel(emp, humanity));

	const nameOf = (piece: InstalledCyberware) => {
		const same = installed.filter((i) => i.defId === piece.defId);
		const name = cyberwareDef(piece.defId)?.name ?? piece.defId;
		return same.length > 1 ? `${name} ${same.indexOf(piece) + 1}` : name;
	};
	const top = $derived(installed.filter((i) => !i.hostId));
	const inside = (host: InstalledCyberware) => installed.filter((i) => i.hostId === host.id);

	function pick() {
		hostA = hostB = '';
		const preset = def?.hl ?? null;
		losses = [preset, preset];
		message = '';
	}

	function roll() {
		if (!def) return;
		losses = [rollHumanityLoss(def.hlDice, d6), rollHumanityLoss(def.hlDice, d6)];
	}

	function install() {
		if (!def || problem || !lossesValid) return;
		const fitted = Array.from({ length: pieces }, (_, i): InstalledCyberware => ({
			id: crypto.randomUUID(),
			defId: def.id,
			hostId: hostIds[i],
			hl: lossesFor[i] as number
		}));
		const lost = fitted.reduce((n, p) => n + p.hl, 0);
		onchange({ cyberware: [...installed, ...fitted], humanity: humanity - lost });
		message = `${def.name} installed. −${lost} Humanity.`;
		defId = '';
		pick();
	}

	function remove(piece: InstalledCyberware) {
		const blocked = removeProblem(installed, piece);
		if (blocked) {
			message = blocked;
			confirmingRemove = null;
			return;
		}
		onchange({ cyberware: installed.filter((i) => i.id !== piece.id), humanity });
		message = `${nameOf(piece)} removed. Humanity comes back through therapy, up to the new maximum.`;
		confirmingRemove = null;
	}

	function therapy(dice: 2 | 4) {
		const rolled = Array.from({ length: dice }, d6).reduce((a, b) => a + b, 0);
		const next = regainHumanity(humanity, rolled, maximum);
		onchange({ humanity: next });
		message = `Therapy: rolled ${rolled}, regained ${next - humanity} Humanity.`;
	}
</script>

{#snippet row(piece: InstalledCyberware, nested: boolean)}
	<li class:nested>
		<span class="name">{nameOf(piece)}</span>
		{#if cyberwareDef(piece.defId)?.holds}<span class="dim small">{freeSlots(installed, piece)} free</span>{/if}
		<span class="dim small">−{piece.hl}</span>
		{#if confirmingRemove === piece.id}
			<button type="button" class="danger" onclick={() => remove(piece)}>CONFIRM</button>
		{:else}
			<button type="button" aria-label="Remove {nameOf(piece)}" onclick={() => (confirmingRemove = piece.id)}>×</button>
		{/if}
	</li>
{/snippet}

<Panel title="CYBERWARE & HUMANITY">
	<div class="humanity">
		<span class="value" class:low={level !== 'stable'}>{humanity}</span>
		<span class="dim">/ {maximum} Humanity · EMP {emp}{emp !== baseEmp ? ` (from ${baseEmp})` : ''}</span>
	</div>
	{#if level !== 'stable'}<p class="warn" role="status">{PSYCHOSIS_LABELS[level]}</p>{/if}

	{#if top.length}
		<ul class="installed" aria-label="Installed cyberware">
			{#each top as piece (piece.id)}
				{@render row(piece, false)}
				{#each inside(piece) as option (option.id)}
					{@render row(option, true)}
					{#each inside(option) as chip (chip.id)}{@render row(chip, true)}{/each}
				{/each}
			{/each}
		</ul>
	{:else}
		<p class="dim">No cyberware installed. Still all meat, choom.</p>
	{/if}

	<h3>INSTALL</h3>
	<div class="grid">
		<label><span>TYPE</span>
			<select aria-label="Cyberware type" bind:value={category} onchange={() => { defId = ''; pick(); }}>
				{#each categories as c (c)}<option value={c}>{CYBERWARE_CATEGORY_LABELS[c]}</option>{/each}
			</select>
		</label>
		<label><span>CYBERWARE</span>
			<select aria-label="Cyberware to install" bind:value={defId} onchange={pick}>
				<option value="">Choose…</option>
				{#each items as d (d.id)}<option value={d.id}>{d.name}</option>{/each}
			</select>
		</label>
	</div>

	{#if def}
		<p class="dim small">
			{def.install === 'N/A' ? 'Chip' : `${def.install} install`} · {def.cost.toLocaleString('en-IE')}eb · HL {def.hl}{def.hlDice !== 'none' ? ` (${HL_DICE_LABELS[def.hlDice]})` : ''}
			{#if def.hosts}· {slotsUsedBy(def)} {slotsUsedBy(def) === 1 ? 'slot' : 'slots'}{/if}
			{#if def.paired}· paired: fitted and paid for twice{/if}
		</p>

		{#if def.hosts && hosts.length}
			<div class="grid">
				<label><span>{def.paired ? 'FIRST' : 'INSTALL IN'}</span>
					<select aria-label={def.paired ? 'First host' : 'Install in'} bind:value={hostA}>
						<option value="">{def.meatLimb ? 'Meat limb' : 'Choose…'}</option>
						{#each hosts as h (h.id)}<option value={h.id}>{nameOf(h)}</option>{/each}
					</select>
				</label>
				{#if def.paired}
					<label><span>SECOND</span>
						<select aria-label="Second host" bind:value={hostB}>
							<option value="">Choose…</option>
							{#each hosts as h (h.id)}<option value={h.id}>{nameOf(h)}</option>{/each}
						</select>
					</label>
				{/if}
			</div>
		{/if}

		<div class="loss">
			{#each lossesFor as _, i (i)}
				<label><span>HUMANITY LOSS{pieces > 1 ? ` ${i + 1}` : ''}</span>
					<input type="number" inputmode="numeric" min="0" bind:value={losses[i]} />
				</label>
			{/each}
			{#if def.hlDice !== 'none'}
				<button type="button" onclick={roll}>ROLL {HL_DICE_LABELS[def.hlDice]}</button>
			{/if}
		</div>
		<p class="dim small">The preset is for character creation. After that, roll.</p>
		{#if problem}<p class="warn small">{problem}</p>{/if}
		<button type="button" class="install" disabled={Boolean(problem) || !lossesValid} onclick={install}>INSTALL</button>
	{/if}

	<h3>THERAPY</h3>
	<div class="therapy">
		<button type="button" disabled={humanity >= maximum} onclick={() => therapy(2)}>STANDARD · 2d6</button>
		<button type="button" disabled={humanity >= maximum} onclick={() => therapy(4)}>EXTREME · 4d6</button>
	</div>

	{#if message}<p class="message" aria-live="polite">{message}</p>{/if}
</Panel>

<style>
	.humanity {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.5rem;
	}

	.value {
		font-size: 2.2rem;
		line-height: 1;
		color: var(--mint);
		text-shadow: 0 0 12px var(--mint-glow);
	}

	.value.low {
		color: var(--red);
		text-shadow: 0 0 12px var(--red-glow);
	}

	h3 {
		margin: 1rem 0 0.4rem;
		font-family: var(--f-label);
		font-size: 0.6rem;
		letter-spacing: 0.12em;
		color: var(--label);
	}

	.installed {
		list-style: none;
		margin: 0.75rem 0 0;
		padding: 0;
		display: grid;
		gap: 0.25rem;
	}

	.installed li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto auto;
		align-items: center;
		gap: 0.5rem;
		padding: 0.1rem 0;
	}

	.installed li.nested {
		padding-left: 1rem;
	}

	.installed .name {
		color: var(--value);
		overflow-wrap: anywhere;
	}

	.installed button {
		min-width: 44px;
		min-height: 36px;
		padding: 0 0.4rem;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.loss {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
		align-items: end;
		gap: 0.5rem;
	}

	label {
		display: grid;
		gap: 0.3rem;
	}

	label span {
		font-family: var(--f-label);
		font-size: 0.55rem;
		letter-spacing: 0.12em;
		color: var(--label);
	}

	select,
	input {
		width: 100%;
		min-width: 0;
	}

	select,
	input,
	.loss button,
	.install,
	.therapy button {
		min-height: 44px;
	}

	.install {
		color: var(--mint);
		border-color: var(--mint-dim);
	}

	.therapy {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.danger {
		color: var(--red-soft);
		border-color: var(--red-dim);
	}

	.dim {
		color: var(--muted);
	}

	.small {
		font-size: 0.8rem;
	}

	.warn {
		color: var(--red-soft);
		margin: 0.5rem 0;
	}

	.message {
		color: var(--mint);
		margin: 0.75rem 0 0;
	}
</style>
