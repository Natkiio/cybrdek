"""Mutation-check campaign combat rules on PGlite only; never connects to Supabase."""
import os, subprocess, pathlib, tempfile
repo = pathlib.Path(__file__).resolve().parents[1]
source = (repo / 'supabase/migrations/20261113180000_campaign_encounters.sql').read_text()
mutants = {
 'gm_write_guard': ("or not public.is_campaign_gm(campaign) then", "then"),
 'member_read_guard': ("or not public.is_campaign_member(campaign) then", "then"),
 'raw_table_exposure': ("-- No API table grants or policies, including for the GM: use the checked RPCs.", "-- No API table grants or policies, including for the GM: use the checked RPCs."),
 'npc_stats_leak': ("item := jsonb_build_object('id'", "item := c || jsonb_build_object('id'"),
 'teammate_hp_leak': ("if c->>'characterOwnerId' = auth.uid()::text then", "if c ? 'characterOwnerId' then"),
 'stale_revision': ("or expected_revision is distinct from fight.revision then", "then"),
 'foreign_pc': ("raise exception 'That character is not in this campaign' using errcode = '42501';", "null;"),
 'wound_boundary': ("< ceil((c->>'maxHp')::numeric / 2)", "<= ceil((c->>'maxHp')::numeric / 2)"),
}
root = pathlib.Path(tempfile.mkdtemp(prefix='cybrdek-combat-mutants-'))
print(f'Mutation logs: {root}', flush=True)
baseline = subprocess.run(['npx','vitest','run','tests/db/campaign-encounters.test.ts'], cwd=repo)
if baseline.returncode: raise SystemExit('Baseline must pass before mutation checks')
for name, (old,new) in mutants.items():
 if source.count(old) != 1: raise RuntimeError((name,source.count(old)))
 sql = source.replace(old,new)
 if name == 'raw_table_exposure':
  sql += "\ngrant select on public.campaign_encounters to authenticated; create policy leak on public.campaign_encounters for select to authenticated using (true);\n"
 path = root / (name+'.sql'); path.write_text(sql)
 env = dict(os.environ, ENCOUNTER_MIGRATION_OVERRIDE=str(path))
 p = subprocess.run(['npx','vitest','run','tests/db/campaign-encounters.test.ts'],cwd=repo,env=env,text=True,capture_output=True)
 (root/(name+'.log')).write_text(p.stdout+p.stderr)
 caught = p.returncode != 0 and 'AssertionError' in p.stdout+p.stderr
 print(name + ': ' + ('CAUGHT' if caught else 'NOT CAUGHT / INVALID MUTANT'),flush=True)
 if not caught: raise SystemExit(1)
