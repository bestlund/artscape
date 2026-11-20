// Find candidate home areas: a copper + tin mine with a furnace, an anvil and a
// bank close by. Reads the engine's map files (server/content/maps/*.jm2) and
// measures real walking distances with the SDK's pathfinder. Changes nothing.
//
//   bun artscape/tools/find-home-area.ts [--top=12] [--radius=120]
//
// Distances are in tiles walked (doors count as open). At the default tick
// rate (400 ms) walking is 1 tile per tick, running 2.

import fs from 'fs';
import path from 'path';
import { findLongPath, initPathfinding, isTileWalkable } from '../../sdk/pathfinding';

const ROOT = path.resolve(import.meta.dir, '..', '..');
const CONTENT = path.join(ROOT, 'server', 'content');
const arg = (n: string, d: number) => Number(process.argv.find(a => a.startsWith(`--${n}=`))?.split('=')[1] ?? d);
const TOP = arg('top', 12);
const RADIUS = arg('radius', 120); // only look for spots this many tiles (straight line) from the mine

// ---- names from the pack files ----
function readPack(file: string): Map<number, string> {
    const m = new Map<number, string>();
    for (const line of fs.readFileSync(path.join(CONTENT, 'pack', file), 'utf-8').split(/\r?\n/)) {
        const i = line.indexOf('=');
        if (i > 0) m.set(Number(line.slice(0, i)), line.slice(i + 1));
    }
    return m;
}
const locNames = readPack('loc.pack');
const npcNames = readPack('npc.pack');

const KIND: Record<string, string> = {
    copperrock1: 'copper', copperrock2: 'copper',
    tinrock1: 'tin', tinrock2: 'tin',
    furnace1: 'furnace', furnace2: 'furnace',
    anvil: 'anvil',
    bankbooth: 'bank',
};

type P = { x: number; z: number };
const spots: Record<string, P[]> = { copper: [], tin: [], furnace: [], anvil: [], bank: [] };
const npcs: { x: number; z: number; name: string }[] = [];

// ---- read the maps (ground level only) ----
for (const f of fs.readdirSync(path.join(CONTENT, 'maps'))) {
    const m = f.match(/^m(\d+)_(\d+)\.jm2$/);
    if (!m) continue;
    const baseX = Number(m[1]) * 64, baseZ = Number(m[2]) * 64;
    let section = '';
    for (const line of fs.readFileSync(path.join(CONTENT, 'maps', f), 'utf-8').split(/\r?\n/)) {
        if (line.startsWith('====')) { section = line; continue; }
        const r = line.match(/^(\d+) (\d+) (\d+): (\d+)/);
        if (!r || r[1] !== '0') continue;
        const x = baseX + Number(r[2]), z = baseZ + Number(r[3]), id = Number(r[4]);
        if (section.includes('LOC')) {
            const kind = KIND[locNames.get(id) ?? ''];
            if (kind) spots[kind].push({ x, z });
        } else if (section.includes('NPC')) {
            npcs.push({ x, z, name: npcNames.get(id) ?? String(id) });
        }
    }
}
console.log(`Found: ${Object.entries(spots).map(([k, v]) => `${v.length} ${k}`).join(', ')}, ${npcs.length} NPC spawns (ground level)`);

// ---- group ore rocks into mines ----
const cheb = (a: P, b: P) => Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));
const rocks = [...spots.copper.map(p => ({ ...p, ore: 'copper' })), ...spots.tin.map(p => ({ ...p, ore: 'tin' }))];
const group = new Array(rocks.length).fill(-1);
let groups = 0;
for (let i = 0; i < rocks.length; i++) {
    if (group[i] >= 0) continue;
    const stack = [i];
    group[i] = groups;
    while (stack.length) {
        const a = stack.pop()!;
        for (let j = 0; j < rocks.length; j++) {
            if (group[j] < 0 && cheb(rocks[a], rocks[j]) <= 10) { group[j] = groups; stack.push(j); }
        }
    }
    groups++;
}
const mines = [...Array(groups).keys()].map(g => {
    const rs = rocks.filter((_, i) => group[i] === g);
    const cx = rs.reduce((s, r) => s + r.x, 0) / rs.length, cz = rs.reduce((s, r) => s + r.z, 0) / rs.length;
    return { rocks: rs, copper: rs.filter(r => r.ore === 'copper').length, tin: rs.filter(r => r.ore === 'tin').length, center: { x: Math.round(cx), z: Math.round(cz) } };
}).filter(m => m.copper >= 1 && m.tin >= 1);
console.log(`${mines.length} mines with copper and tin rocks\n`);

// ---- walking distance ----
initPathfinding();
function standTiles(p: P): P[] {
    // walkable tiles next to the spot (rocks, furnaces, anvils and booths block their own tile).
    // Several, because a free tile can be boxed in between rocks and lead nowhere.
    const out: P[] = [];
    for (let r = 0; r <= 3 && out.length < 4; r++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        if (isTileWalkable(0, p.x + dx, p.z + dz)) out.push({ x: p.x + dx, z: p.z + dz });
    }
    return out.slice(0, 4);
}
function pathLength(s: P, t: P): number | null {
    if (cheb(s, t) <= 1) return cheb(s, t);
    const pts = findLongPath(0, s.x, s.z, t.x, t.z, 2000);
    if (pts.length === 0) return null;
    let len = 0, prev = s;
    for (const q of pts) { len += cheb(prev, q); prev = q; }
    return cheb(prev, t) <= 2 ? len : null; // path must actually arrive
}
function walk(a: P, b: P): number | null {
    let best: number | null = null;
    for (const s of standTiles(a)) {
        for (const t of standTiles(b)) {
            const d = pathLength(s, t);
            if (d !== null) { if (best === null || d < best) best = d; break; }
        }
    }
    return best;
}
/** One spot per group: a bank with 8 booths counts once, so it can't crowd out the next bank. */
function onePerGroup(list: P[], within = 8): P[] {
    const out: P[] = [];
    for (const p of list) if (!out.some(q => cheb(p, q) <= within)) out.push(p);
    return out;
}
function nearest(from: P, list: P[]): { p: P; d: number } | null {
    let best: { p: P; d: number } | null = null;
    const candidates = onePerGroup(list.filter(q => cheb(from, q) <= RADIUS).sort((a, b) => cheb(from, a) - cheb(from, b)));
    for (const p of candidates.slice(0, 6)) {
        const d = walk(from, p);
        if (d !== null && (!best || d < best.d)) best = { p, d };
    }
    return best;
}

