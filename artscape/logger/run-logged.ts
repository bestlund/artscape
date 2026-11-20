// runLogged: like rs-sdk's runScript, but everything the bot does is logged
// into a run folder. Use it for every ArtScape script that acts in the game.
//
//   bun artscape/chop-loop.ts testbot1                 -> new dev run
//   bun artscape/chop-loop.ts testbot1 --run=<run-id>  -> join an existing run
//   bun artscape/chop-loop.ts testbot1 --condition=memory-on
//
// Each agent's events go to runs/<run-id>/agents/<bot>.jsonl. Merge all agents
// into one timeline with: bun artscape/logger/merge.ts [run-id]

import path from 'path';
import { runScript, type RunOptions, type ScriptContext } from '../../sdk/runner';
import { AgentLog, AREAS_FILE, createRun, openRun, type RunInfo } from './log';
import { loadAreas, type Area } from './areas';
import { diffCounts, instrument, inventoryCounts, skillXp } from './instrument';

export interface ActivityInfo {
    /** Named area where the routine runs. */
    area?: string;
    /** Settings of the routine (amounts, targets). */
    settings?: Record<string, unknown>;
}

export interface ActivityEnd {
    /** Why it stopped, e.g. 'backpack_full', 'done', 'failure_streak'. */
    reason: string;
    /** Anything else worth keeping. */
    [key: string]: unknown;
}

export interface LoggedContext extends ScriptContext {
    log: AgentLog;
    run: RunInfo;
    areas: Area[];
    /**
     * Run a routine as one activity: logs activity.start, then activity.end with
     * duration, items gained/lost, XP gained and the reason it stopped.
     */
    activity(routine: string, info: ActivityInfo, fn: () => Promise<ActivityEnd>): Promise<ActivityEnd>;
}

export interface LoggedRunOptions extends RunOptions {
    /** Condition for a new run (default 'dev', or --condition=...). */
    condition?: string;
    /** Note stored in run.json of a new run. */
    note?: string;
    /** Snapshot interval in ms (default 10 s). */
    snapshotMs?: number;
}

function argValue(name: string): string | undefined {
    const hit = process.argv.slice(2).find(a => a.startsWith(`--${name}=`));
    return hit?.slice(name.length + 3);
}

export async function runLogged(script: (ctx: LoggedContext) => Promise<any>, options: LoggedRunOptions = {}) {
    const scriptName = path.basename(process.argv[1] ?? 'unknown');
    let log: AgentLog | null = null;
    let stopInstrument: (() => void) | null = null;
    let finalSnapshot: (() => void) | null = null;
    let ended = false;
    let startedAt = 0;

    const endRun = (reason: string, extra: Record<string, unknown> = {}) => {
        if (!log || ended) return;
        ended = true;
        try {
            finalSnapshot?.();
        } catch {
            // no state at the very end is fine
        }
        stopInstrument?.();
        try {
            log.event('run.end', { reason, seconds: Math.round((Date.now() - startedAt) / 1000), ...extra });
        } catch (e: any) {
            console.error(`[logger] could not write run.end: ${e?.message ?? e}`);
        }
        log.close();
    };

    // Ctrl+C or a kill: rs-sdk's runner exits the process, so write run.end on the way out.
    const onExit = (code: number) => endRun('stopped', { how: 'process exit', exitCode: code });
    process.on('exit', onExit);

    const result = await runScript(async ({ bot, sdk }) => {
        const agent = process.env.BOT_USERNAME!.toLowerCase();
        const joinId = argValue('run');
        const run = joinId
            ? openRun(joinId)
            : createRun({ condition: argValue('condition') ?? options.condition ?? 'dev', agents: [agent], note: options.note });
        const areas = loadAreas(joinId ? path.join(run.dir, 'files', 'config', 'areas.json') : AREAS_FILE);

        log = new AgentLog(run, agent);
        startedAt = Date.now();
        console.log(`[logger] run ${run.id}, agent ${agent} -> ${path.relative(process.cwd(), log.file)}`);
        const agentLog = log;

        agentLog.event('run.start', {
            script: scriptName,
            args: process.argv.slice(2),
            pid: process.pid,
            joined: Boolean(joinId),
            condition: run.setup.condition,
        });

        const inst = instrument(bot, sdk, agentLog, { areas, snapshotMs: options.snapshotMs });
        stopInstrument = inst.stop;
        finalSnapshot = inst.snapshot;

        const activity = async (routine: string, info: ActivityInfo, fn: () => Promise<ActivityEnd>) => {
            const before = sdk.getState();
            const inv0 = inventoryCounts(before);
            const xp0 = skillXp(before);
            const t0 = Date.now();
            const area = info.area ?? inst.currentArea();
            agentLog.event('activity.start', { routine, area, settings: info.settings ?? {} });
            const finish = (end: Record<string, unknown>) => {
                const after = sdk.getState();
                agentLog.event('activity.end', {
                    routine,
                    area,
                    seconds: Math.round((Date.now() - t0) / 1000),
                    items: diffCounts(inv0, inventoryCounts(after)),
                    xp: diffCounts(xp0, skillXp(after)),
                    ...end,
                });
            };
            try {
                const end = await fn();
                finish(end);
                return end;
            } catch (e: any) {
                finish({ reason: 'error', error: { name: e?.name ?? 'Error', message: e?.message ?? String(e) } });
                throw e;
            }
        };

        try {
            return await script({ bot: inst.bot, sdk, log: agentLog, run, areas, activity });
        } finally {
            // Stop listening before rs-sdk's runner logs the bot out on purpose,
            // so that planned disconnect isn't logged as a connection problem.
            inst.stop();
        }
    }, options);

    if (result.error) {
        const e = result.error;
        const timedOut = /timed? ?out/i.test(e.message);
        endRun(timedOut ? 'stopped' : 'crashed', { error: { name: e.name, message: e.message }, how: timedOut ? 'timeout' : 'error' });
    } else {
        endRun('finished');
    }
    process.off('exit', onExit);
    return result;
}
