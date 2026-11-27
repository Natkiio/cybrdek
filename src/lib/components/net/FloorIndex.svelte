<script lang="ts">
	let { floors, prefix, name, player = false, editing = false }: {
		floors: readonly { id: string; label: string; revealed?: boolean }[];
		prefix: string;
		name: string;
		player?: boolean;
		editing?: boolean;
	} = $props();
</script>

{#if floors.length}
	<nav aria-label="{editing ? 'Edit floors' : player ? 'Revealed floors' : 'Floors'} in {name}">
		<p>{player ? 'REVEALED FLOORS' : 'FLOOR INDEX'}</p>
		<ol>
			{#each floors as floor, i (floor.id)}
				<li><a href="#{encodeURIComponent(`${prefix}-${floor.id}`)}">
					<span class="number">{String(i + 1).padStart(2, '0')}</span>
					<span class="label">{floor.label}</span>
					{#if !player && floor.revealed !== undefined}<span class="state" class:revealed={floor.revealed}>{floor.revealed ? 'REVEALED' : 'HIDDEN'}</span>{/if}
				</a></li>
			{/each}
		</ol>
	</nav>
{/if}

<style>
	nav { display: none; }
	@media (min-width: 1000px) {
		nav { display: block; position: sticky; top: calc(var(--net-header-height, 4rem) + 1rem); max-height: calc(100dvh - var(--net-header-height, 4rem) - 2rem); overflow-y: auto; overscroll-behavior: contain; }
	}
	p { color: var(--label); font-family: var(--f-label); font-size: 0.65rem; letter-spacing: 0.1em; margin: 0 0 0.5rem; }
	ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.25rem; }
	a { display: grid; grid-template-columns: 2ch minmax(0, 1fr); align-items: center; gap: 0.25rem 0.6rem; min-height: 44px; padding: 0.4rem 0.5rem; color: var(--value); border-left: 2px solid var(--frame-dim); text-decoration: none; }
	a:hover, a:focus-visible { border-color: var(--bright); background: var(--bg-2); }
	.number { color: var(--red); }
	.label { overflow-wrap: anywhere; }
	.state { grid-column: 2; color: var(--muted); font-size: 0.65rem; }
	.state.revealed { color: var(--bright); }
</style>
