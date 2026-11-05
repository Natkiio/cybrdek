<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import Panel from '#lib/components/Panel.svelte';
	import RollLog from '#lib/components/RollLog.svelte';
	import GearPanel from '#lib/components/sheet/GearPanel.svelte';
	import ArmorPanel from '#lib/components/sheet/ArmorPanel.svelte';
	import { armoredStats } from '#lib/rulesets/red/armor.ts';
	import CriticalInjuries from '#lib/components/sheet/CriticalInjuries.svelte';
	import { injuriesOf, injuryModifiers } from '#lib/rulesets/red/injuries.ts';
	import HpTracker from '#lib/components/sheet/HpTracker.svelte';
	import ImprovementPanel from '#lib/components/sheet/ImprovementPanel.svelte';
	import { roll, rollDie, skillCheck, type RollResult } from '#lib/engine/dice.ts';
	import type { Character } from '#lib/engine/types.ts';
	import { logRoll, type RollKind } from '#lib/rolls/log.svelte.ts';
	import { rulesets } from '#lib/rulesets/index.ts';
	import { derivedStats } from '#lib/rulesets/red/derived.ts';
	import { ipLogOf, ipOf, type ImprovementChange } from '#lib/rulesets/red/improvement.ts';
	import { gearOf, isDamageCrit, parseDamage, type ArmorLocation, type GearItem } from '#lib/rulesets/red/gear.ts';
	import {
		actionPenalty,
		clampHp,
		resolveDeathSave,
		takeArmoredDamage,
		woundedMove,
		woundState,
		type DeathSaveResult
	} from '#lib/rulesets/red/wounds.ts';
	import { getCharacter, saveCharacter } from '#lib/storage/characters.ts';

	let character = $state<Character | undefined>(undefined);
	let loaded = $state(false);
	let showAllSkills = $state(false);
	let lastRoll = $state<{
		label: string;
		result: RollResult;
		crit: boolean;
		fumble: boolean;
		note?: string;
		damageCritical?: boolean;
	} | null>(null);
	let lastDeathSave = $state<DeathSaveResult | null>(null);
	let saveError = $state('');

	onMount(async () => {
		character = await getCharacter(page.params.id ?? '');
		loaded = true;
	});

	// ---- everything below recalculates automatically when `character` changes
	const ruleset = $derived(rulesets.find((r) => r.id === character?.rulesetId));
	const role = $derived(ruleset?.roles.find((r) => r.id === character?.extra.role));
	const roleRank = $derived(Number(character?.extra.roleRank ?? 4));
	const sheet = $derived(character ? derivedStats(character.stats) : undefined);
	const maxHp = $derived(sheet?.hp ?? 0);
	// Old characters have no currentHp yet: treat them as unhurt.
	const hp = $derived(clampHp(Number(character?.extra.currentHp ?? maxHp), maxHp));
	const injuries = $derived(injuriesOf(character?.extra ?? {}));
	const injuryMods = $derived(injuryModifiers(injuries));
	const deathSavePenalty = $derived(Number(character?.extra.deathSavePenalty ?? 0) + injuryMods.deathSave);
	const wound = $derived(woundState(hp, maxHp));
	const penalty = $derived(actionPenalty(wound) + injuryMods.actions);
	const gear = $derived(character ? gearOf(character.extra) : []);

	const effectiveStats = $derived(armoredStats(character?.stats ?? {}, gear));

	function takeDamage(amount: number, location: ArmorLocation) {
		const result = takeArmoredDamage(hp, maxHp, gear, amount, location);
		// Core p. 188: Cracked Skull changes penetrating head damage to ×3.
		const hpDamage = result.penetrating * (location === 'head' ? injuryMods.headMultiplier : 1);
		void update({ currentHp: clampHp(hp - hpDamage, maxHp), gear: result.gear });
	}

	const skillGroups = $derived.by(() => {
		if (!character || !ruleset) return [];
		const levels = character.skills;
		return ruleset.skillCategories
			.map((category) => ({
				category,
				skills: ruleset.skills
					.filter((s) => s.category === category && (showAllSkills || (levels[s.id] ?? 0) > 0))
					.map((s) => {
						const level = levels[s.id] ?? 0;
						const statValue = effectiveStats[s.stat] ?? 0;
						return { ...s, level, statValue, base: statValue + level };
					})
			}))
			.filter((g) => g.skills.length > 0);
	});

	/** Save extra fields (HP, death save penalty) to the device. */
	async function update(extra: Record<string, unknown>) {
		if (!character) return;
		character.extra = { ...character.extra, ...extra };
		await persist();
	}

	/** Save an IP award, spend or undo: the balance, the log and what was raised. */
	async function improve(change: ImprovementChange) {
		if (!character) return;
		if (change.skill) character.skills = { ...character.skills, [change.skill.id]: change.skill.level };
		const extra: Record<string, unknown> = { ip: change.ip, ipLog: change.ipLog };
		if (change.roleRank !== undefined) extra.roleRank = change.roleRank;
		await update(extra);
	}

	async function persist() {
		if (!character) return;
		try {
			await saveCharacter($state.snapshot(character));
			saveError = '';
		} catch (e) {
			saveError = e instanceof Error ? e.message : String(e);
		}
	}

	/** A skill or STAT check: d10 + base, with the wound penalty applied. */
	function check(label: string, base: number, kind: RollKind) {
		const result = skillCheck(base + penalty);
		logRoll({ characterId: character?.id, label, kind, result });
		lastRoll = { label, result, crit: result.rolls[0] === 10, fumble: result.rolls[0] === 1 };
	}

	/** Attack base for a weapon skill: STAT + skill level + wound penalty. */
	function attackBase(skillId: string) {
		const skill = ruleset?.skills.find((s) => s.id === skillId);
		if (!character || !skill) return 0;
		return (effectiveStats[skill.stat] ?? 0) + (character.skills[skillId] ?? 0) + penalty;
	}

	function attackWith(item: GearItem) {
		const skill = ruleset?.skills.find((s) => s.id === item.skill);
		const base = attackBase(item.skill ?? '') - penalty; // check() adds the penalty back
		check(`${item.name}: attack${skill ? ` (${skill.name})` : ''}`, base, 'skill');
	}

	function rollDamage(item: GearItem) {
		const dice = parseDamage(item.damage ?? '');
		if (!dice) return;
		const result = roll(dice.count, dice.sides, 0);
		const crit = isDamageCrit(result.rolls);
		const label = `${item.name}: damage`;
		logRoll({ characterId: character?.id, label, kind: 'damage', result });
		lastRoll = {
			label,
			result,
			crit,
			fumble: false,
			note: crit ? 'CRITICAL INJURY · roll for target below' : undefined,
			damageCritical: crit
		};
	}

	function rollDeathSave() {
		if (!character) return;
		const save = resolveDeathSave(rollDie(10), deathSavePenalty, character.stats.BODY);
		lastDeathSave = save;
		logRoll({
			characterId: character.id,
			label: save.survived ? 'Death Save: survived' : 'Death Save: FAILED',
			kind: 'free',
			result: { rolls: [save.die], modifier: save.penalty, total: save.total }
		});
		void update({ deathSavePenalty: Number(character.extra.deathSavePenalty ?? 0) + 1 });
	}

	function signed(n: number) {
		return n >= 0 ? `+${n}` : `${n}`;
	}
