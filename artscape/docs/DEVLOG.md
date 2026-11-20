# ArtScape dev log

Decisions, problems and fixes, newest last. This becomes the method section of the paper.

## 2026-10-21: Local stack running, first bot logged in

**Goal:** engine, gateway and one local bot logged in on this machine (Windows 11).

**Setup**

- rs-sdk at commit `b565f2d92`.
- Installed Bun 1.4.3 with winget (`Oven-sh.Bun`). Node 24.13.1 was already installed; the engine needs Node 24+.
- Ran `bun install` in the repo root, `server/engine`, `server/webclient` and `server/gateway`.
- Built the web client once with `bun run build:dev` in `server/webclient`. The bot client needs this build, and `watch` is only needed when editing the client.
- Test bot `testbot1`: `bun bots/create-bot.ts testbot1 --local --no-chat`, then logged in with the headless lite client (`cd server/webclient && bun src/lite/runner.ts testbot1`) instead of a browser tab.

**Problems and fixes**

1. **Engine stops on first start with `.loc checksum mismatch!`.** The packer compares the packed configs against checksums from the original 2004 game. rs-sdk ships custom content, so they never match. Upstream builds with `BUILD_VERIFY=false` (`server/Dockerfile`, CI); only the README quick start leaves it out. Fix: `server/engine/.env` with `BUILD_VERIFY=false`. The first cache pack takes about 4 minutes.
2. **`create-bot.ts --local` writes an incomplete `bot.env` on Windows.** Git checks out the template with CRLF line endings, and the script looks for `SERVER=localhost\n`, so it silently skips adding the port and the gateway. Fix: edit `bot.env` by hand to `SERVER=localhost:8888` and `GATEWAY_URL=ws://localhost:7780`. Needed for every new bot until it is fixed in code.
3. **`TELEMETRY=true` by default** in the bot template. It controls SDK bug reports, which are always sent to the shared demo server. Set to `false` in every `bot.env` (project rule).

**Verified:** `bun sdk/cli.ts testbot1` returns live state (tick, position, skills). The bot is on Tutorial Island at the character design screen.

**Running processes:** engine (`localhost:8888`), gateway (`ws://localhost:7780`), lite client for `testbot1`.

**Watching as a human player**

- Game client: `http://localhost:8888/rs2.cgi`. A local world accepts any username and password and creates the account on first login.
- Live world map with every logged-in player: `http://localhost:8888/mapview`. It polls `/playerpositions`, which is also usable as JSON for logging.
- Limitation: rs-sdk hard-codes `staffmodlevel = 0` when no login server is running (`server/engine/src/server/login/LoginThread.ts`), so in-game `::speed` and `::tele` don't work. Change the speed with `NODE_TICKRATE` in `server/engine/.env` instead.

**Engine patch: local staff rights (first ArtScape change to rs-sdk code)**

- Added `LOCAL_STAFF_USERS` (comma-separated usernames) in `server/engine/src/util/Environment.ts`. `LoginThread.ts` gives these users staff level 4 instead of 0, and only on worlds without a login server.
- `server/engine/.env` sets `LOCAL_STAFF_USERS=jacob`. This is the observer/admin account and never one of the agents.
- Useful commands: `::~maxme`, `::give <item>`, `::tele level,mx,mz,lx,lz` (for example `::tele 0,50,50,22,18` for Lumbridge), and `::speed <ms>`. `::teleto <name>` is disabled on non-production worlds.
- Experiment note: the admin account must not interact with agents during runs. If it is used to set up the world, log that in the run's data.

**Bug fix: XP overflow in `Player.addXp`**

- Symptom: `::~maxme` set every stat to level 1 with negative XP.
- Cause: rs-sdk runs XP at 25× (`xpRate: 25` in `WorldConfig.ts`, overridable with `NODE_XPRATE`). maxme adds 130,344,310 × 25 ≈ 3.26 billion. Stats are an `Int32Array`, so the value wrapped to -1,036,359,546 before the 200M cap was checked.
- Fix: in `server/engine/src/engine/entity/Player.ts`, cap with `Math.min(...)` before writing to the array. Checked in Bun: the old code gives -1,036,359,546 and the new code gives 2,000,000,000 (200M XP, level 99).
- Decision (Jacob): **keep rs-sdk's 25× XP rate.** It is part of the world setup, the same in both conditions.

