# Project Imperium Guidelines

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