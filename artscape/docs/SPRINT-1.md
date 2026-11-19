# Sprint 1: World and bots

> **Paused on 19 Nov 2026 (Jacob's decision).** Nothing below was started. Until the prototype period ends on 23 Nov, the work follows the thin vertical slice in `sessions/2026-11-19.md`: one model-driven agent with BDI, then memory, then one deal with a scripted smith. World-building moves to after 23 Nov. This list is kept as it was so it can be resumed or replanned later.

**Dates:** 3 – 11 Nov 2026 (prototyping starts 9 Nov; away 12–15 Nov)

**Sprint goal:** four scripted bots (no AI yet) live in the home area, each doing its role, and complete the whole chain ore → bars → items → coins through two-step deals at agreed prices. A run with days can be started and reset from code, and every step is logged in the format Sprint 2 will use.

When this works, Sprint 2 only has to swap the scripted brain for a model and add memory.

The design is on the Miro board (frames 1–6). This file is the build list.

---

## 0. Housekeeping

- [ ] Move the project out of OneDrive (for example `C:\dev\ArtScape`). The unexplained content reloads would confound runs. *(19 Nov: in progress. Repo cloned to `C:\dev\ArtScape`, docs moved into `artscape/docs/`. Still to do: run the stack from the new folder, then remove the OneDrive copy.)*
- [ ] One start script that launches engine, gateway and all bot clients (with restart loops).
- [ ] Fix the `create-bot.ts` CRLF bug, or write a small script that creates bots with a correct `bot.env` (`SERVER=localhost:8888`, `GATEWAY_URL=ws://localhost:7780`, `TELEMETRY=false`).
- [ ] Turn the Grand Exchange off (`GE_ENABLED=false`), so agents have to trade with each other.

## 1. World (timebox: 2 days)

- [ ] Pick an existing area with everything close together: a mine with copper and tin, a furnace, an anvil, a bank, and a spot for the market. Reuse before building.
- [ ] Name every spot (`mine`, `furnace`, `anvil`, `bank`, `market`, `gearshop`, `buyer`) with coordinates in one config file. Routines and the location log both use these names.
- [ ] **NPC buyer:** buys the smith's items, but only from the merchant. Coins enter the world here.
- [ ] **NPC gear shop:** sells pickaxes in fixed steps (for example bronze → iron → steel → mithril). Coins leave the world here.
- [ ] **List prices** for every traded item, in one config file. Offers may move 20% above or below (placeholder).
- [ ] No public scoreboard: agents must not be able to see each other's coins.
- [ ] **Freeze the world** at the end of the sprint. Any later change means rerunning experiments.

## 2. Commands (only what helps running and testing)

- [ ] Reset to the start state (positions, items, coins, stats), callable **from code** and as a command for testing.
- [ ] Add the new commands to the `::commands` menu.

## 3. Bots

- [ ] Four accounts: `minera`, `minerb`, `smith`, `merchant` (letters and digits, max 12 characters).
- [ ] Each has a role config: role, personality (placeholder text), goals, toolkit, start position, start items.
- [ ] All four clients start from the start script.

## 4. Logger (before the routines)

- [ ] JSONL, one folder per run, every line tagged with run id, condition (memory on/off), agent, day, tick and time.
- [ ] Event types: activity (routine started, stopped, result), location (named spot), deal (offered, agreed price, delivered, paid, broken), chat (message, reply, ignored), snapshot (every ~10 s: position, items, coins), and **decision**.
- [ ] The decision event is shaped for BDI from day one: `beliefs`, `desire`, `intention`, `reason`, plus `trust` ratings (1–7 with a reason) for partners. The scripted brain fills it with simple values, so the format does not change in Sprint 2.

## 5. Agent loop with a swappable brain

- [ ] The loop from Miro frame 5: look at the situation → `decide()` → act (routine, deal or chat) → checkpoint → repeat.
- [ ] Checkpoints: backpack full, routine done or failed, or X minutes passed (placeholder, same for all agents).
- [ ] `decide()` is one swappable function. In this sprint a scripted brain fills it; in Sprint 2 the model does.
- [ ] Message track: incoming messages are handled while the routine keeps running. A reply can answer, ignore, or flag the message for the next checkpoint. It can never agree to a deal. Reply limit N per hour (placeholder).

## 6. Run controller

- [ ] Start run, start day, end day, end run. Calls the reset at the start of a run.
- [ ] A day is a block of real time (placeholder: 20 minutes).
- [ ] The run ends when someone reaches the target (placeholder: 10,000 coins) or after 5 days.
- [ ] Hooks for later (empty in this sprint): read diary at day start, reflect at day end, end-of-run questions.

## 7. Routine toolkit

Each routine has start, stop, settings and logging built in, and returns a clear result.

- [ ] `walkTo(spot)`: everyone
- [ ] `mine(ore, amount)`: miners only
- [ ] `smelt(bar, amount)` and `smith(item, amount)`: smith only
- [ ] `sellToNpc(item, amount)`: merchant only
- [ ] `buyPickaxe(level)`: miners only
- [ ] `bank(deposit/withdraw)`: everyone
- [ ] Toolkits enforced in code: an agent can only call its own role's routines. The smith has no way to sell to the NPC buyer.

## 8. Deals (scripted, no AI)

- [ ] Messaging: send an offer (item, amount, price) by private message, and read messages.
- [ ] Offer → accept, decline or one counter-offer → accept or decline. The agreed price is logged as the promise.
- [ ] Meet at the market spot.
- [ ] `deliver(partner, item, amount)`: trade 1, goods only. The seller may deliver less, which is logged.
- [ ] `pay(partner, coins)`: trade 2, coins only. Deadline: end of the day.
- [ ] A deal record links offer → agreed price → delivery → payment, and ends as completed, partly broken or broken.
- [ ] Test 1: miner delivers, smith pays in full → completed.
- [ ] Test 2: miner delivers, smith pays less → partly broken.
- [ ] Test 3: miner delivers, smith never pays → broken at day end.
- [ ] Test 4: the full chain, scripted end to end, with all four bots.

---

## Done when

- One command starts the world and all four bots.
- A run can be reset from code to the same start state.
- The full chain runs with scripted decisions inside a day, including one broken deal.
- The logs show the whole run, with decision events already in BDI format.

## Not in this sprint

Model calls, memory and the diary, reflection, real personalities, the control room, the visual routine layer, purchasable toolkits, distractions, "anyone can offer / who goes first" deals.

## If time runs short

Cut in this order: extra commands, custom NPCs (use existing shops), the gear shop. Never cut the logger, the reset, the swappable `decide()` or the run controller.
