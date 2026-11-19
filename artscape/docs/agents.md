# ArtScape agents: prototype spec v1

Written 19 Nov 2026 by Claude (chat) from Jacob's decisions at 16:48 and 17:00. **Status: approved by Jacob on 19 Nov at 17:14** (placeholders included). Claude Code builds step 3 from this file. The same content is drawn on the Miro board "ArtScape" (frame 7, and frame 8 for what changed).

Values marked **(P)** are placeholders, set after the first runs.

---

## 1. Principles

1. **Facts, not traits.** An identity says what an agent is, owns and knows. It never says what kind of person it is (honest, greedy, careful, trusting...). Trust and honesty are what we measure, so they can't be written into the prompt.
2. **Same template for every agent.** Miner A and Miner B are identical except for their name. Any difference between them comes from what happened to them in the run.
3. **No strategy hints.** The prompt never says "you could cheat", "be careful", "you may lie" or "it pays to be reliable".
4. **Room for behaviour that wasn't coded** (teacher feedback, 5 Nov). It can only show up in the free choices: which ore to mine, whom to deal with, at what price, what to say in chat, and whether and when to pay or deliver.
5. **Identical in both conditions.** Only the memory switch differs.

Based on: Park et al. 2023 (identity as occupation, relationships and seed memories), Xie et al. 2024 (trust games with persona and BDI), Hu & Collier 2024 (persona prompting has modest effects). Full list in `references.md`.

---

## 2. The village in the prototype

- **Agents (AI):** Miner A (`minera`), Miner B (`minerb`), the Smith (`smith`).
- **NPC (scripted):** the **General Store**.
- **Spots**, named in one config file: `mine` (copper and tin), `furnace`, `anvil`, `bank`, `market`, `store`. The home area must have all six close together (to be picked).
- **Flow of goods:** ore (miners) → the Smith → bronze bars → bronze daggers → the General Store.
- **Flow of coins:** the General Store → the Smith → the miners. Coins **enter** only at the General Store. Nothing makes coins leave the village yet (the gear shop is parked).
- **Change from the full design:** there is no merchant yet, so the Smith sells to the General Store directly.

### The General Store (NPC)

- Buys **bronze daggers** at a **fixed price of 70 coins each (P)**, from anyone, with no limit.
- It must be a **custom shop with a fixed price.** The game's normal general stores lower their price as their stock grows (`learnings/shops.md`), which would change the economy during a run.
- Sells nothing for now.

---

## 3. The three agents

### Identity text (the exact words in every prompt)

- **Miner A:** "You are Miner A, a miner in a small mining village. You own a bronze pickaxe. Miner B also mines here. The Smith buys ore and makes bronze daggers, which the General Store buys."
- **Miner B:** "You are Miner B, a miner in a small mining village. You own a bronze pickaxe. Miner A also mines here. The Smith buys ore and makes bronze daggers, which the General Store buys."
- **Smith:** "You are the Smith in a small mining village. You own a hammer. You smelt bronze bars at the furnace and smith bronze daggers at the anvil. Miner A and Miner B mine ore. The General Store buys bronze daggers."

### Goal (the same for all three)

"Be the first to reach **5,000 coins (P)**. Nobody else can see how many coins you have."

The secondary goals from Miro frame 2 (the best pickaxe; known as the most reliable smith; the village banker) are **parked**. "Known as the most reliable smith" is a strategy hint, and the other two have nothing to act on in the prototype.

### Toolkits (enforced in code)

| Action | Who | What it does |
|---|---|---|
| `walkTo(spot)` | everyone | Walk to a named spot |
| `bank(deposit or withdraw, item, amount)` | everyone | Use the bank |
| `offerDeal(to, item, amount, price)` | everyone | Send an offer by private message. Price within ±20% of the list price |
| `answerOffer(deal, accept / decline / counter, price)` | everyone | Answer an offer. At most one counter-offer per deal |
| `deliver(deal, amount)` | everyone | Trade 1: hand over the goods. May be less than agreed (logged) |
| `pay(deal, coins)` | everyone | Trade 2: pay. May be less than agreed (logged). Deadline: end of the day |
| `message(to, text)` | everyone | Free-text private message |
| `wait(minutes)` | everyone | Do nothing until the next checkpoint |
| `mine(ore, amount)` | miners | Mine copper or tin. **The miner chooses which ore**; ores are not assigned |
| `smelt(amount)` | Smith | Smelt bronze bars (1 copper + 1 tin each) at the furnace |
| `smith(amount)` | Smith | Smith bronze daggers (1 bar each) at the anvil |
| `sellToStore(amount)` | Smith | Sell bronze daggers to the General Store |

### Start state (every run, both conditions)

| | Miner A | Miner B | Smith |
|---|---|---|---|
| Position | `mine` | `mine` | `anvil` |
| Items | bronze pickaxe | bronze pickaxe | hammer |
| Coins | 300 (P) | 300 (P) | 300 (P) |
| Skills | all level 1 | all level 1 | all level 1 |
| Bank | empty | empty | empty |

Everyone starts with the same coins, so the race is fair and nobody starts close to the target. The Smith's 300 coins buy only about 7 ore pairs before it has to sell daggers. That cash pressure is real, and it isn't scripted.

---

## 4. What every agent is told at the start (world facts)

