// First script for testbot1: skip the tutorial, walk to the trees near Lumbridge, chop one.
// Run from the rs-sdk folder:  bun bots/testbot1/first.ts
// Needs the engine, the gateway and testbot1's game client running.

import { runScript } from '../sdk/runner';

await runScript(async ({ bot, sdk }) => {
    // Helper: print where the bot is and what it carries
    const report = (label: string) => {
        const state = sdk.getState();
        const items = sdk.getInventory().map(i => `${i.name} x${i.count}`).join(', ') || '(empty)';
        console.log(`[${label}] position (${state?.player?.worldX}, ${state?.player?.worldZ}) | inventory: ${items}`);
    };

    report('start');

    // 1. Leave Tutorial Island (accepts the character design, talks through the guide).
    //    Only needed the first time, so check the position first.
    const { worldX: x, worldZ: z } = sdk.getState()!.player!;
    const onTutorialIsland = x >= 3050 && x <= 3160 && z >= 3050 && z <= 3140;
    if (onTutorialIsland) {
        const tutorial = await bot.skipTutorial();
        console.log(`skipTutorial: ${tutorial.success ? 'ok' : 'failed'} - ${tutorial.message}`);
        report('after tutorial');
    }

    // 2. Walk to the tree cluster west of Lumbridge castle
    const walk = await bot.walkTo(3195, 3220);
    console.log(`walkTo: ${walk.success ? 'ok' : 'failed'} - ${walk.message}`);
    report('at the trees');

    // 3. Chop the nearest normal tree (needs an axe in the inventory).
    //    Actions can fail, so check the result and try again, up to 3 times.
    for (let attempt = 1; attempt <= 3; attempt++) {
        const chop = await bot.chopTree();
        console.log(`chopTree (try ${attempt}): ${chop.success ? 'ok' : 'failed'} - ${chop.message}`);
        if (chop.success) break;
    }
    report('end');
}, {
    timeout: 120_000, // stop after 2 minutes no matter what
});
