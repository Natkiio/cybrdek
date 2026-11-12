// Decide what one sync should do (SY-1, #52). Pure, so every case can be tested.
//
// `remoteAt` is the cloud version a device last saw. If the cloud still has it,
// only this device changed and its edit simply goes up, whatever its clock says.
// If both changed, the newest save wins for the whole character.

export interface LocalRow {
	id: string;
	updatedAt: number;
	dirty: boolean; // changed here and not yet in the cloud
	remoteAt?: number;
	deletedAt?: number;
}

export interface RemoteRow {
	id: string;
	data: unknown;
	updated_at: number;
	deleted_at: number | null;
}

export interface SyncPlan {
	pull: RemoteRow[]; // copy down, replacing this device's copy
	push: { id: string; savedAt: number }[]; // send this device's copy up
	drop: string[]; // remove this device's copy
}

export function planSync(local: readonly LocalRow[], remote: readonly RemoteRow[]): SyncPlan {
	const plan: SyncPlan = { pull: [], push: [], drop: [] };
	const cloud = new Map(remote.map((row) => [row.id, row]));
	const take = (row: RemoteRow) => (row.deleted_at === null ? plan.pull.push(row) : plan.drop.push(row.id));

	for (const mine of local) {
		const theirs = cloud.get(mine.id);
		cloud.delete(mine.id);
		if (!theirs) {
			if (mine.dirty) plan.push.push({ id: mine.id, savedAt: mine.updatedAt });
			else plan.drop.push(mine.id); // it was in the cloud and is gone
			continue;
		}
		const cloudUnchanged = mine.remoteAt === theirs.updated_at;
		if (mine.dirty) {
			// A later edit even if this device's clock is behind, so make its time later too.
			if (cloudUnchanged) plan.push.push({ id: mine.id, savedAt: Math.max(mine.updatedAt, theirs.updated_at + 1) });
			else if (mine.updatedAt >= theirs.updated_at) plan.push.push({ id: mine.id, savedAt: mine.updatedAt });
			else take(theirs);
		} else if (!cloudUnchanged || theirs.deleted_at !== null) {
			take(theirs);
		}
	}
	// Only in the cloud: a character from another device, unless it was deleted.
	for (const row of cloud.values()) if (row.deleted_at === null) plan.pull.push(row);
	return plan;
}
