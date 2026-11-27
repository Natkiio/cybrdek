<script lang="ts">
	import type { Snippet } from 'svelte';
	let { open, title, onclose, children }: { open: boolean; title: string; onclose: () => void; children: Snippet } = $props();
	const id = $props.id();
	let dialog: HTMLDialogElement;
	$effect(() => {
		if (open && !dialog.open) {
			dialog.showModal();
			dialog.querySelector<HTMLElement>('[data-initial-focus]')?.focus();
		}
		else if (!open && dialog.open) dialog.close();
	});
</script>

<dialog bind:this={dialog} aria-labelledby={id} onclose={() => { if (open) onclose(); }}>
	<header><h2 id={id}>{title}</h2><button type="button" aria-label="Close {title}" onclick={onclose}>×</button></header>
	<div class="contents">{@render children()}</div>
</dialog>

<style>
	dialog { margin: auto 0 0 auto; padding: 0; width: min(100%, 30rem); max-width: 100%; max-height: 90dvh; border: 1px solid var(--frame); color: var(--value); background: var(--bg-0); }
	dialog::backdrop { background: var(--bg-0); opacity: 0.65; }
	header { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; justify-content: space-between; gap: 1rem; background: var(--bg-1); padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--frame-dim); }
	h2 { margin: 0; font-family: var(--f-label); font-size: 0.9rem; }
	button { min-width: 44px; min-height: 44px; }
	.contents { padding: 0.75rem; overflow-wrap: anywhere; }
	@media (min-width: 700px) { dialog { margin: 0 0 0 auto; max-height: 100dvh; height: 100dvh; } }
</style>
