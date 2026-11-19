# ArtScape: reading list and references

Papers to read for the report, with why each one matters for ArtScape. Started 19 Nov 2026. Add new papers at the end of the right section.

## Agent identity and personas

- **Park, J. S., O'Brien, J. C., Cai, C. J., Morris, M. R., Liang, P. & Bernstein, M. S. (2023).** Generative Agents: Interactive Simulacra of Human Behavior. *UIST '23.* https://arxiv.org/abs/2304.03442
  The classic. 25 agents in a Sims-like town, each seeded with a one-paragraph identity (occupation, relationships, seed memories). Memory stream, reflection and planning. Emergent social behaviour from one seed (the Valentine's Day party). Source for our "facts, not traits" identities and the diary/reflection design.
- **Hu, T. & Collier, N. (2024).** Quantifying the Persona Effect in LLM Simulations. *ACL 2024.* https://aclanthology.org/2024.acl-long.554
  Persona variables explain under 10% of the variance in most subjective NLP datasets; persona prompting gives modest but significant improvements. Supports keeping personas thin and not expecting them to control behaviour.
- **Serapio-García, G., Safdari, M., et al. (2023).** Personality Traits in Large Language Models. https://arxiv.org/abs/2307.00184
  How to give validated personality tests to LLMs and shape the Big Five through prompts. Method source for the questionnaire.
- **Zakazov, I., Boronski, M., Drudi, L. & West, R. (2024/2025).** Assessing Social Alignment: Do Personality-Prompted Large Language Models Behave Like Humans? https://arxiv.org/abs/2412.16772
  Prompted personalities have failure modes shared across models. A caution against relying on traits.

## Trust, economics and LLM agents

- **Xie, C., Chen, C., et al. (2024).** Can Large Language Model Agents Simulate Human Trust Behavior? *NeurIPS 2024.* https://arxiv.org/abs/2402.04559
  Closest to ArtScape: trust games with LLM agents that have personas (name, age, gender, job, background) and **BDI** reasoning. Cite for the BDI harness and the trust measures.
- **Horton, J. J., Filippas, A. & Manning, B. S. (2023, rev. 2026).** Large Language Models as Simulated Economic Agents: What Can We Learn from Homo Silicus? *NBER Working Paper 31122.* https://arxiv.org/abs/2301.07543
  LLMs as simulated economic agents that are given endowments, information and preferences. Background for the economy and for using LLM agents as research subjects.

## Emergent behaviour in game worlds

- **Altera.AL et al. (2024).** Project Sid: Many-agent simulations toward AI civilization. https://arxiv.org/abs/2411.00114
  10 to 1000+ agents in Minecraft developed specialised roles, collective rules and cultural transmission. Example of emergent specialisation (compare: miners choosing ores).

## Measurement

- **Donnellan, M. B., Oswald, F. L., Baird, B. M. & Lucas, R. E. (2006).** The Mini-IPIP Scales: Tiny-yet-effective measures of the Big Five factors of personality. *Psychological Assessment, 18*(2), 192–203. https://doi.org/10.1037/1040-3590.18.2.192
  The 20-item Big Five questionnaire used at the start and end of each run. Public domain (IPIP).
- **Big Five profile of LLMs:** studies find most models score high on conscientiousness and agreeableness and low on neuroticism (for example the ACL 2025 Findings paper on LLM risk-taking and the Big Five). Relevant to the "too honest to cheat" risk.

## Already in the project (from the teacher)

- Barreto, Macedo & Roque (2014), the multi-agent architecture in "Orphibs II". Memory and inter-agent communication named as future work.
- Tenenberg, Roth & Socha (2016), socially recursive inference in collaborative awareness. Basis for a possible "reputation" belief.
- Bratman (1987); Rao & Georgeff (1995): BDI.
