// ArtScape logger core: run folders, run.json and the per-agent event writer.
// Design: artscape/docs/logger/DESIGN.md. Format: artscape/logger/SCHEMA.md.
//
// Rules from the design:
// - Every event is one JSON line, written and flushed to disk the moment it happens.
// - A new run never touches an old run's folder; nothing is ever truncated.
// - One file per agent, so no two processes ever write the same file.
// - If a line cannot be written, the run stops (no run without complete data).

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export const SCHEMA_VERSION = 1;
export const REPO_ROOT = path.resolve(import.meta.dir, '..', '..');
export const RUNS_DIR = path.join(REPO_ROOT, 'runs');
export const AREAS_FILE = path.join(REPO_ROOT, 'artscape', 'areas.json');
/** The upstream rs-sdk commit this fork is pinned to (never pulled since). */
export const RS_SDK_UPSTREAM = 'b565f2d92';

/** Thrown when an event cannot be written. The run must stop. */
export class LogWriteError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'LogWriteError';
    }
}

export interface RunSetup {
    /** 'dev' for anything that isn't an experiment run; later 'memory-on' / 'memory-off'. */
    condition: string;
    /** Agents expected in this run (bot names). */
    agents: string[];
    /** Language model, once there is one. */
    model?: string | null;
    /** Memory on/off, once there is memory. */
    memory?: boolean | null;
    /** Free text, e.g. what this run is for. */
    note?: string;
}

export interface RunInfo {
    id: string;
    dir: string;
    setup: Record<string, unknown>;
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** Run id from local time: YYYY-MM-DD_HHMM_<condition>, e.g. 2026-11-20_1745_dev */
export function makeRunId(condition: string, date = new Date()): string {
    if (!/^[a-z0-9-]+$/.test(condition)) {
        throw new Error(`Condition "${condition}" must be lowercase letters, digits and dashes`);
    }
    const d = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    return `${d}_${pad(date.getHours())}${pad(date.getMinutes())}_${condition}`;
}

function gitInfo(): { commit: string | null; branch: string | null; dirty: boolean | null } {
    const run = (cmd: string) => execSync(cmd, { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    try {
        return {
            commit: run('git rev-parse --short HEAD'),
            branch: run('git rev-parse --abbrev-ref HEAD'),
            dirty: run('git status --porcelain --untracked-files=no').length > 0,
        };
    } catch {
        return { commit: null, branch: null, dirty: null };
    }
}

/**
 * World settings from server/engine/.env. Only these keys are read, so nothing
 * private from that file ends up in run.json. Defaults are the engine's own.
 */
function worldSettings(): Record<string, unknown> {
    const envFile = path.join(REPO_ROOT, 'server', 'engine', '.env');
    const env: Record<string, string> = {};
    if (fs.existsSync(envFile)) {
        for (const line of fs.readFileSync(envFile, 'utf-8').split(/\r?\n/)) {
            const m = line.match(/^\s*(NODE_TICKRATE|NODE_XPRATE|GE_ENABLED|BUILD_LIVE_RELOAD)\s*=\s*(.*?)\s*$/);
            if (m) env[m[1]] = m[2];
        }
    }
    const bool = (v: string | undefined, dflt: boolean) => (v === undefined ? dflt : v.toLowerCase() === 'true');
    return {
        tickRateMs: env.NODE_TICKRATE ? Number(env.NODE_TICKRATE) : 400,
        xpRate: env.NODE_XPRATE ? Number(env.NODE_XPRATE) : 25,
        geEnabled: bool(env.GE_ENABLED, true),
        liveReload: bool(env.BUILD_LIVE_RELOAD, true),
        source: 'server/engine/.env at run start (::speed in-game changes the tick rate later without a trace here)',
    };
}

/**
 * Create a new run folder: runs/<id>/ with run.json, agents/ and files/.
 * Never reuses a folder: if the id exists, a suffix _2, _3, ... is added.
 */
export function createRun(setup: RunSetup, runsDir = RUNS_DIR, areasFile = AREAS_FILE): RunInfo {
    fs.mkdirSync(runsDir, { recursive: true });
    const base = makeRunId(setup.condition);
    let id = base;
    let dir = path.join(runsDir, id);
    for (let i = 2; ; i++) {
        try {
            fs.mkdirSync(dir); // not recursive: fails if the folder exists, so two runs never share one
            break;
        } catch (e: any) {
            if (e.code !== 'EEXIST') throw e;
            id = `${base}_${i}`;
            dir = path.join(runsDir, id);
        }
    }
    fs.mkdirSync(path.join(dir, 'agents'));
    fs.mkdirSync(path.join(dir, 'files', 'config'), { recursive: true });

    const configFiles: string[] = [];
    if (fs.existsSync(areasFile)) {
        fs.copyFileSync(areasFile, path.join(dir, 'files', 'config', 'areas.json'));
        configFiles.push('files/config/areas.json');
    }

    const now = new Date();
    const runJson = {
        schema: SCHEMA_VERSION,
        run: id,
        condition: setup.condition,
        created: now.toISOString(),
        timezoneOffsetMinutes: -now.getTimezoneOffset(),
        agents: setup.agents,
        model: setup.model ?? null,
        memory: setup.memory ?? null,
        note: setup.note ?? null,
        versions: { rsSdkUpstream: RS_SDK_UPSTREAM, fork: gitInfo(), bun: Bun.version },
        world: worldSettings(),
        configFiles,
    };
    fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify(runJson, null, 2) + '\n', { flag: 'wx' });
    return { id, dir, setup: runJson };
}

/** Open an existing run, e.g. when a second agent joins it. */
export function openRun(idOrDir: string, runsDir = RUNS_DIR): RunInfo {
    const dir = fs.existsSync(path.join(idOrDir, 'run.json')) ? idOrDir : path.join(runsDir, idOrDir);
    const file = path.join(dir, 'run.json');
    if (!fs.existsSync(file)) throw new Error(`No run found at ${dir} (run.json missing)`);
    const setup = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return { id: setup.run, dir, setup };
}

/** The newest run folder (by name, which sorts by time). */
export function latestRun(runsDir = RUNS_DIR): RunInfo | null {
    if (!fs.existsSync(runsDir)) return null;
    const ids = fs.readdirSync(runsDir).filter(d => fs.existsSync(path.join(runsDir, d, 'run.json'))).sort();
    return ids.length ? openRun(ids[ids.length - 1], runsDir) : null;
}

/**
 * Turn any value into something small and JSON-safe for a log line:
 * RegExp -> "/src/flags", functions dropped, long strings and arrays cut, depth limited.
 */
export function loggable(value: unknown, depth = 3): unknown {
    if (value === null || value === undefined) return value ?? null;
    if (value instanceof RegExp) return value.toString();
    if (value instanceof Error) return { error: value.name, message: value.message };
    if (typeof value === 'function' || typeof value === 'symbol') return undefined;
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'string') return value.length > 300 ? value.slice(0, 300) + '…' : value;
    if (typeof value !== 'object') return value;
    if (depth <= 0) return Array.isArray(value) ? `[${value.length} items]` : '{…}';
    if (Array.isArray(value)) {
        const items = value.slice(0, 20).map(v => loggable(v, depth - 1));
        if (value.length > 20) items.push(`…${value.length - 20} more`);
        return items;
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        // Interaction option lists make lines huge and say nothing about what happened.
        if (k === 'optionsWithIndex' || k === 'options') continue;
        const lv = loggable(v, depth - 1);
        if (lv !== undefined) out[k] = lv;
    }
    return out;
}

export interface LogEvent {
    seq: number;
    t: string;
    tick: number | null;
    run: string;
    agent: string;
    type: string;
    data: Record<string, unknown>;
}

/**
 * Writes one agent's events to runs/<id>/agents/<agent>.jsonl.
 * Every event is written and fsynced before event() returns.
 */
export class AgentLog {
    readonly file: string;
    readonly runId: string;
    readonly runDir: string;
    readonly agent: string;
    /** Set once a write failed. Every later call throws it. */
    failed: LogWriteError | null = null;
    /** Exposed for the self-test only. */
    fd: number;
    private seq = 0;
    private tickSource: () => number | null = () => null;

