<script lang="ts">
	import { onMount } from 'svelte';
	import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
	import Panel from '#lib/components/Panel.svelte';
	import PdfPage from './PdfPage.svelte';
	import { openPdf, pdfLicenses } from '#lib/rulebook/pdf.ts';
	import { indexPdf } from '#lib/rulebook/extract.ts';
	import { INDEX_VERSION, searchBook } from '#lib/rulebook/search.ts';
	import { loadRulebook, removeRulebook, saveBookPage, saveRulebook, type StoredRulebook } from '#lib/storage/rulebook.ts';

	// PDF.js owns mutable objects and workers; $state.raw avoids wrapping them in proxies.
	let pdf = $state.raw<PDFDocumentProxy | undefined>();
	let book = $state.raw<StoredRulebook | undefined>();
	let busy = $state(true);
	let status = $state('Opening on-device library…');
	let error = $state('');
	let pageNumber = $state(1);
	let jump = $state<number | undefined>(1);
	let zoom = $state(1);
	let query = $state('');
	let submitted = $state('');
	let confirmingRemove = $state(false);
	let alive = true;
	let pending: PDFDocumentLoadingTask | undefined;
	const results = $derived(book ? searchBook(book.index, submitted) : []);
	const searchable = $derived(book?.index.pages.some((text) => text.trim()) ?? false);

	onMount(() => {
		void restore();
		return () => { alive = false; void pending?.destroy(); void pdf?.loadingTask.destroy(); };
	});

	function message(e: unknown): string {
		if (e instanceof Error && e.name === 'PasswordException') return 'This PDF is password-protected. Choose an unlocked copy.';
		if (e instanceof Error && e.name === 'QuotaExceededError') return 'Not enough on-device storage. Free some browser storage and try again.';
		return e instanceof Error ? e.message : 'Could not open this PDF.';
	}

	async function restore() {
		try {
			const saved = await loadRulebook();
			if (!alive || !saved) return;
			pending = openPdf(new Uint8Array(await saved.pdf.arrayBuffer()));
			const opened = await pending.promise;
			if (!alive) return;
			if (saved.index.version !== INDEX_VERSION) {
				saved.index = await indexPdf(opened, (n) => { status = `Indexing page ${n} / ${opened.numPages}…`; });
				await saveRulebook(saved);
			}
			book = saved;
			pdf = opened;
			pageNumber = Math.max(1, Math.min(opened.numPages, saved.page));
			jump = pageNumber;
		} catch (e) {
			if (alive) error = message(e);
			await pending?.destroy();
		} finally {
			pending = undefined;
			if (alive) { busy = false; status = ''; }
		}
	}

	async function choose(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file || busy) return;
		busy = true;
		error = '';
		status = 'Opening PDF on this device…';
		try {
			if (file.size > 250 * 1024 * 1024) throw new Error('Choose a PDF smaller than 250 MB.');
			const header = new TextDecoder().decode(await file.slice(0, 1024).arrayBuffer());
			if (!header.includes('%PDF-')) throw new Error('This file does not look like a PDF.');
			pending = openPdf(new Uint8Array(await file.arrayBuffer()));
			const opened = await pending.promise;
			const index = await indexPdf(opened, (n) => { if (alive) status = `Indexing page ${n} / ${opened.numPages}…`; });
			if (!alive) return;
			const next: StoredRulebook = { id: 'red-core', name: file.name, pdf: file, index, page: 1, savedAt: Date.now() };
			status = 'Saving PDF and search index on this device…';
			await saveRulebook(next);
			if (!alive) return;
			const previous = pdf;
			pdf = opened;
			book = next;
			pending = undefined;
			pageNumber = jump = 1;
			query = submitted = '';
			confirmingRemove = false;
			void previous?.loadingTask.destroy();
		} catch (e) {
			if (alive) error = `${message(e)}${book ? ' Your previous book is unchanged.' : ''}`;
		} finally {
			await pending?.destroy();
			pending = undefined;
			if (alive) { busy = false; status = ''; }
		}
	}

	function go(number: number | undefined) {
		if (!pdf || busy || number === undefined || !Number.isInteger(number)) return;
		pageNumber = Math.max(1, Math.min(pdf.numPages, number));
		jump = pageNumber;
		void saveBookPage(pageNumber).catch((e) => { error = `Could not save reading position: ${message(e)}`; });
	}

	async function remove() {
		busy = true;
		error = '';
		try {
			await removeRulebook();
			const previous = pdf;
			pdf = undefined;
			book = undefined;
			query = submitted = '';
			confirmingRemove = false;
			void previous?.loadingTask.destroy();
		} catch (e) { error = message(e); }
		finally { busy = false; }
	}
</script>

