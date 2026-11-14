import 'fake-indexeddb/auto';
import { beforeEach, expect, it, vi } from 'vitest';
import Dexie from 'dexie';
const fake = vi.hoisted(() => ({ user: 'owner-a' }));
vi.mock('#lib/supabase/client.ts', () => ({ supabase: () => ({ auth: {
	getSession: async () => ({ data: { session: fake.user ? { user: { id: fake.user } } : null } })
} }) }));
import { saveCharacter, getCharacter, hasOwnedReceipt, syncRows, markPushed } from './characters.ts';
import { acceptDamage, damageReceipt, type DamageOffer } from '#lib/combat/damage-offers.ts';
const offer = (damage = 10): DamageOffer => ({ encounterId: '20000000-0000-4000-8000-000000000001', characterId: 'pc', name: 'Vex', damage, endedAt: new Date().toISOString() });
beforeEach(async () => {
	fake.user = 'owner-a';
	const db = await new Dexie('cybrdek').open().catch(() => null); await db?.table('characters').clear(); db?.close();
	await saveCharacter({ id: 'pc', name: 'Vex', rulesetId: 'cyberpunk-red', stats: { BODY: 6, WILL: 6, EMP: 5 }, skills: {}, extra: { currentHp: 30, unrelated: 'keep me' } });
});
it('never changes HP before acceptance; tap changes only the owner’s working copy and creates a dirty receipt', async () => {
	expect((await getCharacter('pc'))?.extra.currentHp).toBe(30);
	expect(await hasOwnedReceipt('owner-a','pc',damageReceipt('owner-a',offer()))).toBe(false);
	expect(await acceptDamage('owner-a',offer(),()=>true)).toBe(true);
	expect((await getCharacter('pc'))?.extra).toMatchObject({ currentHp: 20, unrelated: 'keep me' });
	expect((await syncRows('owner-a'))[0].dirty).toBe(true);
});
it('serializes double taps: the receipt and HP update are atomic', async () => {
	const result = await Promise.all([acceptDamage('owner-a',offer(),()=>true), acceptDamage('owner-a',offer(),()=>true)]);
	expect(result.sort()).toEqual([false,true]); expect((await getCharacter('pc'))?.extra.currentHp).toBe(20);
});
it('a receipt survives a sync acknowledgment and prevents applying the same fight twice', async () => {
	await acceptDamage('owner-a',offer(),()=>true); const [row] = await syncRows('owner-a');
	await markPushed('owner-a','pc',row.rev,1000,()=>true);
	expect(await acceptDamage('owner-a',offer(),()=>true)).toBe(false);
	expect((await getCharacter('pc'))?.extra.currentHp).toBe(20);
});
it('rejects another account and a superseded UI action, without changing the sheet', async () => {
	fake.user = 'owner-b'; await expect(acceptDamage('owner-a',offer(),()=>true)).rejects.toThrow();
	await expect(acceptDamage('owner-b',offer(),()=>true)).rejects.toThrow();
	fake.user = 'owner-a'; await expect(acceptDamage('owner-a',offer(),()=>false)).rejects.toThrow();
	expect((await getCharacter('pc'))?.extra.currentHp).toBe(30);
});
it('rejects malformed damage and clamps accepted damage at zero HP', async () => {
	for (const amount of [0,-5,1.5,Number.NaN,10001]) await expect(acceptDamage('owner-a',offer(amount),()=>true)).rejects.toThrow();
	await acceptDamage('owner-a',offer(99),()=>true); expect((await getCharacter('pc'))?.extra.currentHp).toBe(0);
});
