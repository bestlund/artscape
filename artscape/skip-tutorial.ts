// Get a fresh bot off Tutorial Island and print where it ends up.
// Run from the repo root:  bun artscape/skip-tutorial.ts minera   (any bot name works)
// Needs the engine, the gateway and the bot's game client running.
// Safe to run twice: it does nothing if the bot is already off the island.

import { runScript } from '../sdk/runner';

await runScript(async ({ bot, sdk }) => {
    const report = (label: string) => {
        const state = sdk.getState();
        const items = sdk.getInventory().map(i => `${i.name} x${i.count}`).join(', ') || '(empty)';
        console.log(`[${label}] position (${state?.player?.worldX}, ${state?.player?.worldZ}) | inventory: ${items}`);
    };

    report('start');

    const { worldX: x, worldZ: z } = sdk.getState()!.player!;
    const onTutorialIsland = x >= 3050 && x <= 3160 && z >= 3050 && z <= 3140;
    if (!onTutorialIsland) {
        console.log('Not on Tutorial Island, nothing to do.');
        return;
    }

    const tutorial = await bot.skipTutorial();
    console.log(`skipTutorial: ${tutorial.success ? 'ok' : 'failed'} - ${tutorial.message}`);
    report('after tutorial');

    // Lumbridge spawn is around (3222, 3222).
    const p = sdk.getState()!.player!;
    const inLumbridge = Math.abs(p.worldX - 3222) <= 15 && Math.abs(p.worldZ - 3222) <= 15;
    console.log(inLumbridge ? 'In Lumbridge.' : 'NOT in Lumbridge - check the position above.');
}, {
    timeout: 60_000,
});
