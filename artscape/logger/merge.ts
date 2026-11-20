// Merge all agent files of a run into one timeline, and check the data.
//
//   bun artscape/logger/merge.ts                 -> newest run
//   bun artscape/logger/merge.ts <run-id>        -> that run
//   bun artscape/logger/merge.ts <run-id> --no-snapshots   (leave snapshots out of timeline.txt only)
//
// Writes runs/<id>/timeline.jsonl (all events, ordered by time) and
// runs/<id>/timeline.txt (one readable line per event). Both are generated:
// running merge again replaces them. The agent files are never changed.
// Exit code 1 if the check finds broken lines, seq gaps or wrong run ids.

import fs from 'fs';
import path from 'path';
import { latestRun, openRun, type LogEvent } from './log';
import { loadAreas, type Area } from './areas';

export interface MergeReport {
    run: string;
    events: number;
    perAgent: Record<string, Record<string, number>>;
    issues: string[];
    timelineJsonl: string;
    timelineTxt: string;
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
const clock = (iso: string) => {
    const d = new Date(iso);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const num = (n: number) => n.toLocaleString('en-US');

function signed(counts: Record<string, number> | undefined, suffix = ''): string {
    if (!counts) return '';
    return Object.entries(counts)
        .map(([k, v]) => `${v > 0 ? '+' : ''}${num(v)} ${k}${suffix}`)
        .join(', ');
}

function argText(args: unknown): string {
    if (!Array.isArray(args)) return '';
    return args
        .map(a => {
            if (typeof a === 'string') return a.startsWith('/') ? a : JSON.stringify(a);
            if (a && typeof a === 'object' && 'name' in (a as any)) return String((a as any).name);
            return JSON.stringify(a);
        })
        .join(', ');
}

export function formatEvent(ev: LogEvent, areas: Area[]): string {
    const label = (name: unknown) => (name ? areas.find(a => a.name === name)?.label ?? String(name) : 'no named area');
    const d: any = ev.data ?? {};
    switch (ev.type) {
        case 'run.start':
            return `joined run ${ev.run} (${d.condition}), script ${d.script}`;
        case 'run.end':
            return `left the run: ${d.reason}${d.error ? ` (${d.error.message})` : ''}${d.how ? `, ${d.how}` : ''}, ${d.seconds} s`;
        case 'action': {
            const what = `${d.name}(${argText(d.args)})`;
            const status = d.success ? 'ok' : 'FAILED';
            const msg = d.message ?? d.error?.message;
            return `${what} ${status}${msg ? `: ${msg}` : ''} (${(d.ms / 1000).toFixed(1)} s)`;
        }
        case 'snapshot': {
            const near = (d.nearbyPlayers ?? []).map((p: any) => `${p.name} ${p.distance}`).join(', ');
            return `snapshot: ${label(d.area)} (${d.x}, ${d.z}), HP ${d.hp}/${d.maxHp}, ${d.slotsUsed}/28 slots${near ? `, near: ${near}` : ''}`;
        }
        case 'location':
            return d.to ? `entered ${label(d.to)} (${d.x}, ${d.z})` : `left ${label(d.from)} (${d.x}, ${d.z})`;
        case 'activity.start':
            return `started ${d.routine} at ${label(d.area)}${d.settings && Object.keys(d.settings).length ? ` ${JSON.stringify(d.settings)}` : ''}`;
        case 'activity.end': {
            const parts = [signed(d.items), signed(d.xp, ' XP')].filter(Boolean).join(', ');
            return `finished ${d.routine} at ${label(d.area)}: ${parts || 'nothing gained'} (${d.seconds} s, ${String(d.reason).replace(/_/g, ' ')})`;
        }
        case 'problem':
            return `${d.resolved ? 'OK again' : 'PROBLEM'} ${d.kind}: ${d.message ?? ''}`;
        case 'note':
            return `NOTE: ${d.text}`;
        default:
            return `${ev.type}: ${JSON.stringify(d)}`;
    }
}

export function mergeRun(runDir: string, opts: { snapshotsInTxt?: boolean } = {}): MergeReport {
    const run = openRun(runDir);
    const areas = loadAreas(path.join(run.dir, 'files', 'config', 'areas.json'));
    const agentsDir = path.join(run.dir, 'agents');
    const issues: string[] = [];
    const perAgent: Record<string, Record<string, number>> = {};
    const all: LogEvent[] = [];

    const files = fs.existsSync(agentsDir) ? fs.readdirSync(agentsDir).filter(f => f.endsWith('.jsonl')).sort() : [];
    if (files.length === 0) issues.push('no agent files');

    for (const f of files) {
        const agent = f.replace(/\.jsonl$/, '');
        const counts: Record<string, number> = {};
        perAgent[agent] = counts;
        const lines = fs.readFileSync(path.join(agentsDir, f), 'utf-8').split('\n');
        let expected = 1;
        lines.forEach((line, i) => {
            if (line.trim() === '') return;
            let ev: LogEvent;
            try {
                ev = JSON.parse(line);
            } catch {
                issues.push(`${f} line ${i + 1}: not valid JSON (${line.slice(0, 60)}…)`);
                return;
            }
            for (const key of ['seq', 't', 'run', 'agent', 'type', 'data'] as const) {
                if (ev[key] === undefined) issues.push(`${f} line ${i + 1}: missing "${key}"`);
            }
            if (ev.run !== run.id) issues.push(`${f} line ${i + 1}: run "${ev.run}", expected "${run.id}"`);
            if (ev.agent !== agent) issues.push(`${f} line ${i + 1}: agent "${ev.agent}" in ${agent}'s file`);
            if (ev.seq !== expected) issues.push(`${f} line ${i + 1}: seq ${ev.seq}, expected ${expected}`);
            expected = (typeof ev.seq === 'number' ? ev.seq : expected) + 1;
            counts[ev.type] = (counts[ev.type] ?? 0) + 1;
            all.push(ev);
        });
    }

    // Order by wall-clock time; equal times keep agent order, then seq.
    all.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : a.agent < b.agent ? -1 : a.agent > b.agent ? 1 : a.seq - b.seq));

