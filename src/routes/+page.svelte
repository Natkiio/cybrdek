<script lang="ts">
	import Panel from '#lib/components/Panel.svelte';
	import RollLog from '#lib/components/RollLog.svelte';
	import { rulesets } from '#lib/rulesets/index.ts';

	const bootLines = [
		'BIOS v2.0.77 ... OK',
		'Mounting neural interface ... OK',
		`Loaded rulesets: ${rulesets.map((r) => r.name).join(', ') || 'NONE'}`,
		'Welcome back, choom.'
	];
</script>

<h1>CYBRDEK OS</h1>

<Panel title="BOOT">
	{#each bootLines as line, i (i)}
		<div>&gt; {line}</div>
	{/each}
	<div class="cursor">&gt; </div>
</Panel>

<Panel title="MENU">
	<p><a href="/characters">[1] Characters</a> <span class="dim">— create, level up, view abilities</span></p>
	<p><a href="/rules">[2] Rules</a> <span class="dim">— search the rulebook</span></p>
	<p><a href="/dice">[3] Dice</a> <span class="dim">— free dice roller</span></p>
</Panel>

<RollLog />
