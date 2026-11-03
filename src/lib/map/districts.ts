import { slugify } from '#lib/lore/links.ts';

export const MAP_WIDTH = 3840;
export const MAP_HEIGHT = 2160;
export type Point = readonly [x: number, y: number];

export interface District {
	id: string;
	name: string;
	loreSlug: string;
	/** Coordinates in the original 3840 × 2160 image, independent of the WebP resolution. */
	polygon: readonly Point[];
	label: Point;
	boundary: 'marked' | 'inferred';
	/** Voyage City has 7 districts; wards are named areas inside a district. */
	kind: 'district' | 'ward';
	/** For a ward: the id of the district it belongs to. */
	parentId?: string;
}

// Traced from Nathan's The_City_of_Voyage.jpg. Thick white lines define the main
// divisions. Coastlines close the land shapes. Smaller named neighbourhoods have
// no drawn enclosing boundary: their street-edge extents are explicitly inferred.
// Smaller shapes win hit-testing so neighbourhoods inside a district stay tappable.
const district = (name: string, label: Point, polygon: readonly Point[], boundary: District['boundary'] = 'inferred'): District => ({
	id: slugify(name), name, loreSlug: slugify(name), polygon, label, boundary, kind: 'district'
});

/** Ward → the district it belongs to (Nathan, 2026-11-03: 7 districts, the rest are wards). */
const WARD_OF: Record<string, string> = {
	'nova-peak': 'west-ridge',
	'amber-hill': 'eagelton',
	ashgreene: 'central-point',
	'little-japan': 'akiba',
	newpine: 'central-point',
	'port-of-voyage': 'central-point'
};

const ridgeEast: Point[] = [[1625,52],[1422,246],[1442,358],[1375,377],[1460,655],[1415,693],[1450,788]];
const ridgeSouth: Point[] = [[1450,788],[1425,822],[1338,829],[1273,790],[1220,829],[1133,798],[1054,848],[1014,832],[938,785],[885,825],[797,709],[748,750],[670,451]];
const eageltonEast: Point[] = [[1625,52],[1720,43],[1820,100],[1880,21],[1990,70],[2100,63],[2190,20],[2305,87],[2282,247],[2210,415],[2165,602],[2107,744]];
const sectorNorth: Point[] = [[670,451],[748,750],[797,709],[885,825],[938,785],[1014,832],[1054,848],[1133,798],[1220,829],[1273,790],[1338,829],[1425,822],[1450,788]];
const dayneSouth: Point[] = [[2745,350],[2815,455],[3028,500],[3090,645],[3570,500]];
const boweNorth: Point[] = [[3570,1525],[3500,1470],[3315,1565],[3230,1486],[3016,1650],[2980,1603],[2863,1765],[2890,1930],[2840,1970],[2880,2118]];
const newpineWest: Point[] = [[2198,1613],[2180,1697],[2354,1816],[2373,1886],[2515,1940],[2545,2105]];

const TRACED: readonly District[] = [
	district('West Ridge', [1050,390], [
		[745,0],[1030,55],[1172,0],[1330,52],[1408,0],[1535,70],...ridgeEast,...ridgeSouth.slice(1),[660,319]
	], 'marked'),
	district('Eagelton', [1730,461], [
		...eageltonEast,[2045,873],[1880,940],[1690,949],[1510,986],[1445,909],[1474,859],[1450,788],...ridgeEast.slice(0,-1).reverse()
	], 'marked'),
	district('Corp Sector', [760,1030], [
		...sectorNorth,[1474,859],[1445,909],[1510,986],[1194,1030],[1095,1142],[1125,1210],[999,1250],[853,1362],[600,1460],
		[541,1420],[490,1346],[442,1220],[400,1200],[394,1132],[434,1040],[468,814],[494,560],[526,542],[644,581]
	], 'marked'),
	district('Nova Peak', [1070,651], [[880,546],[1125,651],[1215,760],[1133,798],[1054,848],[1014,832],[938,785],[885,825],[797,709]], 'inferred'),
	district('Amber Hill', [1815,844], [[1510,774],[1845,725],[2107,744],[2045,873],[1880,940],[1690,949],[1510,986],[1445,909],[1474,859],[1450,788]]),
	district('Daynedale', [3205,210], [
		[2730,48],[2820,43],[2825,20],[3000,3],[3090,56],[3190,0],[3340,0],[3435,82],[3565,70],
		[3585,230],[3565,375],[3570,500],...dayneSouth.slice(0,-1).reverse(),[2607,350],[2660,274],[2730,237]
	], 'marked'),
	district('Central Point', [3000,890], [
		...dayneSouth,[3567,704],[3600,883],[3590,1100],[3600,1380],[3570,1525],...boweNorth.slice(1),
		[2545,2105],[2515,1940],[2373,1886],[2354,1816],[2180,1697],[2198,1613],[2525,1640],[2580,1590],
		[2674,1475],[2635,1410],[2473,1420],[2420,1370],[2430,1290],[2380,1190],[2355,1048],[2390,954],[2417,809],[2497,643],[2585,513]
	], 'marked'),
	district('Ashgreene', [3305,1243], [[3040,1135],[3310,1170],[3570,1130],[3600,1380],[3570,1525],[3500,1470],[3315,1565],[3170,1430],[3050,1280]]),
	district('Bowetown', [3245,1770], [
		...boweNorth,[3010,2145],[3300,2130],[3590,2098],[3605,1900],[3587,1760],[3630,1735],[3595,1660],[3590,1560]
	], 'marked'),
	district('Akiba', [1530,1700], [
		[1208,1428],[1260,1350],[1360,1283],[1445,1291],[1510,1267],[1620,1251],[1735,1268],[1815,1280],[1988,1240],
		[1960,1390],[2050,1535],[2198,1613],...newpineWest.slice(1),[2398,2150],[2120,2115],[1970,2140],[1795,2090],
		[1725,2110],[1580,2145],[1400,2120],[1240,2050],[1110,2020],[1014,1950],[1090,1830],[1165,1635]
	], 'inferred'),
	district('Little Japan', [1995,1807], [[1787,1740],[2010,1725],[2180,1697],[2354,1816],[2373,1886],[2515,1940],[2545,2105],[2398,2150],[2120,2115],[1970,2140],[1815,2090]]),
	district('Newpine', [2610,1765], [[2198,1613],[2525,1640],[2580,1590],[2674,1475],[2860,1610],[2980,1603],[2863,1765],[2890,1930],[2840,1970],[2880,2118],[2675,2150],[2545,2105],[2515,1940],[2373,1886],[2354,1816],[2180,1697]], 'marked'),
	district('Port of Voyage', [2300,1440], [[1988,1240],[2140,1310],[2370,1210],[2430,1290],[2420,1370],[2473,1420],[2635,1410],[2674,1475],[2580,1590],[2525,1640],[2198,1613],[2050,1535],[1960,1390]]),
];

export const DISTRICTS: readonly District[] = TRACED.map((d) =>
	WARD_OF[d.id] ? { ...d, kind: 'ward', parentId: WARD_OF[d.id] } : d
);

/** The 7 districts, without their wards. */
export const MAIN_DISTRICTS = DISTRICTS.filter((d) => d.kind === 'district');
