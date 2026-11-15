import { test, expect, type Page } from '@playwright/test';
const panel = (page: Page) => page.locator('section.panel').filter({ has: page.getByText('CYBERDECK', { exact: true }) });
async function seed(page: Page, links = false) {
 await page.context().route(/supabase\.co/, route => route.abort());
 await page.goto('/characters'); await expect(page.getByRole('heading').first()).toBeVisible();
 await page.evaluate(links => new Promise<void>((resolve,reject) => {
  const req = indexedDB.open('cybrdek'); req.onerror = () => reject(req.error);
  req.onsuccess = () => {
   const db = req.result; const tx = db.transaction('characters','readwrite');
   tx.objectStore('characters').put({ id: 'netrunner', name: 'Runner', rulesetId: 'cyberpunk-red',
    stats: { INT: 6, REF: 7, DEX: 6, TECH: 5, COOL: 6, WILL: 6, LUCK: 6, MOVE: 6, BODY: 6, EMP: 5 }, skills: {},
    extra: { role: 'netrunner', roleRank: 4, humanity: 43, keep: 'keep unrelated data', gear: links ? [{ id: 'suit', kind: 'armor', name: 'Bodyweight Suit', armorType: 'bodyweight-suit', sp: 11, location: 'both' }, { id: 'spare-deck', kind: 'item', name: 'Existing deck gear', quantity: 1, notes: 'retain my notes' }, { id: 'agent', kind: 'item', name: 'Agent', quantity: 1 }] : [],
     cyberware: links ? [{ id: 'arm', defId: 'cyberarm', hl: 7 },{ id: 'implant', defId: 'cyberdeck', hostId: 'arm', hl: 3 }] : [] }, updatedAt: Date.now() });
   tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
  };
 }),links);
 await page.goto('/characters/netrunner'); await expect(page.getByRole('heading', { name: 'Runner', exact: true, level: 1 })).toBeVisible();
}
async function stored(page: Page): Promise<any> {
 return page.evaluate(() => new Promise((resolve,reject) => {
  const req = indexedDB.open('cybrdek'); req.onerror = () => reject(req.error); req.onsuccess = () => {
   const db = req.result; const read = db.transaction('characters').objectStore('characters').get('netrunner');
   read.onsuccess = () => { db.close(); resolve(read.result); };
  };
 }));
}
async function addCopy(page: Page) { await panel(page).getByRole('button', { name: 'ADD & LOAD COPY', exact: true }).click(); await expect(panel(page).getByRole('button', { name: 'ADD & LOAD COPY', exact: true })).toBeEnabled(); }

test('device loadout: duplicates, shared hardware budget, refusal restores quality select, offline reload', async ({ page, context }) => {
 await seed(page); const deck = panel(page);
 await deck.getByRole('button', { name: '+ CYBERDECK', exact: true }).click();
 await deck.getByLabel('Deck quality').selectOption('poor');
 await deck.getByLabel('Program to add').selectOption('sword');
 for (let i=0; i<5; i++) await addCopy(page);
 await expect(deck.getByRole('button', { name: 'Unload Sword', exact: true })).toHaveCount(5);
 await deck.getByRole('button', { name: 'ADD UNLOADED COPY' }).click();
 await expect(deck.getByRole('button', { name: 'Load Sword', exact: true })).toHaveCount(1);
 await deck.getByRole('button', { name: 'Load Sword', exact: true }).click();
 await expect(deck.getByRole('alert')).toContainText('Not enough deck slots');
 await deck.getByRole('button', { name: 'FIT HARDWARE' }).click();
 await expect(deck.getByRole('alert')).toContainText('Not enough deck slots');
 await deck.getByRole('button', { name: 'Unload Sword', exact: true }).first().click();
 await deck.getByRole('button', { name: 'Unload Sword', exact: true }).first().click();
 await deck.getByRole('button', { name: 'FIT HARDWARE' }).click();
 await expect(deck.getByRole('button', { name: 'Remove Backup Drive', exact: true })).toBeVisible();
 await expect(deck.getByRole('status')).toContainText('3 program slots + 2 hardware slots used · 0 shared slots free');
 await deck.getByLabel('Deck quality').selectOption('standard');
 await deck.getByRole('button', { name: 'Load Sword', exact: true }).first().click();
 await deck.getByRole('button', { name: 'Load Sword', exact: true }).first().click();
 await deck.getByLabel('Deck quality').selectOption('poor');
 await expect(deck.getByRole('alert')).toContainText('Not enough deck slots');
 await expect(deck.getByLabel('Deck quality')).toHaveValue('standard');
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
 await page.screenshot({ path: '/private/tmp/cybrdek-cyberdeck-mobile.png', fullPage: true });
 const row = await stored(page); const config = row.extra.gear.find((g: any) => g.cyberdeck).cyberdeck;
 expect(config.programs).toHaveLength(6); expect(new Set(config.programs.map((p: any) => p.id)).size).toBe(6);
 expect(row.extra.keep).toBe('keep unrelated data'); expect(row.ownerId).toBeUndefined();
 await page.getByRole('link', { name: 'RULES', exact: true }).click();
 await context.setOffline(true);
 await page.getByRole('link', { name: 'CHARS', exact: true }).click();
 await page.getByRole('link', { name: 'OPEN', exact: true }).click();
 await expect(page.getByRole('heading', { name: 'Runner', exact: true, level: 1 })).toBeVisible();
 await page.reload();
 await expect(deck.getByRole('status')).toContainText('5 program slots + 2 hardware slots used');
 expect((await stored(page)).extra.gear.find((g: any) => g.cyberdeck).cyberdeck).toEqual(config);
});

