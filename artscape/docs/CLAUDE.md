# ArtScape

AI agents with memory living in a small, customized RuneScape-style world. Individual project for the Entertainment Computing Workshop at the University of Coimbra. Runs locally only, for research and education.

## Research question

Does persistent memory change how AI agents cooperate, trade and trust each other in a small game society?

**Hypothesis:** agents with memory protect themselves better: they pick partners who were reliable before, and when they cannot avoid a partner who cheated them, they switch to safer tactics. Open question: does this make the village richer, or just more cautious?

The memory on/off comparison is the core experiment. It may be refined after early experiments.

## Stack

- **rs-sdk** (https://github.com/MaxBittker/rs-sdk): a fork of the LostCity 2004scape engine and client. TypeScript, run with Bun.
- **Architecture:** game engine ↔ bot client (browser or headless lite client) ↔ gateway ↔ SDK / agent code. The SDK never talks to the engine directly.
- **SDK API:** see `sdk/API.md`. Prefer the high-level `bot.*` methods. Use low-level `sdk.send*` only when something is missing.
- **Language model:** OpenRouter (OpenAI-compatible API), starting with DeepSeek V4.1 Flash. Keep the model name configurable.
- **Local addresses:** engine at http://localhost:8888, gateway at ws://localhost:7780.

## Running locally

Verified on this machine on 2026-10-21. It needed fixes (see `DEVLOG.md`): `BUILD_VERIFY=false` in `server/engine/.env`, and fixing each new bot's `bot.env` by hand (CRLF bug in `create-bot.ts`). Start commands are below. Paths in `sessions/2026-10-21.md` are from before the move and are out of date.

## Project layout

Decided 2026-11-03 (replaces the `agents/` plan from 2026-10-22). Moved out of OneDrive on 2026-11-19 (see `sessions/2026-11-19.md`).

- The repo is our fork https://github.com/bestlund/artscape (branch `artscape`), cloned to `C:\dev\ArtScape`. That folder is the repo root. Older notes call it `rs-sdk/`, so `rs-sdk/artscape/` in old notes means `artscape/` here.
- All our code lives in `artscape/`. Logger, routines, agent loop and run controller go there.
- Our docs live in `artscape/docs/`: this file, `DEVLOG.md`, `SPRINT-1.md`, `sessions/` and `logger/DESIGN.md`. The repo root `CLAUDE.md` is rs-sdk's bot guide; its first line imports this file.
- **The fork is public.** Never put keys, passwords, `bot.env` contents or private notes into docs or code. Secrets go in gitignored `.env` files.
- Run scripts from the repo root with the bot name, e.g. `bun artscape/chop-loop.ts testbot1`. The runner finds `bots/<name>/bot.env` itself.
- `bots/` only holds `bot.env` files (gitignored). Engine changes outside `artscape/` are kept small and listed in `DEVLOG.md`.
- Run data goes in `runs/` (gitignored); back up finished runs separately.

```sh
git clone -b artscape https://github.com/bestlund/artscape.git ArtScape
cd ArtScape
bun install
```

A fresh clone has no gitignored state. Copy it by hand from the old copy, with the engine stopped: `bots/*/bot.env`, `server/engine/.env`, and the saves and world data (`server/engine/db.sqlite*`, `server/engine/data/players/`, `server/engine/data/config/world.json`).

Three processes, each in its own terminal:

```sh
cd server/engine && bun run start
cd server/webclient && bun install && bun run watch
cd server/gateway && bun install && bun run gateway
```

Create a bot and run its script:

```sh
bun bots/create-bot.ts <name> --local --no-chat   # name: max 12 chars, letters and digits
# set TELEMETRY=false in bots/<name>/bot.env
# open http://localhost:8888/bot?bot=<name>&password=<PASSWORD from bot.env> and keep it open
bun bots/<name>/script.ts
```

Game speed: `NODE_TICKRATE` in `server/engine/.env` (default 400 ms), or `::speed <ms>` in-game.

## Agent design

The full design is on the Miro board "ArtScape" (frames 1–6). Build list: `SPRINT-1.md`, **paused on 2026-11-19**. The current plan (thin vertical slice for the 23 Nov prototype) is in `sessions/2026-11-19.md`.

- Four agents: **Miner A, Miner B, Smith, Merchant.** Built up one at a time.
- Economy: miners sell ore to the smith, the smith sells items to the merchant, the merchant sells to an NPC buyer. Coins enter only at the NPC buyer and leave only at the NPC gear shop (pickaxes, fixed steps). The smith cannot sell to the NPC buyer.
- Goals: a race. The first agent to reach the target (placeholder: 10,000 coins) wins. Miners also want the best pickaxe, the smith wants to be known as the most reliable smith, the merchant wants to be the village banker.
- Information: no public scoreboard. Progress is only known by asking in chat, and answers can be lies.
- Identity (role, personality, goals, toolkit, rules) is part of every model call.
- Each role has its own toolkit, the same in both conditions.
- Three-part structure:
  1. **Model:** a memory file per agent (markdown) recording what happened, who paid, who cheated and whom it trusts.
  2. **Decide:** the model reads identity, memory and the current situation, records beliefs, desire, intention and a reason (BDI), then picks a routine from its role's toolkit, or a deal or chat. Routines are tested code loops that run with no model calls until the next checkpoint. Model-written code as a fallback is a future plan, to be tested before it is trusted.
  3. **Check:** everything is logged. After each in-game day, a reflection step writes lessons back to memory.
- The model is called only at checkpoints (backpack full, routine done or failed, X minutes passed) and for message replies, never every tick. Code loops do the routine work.
- Messages are handled in parallel while the routine runs. A reply (short BDI) can answer, ignore or flag the message for the next checkpoint; it can never agree to a deal. Reply limit per hour.
- Memory is switched on or off per run, with a single flag that changes nothing else. Both conditions remember the current day. Memory on adds a diary between days (written by a reflection step at day end) and the agent's own past trust ratings.
- After every deal, both agents rate their partner 1–7 with a reason, as part of the next decision's beliefs.

## Deals

- Every item has a list price. Offers may move 20% above or below it (placeholder), with at most one counter-offer.
- The agreed price is logged as the promise. Trade 1: the seller gives the goods. Trade 2: the buyer pays, by the end of the day.
- Outcomes: completed, partly broken (paid or delivered less), broken (not paid by day end). Cheating is measured against the agreed price.

## Runs

- A day is a block of real time (placeholder: 20 minutes) ending with reflection. A run ends when someone reaches the target or after 5 days. The target is sized so a run takes about 3–5 days.
- After a run, every agent answers a few questions (trust, lies, why).
- Placeholders (target, day length, prices, pickaxe steps, X minutes, reply limit) are set after the first scripted runs.

## World

- A home area with a mine, furnace, anvil, bank, market spot, NPC buyer and NPC gear shop close together. Reuse an existing area where possible.
- The game's own trade cannot be cheated (two-screen confirmation), so every deal is two separate trades (decided).
- Grand Exchange off for experiments. XP rate stays at rs-sdk's 25× (decided).

## Experiment

- Two conditions with an identical setup: roles, personalities, starting items, area and model. Only memory differs.
- About 5 runs per condition. Each run lasts several in-game days, and memory carries over between days only in the memory condition.
- **Measures:** completed vs. broken deals, partner choice after being cheated, deal tactics with a past cheater, repeat partners, trust ratings (secondary), claimed vs. real wealth (lies), total and per-agent wealth, and cost per run (tokens, USD).
- Main experiment uses the target goal and limited haggling in every run. Open-ended goals and pure fixed prices are only tried in the pilot.
- Optional: viewers rate recorded clips with the Creature Believability Scale.

## Logging (from day one)

- Log every model call (prompt, response, tokens, cost), all generated code, every action, trade and chat message, and each version of each memory file.
- Use structured JSONL logs, one folder per run, tagged with run id, condition, model and timestamps.
- The logs are the data for the paper, so never skip them.

## Milestones

| Date | Milestone |
| --- | --- |
| 2 Nov 2026 | Design proposal due |
| 9–23 Nov 2026 | Prototyping period. Target: at least one agent with memory, ideally two agents trading |
| Late Nov–Dec | Custom world, 4 to 5 agents, experiment runs (estimate) |
| Dec–Jan | Analysis, paper (50% of the grade), demo video (estimate) |

## Rules

- Local only. Never connect bots to official RuneScape servers. Don't use the public rs-sdk demo server for experiments, since runs there are not controlled.
- Set `TELEMETRY=false` in every `bot.env`.
- Keep API costs low: event-driven calls, a cheap model, and spend tracked per run.
- Keep a dev log of decisions, problems and fixes. It becomes the method section of the paper.
- Work in small steps. Get one thing working before adding the next.

## Open questions

- Do both miners mine the same ores (choice and competition), or one copper and one tin?
- Which area of the map is the home area?
- Is there a human player in the world, or only agents?
- What does the prototype need to show at the end of prototyping?
