// Keeps a signed-in player's characters in step with the cloud (SY-1, #52).
// The device stays the working copy, so the sheet works offline at the table.
// `characterSync` is a shared reactive object, like `gm`.

import type { Character } from '#lib/engine/types.ts';
import { exportCharacter, parseCharacterFile } from '#lib/storage/backup.ts';
import {
	applyRemote,
	dropRow,
	forgetOtherAccounts,
	markPushed,
	onCharacterChange,
	rowToPush,
	syncRows
} from '#lib/storage/characters.ts';
import { supabase } from '#lib/supabase/client.ts';
import { planSync, type RemoteRow } from './plan.ts';

const TIMEOUT_MS = 10000;
const SAVE_DELAY_MS = 1500;
const isOffline = () => navigator.onLine === false;

export const characterSync = $state({
	status: 'off' as 'off' | 'syncing' | 'synced' | 'offline' | 'error',
	message: '',
	revision: 0 // goes up when the cloud changed characters on this device
});

let user: string | undefined;
// Goes up whenever the signed-in account changes. Work started for an older
// generation stops at its next step and writes nothing.
let generation = 0;
let running = false;
let again = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let listening = false;

/** Thrown when the account changed mid-sync: the old run just stops. */
class Superseded extends Error {}

/** A cloud row is only used if it's a character the app can really open. */
function validated(row: RemoteRow): Character | undefined {
	try {
		const result = parseCharacterFile(exportCharacter(row.data as Character));
		return result.ok && result.character.id === row.id ? result.character : undefined;
	} catch {
		return undefined;
	}
}

type Pass = { retry: boolean };

/**
 * One sync for `account`. Both cloud calls name the account, and the server
 * refuses them if the session is someone else's (the session can change
 * before we hear about it). Every device write also rechecks `current`.
 */
async function syncOnce(account: string, current: () => boolean): Promise<Pass> {
	const { data, error } = await supabase()
		.rpc('my_characters', { owner: account })
		.abortSignal(AbortSignal.timeout(TIMEOUT_MS));
	if (!current()) throw new Superseded();
	if (error || !data) throw new Error(error?.message ?? 'No reply from the cloud.');

	const local = await syncRows(account);
	if (!current()) throw new Superseded();
	const seen = new Map(local.map((row) => [row.id, row.rev]));
	const plan = planSync(local, data as RemoteRow[]);
	let changed = false;
	let skipped = 0;
	let retry = false;

	for (const row of plan.pull) {
		const character = validated(row);
		if (!character) skipped++;
		else if (await applyRemote(account, row, character, seen.get(row.id), current)) changed = true;
		else retry = true; // edited here meanwhile: plan again
	}
	for (const id of plan.drop) {
		if (await dropRow(account, id, seen.get(id), current)) changed = true;
		else retry = true;
	}
	for (const { id, savedAt } of plan.push) {
		const sentRev = seen.get(id);
		const row = await rowToPush(account, id, sentRev);
		if (!current()) throw new Superseded();
		if (!row) {
			retry = true; // changed since the plan: its new time decides, next pass
			continue;
		}
		const { data: stored, error: saveError } = await supabase()
			.rpc('save_character', {
				owner: account,
				character_id: id,
				character_data: row.data,
				saved_at: savedAt,
				removed_at: row.deletedAt ?? null
			})
			.abortSignal(AbortSignal.timeout(TIMEOUT_MS));
		if (!current()) throw new Superseded();
		if (saveError) throw new Error(saveError.message);
		if (typeof stored === 'number') await markPushed(account, id, sentRev, stored, current);
		else retry = true; // a newer save got there first: the next pass brings it down
	}

	if (!current()) throw new Superseded();
	if (changed) characterSync.revision++;
	characterSync.message = skipped ? `${skipped} saved character${skipped === 1 ? '' : 's'} could not be read.` : '';
	return { retry };
}

const MAX_PASSES = 3;

/** Run a sync now. Calls made during one run once more afterwards. */
export async function syncCharacters(): Promise<void> {
	const account = user;
	const mine = generation;
	const current = () => mine === generation;
	if (!account) {
		characterSync.status = 'off';
		return;
	}
	if (running) {
		again = true;
		return;
	}
	if (isOffline()) {
		characterSync.status = 'offline';
		return;
	}
	running = true;
	characterSync.status = 'syncing';
	try {
		// A lost race or an edit mid-sync: plan again with what's there now.
		for (let pass = 1; (await syncOnce(account, current)).retry && pass < MAX_PASSES; pass++);
		if (current()) characterSync.status = 'synced';
	} catch (e) {
		if (current() && !(e instanceof Superseded)) {
			characterSync.status = isOffline() ? 'offline' : 'error';
			characterSync.message = e instanceof Error ? e.message : String(e);
		}
	} finally {
		running = false;
	}
	if (again || !current()) {
		again = false;
		await syncCharacters();
	}
}

function schedule(delay: number) {
	clearTimeout(timer);
	timer = setTimeout(() => void syncCharacters(), delay);
}

/**
 * Called whenever the signed-in account changes. It runs inside Supabase's auth
 * callback, where awaiting Supabase can deadlock, so the work starts on a timer.
 */
export function setSyncUser(next: string | undefined) {
	if (listening && next === user) return; // e.g. a token refresh: same person
	user = next;
	const mine = ++generation;
	const current = () => mine === generation;
	if (!listening) {
		listening = true;
		onCharacterChange(() => schedule(SAVE_DELAY_MS));
		window.addEventListener('online', () => schedule(0));
		document.addEventListener('visibilitychange', () => {
			if (document.visibilityState === 'visible') schedule(0);
		});
	}
	characterSync.status = next ? 'syncing' : 'off';
	characterSync.message = '';
	setTimeout(() => {
		if (!current()) return; // the account changed again before this ran
		void forgetOtherAccounts(next, current).then(() => {
			if (!current()) return;
			characterSync.revision++;
			return syncCharacters();
		});
	}, 0);
}
