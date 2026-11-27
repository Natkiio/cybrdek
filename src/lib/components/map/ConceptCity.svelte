<script lang="ts" module>
	/** A deterministic random sequence from a string, so the city is the same every time. */
	export function seeded(seed: string): () => number {
		let s = 0;
		for (const c of seed) s = (s * 31 + c.charCodeAt(0)) >>> 0;
		return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
	}
</script>

<script lang="ts">
	// The concept city (Nathan, 27 Nov): a generated map in the "Map first" mockup
	// style, drawn from the map's own districts and wards. Each district gets cube
	// buildings and a street grid at its own angle; wards are dashed outlines.
	// Nothing here comes from the map image, so new wards drawn by the GM appear
	// automatically. Drawn inside CityMap's SVG, in image coordinates.
	import type { MapArea, Size } from '#lib/map/types.ts';

	let { areas, map, selectedId, scale, uid }: {
		areas: readonly MapArea[];
		map: Size;
		selectedId?: string;
		scale: number; // screen px per image px, to keep labels readable when zoomed out
		uid: string; // unique per map view, for clip and pattern ids
	} = $props();

	const points = (a: MapArea) => a.polygon.map((p) => p.join(',')).join(' ');
	const districts = $derived(areas.filter((a) => a.kind === 'district'));
	const wards = $derived(areas.filter((a) => a.kind === 'ward'));
	// Street spacing and building size scale with the map, tuned on Voyage City's 3840 px.
	const unit = $derived(Math.max(map.width, map.height) / 3840);

	interface Block {
		id: string;
		angle: number;
		bw: number;
		bh: number;
		cubes: [number, number, number, number][];
		streets: [number, number, number, number][];
	}
	const blocks: Block[] = $derived(
		districts.map((d) => {
			const r = seeded(d.id);
			const angle = -25 + r() * 50;
			const bw = (92 + Math.round(r() * 24)) * unit;
			const bh = (78 + Math.round(r() * 20)) * unit;
			const cubes = (
				[
					[10 * unit, 10 * unit, bw * 0.36, bh * 0.34],
					[bw * 0.52, 10 * unit, bw * 0.4, bh * 0.36],
					[10 * unit, bh * 0.54, bw * 0.3, bh * 0.36],
					[bw * 0.48, bh * 0.56, bw * 0.42, bh * 0.32]
				] as [number, number, number, number][]
			).filter(() => r() >= 0.12); // the odd empty lot
			const [lx, ly] = d.label;
			const rad = (angle * Math.PI) / 180;
			const span = 1400 * unit;
			const streets: [number, number, number, number][] = [];
			for (let k = -6; k <= 6; k++) {
				const off = k * 230 * unit;
				for (const a of [rad, rad + Math.PI / 2]) {
					const cx = lx + Math.cos(a + Math.PI / 2) * off;
					const cy = ly + Math.sin(a + Math.PI / 2) * off;
					streets.push([cx - Math.cos(a) * span, cy - Math.sin(a) * span, cx + Math.cos(a) * span, cy + Math.sin(a) * span]);
				}
			}
			return { id: d.id, angle, bw, bh, cubes, streets };
		})
	);
	const selected = $derived(areas.find((a) => a.id === selectedId));
	const selectedDistrict = $derived(selected?.kind === 'ward' ? selected.parentId : selected?.id);
	// Labels: their concept size, but never smaller than readable on screen.
	const districtLabel = $derived(Math.max(64 * unit, 15 / scale));
	const wardLabel = $derived(Math.max(38 * unit, 11 / scale));
</script>

<g class="concept">
	<defs>
		<pattern id="{uid}-grid" width={160 * unit} height={160 * unit} patternUnits="userSpaceOnUse">
			<path d="M{160 * unit} 0H0V{160 * unit}" class="gridline" />
		</pattern>
		{#each districts as d, i (d.id)}
			{@const b = blocks[i]}
			<clipPath id="{uid}-clip-{d.id}"><polygon points={points(d)} /></clipPath>
			<pattern id="{uid}-blocks-{d.id}" width={b.bw} height={b.bh} patternUnits="userSpaceOnUse" patternTransform="rotate({b.angle.toFixed(1)})">
				{#each b.cubes as [x, y, w, h], j (j)}
					<rect {x} {y} width={w} height={h} class="cube" />
					<rect x={x + 3 * unit} y={y + 3 * unit} width={w - 6 * unit} height={h * 0.42} class="cube-top" />
				{/each}
			</pattern>
		{/each}
	</defs>
	<rect class="water" width={map.width} height={map.height} />
	<rect width={map.width} height={map.height} fill="url(#{uid}-grid)" />
	{#each districts as d, i (d.id)}
		<g clip-path="url(#{uid}-clip-{d.id})">
			<polygon points={points(d)} class="land" />
			<rect width={map.width} height={map.height} fill="url(#{uid}-blocks-{d.id})" />
			{#each blocks[i].streets as [x1, y1, x2, y2], j (j)}
				<line {x1} {y1} {x2} {y2} class="street" style:stroke-width={7 * unit} />
			{/each}
		</g>
	{/each}
	{#each wards as w (w.id)}
		<polygon points={points(w)} class="ward-edge" class:on={w.parentId === selectedDistrict} />
	{/each}
	{#each districts as d (d.id)}
		<polygon points={points(d)} class="edge" class:on={d.id === selectedDistrict} />
	{/each}
	{#each districts as d (d.id)}
		<text x={d.label[0]} y={d.label[1]} class="district-name" style:font-size="{districtLabel}px">{d.name.toUpperCase()}</text>
	{/each}
	{#each wards as w (w.id)}
		<text x={w.label[0]} y={w.label[1]} class="ward-name" style:font-size="{wardLabel}px">{w.name.toUpperCase()}</text>
	{/each}
</g>

<style>
	/* Colours derive from the theme's red and blacks (mockup A, #101). */
	.water { fill: var(--bg-0); }
	.gridline { fill: none; stroke: color-mix(in srgb, var(--red) 9%, var(--bg-0)); stroke-width: 2; vector-effect: non-scaling-stroke; }
	.land { fill: color-mix(in srgb, var(--red) 4%, var(--bg-2)); }
	.cube { fill: color-mix(in srgb, var(--red) 6%, var(--bg-3)); stroke: color-mix(in srgb, var(--red) 22%, var(--bg-3)); stroke-width: 1.5; }
	.cube-top { fill: color-mix(in srgb, var(--value) 8%, var(--bg-3)); }
	.street { stroke: color-mix(in srgb, var(--red) 18%, var(--bg-2)); fill: none; stroke-linecap: square; }
	.edge { fill: none; stroke: color-mix(in srgb, var(--red) 55%, var(--bg-2)); stroke-width: 2.5; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
	.edge.on { stroke: var(--red); stroke-width: 4; }
	.ward-edge { fill: none; stroke: color-mix(in srgb, var(--red) 35%, var(--bg-2)); stroke-width: 1.5; stroke-dasharray: 6 4; vector-effect: non-scaling-stroke; }
	.ward-edge.on { stroke: var(--red); stroke-width: 2; }
	text { text-anchor: middle; dominant-baseline: middle; paint-order: stroke; stroke: var(--bg-0); stroke-linejoin: round; pointer-events: none; }
	.district-name { font-family: var(--f-label); letter-spacing: 0.1em; fill: var(--value); stroke-width: 0.22em; }
	.ward-name { font-family: var(--f-mono); letter-spacing: 0.08em; fill: var(--label); stroke-width: 0.26em; }
</style>