</script>

<svelte:head>
	<title>{character?.name ?? 'CHARACTER'} // CYBRDEK</title>
</svelte:head>

<p><a class="back" href="/characters">← ROSTER</a></p>

{#if !loaded}
	<Panel title="CHARACTER FILE"><p class="dim">LOADING…</p></Panel>
{:else if !character || !ruleset || !sheet}
	<Panel title="CHARACTER FILE"><p class="error">NOT FOUND</p></Panel>
{:else}
	<header class="identity">
		<h1>{character.name}</h1>
		<p>
			<span class="role">{role?.name ?? 'No Role'}</span>
			{#if role}<span class="dim">· {role.ability} {roleRank}</span>{/if}
		</p>
	</header>

	{#if saveError}<p class="error">SAVE FAILED: {saveError}</p>{/if}

	{#if lastRoll}
		<div class="last-roll" class:crit={lastRoll.crit} class:fumble={lastRoll.fumble} aria-live="polite">
			<span class="label">{lastRoll.label}</span>
			<span class="dice">[{lastRoll.result.rolls.join(', ')}] {signed(lastRoll.result.modifier)}</span>
			<strong>{lastRoll.result.total}</strong>
			{#if lastRoll.note}<span class="tag">{lastRoll.note}</span>{:else if lastRoll.crit}<span class="tag">CRIT</span>{/if}
			{#if lastRoll.fumble}<span class="tag">FUMBLE</span>{/if}
			<button type="button" class="close" aria-label="Dismiss" onclick={() => (lastRoll = null)}>×</button>
		</div>
	{/if}

	<div class="grid">
		<div class="col">
			<HpTracker
				{hp}
				{maxHp}
				seriouslyWounded={sheet.seriouslyWounded}
				deathSave={sheet.deathSave}
				{deathSavePenalty}
				baseDeathSavePenalty={injuryMods.deathSave}
				onchange={(next) => update({ currentHp: next })}
				ondamage={takeDamage}
				ondeathsave={rollDeathSave}
				onresetpenalty={() => update({ deathSavePenalty: 0 })}
			/>
			<CriticalInjuries {injuries} {hp} {maxHp} characterId={character.id} offered={lastRoll?.damageCritical ?? false} onchange={update} />
			{#if lastDeathSave && wound === 'mortally'}
				<p class="death-result" class:fail={!lastDeathSave.survived}>
					Death Save: {lastDeathSave.die} + {lastDeathSave.penalty} = {lastDeathSave.total} vs BODY {lastDeathSave.body}
					→ <strong>{lastDeathSave.survived ? 'SURVIVED' : 'FAILED. Flatlined.'}</strong>
				</p>
			{/if}

			<Panel title="STATS">
				<p class="hint dim">Tap to roll d10 + STAT{penalty ? ` (${penalty} wounds/injuries)` : ''}.</p>
				<div class="stats">
					{#each ruleset.stats as s (s.id)}
						{@const value = character.stats[s.id]}
						{@const shown = s.id === 'MOVE' ? Math.min(effectiveStats.MOVE, Math.max(1, woundedMove(effectiveStats.MOVE, wound) + injuryMods.move)) : effectiveStats[s.id]}
						<button type="button" class="stat" onclick={() => check(s.id, shown, 'stat')} title={s.name}>
							<span class="stat-id">{s.id}</span>
							<span class="stat-value" class:reduced={shown !== value}>{shown}</span>
						</button>
					{/each}
				</div>
				<dl class="derived">
					<div><dt>HUMANITY</dt><dd>{sheet.humanity}</dd></div>
					<div><dt>DEATH SAVE</dt><dd>{sheet.deathSave}</dd></div>
					<div><dt>SERIOUSLY WOUNDED</dt><dd>{sheet.seriouslyWounded}</dd></div>
				</dl>
			</Panel>
		</div>

		<div class="col">
			<Panel title="SKILLS">
				<div class="skills-head">
					<p class="hint dim">Tap a skill to roll. Base = STAT + level.</p>
					<label class="toggle"><input type="checkbox" bind:checked={showAllSkills} /> all skills</label>
				</div>
				{#each skillGroups as group (group.category)}
					<h3>{group.category}</h3>
					<ul class="skills">
						{#each group.skills as s (s.id)}
							<li>
								<button
									type="button"
									class="skill"
									class:untrained={s.level === 0}
									onclick={() => check(s.name, s.base, 'skill')}
								>
									<span class="name">{s.name}{#if s.costMultiplier === 2}<span class="x2">x2</span>{/if}</span>
									<span class="calc dim">{s.stat} {s.statValue} + {s.level}</span>
									<span class="base">{s.base + penalty}</span>
								</button>
							</li>
						{/each}
					</ul>
				{/each}
			</Panel>
		</div>
	</div>

	<ArmorPanel {gear} onchange={(next) => update({ gear: next })} />

	<GearPanel
		{gear}
		{attackBase}
		onchange={(next) => update({ gear: next })}
		onattack={attackWith}
		ondamage={rollDamage}
	/>

	<ImprovementPanel
		ip={ipOf(character.extra)}
		ipLog={ipLogOf(character.extra)}
		skills={ruleset.skills}
		skillCategories={ruleset.skillCategories}
		levels={character.skills}
		roleAbility={role?.ability}
		{roleRank}
		onchange={improve}
	/>

	<RollLog characterId={character.id} />
{/if}

<style>
	.back {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
	}

	.dim {
		color: var(--muted);
	}

	.error {
		color: var(--red);
	}

	.identity h1 {
		margin: 0;
	}

	.identity p {
		margin: 0.25rem 0 1rem;
	}

	.role {
		font-family: var(--f-label);
		font-size: 0.75rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--red);
	}

	.last-roll {
		position: sticky;
		top: 0;
		z-index: 20;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
		margin-bottom: 1rem;
		padding: 0.5rem 0.75rem;
		background: var(--bg-2);
		border: 1px solid var(--frame);
	}

	.last-roll .label {
		font-family: var(--f-label);
		font-size: 0.65rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.last-roll strong {
		font-size: 1.8rem;
		line-height: 1;
		color: var(--value);
	}

	.last-roll.crit {
		border-color: var(--mint);
		box-shadow: 0 0 12px var(--mint-glow);
	}

	.last-roll.crit strong,
	.last-roll.crit .tag {
		color: var(--mint);
	}

	.last-roll.fumble {
		border-color: var(--red);
		box-shadow: 0 0 12px var(--red-glow);
	}

	.last-roll.fumble strong,
	.last-roll.fumble .tag {
		color: var(--red);
	}

	.tag {
		font-family: var(--f-label);
		font-size: 0.6rem;
		letter-spacing: 0.14em;
	}

	.close {
		margin-left: auto;
		min-width: 44px;
		min-height: 44px;
	}

	.grid {
		display: grid;
		gap: 0 1rem;
	}

	@media (min-width: 760px) {
		.grid {
			grid-template-columns: 1fr 1fr;
			align-items: start;
		}
	}

	.hint {
		margin: 0 0 0.6rem;
		font-size: 0.85rem;
	}

	.stats {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 0.35rem;
	}

	.stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		min-height: 60px;
		padding: 0.4rem 0;
	}

	.stat-id {
		font-family: var(--f-label);
		font-size: 0.55rem;
		letter-spacing: 0.1em;
		color: var(--muted);
	}

	.stat-value {
		font-size: 1.5rem;
		color: var(--value);
	}

	.stat-value.reduced {
		color: var(--red);
	}

	.derived {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.35rem;
		margin: 0.75rem 0 0;
	}

	.derived div {
		border: 1px solid var(--frame-dim);
		padding: 0.4rem 0.5rem;
	}

	dt {
		font-family: var(--f-label);
		font-size: 0.5rem;
		letter-spacing: 0.1em;
		color: var(--muted);
	}

	dd {
		margin: 0.15rem 0 0;
		font-size: 1.2rem;
		color: var(--mint);
	}

	.death-result {
		margin: -0.5rem 0 1rem;
		color: var(--mint);
	}

	.death-result.fail {
		color: var(--red);
	}

	.skills-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		min-height: 44px;
		color: var(--label);
		font-size: 0.85rem;
	}

	h3 {
		margin: 0.9rem 0 0.3rem;
		font-family: var(--f-label);
		font-size: 0.6rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.skills {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.skill {
		width: 100%;
		display: grid;
		grid-template-columns: 1fr auto 3ch;
		align-items: center;
		gap: 0.6rem;
		min-height: 44px;
		padding: 0 0.6rem;
		margin-bottom: 0.25rem;
		text-align: left;
	}

	.skill.untrained {
		opacity: 0.6;
	}

	.x2 {
		margin-left: 0.35rem;
		font-size: 0.75em;
		color: var(--mint);
	}

	.calc {
		font-size: 0.8rem;
	}

	.base {
		text-align: right;
		font-size: 1.2rem;
		color: var(--mint);
	}
</style>
