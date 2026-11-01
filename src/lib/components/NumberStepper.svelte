<script lang="ts">
	// A − value + control. `value` is $bindable, so a parent can write
	// <NumberStepper bind:value={stats.REF} ... /> and the two stay in sync.
	let {
		value = $bindable(),
		min,
		max,
		canIncrease = true,
		label
	}: {
		value: number;
		min: number;
		max: number;
		canIncrease?: boolean; // false when the point pool is empty
		label: string; // for screen readers, e.g. "REF"
	} = $props();
</script>

<div class="stepper">
	<button
		type="button"
		aria-label="Lower {label}"
		disabled={value <= min}
		onclick={() => (value = value - 1)}>−</button
	>
	<output aria-live="polite" aria-label={label}>{value}</output>
	<button
		type="button"
		aria-label="Raise {label}"
		disabled={value >= max || !canIncrease}
		onclick={() => (value = value + 1)}>+</button
	>
</div>

<style>
	.stepper {
		display: inline-flex;
		align-items: stretch;
		border: 1px solid var(--frame-dim);
	}

	button {
		min-width: 44px;
		min-height: 44px;
		background: var(--bg-2);
		color: var(--mint);
		border: none;
		font-family: var(--f-mono);
		font-size: 1.2rem;
		cursor: pointer;
	}

	button:hover:not(:disabled),
	button:focus-visible {
		background: var(--bg-3);
		color: var(--value);
	}

	button:disabled {
		color: var(--faint);
		cursor: not-allowed;
	}

	output {
		min-width: 2.5ch;
		display: grid;
		place-items: center;
		padding: 0 0.5rem;
		color: var(--value);
		font-size: 1.1rem;
		border-left: 1px solid var(--frame-dim);
		border-right: 1px solid var(--frame-dim);
	}
</style>