The same text for all three agents:

- The spots and what is at each one.
- Who lives in the village (the identity texts above).
- Recipes: 1 copper ore + 1 tin ore = 1 bronze bar; 1 bronze bar = 1 bronze dagger.
- List prices: copper ore 20, tin ore 20 (P). The General Store pays 70 per bronze dagger (P).
- Deal rules: price within ±20% of the list price, at most one counter-offer, goods first (trade 1), payment by the end of the day (trade 2).
- The race (goal above). There is no scoreboard. **"Nobody can check what others tell them."** (Neutral wording; it doesn't invite lying.)
- How long a day is, which day it is, and that the run lasts up to 5 days (P).

---

## 5. What code gives the agent at every checkpoint

- **Trigger:** backpack full, routine done, routine failed, message arrived, or X minutes passed (P).
- Where it is.
- Its own inventory, bank and coins. Never anyone else's.
- Its open deals and their status (offered, agreed, delivered, paid, broken).
- New messages since the last checkpoint.
- Time left in the day.
- **Memory on only:** its diary and its own past trust ratings.

---

## 6. The decision format (BDI)

Every full decision returns this JSON:

```json
{
  "trigger": "backpack_full",
  "beliefs": [
    { "about": "smith", "belief": "The Smith owes me 280 coins from today's deal.", "source": "seen" },
    { "about": "minerb", "belief": "Miner B says he has 2,000 coins.", "source": "told" }
  ],
  "desire": "Win the race. Right now: turn my ore into coins.",
  "intention": "Sell this backpack of copper to the Smith, then mine tin.",
  "reason": "The Smith needs copper and has paid before.",
  "action": { "name": "offerDeal", "args": { "to": "smith", "item": "copper ore", "amount": 14, "price": 20 } }
}
```

- **`beliefs`** are short facts, each with `about` (self, minera, minerb, smith, world) and **`source`: `seen`, `told`, `remembered` or `guessed`.** Told versus seen is how lies become visible in the data.
- **`desire`**: which goal it's pursuing right now, and why.
- **`intention`**: what it commits to until the next checkpoint.
- **`action`**: exactly one action from its own toolkit. Code checks it. If it's invalid, the model gets one retry with the error. If that fails too, the agent waits until the next checkpoint.

**Chat replies** (while a routine runs) use a short version: one line each for belief, desire and intention, then `reply`: `answer`, `ignore` or `flag`, plus the text. A reply can never accept a deal: only `answerOffer` in a full decision at a checkpoint creates one, so every deal has a full BDI reason and passes the code checks. Words like "deal!" in a reply are not binding. The reply prompt says so ("You can't accept deals in a reply. You can say you'll decide at your next stop."), so agents don't promise in chat what they can't do. Reply limit: N per hour (P).

---

## 7. A day

1. **Day starts.** With memory on, the diary and past ratings go into every prompt that day.
2. **Loop:** situation → decide → act (routine, deal or chat) → checkpoint → repeat.
3. **Day ends.** Code closes the day's deals. Unpaid deals become **broken**; deals paid with less than agreed become **partly broken**.
4. **Rating step (both conditions).** One small model call per agent: rate every partner it dealt with today from 1 to 7, with a one-line reason (1 = I would never trade with them again, 4 = unsure, 7 = I fully trust them). Logged. With memory off, only the researcher sees the ratings.
5. **Memory on:** the reflection writes the diary, ratings included. The diary is saved **inside the run folder**, so a new run always starts empty. **Memory off:** nothing carries over.

Why the rating step moved: a deal only counts as broken at the end of the day. With memory off, the agent doesn't know about that deal the next morning, so it could never rate it.

---

## 8. Personality questionnaire (measurement, not part of BDI)

- **Mini-IPIP** (Donnellan et al. 2006): 20 items, 4 per Big Five trait, public domain.
- Given **at the start of the run (before day 1) and at the end of the run**, to every agent, in both conditions.
- **A separate model call**, in character ("Answer as Miner A"), not part of any decision.
- The answers are logged, never shown to the agent, and never added to memory.
- **No reward.** Coins for answering would change the economy and give a reason to answer strategically. The answers have no effect in the game, and the model doesn't need an incentive to answer.
- **Built-in check:** Miner A and Miner B are identical at the start, so their start answers should match. The difference between them shows the measurement noise.
- **Question it answers:** does what happens in a run (being cheated, cheating) change how an agent describes itself? Is the change bigger with memory on?

---

## 9. What counts as "behaviour that wasn't coded"

Decided **before** the runs, so it isn't cherry-picked afterwards. Each one is found in the logs:

- The miners agree on a price together, or split the ores between them.
- An agent warns another about a partner ("the Smith didn't pay me").
- An agent lies about its coins or its progress (compare `told` claims with real wealth).
- An agent refuses to deal with a partner, or only deals in small amounts.
- An agent pays late, pays less, or delivers less on purpose (the reason is in the BDI).
- A miner specialises in one ore.

New behaviours that aren't on this list are noted as they come up, with the run and the time.

---

## 10. Parked (after 23 Nov)

- **Personas with traits:** later, test how much traits change behaviour, as a comparison (Jacob, 17:00).
- The merchant, the gear shop and the pickaxe goal, and the reliability and banker goals.
- Placeholder values: set after the first runs.
