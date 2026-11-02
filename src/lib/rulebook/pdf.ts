import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Vite emits these vendor files as app assets. The service worker precaches them,
// including the worker and vendor licenses, so there is no CDN and no book data is sent to a URL.
GlobalWorkerOptions.workerSrc = workerUrl;
const assets = import.meta.glob<string>([
	'/node_modules/pdfjs-dist/cmaps/*.bcmap',
	'/node_modules/pdfjs-dist/standard_fonts/*.{pfb,ttf}',
	'/node_modules/pdfjs-dist/wasm/*.{wasm,js}',
	'/node_modules/pdfjs-dist/standard_fonts/LICENSE_*',
	'/node_modules/pdfjs-dist/wasm/LICENSE_*',
	'/node_modules/pdfjs-dist/LICENSE'
], { eager: true, query: '?url', import: 'default' });
export const pdfLicenses = Object.entries(assets).filter(([path]) => path.includes('/LICENSE'))
	.map(([path, url]) => ({ name: path.split('/').slice(-2).join('/'), url }));

const assetUrls = new Map(Object.entries(assets).map(([path, url]) => {
	const [, directory, filename] = /\/([^/]+)\/([^/]+)$/.exec(path)!;
	const kind = directory === 'cmaps' ? 'cMapUrl' : directory === 'standard_fonts' ? 'standardFontDataUrl' : 'wasmUrl';
	return [`${kind}/${filename}`, url];
}));

class BundledBinaryDataFactory {
	async fetch({ kind, filename }: { kind: string; filename: string }): Promise<Uint8Array> {
		const url = assetUrls.get(`${kind}/${filename}`);
		if (!url) throw new Error('Missing bundled PDF.js asset.');
		const response = await fetch(url);
		if (!response.ok) throw new Error('Could not load a bundled PDF.js asset.');
		return new Uint8Array(await response.arrayBuffer());
	}
}

export function openPdf(data: Uint8Array) {
	return getDocument({
		data,
		BinaryDataFactory: BundledBinaryDataFactory,
		useWorkerFetch: false,
		enableXfa: false
	});
}
