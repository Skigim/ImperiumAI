# Project Imperium Guidelines

## Critical requirements for all work in this repository. These are non-negotiable and must be followed for any contribution.

- Load or consult the `using-superpowers` skill before doing any repository work. In environments without native skill invocation, use [skills/using-superpowers/SKILL.md](skills/using-superpowers/SKILL.md) as the reference source. This is the foundational local workflow reference for how to use all other skills and how to approach tasks in this repository.
- Every action, no matter how large or small, must be preceded by a check for relevant local skills using the skill-loading mechanism available in the current environment. This includes clarifying questions, code exploration, planning, editing, and user responses.
- Always prioritize locally available skills over native assumptions about how to approach the task.
- Always prioritize process skills before domain-specific execution.
- The default Copilot model is the primary orchestrator for this repository. It is responsible for workflow control, user communication, synthesis, and deciding whether work should stay local or be delegated.
- Existing named workspace agent files are not part of the active phase-one workflow. Do not rely on a fixed roster to route work.
- Ad hoc subagent delegation is allowed when it improves focus, but every delegated prompt must include the task objective, relevant repository context, applicable architecture constraints, relevant Screeps or CPU constraints, and the exact deliverable expected back.
- Keep final judgment, planning checkpoints, and synthesis in the primary orchestrator unless the user explicitly directs otherwise.

## Delegation Policy

- Prefer ad hoc delegation for focused research, targeted review, isolated implementation chunks, and Screeps compatibility checks.
- Prefer staying in the primary orchestrator for planning, workflow sequencing, tradeoff decisions, and final integration of results.
- Do not delegate vaguely. Package the minimum correct context so the delegated task is bounded and testable.
- Do not treat delegated work as authoritative until the primary orchestrator has reviewed and integrated it.

## Architecture

- Preserve the OS-style separation between kernel, platform, domain, processes, policies, tasks, model, and utils.
- Put behavior in the narrowest correct layer instead of adding cross-layer shortcuts.
- Treat rooms as future semi-autonomous execution domains and keep empire logic above room-local control.

## Screeps Constraints

- Treat CPU budget as a primary design constraint for all runtime decisions.
- Prefer bounded per-tick work, deferrable tasks, and explicit scheduling over eager full-tick processing.
- Verify version-sensitive Screeps assumptions against current documentation before locking in plans or APIs.
- Keep shared Screeps guidance high level here. Put detailed subsystem knowledge into localized prompts or future specialized agent definitions.

## Code Changes

- Prefer small, architecture-consistent changes over speculative framework expansion.
- Keep memory schema and shared contracts explicit and typed.
- Avoid unrelated refactors while implementing a focused task.

## Validation

- Use the narrowest relevant project check after changes when practical: `npm run typecheck`, `npm run build`, or `npm run lint`.
- Follow the existing project tooling in [package.json](../package.json).

## Project Context

- When broader repository context is needed, start with [README.md](../README.md) for project goals and workflow.
- Use [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) when system boundaries or design rationale matter to the task.
- Use [docs/DEV_PLAN.md](../docs/DEV_PLAN.md) when planning new work or checking roadmap sequencing.