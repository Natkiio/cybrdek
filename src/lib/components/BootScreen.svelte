<script lang="ts">
	// The terminal boot sequence over the app as it opens (#101). Lines type in
	// over BOOT_MS, then it gets out of the way. Tap, click or any key skips it.
	import { onMount } from 'svelte';
	import { BOOT_MS } from '#lib/boot/boot.ts';
	import { campaign } from '#lib/campaigns/current.svelte.ts';
	import { listCharacters } from '#lib/storage/characters.ts';

	let { onfinish }: { onfinish: () => void } = $props();

	let runner = $state<string | null>(null);
	let elapsed = $state(0);

	// What it "does": real names where we have them, so it reads like your machine booting.
	const lines = $derived([
		{ text: 'bios.check', result: 'OK' },
		{ text: 'mount neural_iface', result: 'OK' },
		{ text: `link campaign ${campaign.name.toUpperCase()}`, result: 'OK' },
		{ text: runner ? `load runner ${runner.toUpperCase()}` : 'scan runners', result: runner ? 'OK' : 'NONE YET' },
		{ text: 'decrypt roll_log', result: 'OK' },
		{ text: 'boot dashboard', result: '' }
	]);
	const shown = $derived(Math.min(lines.length, Math.floor((elapsed / BOOT_MS) * (lines.length + 1))));
	const percent = $derived(Math.min(100, Math.round((elapsed / BOOT_MS) * 100)));

	let skipButton = $state<HTMLButtonElement>();
	let done = false;
	function finish() {
		if (done) return;
		done = true;
		onfinish();
	}

	onMount(() => {
		void listCharacters()
			.then((list) => (runner = list[0]?.name ?? null))
			.catch(() => {});
		skipButton?.focus();
		const started = performance.now();
		let frame = requestAnimationFrame(function tick(now) {
			elapsed = now - started;
			if (elapsed >= BOOT_MS) finish();
			else frame = requestAnimationFrame(tick);
		});
		const skip = () => finish();
		window.addEventListener('keydown', skip);
		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener('keydown', skip);
		};
	});
</script>

<!-- svelte-ignore a11y_click_events_have_key_events (any key skips, handled on window) -->
<div class="boot" role="presentation" onclick={finish}>
	<div class="inner">
		<div class="title">
			<span class="logo">CYBRDEK://</span>
			<span class="dim">NL-OS 2.0.77 · CYBERPUNK RED</span>
		</div>
		<div class="lines" aria-hidden="true">
			{#each lines.slice(0, shown) as line, i (i)}
				<div>
					<span class="dim">&gt;</span>
					{line.text}{#if line.result}<span class="dots"></span><span class:warn={line.result !== 'OK'}>{line.result}</span>{:else}<span class="cursor"></span>{/if}
				</div>
			{/each}
		</div>
		<div class="progress">
			<div class="row dim"><span>LOADING</span><span class="pct">{percent}%</span></div>
			<div class="track"><div class="bar" style:width="{percent}%"></div></div>
		</div>
		<button type="button" class="skip" bind:this={skipButton} onclick={finish}>[ TAP TO SKIP ]</button>
	</div>
</div>

<style>
	.boot {
		position: fixed;
		inset: 0;
		z-index: 900;
		background: var(--bg-0);
		display: flex;
		justify-content: center;
		cursor: pointer;
	}

	/* The first-paint fallback must override the base display before hydration. */
	@media (prefers-reduced-motion: reduce) {
		.boot {
			display: none;
		}
	}

	.inner {
		width: min(100%, 34rem);
		padding: max(4rem, env(safe-area-inset-top, 0px)) 1.5rem max(2.5rem, env(safe-area-inset-bottom, 0px));
		display: flex;
		flex-direction: column;
		gap: 1.75rem;
	}

	.title {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.logo {
		font-family: var(--f-label);
		font-size: 1.4rem;
		letter-spacing: 0.08em;
		color: var(--red);
		text-shadow: 0 0 14px var(--red-glow);
	}

	.title .dim {
		font-size: 0.75rem;
		letter-spacing: 0.1em;
	}

	.lines {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		min-height: 11rem;
		font-size: 0.9rem;
	}

	.lines div {
		display: flex;
		gap: 0.5rem;
		align-items: baseline;
	}

	.dots {
		flex: 1;
		min-width: 1rem;
		border-bottom: 1px dotted var(--faint);
	}

	.warn {
		color: var(--red-soft);
	}

	.cursor {
		display: inline-block;
		width: 0.55rem;
		height: 1rem;
		background: var(--red);
		vertical-align: -2px;
	}

	.progress {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.row {
		display: flex;
		justify-content: space-between;
		font-size: 0.75rem;
		letter-spacing: 0.08em;
	}

	.pct {
		color: var(--bright);
		font-variant-numeric: tabular-nums;
	}

	.track {
		height: 6px;
		background: var(--bg-3);
	}

	.bar {
		height: 100%;
		background: var(--red);
		box-shadow: 0 0 10px var(--red-glow);
	}

	.skip {
		margin-top: auto;
		align-self: center;
		min-height: 44px;
		padding: 0 1.4rem;
		background: transparent;
		color: var(--label);
		letter-spacing: 0.12em;
	}
</style>