**First script: `bots/testbot1/first.ts`**

- Skips the tutorial (only on Tutorial Island), walks to the Lumbridge trees, chops a tree (up to 3 tries) and prints position and inventory at each step.
- First run: skipping the tutorial and walking worked, but `chopTree` timed out after 30 s with no logs. The cause is unknown; the attempt came right after the walk. A diagnostic rerun chopped fine. The final version retries and worked on the first try.
- Lesson for agents: `bot.*` actions return `{ success, message }` and can fail for no visible reason, so scripts must check results. A failed action is a natural trigger for a model call.
- Running the same script in two terminals at once: the second one took control and the first got `Pre-empted by another controller`. **One controller per bot**, so each agent needs its own bot and its own script.

**In-game command menu (`::commands`)**

- New content script `server/content/scripts/artscape/scripts/artscape_commands.rs2` with a 5-category menu (character, items, travel, world speed, how to use). It lists only commands that work on this local world. The engine reloads content files while running, so `::~commands` worked without a restart.
- Engine change in `ClientCheatHandler.ts`: **every content command (debugproc) also works without the `~`**, so `::maxme` works like `::~maxme`. Engine commands keep their names. `random` is the only name that is both, and the engine version wins there (`::~random` still runs the content one). Only staff accounts get this. Needs an engine restart.

**Restarting from inside the game (`::reboot`)**

- `::reboot` was production-only, and on its own it only *stops* the engine, after logging out (and so saving) every player. It is now allowed on the local world (`ClientCheatHandler.ts`).
- The engine and each bot client now run in restart loops: the engine restarts 3 s after it exits, and `testbot1`'s client retries every 5 s. Engine code changes take effect with `::reboot`; content changes reload by themselves.
- The loops currently run as background tasks in the Claude session. Once Jacob runs the stack himself, this needs a start script that does the same.

**Version 2: `bots/testbot1/chop-loop.ts`**

- Chop until the backpack is full, drop the logs, repeat (2 rounds). It walks back when it drifts more than 12 tiles from the trees, and stops after 5 failed chops in a row.
- Two runs of about 2 minutes each: 17 and 20 logs, 0 failed chops, Woodcutting 36 → 46.

**Design decisions (end of session)**

