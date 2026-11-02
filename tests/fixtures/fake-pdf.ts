/** Entirely invented text, assembled into a PDF in memory. Never use a rulebook as a fixture. */
export function fakePdf(pages = [
	'An invented manual about violet umbrellas.',
	'Clockwork otters repair the violet engine.',
	'The umbrella museum closes at midnight.'
]): Uint8Array {
	const encode = (text: string) => new TextEncoder().encode(text);
	const objects = [
		'<< /Type /Catalog /Pages 2 0 R >>',
		`<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
		'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
	];
	for (const text of pages) {
		const escaped = text.replace(/[\\()]/g, '\\$&');
		const stream = `BT /F1 18 Tf 40 200 Td (${escaped}) Tj ET\n`;
		const contentId = objects.length + 2;
		objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`,
			`<< /Length ${encode(stream).length} >>\nstream\n${stream}endstream`);
	}
	let pdf = '%PDF-1.7\n';
	const offsets = [0];
	objects.forEach((object, i) => {
		offsets.push(encode(pdf).length);
		pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
	});
	const xref = encode(pdf).length;
	pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
	for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
	pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
	return encode(pdf);
}
