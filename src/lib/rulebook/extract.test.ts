import { expect, it } from 'vitest';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { fakePdf } from '../../../tests/fixtures/fake-pdf.ts';
import { indexPdf } from './extract.ts';
import { searchBook } from './search.ts';

it('extracts and indexes an actual synthetic PDF locally with PDF.js', async () => {
	const task = getDocument({ data: fakePdf(), useSystemFonts: true });
	try {
		const pdf = await task.promise;
		const progress: number[] = [];
		const index = await indexPdf(pdf, (page) => progress.push(page));
		expect(pdf.numPages).toBe(3);
		expect(progress).toEqual([1, 2, 3]);
		expect(searchBook(index, 'violet engine').map((r) => r.page)).toEqual([2]);
		expect(index.pages[2]).toContain('umbrella museum');
	} finally { await task.destroy(); }
});