// ---- score each mine ----
const rows = [];
for (const mine of mines) {
    const c = mine.rocks.slice().sort((a, b) => cheb(a, mine.center) - cheb(b, mine.center))[0];
    const furnace = nearest(c, spots.furnace), anvil = nearest(c, spots.anvil), bank = nearest(c, spots.bank);
    if (!furnace || !anvil || !bank) { console.log(`skip mine ${mine.center.x},${mine.center.z} (copper ${mine.copper}, tin ${mine.tin}): no ${!furnace ? "furnace " : ""}${!anvil ? "anvil " : ""}${!bank ? "bank" : ""} within ${RADIUS} tiles`); continue; }
    const fa = walk(furnace.p, anvil.p), ab = walk(anvil.p, bank.p), fb = walk(furnace.p, bank.p);
    if (fa === null || ab === null || fb === null) continue;
    const total = furnace.d + anvil.d + bank.d + fa + ab + fb; // all six pairs
    const pts = [c, furnace.p, anvil.p, bank.p];
    const span = Math.max(Math.max(...pts.map(p => p.x)) - Math.min(...pts.map(p => p.x)), Math.max(...pts.map(p => p.z)) - Math.min(...pts.map(p => p.z)));
    const near = npcs.filter(n => cheb(n, mine.center) <= 15);
    const counts: Record<string, number> = {};
    for (const n of near) counts[n.name] = (counts[n.name] ?? 0) + 1;
    const shops = npcs.filter(n => /shop|store/i.test(n.name) && !/guard/i.test(n.name) && cheb(n, mine.center) <= RADIUS)
        .map(n => ({ n, d: cheb(n, mine.center) })).sort((a, b) => a.d - b.d)[0];
    rows.push({
        mine: mine.center, copper: mine.copper, tin: mine.tin, underground: mine.center.z > 6400,
        furnace, anvil, bank, fa, ab, fb, total, span,
        npcsNearMine: Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}${v > 1 ? ` x${v}` : ''}`).join(', '),
        shop: shops ? `${shops.n.name} at (${shops.n.x}, ${shops.n.z}), ${shops.d} tiles` : 'none',
    });
}
rows.sort((a, b) => a.total - b.total);

const xy = (p: P) => `(${p.x}, ${p.z})`;
for (const [i, r] of rows.slice(0, TOP).entries()) {
    console.log(`#${i + 1}  mine ${xy(r.mine)}  copper ${r.copper}, tin ${r.tin}${r.underground ? '  [underground]' : ''}`);
    console.log(`    walk from mine: furnace ${r.furnace.d} ${xy(r.furnace.p)}, anvil ${r.anvil.d} ${xy(r.anvil.p)}, bank ${r.bank.d} ${xy(r.bank.p)}`);
    console.log(`    furnace-anvil ${r.fa}, anvil-bank ${r.ab}, furnace-bank ${r.fb}  | all six pairs: ${r.total} tiles, fits in ${r.span}x${r.span}`);
    console.log(`    NPCs within 15 tiles of the mine: ${r.npcsNearMine || 'none'}`);
    console.log(`    nearest shop NPC: ${r.shop}\n`);
}
console.log(`${rows.length} mines have a furnace, an anvil and a bank within ${RADIUS} tiles (by walking).`);

// ---- second view: start from each bank, see what is close and what is missing ----
const CLOSE = arg('close', 40); // "close" = this many tiles walked or less
const mineRocks = mines.flatMap(m => m.rocks);
const generalStores = npcs.filter(n => /^generalshopkeeper\d$/.test(n.name));
const bankRows = [];
for (const bank of onePerGroup(spots.bank)) {
    const f = nearest(bank, spots.furnace), a = nearest(bank, spots.anvil), m = nearest(bank, mineRocks), g = nearest(bank, generalStores);
    const parts = { furnace: f, anvil: a, mine: m, 'general store': g };
    const close = Object.entries(parts).filter(([, v]) => v && v.d <= CLOSE).map(([k]) => k);
    const missing = Object.keys(parts).filter(k => !close.includes(k));
    const sum = Object.values(parts).reduce((s, v) => s + (v ? v.d : RADIUS * 2), 0);
    bankRows.push({ bank, parts, close, missing, sum });
}
bankRows.sort((x, y) => y.close.length - x.close.length || x.sum - y.sum);
console.log(`\n=== Banks: what is within ${CLOSE} tiles walked (furnace, anvil, a copper/tin mine, a general store) ===\n`);
for (const r of bankRows.slice(0, TOP)) {
    const show = (k: string) => {
        const v = (r.parts as any)[k];
        return `${k} ${v ? `${v.d} ${xy(v.p)}` : `none within ${RADIUS}`}`;
    };
    console.log(`bank ${xy(r.bank)}: close: ${r.close.join(', ') || 'nothing'} | missing: ${r.missing.join(', ') || 'nothing'}`);
    console.log(`    ${['furnace', 'anvil', 'mine', 'general store'].map(show).join(' | ')}\n`);
}
