import type { PDFDocumentProxy } from 'pdfjs-dist';
import { buildIndex, type BookIndex } from './search.ts';

export async function indexPdf(pdf: PDFDocumentProxy, onprogress: (page: number) => void): Promise<BookIndex> {
	const pages: string[] = [];
	for (let number = 1; number <= pdf.numPages; number++) {
		const page = await pdf.getPage(number);
		try {
			const content = await page.getTextContent();
			pages.push(content.items.map((item) => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join(''));
		} finally {
			page.cleanup();
		}
		onprogress(number);
	}
	return buildIndex(pages);
}
