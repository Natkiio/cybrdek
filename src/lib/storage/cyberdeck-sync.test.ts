import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({ user: 'runner' as string | undefined }));
vi.mock('#lib/supabase/client.ts', () => ({ supabase: () => ({ auth: { getSession: async () => ({ data: { session: fake.user ? { user: { id: fake.user } } : null } }) } }) }));
import { saveCharacter, getCharacter, syncRows, rowToPush, markPushed, applyRemote } from './characters.ts';
import { newDeck } from '#lib/rulesets/red/cyberdeck.ts';
import type { Character } from '#lib/engine/types.ts';
const sheet = (): Character => ({ id: 'pc', name: 'Runner', rulesetId: 'cyberpunk-red', stats: {}, skills: {}, extra: { humanity: 43, keep: 'unrelated', gear: [{ id: 'deck', name: 'Deck', kind: 'item', cyberdeck: newDeck() }] } });
beforeEach(async () => { fake.user = 'runner'; const db = await new Dexie('cybrdek').open().catch(() => null); await db?.table('characters').clear(); db?.close(); });
it('a deck edit during an in-flight save keeps a fresh revision and cannot be marked clean by the old acknowledgment', async () => {
 const c = sheet(); await saveCharacter(c); const [sent] = await syncRows('runner');
 const first = await rowToPush('runner','pc',sent.rev); expect(first).toBeDefined();
 (c.extra.gear as any[])[0].cyberdeck.programs.push({ id: 'sword-1', defId: 'sword', loaded: true });
 await saveCharacter(c); await markPushed('runner','pc',sent.rev,1000,()=>true);
 const [after] = await syncRows('runner'); expect(after.dirty).toBe(true); expect(after.rev).not.toBe(sent.rev);
 const next = await rowToPush('runner','pc',after.rev); expect(next!.data.extra).toMatchObject({ humanity: 43, keep: 'unrelated' });
 expect((next!.data.extra.gear as any[])[0].cyberdeck.programs).toHaveLength(1);
 expect(await applyRemote('runner',{ id: 'pc', data: first!.data, updated_at: 2000, deleted_at: null },first!.data,sent.rev,()=>true)).toBe(false);
});
it('deck data follows existing ownership and superseded sync guards, while signed-out decks stay device-only', async () => {
 const c = sheet(); await saveCharacter(c); const [row] = await syncRows('runner');
 expect(await applyRemote('runner',{ id: 'pc', data: c, updated_at: 2000, deleted_at: null },c,row.rev,()=>false)).toBe(false);
 fake.user = 'other'; expect(await getCharacter('pc')).toBeUndefined();
 fake.user = undefined; const local = { ...sheet(), id: 'local' }; await saveCharacter(local);
 expect((await getCharacter('local'))!.extra.gear).toEqual(local.extra.gear);
 expect(await syncRows('other')).toEqual([]);
});