    const width = Math.max(5, ...Object.keys(perAgent).map(a => a.length));
    const header = [
        `Run ${run.id}  (condition ${run.setup.condition}, created ${run.setup.created})`,
        `Agents: ${Object.keys(perAgent).join(', ') || 'none'}. Times are local (${Intl.DateTimeFormat().resolvedOptions().timeZone}).`,
        '',
    ];
    let lastDay = '';
    const lines: string[] = [];
    for (const ev of all) {
        if (ev.type === 'snapshot' && opts.snapshotsInTxt === false) continue;
        const day = new Date(ev.t).toDateString();
        if (day !== lastDay) {
            lines.push(`--- ${day}`);
            lastDay = day;
        }
        lines.push(`${clock(ev.t)}  ${ev.agent.padEnd(width)}  ${formatEvent(ev, areas)}`);
    }

    // Write to a temp file, then rename, so a half-written timeline never replaces a good one.
    const jsonlPath = path.join(run.dir, 'timeline.jsonl');
    const txtPath = path.join(run.dir, 'timeline.txt');
    fs.writeFileSync(jsonlPath + '.tmp', all.map(e => JSON.stringify(e)).join('\n') + (all.length ? '\n' : ''));
    fs.renameSync(jsonlPath + '.tmp', jsonlPath);
    fs.writeFileSync(txtPath + '.tmp', [...header, ...lines].join('\n') + '\n');
    fs.renameSync(txtPath + '.tmp', txtPath);

    return { run: run.id, events: all.length, perAgent, issues, timelineJsonl: jsonlPath, timelineTxt: txtPath };
}

if (import.meta.main) {
    const args = process.argv.slice(2);
    const id = args.find(a => !a.startsWith('--'));
    const run = id ? openRun(id) : latestRun();
    if (!run) {
        console.error('No runs found in runs/');
        process.exit(1);
    }
    const report = mergeRun(run.dir, { snapshotsInTxt: !args.includes('--no-snapshots') });
    console.log(`Run ${report.run}: ${report.events} events`);
    for (const [agent, counts] of Object.entries(report.perAgent)) {
        console.log(`  ${agent}: ${Object.entries(counts).map(([t, n]) => `${t} ${n}`).join(', ')}`);
    }
    console.log(`Wrote ${path.relative(process.cwd(), report.timelineJsonl)} and ${path.relative(process.cwd(), report.timelineTxt)}`);
    if (report.issues.length) {
        console.log(`\n${report.issues.length} problem(s) in the data:`);
        for (const i of report.issues.slice(0, 50)) console.log(`  - ${i}`);
        process.exit(1);
    }
    console.log('Check: every line is valid, seq has no gaps, run ids match.');
}
