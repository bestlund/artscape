// Version 3: chop until the backpack is full, drop the logs, repeat. Everything is logged
// into a run folder (runs/<run-id>/), one woodcutting activity per backpack.
// Run from the repo root:  bun artscape/chop-loop.ts testbot1 [--rounds=2] [--run=<run-id>]
// Needs the engine, the gateway and the bot's game client running.
// Then merge the run's logs:  bun artscape/logger/merge.ts

import { runLogged } from './logger/run-logged';

const TREES = { x: 3195, z: 3220 }; // tree cluster west of Lumbridge castle
const ROUNDS = Number(process.argv.find(a => a.startsWith('--rounds='))?.split('=')[1] ?? 2);
const BACKPACK_SLOTS = 28;

await runLogged(async ({ bot, sdk, activity }) => {
    // LOOK helpers
    const slotsUsed = () => sdk.getInventory().length;
    const isFull = () => slotsUsed() >= BACKPACK_SLOTS;
    const distanceToTrees = () => {
        const p = sdk.getState()!.player!;
        return Math.max(Math.abs(p.worldX - TREES.x), Math.abs(p.worldZ - TREES.z));
    };

    for (let round = 1; round <= ROUNDS; round++) {
        console.log(`\n=== Round ${round} of ${ROUNDS}: chop until the backpack is full (${slotsUsed()}/${BACKPACK_SLOTS} slots used)`);

        // 1. CHOP until full (one logged activity)
        const end = await activity('woodcutting', { area: 'lumbridge_trees', settings: { round, until: 'backpack_full' } }, async () => {
            let failuresInARow = 0;
            while (!isFull()) {
                // Trees get cut down, so the bot drifts to the next one. Walk back if it wandered off.
                if (distanceToTrees() > 12) {
                    console.log('  wandered too far, walking back to the trees');
                    await bot.walkTo(TREES.x, TREES.z);
                }

                const chop = await bot.chopTree();
                if (chop.success) {
                    failuresInARow = 0;
                    console.log(`  got logs (${slotsUsed()}/${BACKPACK_SLOTS} slots used)`);
                } else {
                    failuresInARow++;
                    console.log(`  chop failed (${failuresInARow} in a row): ${chop.message}`);
                    if (failuresInARow >= 5) return { reason: 'failure_streak' };
                }
            }
            return { reason: 'backpack_full' };
        });
        if (end.reason !== 'backpack_full') {
            console.log('  5 failures in a row, something is wrong. Stopping.');
            return;
        }

        // 2. DROP all logs (logged automatically as an action)
        const drop = await bot.dropItem(/logs/i, 'all');
        console.log(`  backpack full: dropped ${drop.slotsDropped} logs (${drop.success ? 'ok' : 'failed'})`);
    }

    console.log(`\nDone: ${ROUNDS} rounds. Woodcutting level ${sdk.getSkill('Woodcutting')?.baseLevel}.`);
}, {
    timeout: 6 * 60_000, // safety stop after 6 minutes
    note: 'chop-loop',
});
