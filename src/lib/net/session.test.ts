import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { ArchitectureView } from './architecture.ts';
import { newArchitecture } from './architecture.ts';
const fake = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), remove: vi.fn(), changed: () => {},
 events: {} as Record<string, () => void>, filter: {} as Record<string, unknown> }));
vi.mock('./api.ts', () => ({ readArchitectures: fake.read, saveArchitecture: fake.save, deleteArchitecture: fake.remove }));
vi.mock('#lib/supabase/client.ts', () => ({ supabase: () => ({ channel: () => ({
 on: (_: string, filter: Record<string, unknown>, fn: () => void) => { fake.filter = filter; fake.changed = fn; return { subscribe: () => ({}) }; }
 }), removeChannel: vi.fn() }) }));
const view = (revision = 1): ArchitectureView => ({ canManage: true, architectures: [{ ...newArchitecture(), id: 'a', revision }] });
const tick = async () => { for (let i=0;i<20;i++) await Promise.resolve(); };
let stop: (() => void) | undefined;
beforeEach(() => {
 vi.resetModules(); vi.clearAllMocks(); fake.events = {};
 fake.read.mockResolvedValue(view()); fake.save.mockResolvedValue(view(2)); fake.remove.mockResolvedValue(view(3));
 vi.stubGlobal('window', { addEventListener: (event: string, fn: () => void) => fake.events[event] = fn,
 removeEventListener: vi.fn(), setInterval: () => 1, clearInterval: vi.fn() });
 vi.stubGlobal('document', { addEventListener: vi.fn(), removeEventListener: vi.fn(), visibilityState: 'visible' });
});
afterEach(() => { stop?.(); stop = undefined; vi.unstubAllGlobals(); });
async function start() {
 const { architectureSession } = await import('./session.svelte.ts'); const s = architectureSession('campaign');
 stop = s.start(); await tick(); return s;
}
it('subscribes to content-free invalidations, refuses player mutations and clears on revoked access', async () => {
 const s = await start(); expect(fake.filter).toMatchObject({ table: 'net_architecture_updates', filter: 'campaign_id=eq.campaign' });
 fake.read.mockResolvedValue({ canManage: false, architectures: [] }); fake.changed(); await tick();
 expect(await s.save(newArchitecture(),null,0)).toBe(false); expect(fake.save).not.toHaveBeenCalled();
 expect(await s.remove('a',1)).toBe(false); expect(fake.remove).not.toHaveBeenCalled();
 fake.read.mockResolvedValue({ error: 'Membership revoked' }); await s.refresh(); expect(s.state.view).toBeNull();
});
it('late refreshes cannot undo a successful revision-checked write', async () => {
 const s = await start(); let release!: (v: ArchitectureView) => void;
 fake.read.mockImplementationOnce(() => new Promise(resolve => release = resolve)); const pending = s.refresh();
 expect(await s.save(newArchitecture(),'a',1)).toBe(true);
 release(view(1)); await pending; expect(s.state.view).toEqual(view(2));
});
it('refreshes on a conflict without retrying or silently rebasing the stale write', async () => {
 const s = await start(); fake.save.mockResolvedValue({ error: 'Conflict', conflict: true }); fake.read.mockResolvedValue(view(7));
 expect(await s.save(newArchitecture(),'a',1)).toBe(false); expect(s.state.view).toEqual(view(7));
 expect(fake.save).toHaveBeenCalledTimes(1); expect(s.state.error).toBe('Conflict');
});
it('account/campaign disposal and going offline both prevent late writes from restoring content', async () => {
 for (const offline of [true,false]) {
  const s = await start(); let release!: (v: ArchitectureView) => void;
  fake.save.mockImplementationOnce(() => new Promise(resolve => release = resolve));
  const pending = s.save(newArchitecture(),'a',1);
  if (offline) fake.events.offline(); else { stop!(); stop = undefined; }
  release(view(2)); expect(await pending).toBe(false); expect(s.state.view).toBeNull();
  stop?.(); stop = undefined;
 }
});
