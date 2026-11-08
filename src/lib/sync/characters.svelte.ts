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
let running = false;
let again = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let listening = false;

/** A cloud row is only used if it's a character the app can really open. */
function validated(row: RemoteRow): Character | undefined {
	try {
		const result = parseCharacterFile(exportCharacter(row.data as Character));
		return result.ok && result.character.id === row.id ? result.character : undefined;
	} catch {
		return undefined;
	}
}

async function syncOnce(account: string): Promise<boolean> {
	const { data, error } = await supabase()
		.from('characters')
		.select('id, data, updated_at, deleted_at')
		.eq('user_id', account)
		.abortSignal(AbortSignal.timeout(TIMEOUT_MS));
	if (error || !data) throw new Error(error?.message ?? 'No reply from the cloud.');

	const local = await syncRows(account);
	const seen = new Map(local.map((row) => [row.id, row.updatedAt]));
	const plan = planSync(local, data as RemoteRow[]);
	let changed = false;
	let skipped = 0;
	let rejected = false;

	for (const row of plan.pull) {
		const character = validated(row);
		if (!character) skipped++;
		else if (await applyRemote(account, row, character, seen.get(row.id))) changed = true;
	}
	for (const id of plan.drop) {
		if (await dropRow(account, id, seen.get(id))) changed = true;
	}
	for (const { id, savedAt } of plan.push) {
		const row = await rowToPush(id);
		if (!row) continue;
		const { data: stored, error: saveError } = await supabase()
			.rpc('save_character', {
				character_id: id,
				character_data: row.data,
				saved_at: savedAt,
				removed_at: row.deletedAt ?? null
			})
			.abortSignal(AbortSignal.timeout(TIMEOUT_MS));
		if (saveError) throw new Error(saveError.message);
		if (typeof stored === 'number') await markPushed(id, row.updatedAt, stored);
		else rejected = true; // a newer save got there first: the next pass brings it down
	}

	if (changed) characterSync.revision++;
	characterSync.message = skipped ? `${skipped} saved character${skipped === 1 ? '' : 's'} could not be read.` : '';
	return rejected;
}

/** Run a sync now. Calls made during one run once more afterwards. */
export async function syncCharacters(): Promise<void> {
	const account = user;
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
		const rejected = await syncOnce(account);
		// A save lost a race: one more pass collects the winner.
		if (rejected) await syncOnce(account);
		if (account === user) characterSync.status = 'synced';
	} catch (e) {
		if (account === user) {
			characterSync.status = isOffline() ? 'offline' : 'error';
			characterSync.message = e instanceof Error ? e.message : String(e);
		}
	} finally {
		running = false;
	}
	if (again) {
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
		void forgetOtherAccounts(next).then(() => {
			characterSync.revision++;
			return syncCharacters();
		});
	}, 0);
}
