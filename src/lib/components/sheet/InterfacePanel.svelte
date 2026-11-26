<script lang="ts">
	// A Netrunner's Interface (#100, part 3): NET Actions per Turn and a button
	// per ability. Each rolls Interface + 1d10 into the shared roll log. Boosters
	// count only while running, which you mark here. It's saved with the run
	// (see NetRunPanel), and jacking out clears it.
	import { PROGRAMS } from '#lib/rulesets/red/programs.ts';
	import { abilityRoll, boosterBonus, INTERFACE_ABILITIES, netActions, type InterfaceAbility } from '#lib/rulesets/red/interface.ts';

	let {
		rank,
		boosters,
		running,
		actionsLeft = null,
		onrunning,
		onuse,
		oncheck,
		ondamage
	}: {
		rank: number;
		boosters: string[]; // loaded Booster program ids
		running: readonly string[]; // the ones marked running
		actionsLeft?: number | null; // NET Actions left this Turn while jacked in, else null
		onrunning: (next: string[]) => void; // switching a Booster on or off is a NET Action
		onuse?: (abilityId: string) => void; // when set, rolls go through here so the sheet can count NET Actions
		oncheck: (label: string, base: number) => void;
		ondamage: (label: string, count: number, sides: number) => void;
	} = $props();

	const runningSet = $derived(new Set(running));
	const nameOf = (id: string) => PROGRAMS.find((p) => p.id === id)?.name ?? id;
	const bonus = (a: InterfaceAbility) => boosterBonus(a, runningSet);
	const toggle = (id: string, on: boolean) => onrunning(on ? [...running.filter((r) => r !== id), id] : running.filter((r) => r !== id));
	const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

	function use(a: InterfaceAbility) {
		if (onuse) return onuse(a.id);
		const roll = abilityRoll(a.id, rank, runningSet);
		oncheck(roll.label, roll.base);
	}
	const out = $derived(actionsLeft === 0); // jacked in with nothing left this Turn
</script>

<p class="actions-line">
	<span>INTERFACE <strong>{rank}</strong></span>
	<span><strong>{netActions(rank)}</strong> NET ACTIONS PER TURN</span>
</p>
{#if actionsLeft !== null}
	<p class="left" class:none={out} aria-live="polite">
		{out ? 'No NET Actions left this Turn. End your Turn in IN THE NET.' : `${actionsLeft} NET ${actionsLeft === 1 ? 'Action' : 'Actions'} left this Turn`}
	</p>
{/if}
<p class="dim small">Roll Interface + 1d10. Moving and saving a copy of a File are free (Core pp. 197–198).</p>

{#if boosters.length}
	<fieldset class="boosters">
		<legend>BOOSTERS RUNNING</legend>
		{#each boosters as id (id)}
			<label>
				<input type="checkbox" checked={runningSet.has(id)} disabled={out} onchange={(e) => toggle(id, e.currentTarget.checked)} />
				{nameOf(id)}
			</label>
		{/each}
	</fieldset>
{/if}

<ul>
	{#each INTERFACE_ABILITIES as a (a.id)}
		<li>
			<button type="button" onclick={() => use(a)} aria-label="Roll {a.name}" disabled={out && !a.meatAction}>
				<span class="name">{a.name}</span>
				<span class="num">{signed(rank + bonus(a))}</span>
			</button>
			<div class="about">
				<span>{a.summary}</span>
				<span class="dim small">vs {a.against}{a.meatAction ? ' · Meat Action' : ' · 1 NET Action'}</span>
			</div>
			{#if a.damage}
				<button type="button" class="dmg" onclick={() => ondamage(`${a.name}: damage`, a.damage!.count, a.damage!.sides)}>
					{a.damage.count}d{a.damage.sides} DMG
				</button>
			{/if}
		</li>
	{/each}
</ul>

<style>
	.actions-line {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 0.25rem 1rem;
		margin: 0;
		overflow-wrap: anywhere;
	}

	strong {
		color: var(--bright);
	}

	.left {
		margin: 0.25rem 0 0;
		color: var(--bright);
	}

	.left.none {
		color: var(--red);
	}

	.boosters {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1rem;
		border: 1px solid var(--frame-dim);
		margin: 0.5rem 0;
		min-width: 0; /* fieldsets don't shrink to the panel by default */
		padding: 0.4rem 0.6rem;
	}

	.boosters legend {
		color: var(--muted);
		font-size: 0.75rem;
	}

	.boosters label {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		min-height: 44px;
	}

	ul {
		list-style: none;
		margin: 0.5rem 0 0;
		padding: 0;
		display: grid;
		gap: 0.4rem;
	}

	li {
		display: grid;
		grid-template-columns: 9rem minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.6rem;
	}

	li button {
		min-height: 44px;
	}

	li > button:first-child {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.num {
		color: var(--bright);
	}

	.about {
		display: grid;
		gap: 0.1rem;
		min-width: 0;
	}

	.dim {
		color: var(--muted);
	}

	.small {
		font-size: 0.8rem;
	}

	@media (max-width: 520px) {
		li {
			grid-template-columns: minmax(0, 1fr) auto;
		}

		.about {
			grid-column: 1 / -1;
			grid-row: 2;
		}
	}
</style>
