// NET rules quick reference (#100, part 7). Our own short summaries with page
// numbers so you can check the book. No rulebook text. Core pp. 196–212.
import { INTERFACE_ABILITIES } from './interface.ts';

export interface RuleSection {
	id: string;
	title: string;
	pages: string;
	points: string[];
}

export const NET_RULES: readonly RuleSection[] = [
	{
		id: 'getting-in',
		title: 'What you need',
		pages: '196–198, 208',
		points: [
			'A Neural Link with Interface Plugs, and a Cyberdeck loaded with Programs.',
			'Virtuality Goggles (or Virtuality cybereyes) lay the NET over what you see. Without them you count as Unconscious in Meatspace while jacked in.',
			'There is no worldwide NET any more: you hack a place by being there, within 6 m/yds of one of its access points (8 m/yds with a Range Upgrade), with no wall in the way.'
		]
	},
	{
		id: 'turn',
		title: 'Your Turn',
		pages: '197–198',
		points: [
			'Take either one Meat Action (in the real world) or all your NET Actions. You always get your Move Action too.',
			'NET Actions per Turn come from Interface: rank 1–3 → 2, 4–6 → 3, 7–9 → 4, 10 → 5.',
			'NET Actions: Jack In or Out, use an Interface Ability, Activate or Deactivate a Program, or something unusual the GM allows.',
			'Free: moving between floors (until something like a Password blocks you) and saving a copy of a File.'
		]
	},
	{
		id: 'abilities',
		title: 'Interface Abilities',
		pages: '198–201',
		points: [
			'Roll Interface + 1d10 vs the DV. Scanner is a Meat Action; the rest each cost a NET Action.',
			...INTERFACE_ABILITIES.map((a) => `${a.name}: ${a.summary}`)
		]
	},
	{
		id: 'architecture',
		title: 'Architectures',
		pages: '209–210',
		points: [
			'A stack of floors you go down, one thing per floor: a Password, File, Control Node, Black ICE or a Demon.',
			'Usually 3d6 floors. It can branch after floor 2; the longest branch has the bottom, the only place a Virus can go.',
			'The top two floors are the Lobby. Deeper floors hold the better Files and Control Nodes.',
			'Difficulty sets the DV of Passwords, Files and Control Nodes: Basic 6, Standard 8, Uncommon 10, Advanced 12.',
			'Control Nodes run real things (cameras, doors, turrets, sprinklers). A Demon runs any active defences.'
		]
	},
	{
		id: 'programs',
		title: 'Programs',
		pages: '201–202',
		points: [
			'Boosters improve you while Rezzed, Defenders stop or soften attacks while Rezzed, Attackers hurt Programs or Netrunners.',
			'Activating or Deactivating a Program is a NET Action. Each copy activates once per Round, and not again until Deactivated.',
			'Attackers switch themselves off after one use. Copies of the same Program stack unless it says otherwise.',
			'REZ is a Program’s hit points. At 0 it is Derezzed: still loaded but useless until you spend 2 NET Actions to Deactivate and Activate it again.',
			'A Destroyed Program is erased for good. Installing or uninstalling a Program takes an hour.'
		]
	},
	{
		id: 'combat',
		title: 'NET combat',
		pages: '201',
		points: [
			'Attack: Interface + Program ATK + 1d10 (or Black ICE ATK + 1d10).',
			'Defence: the target Netrunner’s Interface + 1d10, or the Program’s or Black ICE’s DEF + 1d10.',
			'On a hit the target suffers the Program’s Effect. Anti-Personnel only hurts Netrunners; Anti-Program only hurts Programs.',
			'Zap needs no Program: on a hit it deals 1d6 to a Program’s REZ or the Netrunner’s brain.'
		]
	},
	{
		id: 'black-ice',
		title: 'Black ICE',
		pages: '204–205',
		points: [
			'Anti-Personnel ICE hunts Netrunners, Anti-Program ICE hunts their Rezzed Programs, and Demons run an Architecture’s Control Nodes.',
			'Meeting ICE lying in wait: roll Interface + any active SPD bonus + 1d10 vs its SPD + 1d10. If it wins, you (or a random Program of yours) take its Effect at once.',
			'Then it joins Initiative at the very top and attacks once a Turn: its ATK + 1d10 vs your Interface + 1d10 (or the Program’s DEF + 1d10).',
			'It chases you through the whole Architecture until it is Derezzed or you Slide away. Slid ICE waits where the chase ended.',
			'The GM plays every Black ICE Turn.'
		]
	},
	{
		id: 'leaving',
		title: 'Getting out',
		pages: '198',
		points: [
			'Jacking Out is a NET Action while you’re still in range. It’s the safe way.',
			'Leaving range while jacked in throws you out unsafely: every enemy Black ICE you met and didn’t Derez hits you first.',
			'Either way the Architecture resets. Next time you start again from the top, and your Programs leave with you.'
		]
	}
];