<Panel title="YOUR RULEBOOK">
	<p>Load your own Cyberpunk RED PDF. The book and search index stay on this device and are never uploaded.</p>
	<p class="dim">Available offline after loading. Clearing this site's browser data removes your copy.</p>
	<label class="picker">{book ? 'REPLACE PDF' : 'CHOOSE PDF'}
		<input type="file" accept="application/pdf,.pdf" disabled={busy} onchange={choose} />
	</label>
	{#if book}<p class="filename">{book.name} · {book.index.pages.length} PDF pages</p>{/if}
	{#if busy}<p role="status">{status || 'Removing on-device book…'}</p>{/if}
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	{#if book || error}
		<div class="remove">
			{#if confirmingRemove}
				<span>Remove this device's book and search index?</span>
				<button type="button" disabled={busy} onclick={remove}>YES, REMOVE</button>
				<button type="button" disabled={busy} onclick={() => confirmingRemove = false}>CANCEL</button>
			{:else}
				<button type="button" disabled={busy} onclick={() => confirmingRemove = true}>REMOVE STORED BOOK</button>
			{/if}
		</div>
	{/if}
</Panel>

{#if book && pdf}
	<Panel title="SEARCH THIS BOOK">
		<form class="search" onsubmit={(e) => { e.preventDefault(); submitted = query; }}>
			<input type="search" aria-label="Search rulebook" placeholder="Words to find…" bind:value={query} disabled={busy} />
			<button type="submit" disabled={busy}>SEARCH</button>
		</form>
		{#if !searchable}<p class="dim">This PDF has no searchable text. Image-only scans can still be read; OCR is not included.</p>{/if}
		{#if submitted.trim()}
			<p class="dim" role="status">{results.length ? `${results.length}${results.length === 50 ? '+' : ''} matching ${results.length === 1 ? 'page' : 'pages'}` : 'No matching pages'}. All words must occur on the page.</p>
			<ul class="results">
				{#each results as result (result.page)}
					<li><button type="button" disabled={busy} onclick={() => go(result.page)}>
						<strong>PAGE {result.page}</strong> <span>{result.snippet}</span>
					</button></li>
				{/each}
			</ul>
		{/if}
	</Panel>

	<Panel title="PDF READER">
		<form class="navigation" onsubmit={(e) => { e.preventDefault(); go(jump); }}>
			<button type="button" disabled={busy || pageNumber <= 1} onclick={() => go(pageNumber - 1)} aria-label="Previous page">←</button>
			<label>PAGE <input type="number" min="1" max={pdf.numPages} bind:value={jump} aria-label="PDF page number" disabled={busy} /></label>
			<span>/ {pdf.numPages}</span>
			<button type="submit" disabled={busy}>GO</button>
			<button type="button" disabled={busy || pageNumber >= pdf.numPages} onclick={() => go(pageNumber + 1)} aria-label="Next page">→</button>
		</form>
		<p class="dim">PDF page numbers include covers; they may differ from printed page numbers.</p>
		<div class="zoom">
			<button type="button" disabled={zoom <= 1} onclick={() => zoom = Math.max(1, zoom - 0.5)} aria-label="Zoom out">−</button>
			<span>{Math.round(zoom * 100)}% · fit width at 100%</span>
			<button type="button" disabled={zoom >= 3} onclick={() => zoom = Math.min(3, zoom + 0.5)} aria-label="Zoom in">+</button>
		</div>
		<PdfPage document={pdf} {pageNumber} {zoom} />
		<details><summary>PAGE {pageNumber} TEXT</summary><pre>{book.index.pages[pageNumber - 1]}</pre></details>
	</Panel>
{/if}

<style>
	p { margin: 0.5rem 0; }
	.dim { color: var(--muted); font-size: 0.85rem; }
	.error { color: var(--red-soft); overflow-wrap: anywhere; }
	.filename { color: var(--mint); overflow-wrap: anywhere; }
	.picker { display: grid; gap: 0.5rem; margin: 1rem 0; }
	input, button { min-height: 44px; }
	input { min-width: 0; width: 100%; }
	input[type='file'] { max-width: 100%; }
	.search { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0.5rem; }
	.navigation, .zoom, .remove { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin: 0.5rem 0; }
	.navigation label { display: flex; align-items: center; gap: 0.4rem; }
	.navigation input { width: 5rem; }
	.results { list-style: none; padding: 0; max-height: 20rem; overflow-y: auto; }
	.results button { text-align: left; width: 100%; margin-bottom: 0.5rem; overflow-wrap: anywhere; }
	.results strong { color: var(--mint); display: block; }
	summary { min-height: 44px; cursor: pointer; padding-top: 0.75rem; }
	pre { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; }
</style>

<details><summary>PDF.js / third-party licenses</summary>
	<ul>{#each pdfLicenses as license (license.name)}<li><a href={license.url} target="_blank" rel="noreferrer">{license.name}</a></li>{/each}</ul>
</details>
