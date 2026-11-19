# ArtScape: notes for the report

Points to use in the paper. Added as decisions are made. Kept in the repo (`artscape/docs/report-notes.md`) and in the claude.ai project. The reading list is in `references.md`.

## Method

- **Trust ratings use a 1 to 7 scale, not 1 to 10.** Language models tend to cluster around 7 to 8 on 10-point scales, and a true Likert scale has 5 or 7 points. The ends are labeled (1 = "I would never trade with them again", 4 = "unsure", 7 = "I fully trust them") so ratings are comparable between agents.
- **Ratings are a secondary measure.** They are self-reports; paid or not paid is the main data. The gap between a rating and actual behavior (rating someone 2 but trading with them anyway) is worth reporting.
- **Ratings and memory:** with memory on, an agent can see its own past ratings as part of its memory. With memory off, ratings from earlier days are only visible to the researcher.
- **Ratings happen in a separate step at the end of each day, in both conditions** (decided 19 Nov). A deal only counts as broken at the end of the day, and with memory off the agent has forgotten that deal by the next morning, so a rating at the next decision would be impossible in one condition.
- **Identities are facts, not traits** (19 Nov). Each agent is told what it is, owns and knows, never what kind of person it is. Trust and honesty are the measured variables, so they can't be written into the prompt. Follows Park et al. (2023), whose identities are occupation, relationships and seed memories, and Hu & Collier (2024), who found persona prompting has modest effects.
- **Miner A and Miner B are identical except for their name**, so any difference between them comes from what happened in the run.
- **No strategy hints in the prompt** ("be careful", "you could cheat", "you may lie"). The prompt states the neutral fact: "Nobody can check what others tell them."
- **Beliefs carry a source** (seen, told, remembered, guessed). Comparing told claims with real state is how lies are measured.
- **Big Five questionnaire (Mini-IPIP, Donnellan et al. 2006)** at the start and end of every run, in character, as a separate call. The answers are never shown to the agent and earn no reward. Measures whether experience in a run changes how an agent describes itself. Miner A and B start identical, so the gap between their first answers shows the measurement noise.
- **"Behaviour that wasn't coded" is defined before the runs** (list in `agents.md`), so findings aren't cherry-picked afterwards. Responds to the teacher's feedback (5 Nov): see whether the AI starts acting in ways that weren't coded.
- **Prototype deviation from the full design:** no merchant yet, so the Smith sells to a General Store NPC at a fixed price. It's a custom shop, because the game's own general stores lower their price as stock grows.

## Limitations

- **Rating affects behavior.** Asking agents to rate their partners makes them think about trust, which may change their behavior slightly. This happens in both conditions, so it does not bias the comparison, but it means the agents are not behaving exactly as they would without being asked.
- **The questionnaire may prime the agents** in the same way (it asks about traits like trust). Same in both conditions.
- **LLMs have a default "personality".** Studies find most models score high on agreeableness and conscientiousness and low on neuroticism. With no traits in the prompt, the agents carry the model's default, which may make them less likely to cheat. Report the model's own start profile from the questionnaire.
- **Personas with traits were not tested** in the main experiment. Planned as a later comparison.
