"""Mutation-check owner-only fight offers on PGlite; no network database."""
import os, subprocess, pathlib, tempfile
repo = pathlib.Path(__file__).resolve().parents[1]
source = (repo / 'supabase/migrations/20261114160000_fight_damage_offers.sql').read_text()
mutants = {
 'owner_guard': ("owner is null or owner is distinct from auth.uid() or ", ""),
 'membership_guard': ("or not public.is_campaign_member(campaign)", ""),
 'campaign_isolation': ("e.campaign_id = campaign and ", ""),
 'finished_only': ("e.ended_at is not null and ", ""),
 'character_owner': ("and c->>'characterOwnerId' = owner::text", ""),
 'accepted_receipt': ("and not (coalesce(ch.data->'extra'->'acceptedChanges','{}') ? ('fight-damage:' || owner::text || ':' || e.id::text))", ""),
}
root = pathlib.Path(tempfile.mkdtemp(prefix='cybrdek-damage-mutants-'))
print(f'Mutation logs: {root}', flush=True)
if subprocess.run(['npx','vitest','run','tests/db/campaign-encounters.test.ts'], cwd=repo).returncode:
 raise SystemExit('Baseline must pass before mutation checks')
for name, (old,new) in mutants.items():
 if source.count(old) != 1: raise RuntimeError((name,source.count(old)))
 path = root / (name+'.sql'); path.write_text(source.replace(old,new))
 env = dict(os.environ, DAMAGE_MIGRATION_OVERRIDE=str(path))
 p = subprocess.run(['npx','vitest','run','tests/db/campaign-encounters.test.ts'],cwd=repo,env=env,text=True,capture_output=True)
 (root/(name+'.log')).write_text(p.stdout+p.stderr)
 caught = p.returncode != 0 and 'AssertionError' in p.stdout+p.stderr
 print(name + ': ' + ('CAUGHT' if caught else 'NOT CAUGHT / INVALID MUTANT'),flush=True)
 if not caught: raise SystemExit(1)
