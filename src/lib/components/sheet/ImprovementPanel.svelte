<script lang="ts">
	import Panel from '#lib/components/Panel.svelte';
	import type { SkillDef } from '#lib/engine/types.ts';
	import {
		awardIp,
		logSpend,
		raiseRole,
		raiseSkill,
		roleRaiseCost,
		skillRaiseCost,
		undoLastSpend,
		type ImprovementChange,
		type IpSpend,
		type SpendResult
	} from '#lib/rulesets/red/improvement.ts';

	let {
		ip,
		ipLog,
		skills,
		skillCategories,
		levels,
		roleAbility,
		roleRank,
		onchange
	}: {
		ip: number;
		ipLog: IpSpend[];
		skills: SkillDef[];
		skillCategories: string[];
		levels: Record<string, number>; // the character's current skill levels
		roleAbility?: string; // undefined when the character has no Role
		roleRank: number;
		onchange: (change: ImprovementChange) => void;
	} = $props();

	let award = $state<number | null>(null);
	let skillId = $state('');
	let message = $state('');

	const chosen = $derived(skills.find((s) => s.id === skillId));
	const chosenLevel = $derived(chosen ? (levels[chosen.id] ?? 0) : 0);
	const chosenCost = $derived(chosen ? skillRaiseCost(chosen, chosenLevel) : null);
	const roleCost = $derived(roleRaiseCost(roleRank));
	const lastSpend = $derived(ipLog.at(-1));
	const groups = $derived(
		skillCategories.map((category) => ({
			category,
			skills: skills.filter((s) => s.category === category)
		}))
	);

	function nameOf(spend: IpSpend) {
		if (spend.kind === 'role') return roleAbility ?? 'Role Ability';
		return skills.find((s) => s.id === spend.target)?.name ?? spend.target;
	}

	function giveIp() {
		const next = awardIp(ip, award ?? 0);
		if (next === ip) return;
		message = `+${next - ip} IP awarded.`;
		onchange({ ip: next, ipLog });
		award = null;
	}

	function apply(result: SpendResult, change: (level: number) => Partial<ImprovementChange>) {
		if (!result.ok) {
			message = result.reason;
			return;
		}
		message = `${nameOf(result.spend)} ${result.spend.from} → ${result.spend.to} for ${result.spend.cost} IP.`;
		onchange({ ip: result.ip, ipLog: logSpend(ipLog, result.spend), ...change(result.level) });
	}

	function buySkill() {
		if (!chosen) return;
		apply(raiseSkill(chosen, chosenLevel, ip), (level) => ({ skill: { id: chosen.id, level } }));
	}

	function buyRank() {
		apply(raiseRole(roleRank, ip), (level) => ({ roleRank: level }));
	}

	function undo() {
		// Copy it now: `lastSpend` is derived from props, so it moves on as soon as onchange saves.
		const spend = lastSpend;
		if (!spend) return;
		const current = spend.kind === 'role' ? roleRank : (levels[spend.target] ?? 0);
		const result = undoLastSpend(ipLog, ip, current);
		if (!result.ok) {
			message = result.reason;
			return;
		}
		message = `Undone: ${nameOf(spend)} back to ${result.level}, ${spend.cost} IP refunded.`;
		onchange({
			ip: result.ip,
			ipLog: result.log,
			...(result.kind === 'role'
				? { roleRank: result.level }
				: { skill: { id: result.target, level: result.level } })
		});
	}
</script>

<Panel title="IMPROVEMENT POINTS">
	<div class="balance">
		<span class="ip">{ip}</span><span class="unit">IP</span>
	</div>

	<div class="row">
		<input
			type="number"
			inputmode="numeric"
			min="1"
			placeholder="IP from the GM"
			aria-label="IP to award"
			bind:value={award}
		/>
		<button type="button" class="gain" disabled={!award || award < 1} onclick={giveIp}>AWARD</button>
	</div>

	<h3>RAISE A SKILL</h3>
	<div class="row">
		<select aria-label="Skill to raise" bind:value={skillId}>
			<option value="">Choose a skill…</option>
			{#each groups as group (group.category)}
				<optgroup label={group.category}>
					{#each group.skills as s (s.id)}
						{@const level = levels[s.id] ?? 0}
						{@const cost = skillRaiseCost(s, level)}
						<option value={s.id}>
							{s.name}{s.costMultiplier === 2 ? ' (x2)' : ''}: {cost === null
								? `${level} (max)`
								: `${level} → ${level + 1} · ${cost} IP`}
						</option>
					{/each}
				</optgroup>
			{/each}
		</select>
		<button
			type="button"
			disabled={!chosen || chosenCost === null || chosenCost > ip}
			onclick={buySkill}
		>
			{chosenCost === null ? 'RAISE' : `RAISE · ${chosenCost}`}
		</button>
	</div>
	{#if chosen && chosenCost !== null && chosenCost > ip}
		<p class="dim">Needs {chosenCost} IP. You have {ip}.</p>
	{/if}

	{#if roleAbility}
		<h3>RAISE ROLE ABILITY</h3>
		<div class="row">
			<span class="role">
				{roleAbility}
				{roleCost === null ? `${roleRank} (max)` : `${roleRank} → ${roleRank + 1}`}
			</span>
			<button type="button" disabled={roleCost === null || roleCost > ip} onclick={buyRank}>
				{roleCost === null ? 'MAXED' : `RAISE · ${roleCost}`}
			</button>
		</div>
	{/if}

	{#if message}<p class="message" aria-live="polite">{message}</p>{/if}

	{#if lastSpend}
		<p class="dim last">
			Last spend: {nameOf(lastSpend)}
			{lastSpend.from} → {lastSpend.to} (−{lastSpend.cost} IP)
			<button type="button" class="link" onclick={undo}>UNDO</button>
		</p>
	{/if}

	<p class="dim rule">Cost = new level × 20 IP (× 40 for x2 skills, × 60 for Role rank). One level at a time.</p>
</Panel>

<style>
	.balance {
		display: flex;
		align-items: baseline;
		gap: 0.4rem;
		margin-bottom: 0.5rem;
	}

	.ip {
		font-size: 2.2rem;
		line-height: 1;
		color: var(--mint);
		text-shadow: 0 0 12px var(--mint-glow);
	}

	.unit {
		font-family: var(--f-label);
		font-size: 0.7rem;
		letter-spacing: 0.12em;
		color: var(--label);
	}

	h3 {
		margin: 1rem 0 0.4rem;
		font-family: var(--f-label);
		font-size: 0.6rem;
		letter-spacing: 0.12em;
		color: var(--label);
	}

	.row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.4rem;
		align-items: center;
	}

	button,
	input,
	select {
		min-height: 44px;
	}

	input,
	select {
		width: 100%;
		min-width: 0;
	}

	.gain {
		color: var(--mint);
		border-color: var(--mint-dim);
	}

	.role {
		color: var(--value);
	}

	.message {
		margin: 0.75rem 0 0;
		color: var(--mint);
	}

	.dim {
		color: var(--muted);
		margin: 0.5rem 0 0;
	}

	.rule {
		font-size: 0.8rem;
	}

	.link {
		min-height: 0;
		padding: 0 0.3rem;
		background: none;
		border: none;
		color: var(--mint);
		text-decoration: underline;
		cursor: pointer;
	}
</style>
