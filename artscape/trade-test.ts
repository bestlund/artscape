// One-sided trade smoke test: one bot gives an item and gets nothing back.
// Proves the two-step deal (goods now, payment later as a separate trade) works in this engine.
//
// Run both sides at the same time, each in its own process (one controller per bot):
//   bun artscape/trade-test.ts smith --receive-from=minera
//   bun artscape/trade-test.ts minera --give-to=smith --item=shrimps
//
// Each side prints what it saw: every change of the trade screen, new game messages,
// its inventory before and after, and the trade result.

import { runScript } from '../sdk/runner';

const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1];
const giveTo = arg('give-to');
const receiveFrom = arg('receive-from');
const item = arg('item');

if (!giveTo && !receiveFrom) throw new Error('Use --give-to=<bot> --item=<name>, or --receive-from=<bot>');
if (giveTo && !item) throw new Error('--give-to needs --item=<name>');

await runScript(async ({ bot, sdk }) => {
    const me = sdk.getState()?.player?.name ?? '?';
    const t0 = Date.now();
    const stamp = () => `+${((Date.now() - t0) / 1000).toFixed(1)}s`;
    const inv = () => sdk.getInventory().map(i => `${i.name} x${i.count}`).join(', ') || '(empty)';
    const offer = (items: { name: string; count: number }[]) => items.map(i => `${i.name} x${i.count}`).join(', ') || 'nothing';

    console.log(`[${me}] inventory before: ${inv()}`);

    // Watch the trade screen and game messages while the trade runs.
    let lastScreen = '';
    let msgCursor = 0;
    for (const m of sdk.getState()?.gameMessages ?? []) msgCursor = Math.max(msgCursor, m.observationId ?? m.tick);
    const watcher = setInterval(() => {
        const s = sdk.getState();
        const t = s?.trade;
        const screen = t?.isOpen
            ? `screen=${t.screen} partner=${t.partner} | mine: ${offer(t.myOffer)} | theirs: ${offer(t.theirOffer)} | I accepted=${t.myAccepted} they accepted=${t.partnerAccepted}`
            : 'closed';
        if (screen !== lastScreen) {
            console.log(`  ${stamp()} trade ${screen}`);
            lastScreen = screen;
        }
        for (const m of s?.gameMessages ?? []) {
            const c = m.observationId ?? m.tick;
            if (c > msgCursor) {
                console.log(`  ${stamp()} game message: "${m.text}"`);
                msgCursor = c;
            }
        }
    }, 300);

    let result;
    if (giveTo) {
        console.log(`[${me}] giving 1 ${item} to ${giveTo}, asking nothing back`);
        result = await bot.trade(giveTo, { give: [{ item: item!, amount: 1 }], want: [] });
    } else {
        console.log(`[${me}] waiting for one trade from ${receiveFrom}, giving nothing`);
        const served = await bot.serveTrades({ from: new RegExp(`^${receiveFrom}$`, 'i'), maxTrades: 1, timeout: 90_000 });
        result = served.trades.at(-1) ?? served;
    }

    await new Promise(r => setTimeout(r, 1500)); // let the last messages arrive
    clearInterval(watcher);

    console.log(`[${me}] result: success=${result.success} - ${result.message}`);
    if ('gave' in result) console.log(`[${me}] gave: ${offer(result.gave)} | received: ${offer(result.received)}`);
    console.log(`[${me}] inventory after: ${inv()}`);
}, {
    timeout: 120_000,
});