test('explicit implant and suit links add the right slot types without applying Humanity loss', async ({ page }) => {
 await seed(page,true); const deck = panel(page);
 await deck.getByLabel('Existing gear for deck').selectOption('spare-deck');
 await deck.getByRole('button', { name: 'CONFIGURE AS DECK', exact: true }).click();
 await expect(deck.getByRole('button', { name: 'CONFIGURE AS DECK', exact: true })).toBeDisabled();
 expect((await stored(page)).extra.gear.find((g: any) => g.id === 'spare-deck').notes).toBe('retain my notes');
 await deck.getByLabel('Deck quality').selectOption('poor');
 await deck.getByLabel('Cyberdeck implant link').selectOption('implant');
 await deck.getByLabel('Bodyweight Suit link').selectOption('suit');
 await expect(deck).toContainText('Capacity: 6 shared + 1 hardware-only');
 await deck.getByLabel('Program to add').selectOption('worm');
 for (let i=0;i<6;i++) await addCopy(page);
 await deck.getByLabel('Hardware to fit').selectOption('insulated-wiring');
 await deck.getByRole('button', { name: 'FIT HARDWARE' }).click();
 await expect(deck.getByRole('status')).toContainText('6 program slots + 1 hardware slots used · 0 shared slots free');
 expect((await stored(page)).extra.humanity).toBe(43);
 await page.getByRole('button', { name: 'Remove Cyberdeck', exact: true }).click();
 await page.getByRole('button', { name: 'CONFIRM', exact: true }).click();
 await expect(deck.getByRole('alert')).toContainText('Over capacity by 1');
 await expect(deck).toContainText('Cyberdeck implant link is missing');
 await deck.getByRole('button', { name: 'Unload Worm', exact: true }).first().click();
 await expect(deck.getByRole('alert')).toHaveCount(0);
 expect((await stored(page)).extra.gear.find((g: any) => g.cyberdeck).cyberdeck.programs).toHaveLength(6);
});

test('an in-flight account sync cannot acknowledge away a newer program edit', async ({ page }) => {
 const owner = '10000000-0000-4000-8000-000000000001';
 const data = { id: 'account-runner', name: 'Synced Runner', rulesetId: 'cyberpunk-red',
  stats: { INT: 6, REF: 7, DEX: 6, TECH: 5, COOL: 6, WILL: 6, LUCK: 6, MOVE: 6, BODY: 6, EMP: 5 }, skills: {},
  extra: { role: 'netrunner', roleRank: 4, keep: 'private note', gear: [{ id: 'deck', kind: 'item', name: 'Deck', cyberdeck: { quality: 'standard', programs: [] as any[], hardware: [] } }] } };
 let cloud = { id: data.id, data, updated_at: 1000, deleted_at: null };
 let saves = 0; let release: (() => void) | undefined; let firstPending = false;
 await page.context().route(/supabase\.co/, async route => {
  const req = route.request(); const path = new URL(req.url()).pathname;
  const json = (body: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  if (path.endsWith('/rpc/is_campaign_gm')) return json(false);
  if (path.endsWith('/rpc/my_characters')) return json([cloud]);
  if (path.endsWith('/rpc/save_character')) {
   const body = JSON.parse(req.postData()!); expect(body.owner).toBe(owner);
   if (saves++ === 0) { firstPending = true; await new Promise<void>(resolve => release = resolve); }
   cloud = { id: body.character_id, data: body.character_data, updated_at: body.saved_at, deleted_at: body.removed_at };
   return json(body.saved_at);
  }
  return json(path.includes('/auth/') ? {} : []);
 });
 await page.addInitScript(owner => {
  if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded','1');
  localStorage.setItem('sb-hntlvhspyllaaidvxlox-auth-token', JSON.stringify({ access_token: 'test-token', refresh_token: 'refresh', token_type: 'bearer', expires_at: Math.floor(Date.now()/1000)+3600,
   user: { id: owner, email: 'runner@example.com', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '' } }));
 },owner);
 await page.goto('/characters');
 await page.getByRole('link', { name: 'OPEN', exact: true }).click();
 await expect(page.getByRole('heading', { name: 'Synced Runner', exact: true })).toBeVisible();
 const deck = panel(page); await deck.getByLabel('Program to add').selectOption('sword');
 await addCopy(page); await expect.poll(() => firstPending).toBe(true);
 await addCopy(page); release!();
 await expect.poll(() => cloud.data.extra.gear[0].cyberdeck.programs.length).toBe(2);
 expect(cloud.data.extra.keep).toBe('private note');
 await page.reload(); await expect(deck.getByRole('button', { name: 'Unload Sword', exact: true })).toHaveCount(2);
});
