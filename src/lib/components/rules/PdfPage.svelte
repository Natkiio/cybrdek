<script lang="ts">
	import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
	let { document, pageNumber, zoom }: { document: PDFDocumentProxy; pageNumber: number; zoom: number } = $props();
	let canvas: HTMLCanvasElement;
	let width = $state(0);
	let rendering = $state(false);
	let error = $state('');

	$effect(() => {
		const pdf = document;
		const number = pageNumber;
		const available = width;
		const magnification = zoom;
		if (!canvas || !available) return;
		let cancelled = false;
		let task: RenderTask | undefined;
		const target = canvas;
		rendering = true;
		error = '';
		void (async () => {
			try {
				const page = await pdf.getPage(number);
				if (cancelled) return;
				const base = page.getViewport({ scale: 1 });
				const scale = Math.min(available / base.width, 2) * magnification;
				const viewport = page.getViewport({ scale });
				const ratio = Math.min(window.devicePixelRatio || 1, 2);
				target.width = Math.floor(viewport.width * ratio);
				target.height = Math.floor(viewport.height * ratio);
				target.style.width = `${viewport.width}px`;
				target.style.height = `${viewport.height}px`;
				task = page.render({ canvas: target, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
				await task.promise;
			} catch (e) {
				if (!cancelled) error = e instanceof Error ? e.message : 'Could not render this page.';
			} finally {
				if (!cancelled) rendering = false;
			}
		})();
		return () => { cancelled = true; task?.cancel(); };
	});
</script>

<div class="viewport" bind:clientWidth={width} aria-busy={rendering}>
	{#if error}<p role="alert">PAGE FAILED: {error}</p>{/if}
	<canvas bind:this={canvas} aria-label="PDF page {pageNumber}"></canvas>
</div>

<style>
	.viewport { width: 100%; overflow: auto; min-height: 12rem; border: 1px solid var(--frame-dim); }
	canvas { display: block; margin: 0 auto; }
	p { padding: 0.5rem; color: var(--red-soft); }
</style>
