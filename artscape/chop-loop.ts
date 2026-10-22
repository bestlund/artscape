// Version 2 for testbot1: chop until the backpack is full, drop the logs, repeat.
// Run from the rs-sdk folder:  bun bots/testbot1/chop-loop.ts
// Needs the engine, the gateway and testbot1's game client running.

import { runScript } from '../sdk/runner';

const TREES = { x: 3195, z: 3220 }; // tree cluster west of Lumbridge castle
const ROUNDS = 2;                   // how many full backpacks before the script stops
const BACKPACK_SLOTS = 28;

await runScript(async ({ bot, sdk }) => {
    // LOOK helpers
    const slotsUsed = () => sdk.getInventory().length;
    const isFull = () => slotsUsed() >= BACKPACK_SLOTS;
    const distanceToTrees = () => {
        const p = sdk.getState()!.player!;
        return Math.max(Math.abs(p.worldX - TREES.x), Math.abs(p.worldZ - TREES.z));
    };

    for (let round = 1; round <= ROUNDS; round++) {
        console.log(`\n=== Round ${round} of ${ROUNDS}: chop until the backpack is full (${slotsUsed()}/${BACKPACK_SLOTS} slots used)`);

        // 1. CHOP until full
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
                if (failuresInARow >= 5) {
                    console.log('  5 failures in a row, something is wrong. Stopping.');
                    return;
                }
            }
        }

        // 2. DROP all logs
        const drop = await bot.dropItem(/logs/i, 'all');
        console.log(`  backpack full: dropped ${drop.slotsDropped} logs (${drop.success ? 'ok' : 'failed'})`);
    }

    console.log(`\nDone: ${ROUNDS} rounds. Woodcutting level ${sdk.getSkill('Woodcutting')?.baseLevel}.`);
}, {
    timeout: 6 * 60_000, // safety stop after 6 minutes
});
