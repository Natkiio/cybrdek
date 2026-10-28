// =============================================================================
// dice.ts: the dice engine for Cybrdek
// =============================================================================
//
// WHAT THIS FILE IS FOR
// Every dice roll in the app happens here. When a player taps a skill or a
// weapon, the screen asks this file to roll, and gets back the result.
//
// This file never shows anything on screen and never asks the player anything.
// It only does the maths. The screens (UI) ask the questions, then call these
// functions with the answers.
//
// THE FUNCTIONS, SMALLEST TO BIGGEST
// Each one builds on the ones above it:
//
//   rollDie(10)          → rolls ONE die              → 7
//   rollDice(3, 6)       → rolls SEVERAL dice         → [4, 5, 5]
//   sumRolls([4, 5, 5])  → adds a list of dice up     → 14
//   roll(2, 6, 3)        → any roll, plus a bonus     → { rolls: [4, 5], modifier: 3, total: 12 }
//   skillCheck(14)       → a Cyberpunk RED skill check, with crits
//
// DICE NOTATION REMINDER
// "2d6+3" means: roll two (2) six-sided dice (d6), add them up, then add 3.
// =============================================================================


// -----------------------------------------------------------------------------
// RollResult: the "shape" of a finished roll
// -----------------------------------------------------------------------------
// This is an interface: a blueprint, not code that runs. It says that every
// roll result is a bundle with exactly these three pieces of information.
//
// Example, for 2d6+3 where the dice land on 4 and 5:
//   { rolls: [4, 5], modifier: 3, total: 12 }
export interface RollResult {
    rolls: number[]; // every die that was rolled, e.g. [4, 5]
    modifier: number; // the flat bonus added after rolling, e.g. 3 (can be 0 or negative)
    total: number; // the final answer: all the dice + the modifier, e.g. 12
}


// -----------------------------------------------------------------------------
// rollDie: roll ONE die
// -----------------------------------------------------------------------------
// Give it the number of sides, get back one random whole number from 1 to that.
//   rollDie(6)  → 1, 2, 3, 4, 5 or 6
//   rollDie(10) → anything from 1 to 10
//
// HOW IT WORKS, using rollDie(6) and pretending Math.random() gives 0.48:
//   1. Math.random()   → 0.48   a random decimal from 0 up to (not including) 1
//   2. × side          → 2.88   stretched to the range 0 up to just under 6
//   3. Math.floor()    → 2      round DOWN, so it's 0, 1, 2, 3, 4 or 5
//   4. + 1             → 3      shift up so it's 1 to 6, like a real die
//
// `export` means other files are allowed to use this function.
export function rollDie(side: number): number {
    const random = Math.random(); // step 1: random decimal, 0 to 0.999...
    const scaled = random * side; // step 2: stretch it to the size of the die
    const wholeNumber = Math.floor(scaled); // step 3: chop off the decimal
    return wholeNumber + 1; // step 4: dice start at 1, not 0
}


// -----------------------------------------------------------------------------
// rollDice: roll SEVERAL dice and keep every result
// -----------------------------------------------------------------------------
// Give it how many dice (count) and how many sides (side).
// Get back a list (array) with one number per die.
//   rollDice(3, 6) → [4, 5, 5]     (that's 3d6)
//   rollDice(1, 10) → [7]          (that's 1d10)
//
// HOW IT WORKS:
//   1. Start with an empty list, our "dice tray": []
//   2. Loop `count` times. Each time, roll one die and drop it in the tray.
//   3. Hand back the full tray.
export function rollDice(count: number, side: number): number[] {
    const rolls: number[] = []; // the empty dice tray

    // Repeat `count` times: i goes 0, 1, 2... and stops before reaching count
    for (let i = 0; i < count; i++) {
        const roll = rollDie(side); // roll one die, using the function above
        rolls.push(roll); // .push adds it to the end of the tray
    }

    return rolls; // the full tray, e.g. [4, 5, 5]
}


