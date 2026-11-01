<script lang="ts">
	import { goto } from '$app/navigation';
	import NumberStepper from '#lib/components/NumberStepper.svelte';
	import Panel from '#lib/components/Panel.svelte';
	import { red } from '#lib/rulesets/red/index.ts';
	import {
		BASIC_SKILL_MIN,
		buildCharacter,
		defaultSkills,
		defaultStats,
		SKILL_MAX,
		SKILL_POINTS,
		skillPointsSpent,
		STARTING_ROLE_RANK,
		STAT_POINTS,
		statPointsSpent,
		validateHandle,
		validateRole,
		validateSkills,
		validateStats
	} from '#lib/rulesets/red/creation.ts';
	import { derivedStats } from '#lib/rulesets/red/derived.ts';
	import { saveCharacter } from '#lib/storage/characters.ts';

	const ruleset = red;
	const steps = ['HANDLE', 'ROLE', 'STATS', 'SKILLS', 'REVIEW'] as const;

	// ---- wizard state ($state makes these reactive: the page updates when they change)
	let step = $state(0);
	let handle = $state('');
	let role = $state('');
	let stats = $state(defaultStats());
	let skills = $state(defaultSkills());
	let saving = $state(false);
	let saveError = $state('');

	// ---- derived values ($derived recalculates whenever the state it reads changes)
	const statsLeft = $derived(STAT_POINTS - statPointsSpent(stats));
	const skillsLeft = $derived(SKILL_POINTS - skillPointsSpent(skills));
	const sheet = $derived(derivedStats(stats));
	const roleDef = $derived(ruleset.roles.find((r) => r.id === role));

	// Problems blocking each step. Review shows everything.
	const problemsByStep = $derived([
		validateHandle(handle),
		validateRole(role),
		validateStats(stats),
		validateSkills(skills),
		[]
	]);
	const allProblems = $derived(problemsByStep.flat());
	const currentProblems = $derived(problemsByStep[step]);

	// A step is reachable once every step before it is valid.
	function reachable(i: number) {
		return problemsByStep.slice(0, i).every((p) => p.length === 0);
	}

	const skillsByCategory = ruleset.skillCategories.map((category) => ({
		category,
		skills: ruleset.skills.filter((s) => s.category === category)
	}));

	function categorySpent(category: string) {
		return ruleset.skills
			.filter((s) => s.category === category)
			.reduce((total, s) => total + (skills[s.id] - (s.basic ? BASIC_SKILL_MIN : 0)), 0);
	}

	async function create() {
		saving = true;
		saveError = '';
		try {
			// $state.snapshot turns the reactive proxies back into plain objects.
			const character = buildCharacter(
				$state.snapshot({ handle, role, stats, skills }),
				ruleset,
				crypto.randomUUID()
			);
			await saveCharacter(character);
			await goto(`/characters/${character.id}`);
		} catch (e) {
			saveError = e instanceof Error ? e.message : String(e);
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>NEW CHARACTER // CYBRDEK</title>
</svelte:head>

<h1>NEW CHARACTER</h1>
<p class="dim">Complete Package method · {ruleset.name}</p>

<ol class="steps">
	{#each steps as label, i (label)}
		<li>
			<button
				type="button"
				class:current={i === step}
				class:done={i < step && problemsByStep[i].length === 0}
				disabled={!reachable(i)}
				onclick={() => (step = i)}
			>
				<span class="num">{i + 1}</span>{label}
			</button>
		</li>
	{/each}
</ol>

{#if step === 0}
	<Panel title="01 // HANDLE">
		<label for="handle">What does the street call you?</label>
		<input
			id="handle"
			bind:value={handle}
			placeholder="e.g. Johnny Silverhand"
			autocomplete="off"
			maxlength="40"
			onkeydown={(e) => e.key === 'Enter' && !validateHandle(handle).length && (step = 1)}
		/>
	</Panel>
{:else if step === 1}
	<Panel title="02 // ROLE">
		<p class="dim">Your Role Ability starts at rank {STARTING_ROLE_RANK}.</p>
		<div class="roles">
			{#each ruleset.roles as r (r.id)}
				<button type="button" class="role" class:selected={role === r.id} onclick={() => (role = r.id)}>
					<span class="role-name">{r.name}</span>
					<span class="dim">{r.ability}</span>
				</button>
			{/each}
		</div>
	</Panel>
{:else if step === 2}
	<Panel title="03 // STATS">
		<div class="pool" class:empty={statsLeft === 0}>
			<span>POINTS LEFT</span><strong>{statsLeft}</strong><span class="dim">/ {STAT_POINTS}</span>
		</div>
		<p class="dim">Each STAT is 2–8. Spend all {STAT_POINTS} points.</p>
		<ul class="rows">
			{#each ruleset.stats as s (s.id)}
				<li>
					<span class="row-label"><strong>{s.id}</strong> <span class="dim">{s.name}</span></span>
					<NumberStepper bind:value={stats[s.id]} min={s.min} max={s.max} canIncrease={statsLeft > 0} label={s.id} />
				</li>
			{/each}
		</ul>
		<dl class="derived">
			<div><dt>HP</dt><dd>{sheet.hp}</dd></div>
			<div><dt>SERIOUSLY WOUNDED</dt><dd>{sheet.seriouslyWounded}</dd></div>
			<div><dt>DEATH SAVE</dt><dd>{sheet.deathSave}</dd></div>
			<div><dt>HUMANITY</dt><dd>{sheet.humanity}</dd></div>
		</dl>
	</Panel>
{:else if step === 3}
	<div class="pool sticky" class:empty={skillsLeft === 0}>
		<span>SKILL POINTS LEFT</span><strong>{skillsLeft}</strong><span class="dim">/ {SKILL_POINTS}</span>
	</div>
	<p class="dim">
		Max {SKILL_MAX} per skill. Basic skills (★) start at {BASIC_SKILL_MIN}. (x2) skills cost 2 points per level.
	</p>
	{#each skillsByCategory as group (group.category)}
		<details class="category" open={group.category === 'Ranged Weapon'}>
			<summary>
				{group.category}
				{#if categorySpent(group.category) > 0}<span class="spent">+{categorySpent(group.category)}</span>{/if}
			</summary>
			<ul class="rows">
				{#each group.skills as s (s.id)}
					{@const cost = s.costMultiplier}
					<li>
						<span class="row-label">
							{s.name}{#if s.basic}<span class="tag" title="Basic skill">★</span>{/if}{#if cost === 2}<span
									class="tag">x2</span
								>{/if}
							<span class="dim">{s.stat}</span>
						</span>
						<NumberStepper
							bind:value={skills[s.id]}
							min={s.basic ? BASIC_SKILL_MIN : 0}
							max={SKILL_MAX}
							canIncrease={skillsLeft >= cost}
							label={s.name}
						/>
					</li>
				{/each}
			</ul>
		</details>
	{/each}
{:else}
	<Panel title="05 // REVIEW">
		<dl class="review">
			<div><dt>HANDLE</dt><dd>{handle.trim()}</dd></div>
			<div><dt>ROLE</dt><dd>{roleDef?.name} · {roleDef?.ability} {STARTING_ROLE_RANK}</dd></div>
			<div>
				<dt>STATS</dt>
				<dd>{ruleset.stats.map((s) => `${s.id} ${stats[s.id]}`).join(' · ')}</dd>
			</div>
			<div><dt>HP</dt><dd>{sheet.hp} · Humanity {sheet.humanity}</dd></div>
			<div>
				<dt>SKILLS</dt>
				<dd>
					{ruleset.skills
						.filter((s) => skills[s.id] > 0)
						.map((s) => `${s.name} ${skills[s.id]}`)
						.join(' · ')}
				</dd>
			</div>
		</dl>
		{#if skillsLeft > 0}
			<p class="warn">You still have {skillsLeft} unspent skill points.</p>
		{/if}
		{#if saveError}<p class="error">SAVE FAILED: {saveError}</p>{/if}
	</Panel>
{/if}

{#if currentProblems.length}
	<ul class="problems" aria-live="polite">
		{#each currentProblems as p (p)}<li>! {p}</li>{/each}
	</ul>
{/if}

<div class="nav">
	{#if step > 0}
		<button type="button" class="secondary" onclick={() => (step -= 1)}>← BACK</button>
	{:else}
		<a class="secondary button" href="/characters">CANCEL</a>
	{/if}
	{#if step < steps.length - 1}
		<button type="button" disabled={currentProblems.length > 0} onclick={() => (step += 1)}>NEXT →</button>
	{:else}
		<button type="button" disabled={allProblems.length > 0 || saving} onclick={create}>
			{saving ? 'SAVING…' : 'CREATE CHARACTER'}
		</button>
	{/if}
</div>

<style>
	.dim {
		color: var(--muted);
	}

	.steps {
		list-style: none;
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		padding: 0;
		margin: 1rem 0;
	}

	.steps button {
		min-height: 44px;
		padding: 0 0.7rem;
		background: var(--bg-1);
		color: var(--label);
		border: 1px solid var(--frame-dim);
		font-family: var(--f-label);
		font-size: 0.6rem;
		letter-spacing: 0.12em;
		cursor: pointer;
	}

	.steps .num {
		color: var(--muted);
		margin-right: 0.4rem;
	}

	.steps button.done {
		color: var(--mint);
		border-color: var(--mint-dim);
	}

	.steps button.current {
		color: var(--value);
		border-color: var(--red);
		box-shadow: inset 0 -2px 0 var(--red);
	}

	.steps button:disabled {
		color: var(--faint);
		cursor: not-allowed;
	}

	label {
		display: block;
		color: var(--label);
		margin-bottom: 0.5rem;
	}

	input {
		width: 100%;
		min-height: 44px;
		padding: 0 0.75rem;
		background: var(--bg-0);
		color: var(--value);
		border: 1px solid var(--frame-dim);
		font-family: var(--f-mono);
		font-size: 1.1rem;
	}

	input:focus {
		outline: none;
		border-color: var(--red);
	}

	.roles {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 0.5rem;
	}

	.role {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.2rem;
		min-height: 60px;
		padding: 0.6rem 0.75rem;
		background: var(--bg-2);
		border: 1px solid var(--frame-dim);
		color: var(--value);
		font-family: var(--f-mono);
		text-align: left;
		cursor: pointer;
	}

	.role:hover,
	.role:focus-visible {
		border-color: var(--frame);
	}

	.role.selected {
		border-color: var(--red);
		box-shadow: 0 0 12px var(--red-glow);
	}

	.role-name {
		font-family: var(--f-label);
		font-size: 0.75rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.pool {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		font-family: var(--f-label);
		font-size: 0.7rem;
		letter-spacing: 0.12em;
		color: var(--label);
	}

	.pool strong {
		font-family: var(--f-mono);
		font-size: 1.6rem;
		color: var(--red);
		text-shadow: 0 0 10px var(--red-glow);
	}

	.pool.empty strong {
		color: var(--mint);
		text-shadow: 0 0 10px var(--mint-glow);
	}

	.pool.sticky {
		position: sticky;
		top: 0;
		z-index: 10;
		padding: 0.6rem 0;
		background: var(--bg-0);
		border-bottom: 1px solid var(--frame-dim);
	}

	.rows {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.rows li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.35rem 0;
		border-bottom: 1px solid var(--bg-3);
	}

	.row-label {
		min-width: 0;
	}

	.tag {
		margin-left: 0.35rem;
		color: var(--mint);
		font-size: 0.8em;
	}

	.derived,
	.review {
		margin: 1rem 0 0;
	}

	.derived {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: 0.5rem;
	}

	.derived div,
	.review div {
		border: 1px solid var(--frame-dim);
		padding: 0.5rem 0.75rem;
	}

	.review div {
		margin-bottom: 0.5rem;
	}

	dt {
		font-family: var(--f-label);
		font-size: 0.6rem;
		letter-spacing: 0.12em;
		color: var(--muted);
	}

	dd {
		margin: 0.2rem 0 0;
		color: var(--value);
	}

	.derived dd {
		font-size: 1.3rem;
		color: var(--mint);
	}

	.category {
		border: 1px solid var(--frame-dim);
		border-left: 2px solid var(--frame);
		background: var(--bg-1);
		margin-bottom: 0.5rem;
	}

	summary {
		min-height: 44px;
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0 1rem;
		font-family: var(--f-label);
		font-size: 0.7rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--label);
		cursor: pointer;
	}

	.spent {
		color: var(--mint);
		font-family: var(--f-mono);
	}

	.category .rows {
		padding: 0 1rem 0.5rem;
	}

	.problems {
		list-style: none;
		padding: 0;
		margin: 0.75rem 0;
		color: var(--red-soft);
	}

	.warn {
		color: var(--mint);
	}

	.error {
		color: var(--red);
	}

	.nav {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
		margin-top: 1.25rem;
	}

	.nav button,
	.nav .button {
		min-height: 48px;
		padding: 0 1.25rem;
		display: inline-flex;
		align-items: center;
		background: var(--red);
		color: var(--ink-on-red);
		border: 1px solid var(--red);
		font-family: var(--f-label);
		font-size: 0.7rem;
		letter-spacing: 0.12em;
		cursor: pointer;
	}

	.nav button:disabled {
		background: var(--bg-2);
		color: var(--faint);
		border-color: var(--frame-dim);
		cursor: not-allowed;
	}

	.nav .secondary {
		background: transparent;
		color: var(--label);
		border-color: var(--frame-dim);
	}
</style>