- **Decide step = shared routine toolbox.** The model picks a tested routine (woodcutting, fishing, banking, delivering …) with settings instead of writing code. Every agent has the same toolbox, so memory stays the only difference between conditions. Future plan: let the model write code when no routine fits, but only after testing it a few times.
- **Logging = typed logs combined into one** (Jacob's idea): activity log, location log (named areas and spots), trades, chat, model calls and snapshots, combined into one timeline per run.
- Ideas for later: an ArtScape "control room" (map with agent portraits, per-agent logs, commands, POV) and a visual layer showing each agent's active routine. Full notes: `sessions/2026-10-21.md`.

**Open issue: unexplained content reloads**

- The engine log shows "Packing changes / Reloading with changes" at 23:37:31, 23:37:37 and 23:42:13 with no edits from us. Likely OneDrive syncing the content folder. A reload during an experiment run would be a confound, so investigate before running experiments, possibly by moving the project out of OneDrive.


## 2026-10-22: rs-sdk version pinned

- **Decision (Jacob): don't update rs-sdk, and keep our changes local.** No pull, no commit, no push for now.
- Version used: rs-sdk commit `b565f2d92` (19 Oct 2026). Checked on 22 Oct that it is identical to the latest version on GitHub.
- Why: upstream changes fast (50 commits in 3 weeks, including a game revision upgrade from 274 to 289 on 9 Oct). Updating between experiment runs would change the world and make runs incomparable. Report this version in the paper.
- Our changes to rs-sdk stay uncommitted in the working copy (list in `sessions/2026-10-21.md`). VS Code's "commit changes?" prompt can be ignored. **Never press Pull or Sync** in VS Code's Source Control.
- The two bugs we found are not fixed upstream either: the XP overflow in `Player.addXp`, and `create-bot.ts` with CRLF line endings. Reporting them to Max on GitHub is Jacob's choice.

## 2026-10-22: Platform decision: stay on rs-sdk

- **Decision (Jacob): keep rs-sdk / LostCity (revision 289).** Reason for asking: the 2004 graphics look old, and a newer source would be more presentable.
- Options considered:
  - **Minecraft + Mineflayer:** presentable, with an ecosystem that matches our ideas (live map with player heads, first-person bot view, skill libraries, non-atomic trades). But less reliable for bots, much more prior research, and it gives up the RuneScape identity. Jacob wants to stay with RuneScape.
  - **Another RuneScape source with rs-sdk on top:** not possible as-is. rs-sdk's bot layer lives inside its own LostCity client (`server/webclient/src/bot`: 19 files, ~6,400 lines), the headless lite client is a rebuild of that client (~5,900 lines), and the SDK (~12,400 lines) depends on this game's interface IDs, map collision data and content. Porting would take weeks. Even Max's own upgrade from 274 to 289 (same engine family) needed same-day follow-up fixes. Many newer-looking private servers also use Jagex's OSRS files; LostCity is a from-scratch preservation project, which is a cleaner basis for a paper.
- Direction instead: put presentability in **our own presentation layer** on top of rs-sdk: the control room (map with agent portraits, logs, chat), overhead text or icons for routines, a custom view built on the `/worldfeed` spectator feed, and edited clips. Framing: "a 2004 game world, inhabited by 2026 AI agents".

## 2026-10-22: Background processes survive the Claude session

- The gateway, engine loop and `testbot1` loop started on 21 Oct kept running after that Claude session ended. (The session log said they would stop; that was wrong.)
- Starting a second copy caused problems. The second gateway quit (port in use). The second engine loop failed and was stopped. The second `testbot1` client **took over** the running bot's session ("pending takeover"), and the old loop then took it back. Fixed by stopping the duplicates; one copy of each is running again.
- The engine loop restarted the engine at 13:59:18 on 22 Oct for an unknown reason. The duplicate engine loop had **truncated the engine log** at start (`: > engine.log`), so the cause is lost.
- Lessons: (1) check for running processes before starting the stack (`Get-Process bun`, or `curl localhost:8888/playerpositions`); (2) **logs are append-only and never truncated**, which is a requirement for the research logger.

## 2026-10-22: Logger design agreed, project moving out of OneDrive

- Logger design agreed before building: `agents/logger/DESIGN.md`. Jacob's decisions:
  - **Folders:** our code in `ArtScape/agents/` (logger, routines), run data in `ArtScape/runs/`; `rs-sdk/` stays as untouched as possible. (This answers the open question about the project folder layout.)
  - **If a log line can't be written: stop the run.** No run without complete data.
  - **Snapshots every 10 s** per agent.
  - **Move the whole project out of OneDrive.** OneDrive can lock files while syncing (log write errors) and probably caused the unexplained server reloads.
- Move plan: stop the stack cleanly (`::reboot` with the restart loops disarmed so everything is saved), **copy** (not move) the folder to the new location, verify, copy Claude's memory to the new project path, reopen VS Code there, and only then remove the OneDrive copy.

## 2026-10-29: Stack restarted; scripts live in `rs-sdk/artscape/`

- Nothing was running at the start of the session (the machine had restarted). Started the engine loop, gateway and `testbot1`'s client loop again; world ready at 16:15:59, `testbot1` logged in at 16:17:57 (Woodcutting 51).
- `first.ts` and `chop-loop.ts` were moved from `bots/testbot1/` to `rs-sdk/artscape/` on 22 Oct. With no `bot.env` beside them they take the bot name as an argument: `bun artscape/chop-loop.ts testbot1`. Fixed the outdated "run with" lines at the top of both files.
- The project is still in OneDrive; the move planned on 22 Oct has not happened yet.

## 2026-11-19: Moved out of OneDrive to `C:\dev\ArtScape`; docs now in the repo

- **New location:** `C:\dev\ArtScape` is a fresh `git clone` of the fork (branch `artscape`), so the repo is the folder root. What older notes call `rs-sdk/` is now the root, and `rs-sdk/artscape/` is `artscape/`. Git state matches the old copy exactly: HEAD `a533d3146`, up to date with `origin/artscape`, same remotes.
- **Docs moved into the repo** under `artscape/docs/` so they are versioned and on GitHub: `CLAUDE.md`, `DEVLOG.md` (this file), `SPRINT-1.md`, `sessions/`, and `logger/DESIGN.md` (was `agents/logger/DESIGN.md`). The repo root `CLAUDE.md` (rs-sdk's bot guide) now imports `@artscape/docs/CLAUDE.md` on its first lines. Older entries in this log keep their old paths, since logs are append-only.
- **Sprint 1 paused** (Jacob). The plan until 23 Nov is the vertical slice in `sessions/2026-11-19.md`.
- **The fork is public.** Checked the docs for secrets before committing; none found. An untracked `API_KEYS.env` at the root wasn't covered by `.gitignore` (the `.env` rule only matches files named exactly `.env`). Added `API_KEYS.env` and `*.env.local` to `.gitignore`.
- **A fresh clone has none of the gitignored state:** `bots/*/bot.env`, `server/engine/.env`, the saves (`server/engine/db.sqlite*`, `data/players/`), `data/config/world.json`, packed content, the web client build and `node_modules`. `bun install` was run in the root, `server/engine`, `server/webclient` and `server/gateway`. The rest has to be copied from the OneDrive copy **with the engine stopped**, so the saves are complete.
- **Claude's memory:** the project memory sat under the oldest path (`OneDrive\Desktop\ArtScape`); the `Documents\GitHub` move had left it behind. Copied to the folder for `C:\dev\ArtScape`.
- **Open:** the old stack (engine loop, gateway, `testbot1` client) is still running from the OneDrive copy and holds ports 8888 and 7780. It has to be stopped cleanly before the new stack can start and before the saves can be copied. Then: verify `testbot1` logs in from the new folder, run `chop-loop.ts` once, check `engine.log` for content reloads, and only then remove the OneDrive copy.

## 2026-11-19: Fresh stack, three agent bots, trade smoke test

- **Fresh start (Jacob's decision):** nothing copied from the OneDrive copy. New `server/engine/.env` from `.env.example` plus **`GE_ENABLED=false` (Grand Exchange off)**; the setting already exists in `Environment.ts`, so no code change. Cold start packs the cache in about 3.5 min.
- **Bots:** `testbot1` (test only) and the three agents from `agents.md`: `minera`, `minerb`, `smith`. The `create-bot.ts` CRLF bug is still there (`SERVER=localhost`, no `GATEWAY_URL`, `TELEMETRY=true`); every `bot.env` was fixed by hand. New helper `artscape/skip-tutorial.ts <bot>`: all three land in Lumbridge (3222, 3222) with the starter kit and **no coins**.
- **Trade smoke test (`artscape/trade-test.ts`):** a one-sided trade in each direction completed (`minera` → `smith`: 1 Shrimps; `smith` → `minera`: 1 Bread), about 3–8 s each. Giver uses `bot.trade(partner, { give, want: [] })`, receiver `bot.serveTrades({ from, maxTrades: 1 })`, one process per bot. So two-step deals (goods now, payment as a later separate trade) work in this engine.
  - The live trade-screen status lags (an accept flag can survive an offer change for a moment; the screen reads "closed" between offer and confirm). The confirm screen always showed the final offer. **Deal records should use the trade result (`gave` / `received`), not the live screen.**
- **Content reloads, still open:** "Packing changes / Reloading with changes" at 16:30:28 (4 s after World ready) and twice at 17:20:46–54, with no file in `server/content/` changed. The reloads come from the engine's dev live-reload (`build.liveReload`, default `true` in `WorldConfig.ts`; file watcher in `src/cache/DevThread.ts`). A staff `::rebuild` / `::reload` also triggers one. **Option:** `BUILD_LIVE_RELOAD=false` in `server/engine/.env` turns it off (content edits then need an engine restart). Not changed yet; Jacob decides.

## 2026-11-20: Logger core built and tested

- **Built** in `artscape/logger/` from `logger/DESIGN.md` (build order steps 1–6): run folders with `run.json`, one append-only file per agent (each line written and fsynced, 0.7 ms per line), automatic `action` logging by wrapping `bot` in a Proxy, `snapshot` every 10 s, `location` from `artscape/areas.json`, `activity.start/end`, `problem` events, `note`, a merge tool (`timeline.jsonl` + `timeline.txt` + a data check), `SCHEMA.md`, and an offline self-test (22 checks). Scripts use `runLogged(...)` instead of rs-sdk's `runScript`; `chop-loop.ts` is routine #1. `watch.ts` logs a bot without acting.
- **Stop on failure (design decision 2026-10-22):** a failed write throws `LogWriteError`, every later `bot.*` call is refused before it acts, and a failure inside a timer ends the process (exit code 3). Tested offline by closing the file under the writer.
- **Found: `tick` is not a world clock.** The lite client counts server ticks since that client started (`serverTick++` in `server/webclient/src/lite/runner.ts`), so `testbot1` and `minerb` were about 7,900 ticks apart at the same moment, and the count restarts when a client restarts. Logged as is, documented in `SCHEMA.md`; order agents by `t` (wall clock). A shared game clock would need an engine or client change; since a day is a block of real time in the design, it isn't needed now.
- **Fixed during the test:** the runner's planned logout at the end of a script was logged as `problem: connection disconnected`. The logger now stops listening before the runner logs out.
- The engine (still the old code, waiting for `::reboot`) reloaded content again at 17:07 and twice at 17:40 with no change, more evidence for section 1 of `sessions/2026-11-20.md`.

## 2026-11-20: Content auto-reload off, `::rebuild` kept

- **Problem:** the engine repacked and reloaded its content in bursts of 2–6 with no file edited and no `::rebuild` typed: on 19 Nov at 16:30, 17:20, 20:18, 21:20; on 20 Nov at 06:21, 15:29, 16:29, 17:07, 17:40, 18:40, 19:40. The trigger is the engine's dev file watcher (`src/cache/DevThread.ts`, on by default via `build.liveReload`); something on the machine (antivirus or the search indexer?) touches the content files on a schedule. A reload during a run is a confound.
- **Fix (Jacob's decision: off, but keep a command):** `BUILD_LIVE_RELOAD=false` in `server/engine/.env` (and `.env.example`). Setting it alone would also have disabled `::rebuild`, because `World.ts` only started the dev thread with live reload on. Small engine change: `World.ts` now starts the dev thread on every non-production world (the startup rebuild still needs live reload on), and `DevThread.ts` only watches the content folders when live reload is on. `::rebuild` (staff) repacks and reloads on demand; it is listed in the `::commands` menu (`artscape_commands.rs2`).
- **Checked after `::reboot` (20:06):** clean shutdown with saves, restart without the startup pack, all bots logged in again. `::rebuild` worked at 20:17, and there was no reload at 20:40 or 21:40; the only reloads since are Jacob's own `::rebuild`s.

## 2026-11-20: Furnace in Yanille; map edits need `::reboot`; the bots' map is a copy

- **Change (Jacob's decision, option A):** Yanille is the home area and had no furnace. In `server/content/maps/m40_48.jm2` the middle anvil of the smith's house (2613, 3081) was removed and a `furnace1` added at (2612, 3079), rotation 0, covering x 2612–2614, z 3079–3081. It is used from its east side (x 2615). Two lines in one map file.
- **Problem 1: `::rebuild` doesn't load map edits.** `World.reload()` reloads scripts and config types but not the game map, which is only loaded at engine start. The client still downloads the new map on login, so it *draws* a change the server doesn't have: Jacob saw the furnace, but Smelt did nothing. **Fix:** after a map edit, `::reboot` (the restart loop brings the engine back in about 20 s). The `::commands` menu now says so. Check: `engine.log` shows "Loading game map" after the edit.
- **Problem 2: the bots' pathfinder doesn't read the engine.** It uses `sdk/collision-data.json`, a 27 MB copy tracked in git and originally fetched from the public rs-sdk server. After a map change the bots would walk into the new furnace. **Fix:** regenerated from our own engine with `bun sdk/fetch-collision-data.ts --force --server=http://localhost:8888`. The old copy matched our world except the furnace tiles and 6 blocked tiles in a far-away dungeon (level 3) that the public server has and we don't, so nothing else changed. **Rule from now on: every map edit is followed by `::reboot`, then this command, then a commit of the new file.**
- **Checked:** Smelt opens the smelting interface (Jacob, 21:54). The SDK pathfinder treats the furnace as blocked and reaches its east side from the spawn spot (14 tiles), the bank (19) and the Yanille mine (67).
