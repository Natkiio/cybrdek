<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import Panel from '#lib/components/Panel.svelte';
	import RollLog from '#lib/components/RollLog.svelte';
	import CyberdeckPanel from '#lib/components/sheet/CyberdeckPanel.svelte';
	import InterfacePanel from '#lib/components/sheet/InterfacePanel.svelte';
	import { deckItems } from '#lib/rulesets/red/cyberdeck.ts';
	import { abilityRoll, loadedBoosters, netActions } from '#lib/rulesets/red/interface.ts';
	import CyberwarePanel from '#lib/components/sheet/CyberwarePanel.svelte';
	import GearPanel from '#lib/components/sheet/GearPanel.svelte';
	import ArmorPanel from '#lib/components/sheet/ArmorPanel.svelte';
	import { headMultiplierOf, type DamageOptions } from '#lib/rulesets/red/attacks.ts';
	import { armoredStats } from '#lib/rulesets/red/armor.ts';
	import CriticalInjuries from '#lib/components/sheet/CriticalInjuries.svelte';
	import { injuriesOf, injuryModifiers } from '#lib/rulesets/red/injuries.ts';
	import HpTracker from '#lib/components/sheet/HpTracker.svelte';
	import ImprovementPanel from '#lib/components/sheet/ImprovementPanel.svelte';
	import { roll, rollDie, skillCheck, type RollResult } from '#lib/engine/dice.ts';
	import type { Character } from '#lib/engine/types.ts';
	import { logRoll, type RollKind } from '#lib/rolls/log.svelte.ts';
	import { rulesets } from '#lib/rulesets/index.ts';
	import { cyberwareOf, effectiveEmp, humanityOf, maxHumanity } from '#lib/rulesets/red/cyberware.ts';
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
	import CharacterHistory from '#lib/components/sheet/CharacterHistory.svelte';
	import { CRITICAL_INJURIES } from '#lib/rulesets/red/injuries.ts';
	import { wornSp } from '#lib/rulesets/red/armor.ts';
	import { getCharacter, isInAccount, saveCharacter } from '#lib/storage/characters.ts';
	import { characterSync } from '#lib/sync/characters.svelte.ts';
	import NetRunPanel from '#lib/components/sheet/NetRunPanel.svelte';
	import { accessRange, actionsLeft, netRunOf, positionOf, seesMeatspace, spendAction, stillRunning, type NetRun } from '#lib/rulesets/red/netrun.ts';
	import { campaign } from '#lib/campaigns/current.svelte.ts';
	import { gm } from '#lib/supabase/gm.svelte.ts';

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
	let damageNotice = $state('');

	let inAccount = $state(false);

	async function load() {
		const id = page.params.id ?? '';
		character = await getCharacter(id);
		inAccount = await isInAccount(id);
		loaded = true;
	}

	onMount(load);

	// Another device changed this character: show the newer copy, so saving here
	// can't quietly put the old one back. Only `revision` is a dependency.
	let seenRevision = characterSync.revision;
	$effect(() => {
		const revision = characterSync.revision;
		untrack(() => {
			if (revision !== seenRevision && loaded) void load();
			seenRevision = revision;
		});
	});

	async function restore(version: Character) {
		await saveCharacter(version);
		await load();
	}

	// Two letters for the avatar until portraits arrive (#87).
	const initials = (name: string) => {
		const words = name.trim().split(/\s+/).filter(Boolean);
		return ((words.length > 1 ? words.map((w) => w[0]).join('') : words[0]) ?? '').slice(0, 2).toUpperCase() || '??';
	};

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

	const cyberware = $derived(character ? cyberwareOf(character.extra) : []);
	const decks = $derived(deckItems(gear).map((g) => g.cyberdeck!));
	const boosters = $derived(loadedBoosters(decks));
	// A Booster unloaded since it was marked running no longer counts.
	const netRun = $derived.by(() => {
		const run = netRunOf(character?.extra ?? {});
		return { ...run, running: stillRunning(run.running, boosters) };
	});
	const saveRun = (next: NetRun) => update({ netRun: next });
	// NET Actions this Turn, counted only while jacked in (null otherwise).
	const netLeft = $derived(netRun.jackedIn ? actionsLeft(netRun, netActions(roleRank)) : null);
	// ---- sections and the app bar
	type SectionId = 'combat' | 'skills' | 'net' | 'kit' | 'file';
	const isRunner = $derived(role?.id === 'netrunner');
	const sections = $derived(
		[
			{ id: 'combat', label: 'COMBAT', icon: '✚' },
			{ id: 'skills', label: 'SKILLS', icon: '◈' },
			...(isRunner ? [{ id: 'net', label: 'NET', icon: '◆' }] : []),
			{ id: 'kit', label: 'KIT', icon: '▣' },
			{ id: 'file', label: 'FILE', icon: '≡' }
		] as { id: SectionId; label: string; icon: string }[]
	);
	let chosen = $state<SectionId>('combat');
	// A NET link on a non-Netrunner falls back to COMBAT.
	const section = $derived(sections.some((x) => x.id === chosen) ? chosen : 'combat');
	/** Show a section; the address keeps it (#skills), so a reload or a shared link opens there. */
	function go(id: SectionId) {
		chosen = id;
		try {
			history.replaceState(history.state, '', `#${id}`);
		} catch {
			// no history API: the section just isn't remembered
		}
		window.scrollTo?.({ top: 0 });
	}
	onMount(() => {
		const fromHash = location.hash.slice(1);
		if (['combat', 'skills', 'net', 'kit', 'file'].includes(fromHash)) chosen = fromHash as SectionId;
	});
	// A damage roll that offers a Critical Injury brings you to COMBAT, where it's recorded.
	$effect(() => {
		if (lastRoll?.damageCritical) untrack(() => go('combat'));
	});
	// The rail sticks just below the site's own sticky header, whatever its height.
	let headerHeight = $state(0);
	onMount(() => {
		const bar = document.querySelector('header.bar');
		if (!bar) return;
		const measure = () => (headerHeight = bar.getBoundingClientRect().height);
		measure();
		const watch = new ResizeObserver(measure);
		watch.observe(bar);
		return () => watch.disconnect();
	});
	// Laptop: a left rail and a right column for STATS and the ROLL LOG.
	let wide = $state(false);
	onMount(() => {
		const query = matchMedia('(min-width: 1000px)');
		const sync = () => (wide = query.matches);
		sync();
		query.addEventListener('change', sync);
		return () => query.removeEventListener('change', sync);
	});

	/** Roll an Interface Ability; every one but Scanner (a Meat Action) uses a NET Action. */
	function useAbility(id: string) {
		const roll = abilityRoll(id, roleRank, new Set(netRun.running));
		check(roll.label, roll.base, 'skill');
		if (id !== 'scanner') void saveRun(spendAction(netRun));
	}
	// One-line summaries for the folded sections.
	const injuryNames = $derived(injuries.map((i) => CRITICAL_INJURIES[i.location][i.roll]?.name ?? 'Injury').join(', '));
	const armorSp = $derived(wornSp(gear));
	const humanity = $derived(humanityOf(character?.extra ?? {}, character?.stats.EMP ?? 0));
	// Armor lowers REF/DEX/MOVE; lost Humanity lowers EMP. Base STATs stay as they were.
	const effectiveStats: Record<string, number> = $derived({
		...armoredStats(character?.stats ?? {}, gear),
		EMP: effectiveEmp(character?.stats.EMP ?? 0, humanity)
	});

	function takeDamage(amount: number, location: ArmorLocation, options: DamageOptions = {}) {
		const result = takeArmoredDamage(hp, maxHp, gear, amount, location, { ...options, headMultiplier: headMultiplierOf(character?.extra ?? {}) });
		damageNotice = result.unconscious ? 'Target is unconscious (Core pp. 177, 349). Record this condition at the table.' : '';
		void update({ currentHp: result.hp, gear: result.gear });
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
		// Unloading or removing a Booster stops it running in the saved run too.
		if ('gear' in extra && character.extra.netRun) {
			const run = netRunOf(character.extra);
			const loaded = loadedBoosters(deckItems(gearOf(character.extra)).map((g) => g.cyberdeck!));
			character.extra.netRun = { ...run, running: stillRunning(run.running, loaded) };
		}
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

	/** Plain damage dice with no crit check, e.g. Zap's 1d6 to a Program's REZ or a brain. */
	function rollPlainDamage(label: string, count: number, sides: number) {
		const result = roll(count, sides, 0);
		logRoll({ characterId: character?.id, label, kind: 'damage', result });
		lastRoll = { label, result, crit: false, fumble: false };
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
		<div class="avatar" aria-hidden="true">{initials(character.name)}</div>
		<div class="who">
			<h1>{character.name}</h1>
			<p>
				<span class="role">{role?.name ?? 'No Role'} {roleRank}</span>
				{#if role}<span class="dim">· {role.ability} · {ipOf(character.extra)} IP</span>{/if}
			</p>
		</div>
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

	{#snippet statsPanel(c: Character)}
	<Panel title="STATS">
		<p class="hint dim">Tap to roll d10 + STAT{penalty ? ` (${penalty} wounds/injuries)` : ''}.</p>
		<div class="stats">
			{#each ruleset.stats as s (s.id)}
				{@const value = c.stats[s.id]}
				{@const shown = s.id === 'MOVE' ? Math.min(effectiveStats.MOVE, Math.max(1, woundedMove(effectiveStats.MOVE, wound) + injuryMods.move)) : effectiveStats[s.id]}
				<button type="button" class="stat" onclick={() => check(s.id, shown, 'stat')} title={s.name}>
					<span class="stat-id">{s.id}</span>
					<span class="stat-value" class:reduced={shown !== value}>{shown}</span>
				</button>
			{/each}
		</div>
		<dl class="derived">
			<div><dt>HUMANITY</dt><dd>{humanity}/{maxHumanity(c.stats.EMP, cyberware)}</dd></div>
			<div><dt>DEATH SAVE</dt><dd>{sheet.deathSave}</dd></div>
			<div><dt>SERIOUSLY WOUNDED</dt><dd>{sheet.seriouslyWounded}</dd></div>
		</dl>
	</Panel>
	{/snippet}

	<!-- The sheet in five sections with an app bar: at the bottom of a phone,
	     down the left of a laptop. On a laptop STATS and the ROLL LOG stay in a
	     column on the right; on a phone they live in SKILLS and FILE. -->
	<div class="vitals" role="group" aria-label="Status">
		<button type="button" class="chip" class:hurt={wound !== 'unhurt'} onclick={() => go('combat')}>
			<span>HP</span><strong>{hp}/{maxHp}</strong>
		</button>
		<button type="button" class="chip" onclick={() => go('combat')}><span>SP</span><strong>{armorSp.head}/{armorSp.body}</strong></button>
		<button type="button" class="chip" onclick={() => go('kit')}><span>HUM</span><strong>{humanity}</strong></button>
		{#if injuries.length}
			<button type="button" class="chip alert" title={injuryNames} onclick={() => go('combat')}><span>INJ</span><strong>{injuries.length}</strong></button>
		{/if}
		{#if isRunner}
			<button type="button" class="chip" class:alert={netRun.jackedIn} onclick={() => go('net')}>
				<span>NET</span><strong>{netRun.jackedIn ? positionOf(netRun) : 'OUT'}</strong>
			</button>
		{/if}
	</div>

	<div class="sheet">
		<nav class="appbar" aria-label="Sheet sections" style:--header-h="{headerHeight}px">
			{#each sections as sec (sec.id)}
				<button type="button" aria-current={section === sec.id ? 'page' : undefined} onclick={() => go(sec.id)}>
					<i aria-hidden="true">{sec.icon}</i><span>{sec.label}</span>
				</button>
			{/each}
		</nav>

		<div class="main">
			{#if section === 'combat'}
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
				{#if damageNotice}<p role="status">{damageNotice}</p>{/if}
				{#if lastDeathSave && wound === 'mortally'}
					<p class="death-result" class:fail={!lastDeathSave.survived}>
						Death Save: {lastDeathSave.die} + {lastDeathSave.penalty} = {lastDeathSave.total} vs BODY {lastDeathSave.body}
						→ <strong>{lastDeathSave.survived ? 'SURVIVED' : 'FAILED. Flatlined.'}</strong>
					</p>
				{/if}
				<GearPanel
					{gear}
					kinds={['weapon']}
					title="WEAPONS"
					{attackBase}
					onchange={(next) => update({ gear: next })}
					onattack={attackWith}
					ondamage={rollDamage}
				/>
				<ArmorPanel {gear} onchange={(next) => update({ gear: next })} />
				<CriticalInjuries {injuries} {hp} {maxHp} characterId={character.id} offered={lastRoll?.damageCritical ?? false} onchange={update} />
			{:else if section === 'skills'}
				{#if !wide}{@render statsPanel(character)}{/if}
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
			{:else if section === 'net'}
				<Panel title="IN THE NET">
					<NetRunPanel
						run={netRun}
						seesMeat={seesMeatspace(gear, cyberware)}
						range={accessRange(decks)}
						campaignId={campaign.id}
						signedIn={!!gm.userId}
						onchange={saveRun}
						perTurn={netActions(roleRank)}
						onability={useAbility}
					/>
				</Panel>
				<Panel title="INTERFACE">
					<InterfacePanel
						rank={roleRank}
						{boosters}
						running={netRun.running}
						actionsLeft={netLeft}
						onrunning={(running) => saveRun(spendAction({ ...netRun, running }))}
						onuse={useAbility}
						oncheck={(label, base) => check(label, base, 'skill')}
						ondamage={rollPlainDamage}
					/>
				</Panel>
			{:else if section === 'kit'}
				<CyberdeckPanel {gear} {cyberware} onchange={(next) => update({ gear: next })} />
				<GearPanel
					{gear}
					kinds={['armor', 'item']}
					{attackBase}
					onchange={(next) => update({ gear: next })}
					onattack={attackWith}
					ondamage={rollDamage}
				/>
				<CyberwarePanel
					installed={cyberware}
					{humanity}
					baseEmp={character.stats.EMP}
					onchange={(change) => update(change)}
				/>
			{:else}
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
				{#if inAccount && character}<CharacterHistory id={character.id} onrestore={restore} />{/if}
				{#if !wide}<RollLog characterId={character.id} />{/if}
			{/if}
		</div>

		{#if wide}
			<aside class="side">
				{@render statsPanel(character)}
				<RollLog characterId={character.id} />
			</aside>
		{/if}
	</div>
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

	.identity {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		margin-bottom: 1.25rem;
	}

	.avatar {
		width: 4rem;
		height: 4rem;
		flex: none;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--red);
		background: #140508;
		color: var(--red);
		font-family: var(--f-label);
		font-size: 1.25rem;
	}

	.who {
		min-width: 0;
	}

	.identity h1 {
		margin: 0;
		color: var(--bright);
		text-shadow: none;
		overflow-wrap: anywhere;
	}

	.identity p {
		margin: 0.2rem 0 0;
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
		top: 3.6rem; /* under the top bar */
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
		border-color: var(--bright);
		box-shadow: 0 0 12px var(--bright-glow);
	}

	.last-roll.crit strong,
	.last-roll.crit .tag {
		color: var(--bright);
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

	/* Status chips under the name: tap one to jump to its section. */
	.vitals {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin: 0 0 1rem;
	}

	.chip {
		display: inline-flex;
		align-items: baseline;
		gap: 0.4rem;
		min-height: 44px;
		padding: 0.3rem 0.7rem;
		font-family: var(--f-mono);
		letter-spacing: 0;
		text-transform: none;
	}

	.chip span {
		font-family: var(--f-label);
		font-size: 0.55rem;
		letter-spacing: 0.12em;
		color: var(--muted);
	}

	.chip strong {
		color: var(--bright);
		font-weight: normal;
	}

	.chip.hurt strong,
	.chip.alert strong {
		color: var(--red);
	}

	.chip.alert {
		border-color: var(--red);
	}

	/* Phone: one column, the app bar fixed to the bottom of the screen. */
	.sheet {
		display: grid;
		gap: 0 clamp(1rem, 2.5vw, 2.5rem);
		align-items: start;
	}

	/* Room under everything (the site footer too) for the fixed app bar. */
	:global(body:has(.appbar)) {
		padding-bottom: calc(3.8rem + env(safe-area-inset-bottom, 0px));
	}

	.main,
	.side {
		min-width: 0;
	}

	.appbar {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 20;
		display: flex;
		background: var(--bg-1);
		border-top: 1px solid var(--frame-dim);
		padding: 0 env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px);
	}

	.appbar button {
		flex: 1;
		display: grid;
		justify-items: center;
		align-content: center;
		gap: 0.15rem;
		min-height: 3.6rem;
		border: 0;
		border-top: 2px solid transparent;
		background: transparent;
		font-size: 0.55rem;
		box-shadow: none;
	}

	.appbar i {
		font-style: normal;
		font-family: var(--f-mono);
		font-size: 1.15rem;
		line-height: 1;
	}

	.appbar button[aria-current='page'] {
		color: var(--red);
		border-top-color: var(--red);
	}

	/* Keyboard focus: a white ring inside the button, distinct from the red current-section mark. */
	.appbar button:focus-visible {
		outline: 1px dashed var(--bright);
		outline-offset: -5px;
	}

	/* Laptop: a rail on the left, the section in the middle, STATS and the
	   ROLL LOG on the right. */
	@media (min-width: 1000px) {
		.sheet {
			grid-template-columns: 11rem minmax(0, 1fr) minmax(16rem, 22rem);
		}

		:global(body:has(.appbar)) {
			padding-bottom: 0;
		}

		.appbar {
			position: sticky;
			top: calc(var(--header-h, 0px) + 1rem);
			flex-direction: column;
			background: transparent;
			border-top: 0;
			border-right: 1px solid var(--frame-dim);
			padding: 0;
		}

		.appbar button {
			flex: none;
			grid-template-columns: 1.75rem 1fr;
			justify-items: start;
			align-items: center;
			min-height: 3rem;
			padding: 0 0.9rem;
			border-top: 0;
			border-left: 2px solid transparent;
			font-size: 0.62rem;
		}

		.appbar button[aria-current='page'] {
			border-left-color: var(--red);
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
		color: var(--bright);
	}

	.death-result {
		margin: -0.5rem 0 1rem;
		color: var(--bright);
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
		color: var(--bright);
	}

	.calc {
		font-size: 0.8rem;
	}

	.base {
		text-align: right;
		font-size: 1.2rem;
		color: var(--bright);
	}
</style>