// -----------------------------------------------------------------------------
// sumRolls: add up a list of dice
// -----------------------------------------------------------------------------
// Give it a list of numbers, get back the total. It does NOT roll anything;
// it only adds up rolls that already happened.
//   sumRolls([4, 5, 5]) → 14
//   sumRolls([])        → 0   (no dice = nothing to add)
//
// HOW IT WORKS:
//   1. Start a running total at 0.
//   2. Go through each number in the list and add it to the total.
//      [4, 5, 5] → 0+4 = 4 → 4+5 = 9 → 9+5 = 14
//   3. Hand back the total.
export function sumRolls(rolls: number[]): number {
    let total = 0; // `let`, not `const`, because this number keeps changing

    // "for each roll in the list rolls..."
    for (const roll of rolls) {
        total += roll; // same as: total = total + roll
    }

    return total;
}


// -----------------------------------------------------------------------------
// roll: the all-purpose roll, dice + a bonus
// -----------------------------------------------------------------------------
// Use this for damage, initiative, or any "XdY + bonus" roll.
// Give it: how many dice, how many sides, and the bonus (modifier).
//   roll(2, 6, 3)  → 2d6+3  → { rolls: [4, 5], modifier: 3, total: 12 }
//   roll(5, 6, 0)  → 5d6    → e.g. a rifle's damage
//
// HOW IT WORKS, by reusing the functions above:
//   1. rollDice rolls the dice           → [4, 5]
//   2. sumRolls adds them, + the bonus   → 9 + 3 = 12
//   3. Package everything as a RollResult
export function roll(count: number, side: number, modifier: number): RollResult {
    const rolls = rollDice(count, side); // step 1: roll the dice
    const total = sumRolls(rolls) + modifier; // step 2: add them up, add the bonus
    return { rolls: rolls, modifier: modifier, total: total }; // step 3: package it
}


// -----------------------------------------------------------------------------
// skillCheck: a Cyberpunk RED skill check (1d10 + bonus, with crits)
// -----------------------------------------------------------------------------
// Used every time a player shoots, hacks, drives, sweet-talks...
// Give it the character's bonus (usually STAT + Skill), e.g. REF 8 + Handgun 6 = 14.
//
// THE RED RULES:
//   Roll a 10   → CRITICAL SUCCESS: roll one more d10 and ADD it
//   Roll a 1    → CRITICAL FAILURE: roll one more d10 and SUBTRACT it
//   Roll 2 to 9 → normal, nothing extra
//   The extra die never explodes again: it only happens once.
//
// EXAMPLES with a bonus of 14:
//   Roll 7           → 7 + 14            = 21   rolls: [7]
//   Roll 10, then 6  → 10 + 6 + 14       = 30   rolls: [10, 6]
//   Roll 1, then 4   → 1 - 4 + 14        = 11   rolls: [1, 4]
//
// WHY NOT USE sumRolls HERE? sumRolls can only ADD. On a fumble the extra die
// is SUBTRACTED, so this function keeps its own running total instead.
export function skillCheck(modifier: number): RollResult {
    const first = rollDie(10); // the main d10
    const rolls = [first]; // the tray starts with the first die in it
    let total = first + modifier; // the normal result. `let` because a crit can change it

    if (first === 10) {
        // CRIT: this block only runs when the first die is exactly 10
        const extra = rollDie(10); // roll one bonus die
        rolls.push(extra); // show it in the tray, e.g. [10, 6]
        total += extra; // ADD it to the total
    } else if (first === 1) {
        // FUMBLE: this block only runs when the first die is exactly 1
        const extra = rollDie(10); // roll one penalty die
        rolls.push(extra); // show it in the tray, e.g. [1, 4]
        total -= extra; // SUBTRACT it from the total (same as total = total - extra)
    }
    // Rolled 2 to 9? Both blocks above are skipped, and the total stays as it was.

    // { rolls, modifier, total } is shorthand for
    // { rolls: rolls, modifier: modifier, total: total }
    return { rolls, modifier, total };
}
