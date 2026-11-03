-- District menu (Nathan, 2026-11-03): tap a district → its wards → the places
-- in each ward. A pin's category says what kind of place it is.

alter table public.map_pins
	add column category text not null default 'other'
	check (category in ('bar', 'club', 'shop', 'food', 'home', 'clinic', 'corp', 'gang', 'fixer', 'landmark', 'other'));

comment on column public.map_pins.category is 'Kind of place: bar, club, shop, food, home (NPC house), clinic, corp, gang, fixer, landmark, other.';
