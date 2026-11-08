import { describe, expect, it } from 'vitest';
import { planSync, type LocalRow, type RemoteRow } from './plan.ts';

const mine = (id: string, updatedAt: number, dirty: boolean, remoteAt?: number, deletedAt?: number): LocalRow => ({ id, updatedAt, dirty, remoteAt, deletedAt });
const cloud = (id: string, updated_at: number, deleted_at: number | null = null): RemoteRow => ({ id, data: {}, updated_at, deleted_at });

describe('planSync', () => {
	it('does nothing when both sides match', () => {
		expect(planSync([mine('a', 10, false, 10)], [cloud('a', 10)])).toEqual({ pull: [], push: [], drop: [] });
	});

	it('brings down a character from another device', () => {
		expect(planSync([], [cloud('a', 10)]).pull.map((r) => r.id)).toEqual(['a']);
	});

	it('ignores a cloud character deleted before this device saw it', () => {
		expect(planSync([], [cloud('a', 10, 10)])).toEqual({ pull: [], push: [], drop: [] });
	});

	it('sends up a new character', () => {
		expect(planSync([mine('a', 10, true)], []).push).toEqual([{ id: 'a', savedAt: 10 }]);
	});

	it('removes a synced character the cloud no longer has', () => {
		expect(planSync([mine('a', 10, false, 10)], []).drop).toEqual(['a']);
	});

	it('takes the cloud copy when only the cloud changed', () => {
		expect(planSync([mine('a', 10, false, 10)], [cloud('a', 20)]).pull.map((r) => r.id)).toEqual(['a']);
	});

	it('takes the cloud copy even if this device thinks it is newer, when it has no edits', () => {
		// This device's clock ran ahead, then another device saved.
		expect(planSync([mine('a', 99999, false, 10)], [cloud('a', 20)]).pull).toHaveLength(1);
	});

	it('removes a clean character deleted on another device', () => {
		expect(planSync([mine('a', 10, false, 10)], [cloud('a', 20, 20)]).drop).toEqual(['a']);
	});

	it('sends up an edit when only this device changed', () => {
		expect(planSync([mine('a', 20, true, 10)], [cloud('a', 10)]).push).toEqual([{ id: 'a', savedAt: 20 }]);
	});

	it("a real edit still goes up when this device's clock is behind", () => {
		expect(planSync([mine('a', 5, true, 10)], [cloud('a', 10)]).push).toEqual([{ id: 'a', savedAt: 11 }]);
	});

	describe('both changed: the newest save wins', () => {
		it('this device is newer', () => {
			const plan = planSync([mine('a', 30, true, 10)], [cloud('a', 20)]);
			expect(plan.push).toEqual([{ id: 'a', savedAt: 30 }]);
			expect(plan.pull).toEqual([]);
		});

		it('the cloud is newer', () => {
			const plan = planSync([mine('a', 15, true, 10)], [cloud('a', 20)]);
			expect(plan.pull.map((r) => r.id)).toEqual(['a']);
			expect(plan.push).toEqual([]);
		});

		it('a newer delete elsewhere beats an older edit here', () => {
			expect(planSync([mine('a', 15, true, 10)], [cloud('a', 20, 20)]).drop).toEqual(['a']);
		});

		it('a newer edit here beats an older delete elsewhere', () => {
			expect(planSync([mine('a', 30, true, 10)], [cloud('a', 20, 20)]).push).toEqual([{ id: 'a', savedAt: 30 }]);
		});
	});

	it('a character moved in from the device merges with a same-id cloud copy by time', () => {
		expect(planSync([mine('a', 30, true)], [cloud('a', 20)]).push).toHaveLength(1);
		expect(planSync([mine('a', 10, true)], [cloud('a', 20)]).pull).toHaveLength(1);
	});

	it('sends up a local delete', () => {
		expect(planSync([mine('a', 30, true, 10, 30)], [cloud('a', 10)]).push).toEqual([{ id: 'a', savedAt: 30 }]);
	});
});
