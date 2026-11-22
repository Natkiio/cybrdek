// Core pp. 206–207, 212. Names and reference stats only; no effects or book prose.
export const BLACK_ICE = [
 { id: 'asp', name: 'Asp', per: 4, spd: 6, atk: 2, def: 2, rez: 15, page: 206 },
 { id: 'giant', name: 'Giant', per: 2, spd: 2, atk: 8, def: 4, rez: 25, page: 206 },
 { id: 'hellhound', name: 'Hellhound', per: 6, spd: 6, atk: 6, def: 2, rez: 20, page: 206 },
 { id: 'kraken', name: 'Kraken', per: 6, spd: 2, atk: 8, def: 4, rez: 30, page: 207 },
 { id: 'liche', name: 'Liche', per: 8, spd: 2, atk: 6, def: 2, rez: 25, page: 207 },
 { id: 'raven', name: 'Raven', per: 6, spd: 4, atk: 4, def: 2, rez: 15, page: 207 },
 { id: 'scorpion', name: 'Scorpion', per: 2, spd: 6, atk: 2, def: 2, rez: 15, page: 207 },
 { id: 'skunk', name: 'Skunk', per: 2, spd: 4, atk: 4, def: 2, rez: 10, page: 207 },
 { id: 'wisp', name: 'Wisp', per: 4, spd: 4, atk: 4, def: 2, rez: 15, page: 207 },
 { id: 'dragon', name: 'Dragon', per: 6, spd: 4, atk: 6, def: 6, rez: 30, page: 207 },
 { id: 'killer', name: 'Killer', per: 4, spd: 8, atk: 6, def: 2, rez: 20, page: 207 },
 { id: 'sabertooth', name: 'Sabertooth', per: 8, spd: 6, atk: 6, def: 2, rez: 25, page: 207 }
] as const;
export const DEMONS = [
 { id: 'imp', name: 'Imp', rez: 15, interface: 3, netActions: 2, combatNumber: 14, page: 212 },
 { id: 'efreet', name: 'Efreet', rez: 25, interface: 4, netActions: 3, combatNumber: 14, page: 212 },
 { id: 'balron', name: 'Balron', rez: 30, interface: 7, netActions: 4, combatNumber: 14, page: 212 }
] as const;
