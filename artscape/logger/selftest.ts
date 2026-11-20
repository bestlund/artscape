// Offline self-test for the logger (no game needed):
//   bun artscape/logger/selftest.ts
// Uses a temporary runs folder, never the real runs/.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { AgentLog, createRun, LogWriteError, openRun } from './log';
import { instrument } from './instrument';
import { mergeRun } from './merge';
import type { Area } from './areas';

let failures = 0;
const check = (ok: boolean, what: string) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
    if (!ok) failures++;
};
const readEvents = (file: string) => fs.readFileSync(file, 'utf-8').trim().split('\n').map(l => JSON.parse(l));
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'artscape-logger-'));
const runsDir = path.join(tmp, 'runs');
const areasFile = path.join(tmp, 'areas.json');
fs.writeFileSync(areasFile, JSON.stringify({ areas: { home: { label: 'Home', x: [0, 9], z: [0, 9], level: 0 } } }));
const areas: Area[] = [{ name: 'home', label: 'Home', x: [0, 9], z: [0, 9], level: 0 }];

// 1. Run folders
const run = createRun({ condition: 'dev', agents: ['alpha', 'beta'], note: 'selftest' }, runsDir, areasFile);
const run2 = createRun({ condition: 'dev', agents: ['alpha'] }, runsDir, areasFile);
check(fs.existsSync(path.join(run.dir, 'run.json')) && fs.existsSync(path.join(run.dir, 'agents')), 'run folder has run.json and agents/');
check(run2.id === run.id + '_2' || run2.id !== run.id, `second run in the same minute gets its own folder (${run2.id})`);
check(fs.existsSync(path.join(run.dir, 'files', 'config', 'areas.json')), 'areas.json is copied into the run');
const setup = openRun(run.dir).setup as any;
check(setup.schema === 1 && setup.world?.tickRateMs > 0 && setup.versions?.rsSdkUpstream === 'b565f2d92', 'run.json has schema, world settings and versions');

// 2. Writer: seq, envelope, speed of write+fsync per line
const alpha = new AgentLog(run, 'alpha');
const N = 200;
const t0 = performance.now();
for (let i = 0; i < N; i++) alpha.event('note', { text: `line ${i}` });
const perLine = (performance.now() - t0) / N;
let evs = readEvents(alpha.file);
check(evs.length === N && evs.every((e, i) => e.seq === i + 1), `${N} events, seq 1..${N} without gaps`);
check(evs.every(e => e.run === run.id && e.agent === 'alpha' && typeof e.t === 'string'), 'every event has the envelope');
console.log(`      write + fsync: ${perLine.toFixed(2)} ms per line`);
alpha.close();

// 3. Rejoin continues seq
const alphaAgain = new AgentLog(run, 'alpha');
alphaAgain.note('rejoined');
evs = readEvents(alphaAgain.file);
check(evs[evs.length - 1].seq === N + 1, 'an agent that rejoins continues its seq');
alphaAgain.close();

// 4. Instrumented bot (fake bot and fake state)
class FakeBot {
    async walkTo(x: number, z: number) {
        pos.x = x;
        pos.z = z;
        return { success: true, message: `arrived at ${x},${z}` };
    }
    async chopTree(_t?: RegExp) {
        return { success: false, message: 'no tree' };
    }
    async boom() {
        throw new Error('exploded');
    }
    getEquipment() {
        return [];
    }
}
const pos = { x: 5, z: 5 };
let tick = 100;
const sdk = {
    getState: () => ({
        tick: tick++,
        player: { worldX: pos.x, worldZ: pos.z, level: 0, hp: 10, maxHp: 10 },
        inventory: [{ name: 'Logs', count: 1 }, { name: 'Logs', count: 1 }],
        skills: [{ name: 'Woodcutting', experience: 500 }],
        nearbyPlayers: [{ name: 'gamma', x: 6, z: 5 }],
    }),
    getStateAge: () => 50,
};
const beta = new AgentLog(run, 'beta');
const inst = instrument(new FakeBot(), sdk, beta, { areas, snapshotMs: 100, locationMs: 20 });
await inst.bot.walkTo(3, 4);
await inst.bot.walkTo(50, 50); // leaves "home"
await sleep(80);
for (let i = 0; i < 5; i++) await inst.bot.chopTree(/^tree$/i);
let threw = false;
try {
    await inst.bot.boom();
} catch {
    threw = true;
}
inst.bot.getEquipment();
await sleep(250);
inst.stop();
evs = readEvents(beta.file);
const types = evs.map(e => e.type);
const actions = evs.filter(e => e.type === 'action');
check(actions.length === 8, `every bot.* call is one action event (${actions.length}/8, getEquipment not logged)`);
check(actions[0].data.message === 'arrived at 3,4' && actions[0].data.success === true && typeof actions[0].tick === 'number', 'action has message, success and tick');
check(actions.some(a => a.data.args?.[0] === '/^tree$/i'), 'RegExp args are kept as text');
check(threw && actions[actions.length - 1].data.error?.message === 'exploded', 'a thrown error is logged and still thrown');
check(evs.some(e => e.type === 'problem' && e.data.kind === 'failure_streak' && e.data.count === 5), '5 failures in a row -> problem event');
const locs = evs.filter(e => e.type === 'location');
check(locs.length >= 2 && locs[0].data.to === 'home' && locs.some(l => l.data.from === 'home' && l.data.to === null), 'location: entered home, then left it');
check(types.filter(t => t === 'snapshot').length >= 2, `snapshots on the timer (${types.filter(t => t === 'snapshot').length})`);
const snap = evs.find(e => e.type === 'snapshot');
check(snap.data.inventory.Logs === 2 && snap.data.nearbyPlayers[0].distance === 1, 'snapshot has inventory counts and nearby players');

// 5. A failed write stops everything
fs.closeSync(beta.fd); // simulate the disk going away
let stopped = false;
try {
    beta.event('note', { text: 'should fail' });
} catch (e) {
    stopped = e instanceof LogWriteError;
}
let blocked = false;
try {
    await inst.bot.walkTo(1, 1);
} catch (e) {
    blocked = e instanceof LogWriteError;
}
check(stopped, 'a failed write throws LogWriteError');
check(blocked && pos.x === 50, 'after a failed write, bot calls are refused before they act');

// 6. Merge
const report = mergeRun(run.dir);
check(report.issues.length === 0, `merge: no problems in the data (${report.issues.join('; ') || 'none'})`);
const merged = readEvents(report.timelineJsonl);
check(merged.length === report.events && merged.every((e, i) => i === 0 || merged[i - 1].t <= e.t), 'timeline.jsonl is ordered by time');
const txt = fs.readFileSync(report.timelineTxt, 'utf-8');
check(txt.includes('entered Home') && txt.includes('chopTree(/^tree$/i) FAILED: no tree') && txt.includes('PROBLEM failure_streak'), 'timeline.txt has readable lines');

// 7. Merge finds broken data
fs.appendFileSync(path.join(run.dir, 'agents', 'alpha.jsonl'), '{"seq": 999, "broken\n');
const bad = mergeRun(run.dir);
check(bad.issues.some(i => i.includes('not valid JSON')), 'merge reports a broken line');

console.log(`\n${failures === 0 ? 'All checks passed' : `${failures} check(s) FAILED`}. Temp folder: ${tmp}`);
console.log('\nSample of timeline.txt:\n' + txt.split('\n').filter(l => !l.includes('NOTE: line')).slice(0, 25).join('\n'));
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(failures === 0 ? 0 : 1);
