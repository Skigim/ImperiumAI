# Project Imperium Guidelines

## Critical requirements for all work in this repository. These are non-negotiable and must be followed for any contribution.

- Read [skills/using-superpowers/SKILL.md](skills/using-superpowers/SKILL.md) before doing ANYTHING else. This is the foundational skill for how to use all other skills and how to approach tasks in this repository. If you don't follow it, you will not be able to use any of the other skills effectively.
- Every action, no matter how large or small, must be preceded by a check for relevant skills using the `Skill` tool. This includes clarifying questions, code exploration, and any response to user messages. If a skill applies, you must invoke it and follow it exactly before doing anything else.
- Always prioritize locally available skills over native git skills. If a skill exists in the current repository that applies to the task, use it instead of any native git commands or assumptions about git behavior.
- Always prioritize process skills (like brainstorming, debugging, code review) over domain-specific skills.
- When multiple skills could apply, use the skill priority guidelines in [skills/using-superpowers/SKILL.md](skills/using-superpowers/SKILL.md) to determine which to invoke first.

## Architecture
- Preserve the OS-style separation between kernel, platform, domain, processes, policies, tasks, model, and utils.
- Put behavior in the narrowest correct layer instead of adding cross-layer shortcuts.
- Treat rooms as future semi-autonomous execution domains and keep empire logic above room-local control.

## Screeps Constraints
- Treat CPU budget as a primary design constraint for all runtime decisions.
- Prefer bounded per-tick work, deferrable tasks, and explicit scheduling over eager full-tick processing.
- Verify version-sensitive Screeps assumptions against current documentation before locking in plans or APIs.

## Code Changes
- Prefer small, architecture-consistent changes over speculative framework expansion.
- Keep memory schema and shared contracts explicit and typed.
- Avoid unrelated refactors while implementing a focused task.

## Validation
- Use the narrowest relevant project check after changes when practical: `npm run typecheck`, `npm run build`, or `npm run lint`.
- Follow the existing project tooling in [package.json](../package.json).

## Project Context
- Start with [README.md](../README.md) for project goals and workflow.
- Use [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) for system boundaries and design rationale.
- Use [docs/DEV_PLAN.md](../docs/DEV_PLAN.md) for roadmap sequencing when planning new work.