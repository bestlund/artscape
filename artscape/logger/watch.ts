// Log a bot without making it do anything: snapshots, location and connection
// problems only. Useful to put a second agent into a run, or to watch an idle bot.
//   bun artscape/logger/watch.ts <bot> [--run=<run-id>] [--seconds=60]

import { runLogged } from './run-logged';

const SECONDS = Number(process.argv.find(a => a.startsWith('--seconds='))?.split('=')[1] ?? 60);

await runLogged(async ({ log }) => {
    log.note(`watch only for ${SECONDS} s, no actions`);
    await new Promise(r => setTimeout(r, SECONDS * 1000));
}, {
    timeout: (SECONDS + 30) * 1000,
    printState: false,
    note: 'watch',
});
