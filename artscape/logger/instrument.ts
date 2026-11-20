// Automatic logging around a bot: every bot.* call becomes an `action` event,
// a `snapshot` every 10 s, a `location` event when the bot enters or leaves a
// named area, and `problem` events for failure streaks and disconnects.
// Routine code doesn't call the logger for any of this (DESIGN.md principle 2).

import type { AgentLog } from './log';
import { areaAt, type Area } from './areas';

/** The parts of the SDK the logger reads. BotSDK has all of these. */
export interface StateSource {
    getState(): any;
    getStateAge?(): number;
    onConnectionStateChange?(listener: (state: string, attempt?: number) => void): () => void;
}

export interface InstrumentOptions {
    areas?: Area[];
    /** Snapshot interval (default 10 s, decided 2026-10-22). */
    snapshotMs?: number;
    /** How often the position is checked for location events (default 1 s). */
    locationMs?: number;
    /** Failed actions in a row before a `problem` event (default 5). */
    failureStreak?: number;
}

export interface Instrumented<B> {
    /** The wrapped bot. Use this one in routines. */
    bot: B;
    /** Name of the named area the bot is in now, or null. */
    currentArea(): string | null;
    /** Write one snapshot now (e.g. at the end of a run). */
    snapshot(): void;
    /** Stop timers and listeners. */
    stop(): void;
}

/** Query helpers on BotActions that don't act in the game; not logged. */
const NOT_ACTIONS = new Set(['constructor', 'getEquipment', 'findEquippedItem']);

export function inventoryCounts(state: any): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const item of state?.inventory ?? []) {
        counts[item.name] = (counts[item.name] ?? 0) + (item.count ?? 1);
    }
    return counts;
}

export function skillXp(state: any): Record<string, number> {
    const xp: Record<string, number> = {};
    for (const s of state?.skills ?? []) {
        if (s.experience > 0) xp[s.name] = s.experience;
    }
    return xp;
}

/** after - before, keeping only the keys that changed. */
export function diffCounts(before: Record<string, number>, after: Record<string, number>): Record<string, number> {
    const out: Record<string, number> = {};
    for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
        const d = (after[k] ?? 0) - (before[k] ?? 0);
        if (d !== 0) out[k] = d;
    }
    return out;
}