    constructor(run: RunInfo, agent: string) {
        if (!/^[a-z0-9_-]+$/i.test(agent)) throw new Error(`Bad agent name "${agent}"`);
        this.runId = run.id;
        this.runDir = run.dir;
        this.agent = agent;
        this.file = path.join(run.dir, 'agents', `${agent}.jsonl`);

        // An agent can rejoin a run (e.g. after a crash): continue its file and its seq.
        if (fs.existsSync(this.file)) {
            const text = fs.readFileSync(this.file, 'utf-8');
            for (const line of text.split('\n')) {
                try {
                    const seq = JSON.parse(line).seq;
                    if (typeof seq === 'number' && seq > this.seq) this.seq = seq;
                } catch {
                    // A broken last line (crash mid-write) stays in the file; merge reports it.
                }
            }
            this.fd = fs.openSync(this.file, 'a');
            if (text.length > 0 && !text.endsWith('\n')) fs.writeSync(this.fd, '\n');
        } else {
            this.fd = fs.openSync(this.file, 'a');
        }
    }

    /** Where `tick` comes from (the bot's state). Set by instrument(). */
    setTickSource(fn: () => number | null) {
        this.tickSource = fn;
    }

    event(type: string, data: Record<string, unknown> = {}): LogEvent {
        if (this.failed) throw this.failed;
        let tick: number | null = null;
        try {
            tick = this.tickSource();
        } catch {
            tick = null;
        }
        const ev: LogEvent = {
            seq: this.seq + 1,
            t: new Date().toISOString(),
            tick: typeof tick === 'number' ? tick : null,
            run: this.runId,
            agent: this.agent,
            type,
            data: (loggable(data, 6) ?? {}) as Record<string, unknown>,
        };
        try {
            fs.writeSync(this.fd, JSON.stringify(ev) + '\n');
            fs.fsyncSync(this.fd);
        } catch (e: any) {
            this.failed = new LogWriteError(`Cannot write ${type} event to ${this.file}: ${e?.message ?? e}`);
            throw this.failed;
        }
        this.seq = ev.seq;
        return ev;
    }

    /** A manual note, e.g. "Jacob restarted the server". Shown as an intervention. */
    note(text: string, data: Record<string, unknown> = {}): LogEvent {
        return this.event('note', { text, ...data });
    }

    /**
     * Save a long text (prompt, answer, memory version) to files/<agent>/ and
     * return its path relative to the run folder, for use in an event.
     */
    saveFile(name: string, content: string): string {
        if (!/^[\w.-]+$/.test(name)) throw new Error(`Bad file name "${name}"`);
        const rel = path.posix.join('files', this.agent, `${pad(this.seq + 1, 5)}_${name}`);
        const full = path.join(this.runDir, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        try {
            fs.writeFileSync(full, content, { flag: 'wx' }); // never overwrite
        } catch (e: any) {
            this.failed = new LogWriteError(`Cannot write ${full}: ${e?.message ?? e}`);
            throw this.failed;
        }
        return rel;
    }

    close() {
        try {
            fs.closeSync(this.fd);
        } catch {
            // already closed
        }
    }
}
