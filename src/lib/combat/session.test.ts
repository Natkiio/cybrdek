import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { EncounterView } from './api.ts';
import { newEncounter } from './encounter.ts';
const fake = vi.hoisted(() => ({
	read: vi.fn(), write: vi.fn(), party: vi.fn(), changed: () => {}, subscribed: (_s: string) => {},
	removed: vi.fn(), filter: {} as Record<string, unknown>
}));
vi.mock('./api.ts', () => ({ readEncounter: fake.read, writeEncounter: fake.write, readParty: fake.party }));
vi.mock('#lib/supabase/client.ts', () => ({ supabase: () => ({
	channel: () => ({ on: (_event: string, filter: Record<string, unknown>, fn: () => void) => {
		fake.filter = filter; fake.changed = fn;
		return { subscribe: (fn: (s: string) => void) => { fake.subscribed = fn; return {}; } };
	} }), removeChannel: fake.removed
}) }));
const view = (revision = 1): EncounterView => ({ id: 'fight', revision, ended: false, canManage: true, encounter: newEncounter() });
const tick = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
let stop: (() => void) | undefined;
beforeEach(() => {
	vi.resetModules(); vi.clearAllMocks();
	fake.read.mockResolvedValue(view()); fake.write.mockResolvedValue(view(2)); fake.party.mockResolvedValue([]);
	vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn(), setInterval: () => 1, clearInterval: vi.fn() });
	vi.stubGlobal('document', { addEventListener: vi.fn(), removeEventListener: vi.fn(), visibilityState: 'visible' });
});
afterEach(() => { stop?.(); stop = undefined; vi.unstubAllGlobals(); });

it('subscribes only to safe campaign invalidations and refreshes on reconnect', async () => {
	const { encounterSession } = await import('./session.svelte.ts'); const session = encounterSession('campaign','owner');
	stop = session.start(); await tick();
	expect(fake.filter).toMatchObject({ table: 'campaign_encounter_updates', filter: 'campaign_id=eq.campaign' });
	fake.read.mockResolvedValue(view(3)); fake.changed(); await tick(); expect(session.state.view?.revision).toBe(3);
	fake.read.mockResolvedValue(view(4)); fake.subscribed('SUBSCRIBED'); await tick(); expect(session.state.view?.revision).toBe(4);
});
it('does not let a late read undo an acknowledged GM edit', async () => {
	const { encounterSession } = await import('./session.svelte.ts'); const session = encounterSession('campaign','owner');
	stop = session.start(); await tick();
	let finish!: (v: EncounterView) => void; fake.read.mockImplementationOnce(() => new Promise(r => { finish = r; }));
	const pending = session.refresh();
	await session.save(newEncounter()); expect(session.state.view?.revision).toBe(2);
	finish(view(1)); await pending; expect(session.state.view?.revision).toBe(2);
});
it('refuses client-side edits for a player and never loads party sheets for them', async () => {
	fake.read.mockResolvedValue({ ...view(), canManage: false });
	const { encounterSession } = await import('./session.svelte.ts'); const session = encounterSession('campaign','player');
	stop = session.start(); await tick(); await session.save(newEncounter());
	expect(fake.write).not.toHaveBeenCalled(); expect(fake.party).not.toHaveBeenCalled();
});
it('discarded account reads and writes cannot repopulate a stopped session', async () => {
	const { encounterSession } = await import('./session.svelte.ts'); const session = encounterSession('campaign','old-user');
	stop = session.start(); await tick();
	let finish!: (v: EncounterView) => void; fake.write.mockImplementationOnce(() => new Promise(r => { finish = r; }));
	const pending = session.save(newEncounter()); stop(); stop = undefined;
	finish(view(7)); await pending; expect(session.state.view).toBeNull(); expect(session.state.party).toEqual([]);
});
it('clears raw history and party sheets on access/network failures', async () => {
	const { encounterSession } = await import('./session.svelte.ts'); const session = encounterSession('campaign','owner');
	stop = session.start(); await tick(); fake.read.mockResolvedValue({ error: 'Membership removed' });
	await session.refresh(); expect(session.state.view).toBeNull(); expect(session.state.party).toEqual([]);
});
it('refreshes after a stale-write rejection and never retries the stale operation', async () => {
	const { encounterSession } = await import('./session.svelte.ts'); const session = encounterSession('campaign','owner');
	stop = session.start(); await tick(); fake.write.mockResolvedValue({ error: 'Conflict', conflict: true }); fake.read.mockResolvedValue(view(5));
	await session.save(newEncounter()); expect(session.state.view?.revision).toBe(5);
	expect(session.state.error).toBe('Conflict'); expect(fake.write).toHaveBeenCalledTimes(1);
});