export function instrument<B extends object>(bot: B, sdk: StateSource, log: AgentLog, opts: InstrumentOptions = {}): Instrumented<B> {
    const areas = opts.areas ?? [];
    const snapshotMs = opts.snapshotMs ?? 10_000;
    const locationMs = opts.locationMs ?? 1_000;
    const streakLimit = opts.failureStreak ?? 5;

    log.setTickSource(() => sdk.getState()?.tick ?? null);

    // A failed write inside a timer can't be thrown to the routine, so the
    // process stops here (decided 2026-10-22: no run without complete data).
    const fatal = (e: unknown) => {
        console.error(`[logger] ${e instanceof Error ? e.message : e}`);
        console.error('[logger] A log line could not be written. Stopping the run.');
        process.exit(3);
    };
    const safely = (fn: () => void) => () => {
        try {
            fn();
        } catch (e) {
            fatal(e);
        }
    };

    // ---- location ----
    let area: string | null | undefined = undefined; // undefined = not known yet
    let noState = false;
    const checkLocation = () => {
        const p = sdk.getState()?.player;
        if (!p) return;
        const now = areaAt(areas, p.worldX, p.worldZ, p.level ?? 0)?.name ?? null;
        if (now !== area) {
            log.event('location', { from: area ?? null, to: now, x: p.worldX, z: p.worldZ, level: p.level ?? 0 });
            area = now;
        }
    };

    // ---- snapshot ----
    const snapshot = () => {
        const state = sdk.getState();
        const p = state?.player;
        if (!p) {
            if (!noState) log.event('problem', { kind: 'no_state', message: 'No game state from the client' });
            noState = true;
            return;
        }
        if (noState) log.event('problem', { kind: 'no_state', resolved: true, message: 'Game state is back' });
        noState = false;
        checkLocation();
        const nearby = (state.nearbyPlayers ?? []).map((o: any) => ({
            name: o.name,
            x: o.x,
            z: o.z,
            distance: Math.max(Math.abs(o.x - p.worldX), Math.abs(o.z - p.worldZ)),
        }));
        log.event('snapshot', {
            x: p.worldX,
            z: p.worldZ,
            level: p.level ?? 0,
            area: area ?? null,
            hp: p.hp,
            maxHp: p.maxHp,
            slotsUsed: (state.inventory ?? []).length,
            inventory: inventoryCounts(state),
            xp: skillXp(state),
            nearbyPlayers: nearby,
            stateAgeMs: sdk.getStateAge?.() ?? null,
        });
    };

    // ---- actions ----
    let streak = 0;
    const logAction = (name: string, args: unknown[], startedAt: number, tick0: number | null, outcome: { result?: any; error?: unknown }) => {
        const ms = Math.round(performance.now() - startedAt);
        const r = outcome.result;
        let success: boolean;
        const data: Record<string, unknown> = { name, args, ms, tickStart: tick0 };
        if (outcome.error !== undefined) {
            success = false;
            const e = outcome.error as any;
            data.error = { name: e?.name ?? 'Error', message: e?.message ?? String(e) };
        } else {
            success = r && typeof r === 'object' && typeof r.success === 'boolean' ? r.success : true;
            if (r && typeof r === 'object') {
                if (typeof r.message === 'string') data.message = r.message;
                const { success: _s, message: _m, ...rest } = r;
                if (Object.keys(rest).length) data.result = rest;
            } else if (r !== undefined) {
                data.result = r;
            }
        }
        data.success = success;
        log.event('action', data);

        streak = success ? 0 : streak + 1;
        if (streak === streakLimit) {
            log.event('problem', { kind: 'failure_streak', count: streak, lastAction: name, message: data.message ?? (data.error as any)?.message ?? null });
        }
    };

    const cache = new Map<string, Function>();
    const proxy = new Proxy(bot, {
        get(target, prop) {
            const value = Reflect.get(target, prop, target);
            if (typeof value !== 'function' || typeof prop !== 'string' || NOT_ACTIONS.has(prop) || prop.startsWith('_')) {
                return typeof value === 'function' ? value.bind(target) : value;
            }
            let wrapped = cache.get(prop);
            if (!wrapped) {
                wrapped = function (...args: unknown[]) {
                    if (log.failed) throw log.failed; // the run has already lost data: stop
                    const startedAt = performance.now();
                    const tick0 = sdk.getState()?.tick ?? null;
                    let out: any;
                    try {
                        out = value.apply(target, args); // `this` = the real bot, so inner calls aren't logged twice
                    } catch (error) {
                        logAction(prop, args, startedAt, tick0, { error });
                        throw error;
                    }
                    if (out && typeof out.then === 'function') {
                        return out.then(
                            (result: any) => {
                                logAction(prop, args, startedAt, tick0, { result });
                                return result;
                            },
                            (error: unknown) => {
                                logAction(prop, args, startedAt, tick0, { error });
                                throw error;
                            }
                        );
                    }
                    logAction(prop, args, startedAt, tick0, { result: out });
                    return out;
                };
                cache.set(prop, wrapped);
            }
            return wrapped;
        },
    });

    // ---- connection ----
    let lastConn = 'connected';
    const unsubscribe = sdk.onConnectionStateChange?.(
        (state, attempt) => {
            try {
                if (state === lastConn) return;
                if (state === 'connected') log.event('problem', { kind: 'connection', state, resolved: true, message: 'Connected again' });
                else log.event('problem', { kind: 'connection', state, attempt: attempt ?? null, message: `Connection ${state}` });
                lastConn = state;
            } catch (e) {
                fatal(e);
            }
        }
    );

    // ---- timers ----
    safely(snapshot)(); // first snapshot right away (also writes the first location event)
    const snapTimer = setInterval(safely(snapshot), snapshotMs);
    const locTimer = setInterval(safely(checkLocation), locationMs);

    return {
        bot: proxy as B,
        currentArea: () => area ?? null,
        snapshot: () => snapshot(),
        stop: () => {
            clearInterval(snapTimer);
            clearInterval(locTimer);
            unsubscribe?.();
        },
    };
}
