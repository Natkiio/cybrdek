import { rollDice, type RollResult } from '#lib/engine/dice.ts';

export interface DiceTerm {
	count: number;
	sides: number;
	sign: 1 | -1;
}

export type DiceParseResult =
	| { ok: true; terms: DiceTerm[]; modifier: number }
	| { ok: false; error: string };

export type RollExpressionResult =
	| {
			ok: true;
			expression: string;
			result: RollResult;
			groups: { notation: string; rolls: number[] }[];
		}
	| { ok: false; error: string };

const MAX_DICE_PER_GROUP = 100;
const MAX_TOTAL_DICE = 200;
const MAX_SIDES = 1000;

function isDigit(character: string | undefined): boolean {
	return character !== undefined && character >= '0' && character <= '9';
}

function formatTerm(term: DiceTerm, first: boolean): string {
	const notation = `${term.count}d${term.sides}`;
	if (term.sign === -1) return `-${notation}`;
	return first ? notation : `+${notation}`;
}

function formatModifier(modifier: number, hasTerms: boolean): string {
	if (modifier === 0) return '';
	if (modifier > 0) return `${hasTerms ? '+' : ''}${modifier}`;
	return `${modifier}`;
}

/** Turns a dice expression into dice groups and one combined flat modifier. */
export function parseDice(expr: string): DiceParseResult {
	const input = expr.replace(/\s/g, '');
	if (!input) return { ok: false, error: 'Enter a dice expression.' };

	const terms: DiceTerm[] = [];
	let modifier = 0;
	let totalDice = 0;
	let index = 0;
	let sign: 1 | -1 = 1;

	while (index < input.length) {
		if (input[index] === '+' || input[index] === '-') {
			sign = input[index] === '+' ? 1 : -1;
			index += 1;
			if (index >= input.length) return { ok: false, error: `Expected a term after '${input[index - 1]}'.` };
		} else if (index > 0) {
			return { ok: false, error: `Expected '+' or '-' at position ${index + 1}.` };
		}

		let countText = '';
		while (isDigit(input[index])) {
			countText += input[index];
			index += 1;
		}

		const hasDiceMarker = input[index]?.toLowerCase() === 'd';
		if (hasDiceMarker) {
			const count = countText === '' ? 1 : Number(countText);
			if (!Number.isSafeInteger(count)) return { ok: false, error: 'Dice count is too large.' };
			if (count < 1 || count > MAX_DICE_PER_GROUP) {
				return { ok: false, error: `Dice count must be from 1 to ${MAX_DICE_PER_GROUP}.` };
			}

			index += 1;
			let sidesText = '';
			while (isDigit(input[index])) {
				sidesText += input[index];
				index += 1;
			}
			if (sidesText === '') return { ok: false, error: "Expected a number after 'd'." };

			const sides = Number(sidesText);
			if (!Number.isSafeInteger(sides) || sides < 2 || sides > MAX_SIDES) {
				return { ok: false, error: `Dice sides must be from 2 to ${MAX_SIDES}.` };
			}

			totalDice += count;
			if (totalDice > MAX_TOTAL_DICE) return { ok: false, error: `Too many dice (max ${MAX_TOTAL_DICE}).` };
			terms.push({ count, sides, sign });
		} else if (countText !== '') {
			const flatNumber = Number(countText);
			if (!Number.isSafeInteger(flatNumber)) return { ok: false, error: 'Number is too large.' };
			modifier += sign * flatNumber;
		} else {
			return { ok: false, error: `Expected a number or 'd' at position ${index + 1}.` };
		}

		sign = 1;
	}

	if (terms.length === 0) return { ok: false, error: 'Enter at least one dice group.' };
	return { ok: true, terms, modifier };
}

function normaliseExpression(terms: DiceTerm[], modifier: number): string {
	return `${terms.map((term, index) => formatTerm(term, index === 0)).join('')}${formatModifier(modifier, terms.length > 0)}`;
}

/** Rolls a validated expression, retaining each die for display and the roll log. */
export function rollExpression(expr: string): RollExpressionResult {
	const parsed = parseDice(expr);
	if (!parsed.ok) return parsed;

	const groups = parsed.terms.map((term, index) => ({
		notation: formatTerm(term, index === 0),
		rolls: rollDice(term.count, term.sides)
	}));
	const rolls = groups.flatMap((group) => group.rolls);
	const diceTotal = groups.reduce(
		(total, group, index) => total + parsed.terms[index].sign * group.rolls.reduce((sum, die) => sum + die, 0),
		0
	);

	return {
		ok: true,
		expression: normaliseExpression(parsed.terms, parsed.modifier),
		result: { rolls, modifier: parsed.modifier, total: diceTotal + parsed.modifier },
		groups
	};
}
