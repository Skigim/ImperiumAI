# Agent Orchestrator Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current named agent roster with a single orchestrator model driven by [../../../.github/copilot-instructions.md](../../../.github/copilot-instructions.md), while preserving the imported skills setup.

**Architecture:** The primary Copilot agent becomes the sole orchestrator in the workspace instructions. Named `.agent.md` files are removed in phase one, and ad hoc subagent delegation is permitted through explicit prompt construction rather than fixed agent definitions.

**Tech Stack:** Markdown workspace instructions, VS Code agent customization files, existing npm validation commands (`lint`, `typecheck`).

---

## File Structure

- [../../../.github/copilot-instructions.md](../../../.github/copilot-instructions.md)
  - The single authoritative workflow file for phase one.
  - Will be rewritten so the default Copilot model is the orchestrator, skills stay first, and ad hoc delegation is explicitly allowed.

- [../../../.github/agents/imperium-architecture.agent.md](../../../.github/agents/imperium-architecture.agent.md)
  - Remove in phase one.

- [../../../.github/agents/imperium-implementation.agent.md](../../../.github/agents/imperium-implementation.agent.md)
  - Remove in phase one.

- [../../../.github/agents/imperium-manager.agent.md](../../../.github/agents/imperium-manager.agent.md)
  - Remove in phase one.

- [../../../.github/agents/imperium-research.agent.md](../../../.github/agents/imperium-research.agent.md)
  - Remove in phase one.

- [../../../.github/agents/imperium-review.agent.md](../../../.github/agents/imperium-review.agent.md)
  - Remove in phase one.

## Task 1: Rewrite Workspace Instructions

**Files:**
- Modify: `.github/copilot-instructions.md`

- [ ] **Step 1: Replace the current instructions file with the orchestrator-first content below**

```md
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

- When broader repository context is needed, start with [README.md](../../../README.md) for project goals and workflow.
- Use [ARCHITECTURE.md](../../ARCHITECTURE.md) when system boundaries or design rationale matter to the task.
- Use [DEV_PLAN.md](../../DEV_PLAN.md) when planning new work or checking roadmap sequencing.
```

- [ ] **Step 2: Verify the file contents match the intended phase-one design**

Run:
```powershell
Get-Content .github/copilot-instructions.md
```

Expected:
- The file states the default Copilot model is the primary orchestrator.
- The file says the old named workspace agents are not part of the active phase-one workflow.
- The file explicitly allows ad hoc delegation with context-packed prompts.
- The file keeps Screeps guidance high level.

- [ ] **Step 3: Confirm no unintended instruction areas were added**

Check manually that the rewritten file does **not** introduce:
- detailed Screeps API references,
- a new fixed agent roster,
- prompt-template sections for future agents,
- instructions that conflict with the imported skills.

Expected:
- The file stays focused on orchestration, delegation policy, repo architecture, high-level Screeps constraints, and validation.

## Task 2: Remove the Current Named Agent Roster

**Files:**
- Delete: `.github/agents/imperium-architecture.agent.md`
- Delete: `.github/agents/imperium-implementation.agent.md`
- Delete: `.github/agents/imperium-manager.agent.md`
- Delete: `.github/agents/imperium-research.agent.md`
- Delete: `.github/agents/imperium-review.agent.md`

- [ ] **Step 1: Delete the five current agent files**

Use workspace edits to delete these exact files:

```text
.github/agents/imperium-architecture.agent.md
.github/agents/imperium-implementation.agent.md
.github/agents/imperium-manager.agent.md
.github/agents/imperium-research.agent.md
.github/agents/imperium-review.agent.md
```

Expected:
- The `.github/agents` directory no longer contains the current phase-zero roster files.

- [ ] **Step 2: Verify the directory contents after deletion**

Run:
```powershell
Get-ChildItem .github/agents
```

Expected:
- No output, or only future files unrelated to the removed roster.

- [ ] **Step 3: Verify no remaining workspace files reference the removed roster as active workflow**

Run:
```powershell
rg "Imperium (Manager|Researcher|Reviewer|Architect|Implementer)|named workspace agent|fixed roster" .github
```

Expected:
- Only historical or future-facing references remain if intentional.
- No active workspace instruction should direct the system to depend on the removed `.agent.md` files.

## Task 3: Validate the Workspace Configuration

**Files:**
- Modify: `eslint.config.mjs` only if already required by prior work and still correct
- Validate: `.github/copilot-instructions.md`
- Validate: `.github/agents/**`

- [ ] **Step 1: Run lint**

Run:
```powershell
npm run lint
```

Expected:
- Exit code `0`
- No new lint errors introduced by the instruction rewrite or agent deletions

- [ ] **Step 2: Run typecheck**

Run:
```powershell
npm run typecheck
```

Expected:
- Exit code `0`
- No TypeScript regressions from the workspace cleanup

- [ ] **Step 3: Inspect git status to confirm the scope of change**

Run:
```powershell
git status --short
```

Expected:
- Modified: `.github/copilot-instructions.md`
- Deleted: the five `.github/agents/*.agent.md` files
- No changes to files under `.github/skills/**`

- [ ] **Step 4: Confirm imported skills remain untouched**

Run:
```powershell
git diff -- .github/skills
```

Expected:
- No diff output

## Task 4: Summarize the New Phase-One State

**Files:**
- No additional file changes

- [ ] **Step 1: Prepare the completion summary**

Summarize these exact points:
- `.github/copilot-instructions.md` is now the sole phase-one orchestration surface.
- The old named workspace roster has been removed.
- Skills remain intact and take priority before action.
- Ad hoc subagent delegation is now the supported delegation model.
- Validation results for lint and typecheck.

- [ ] **Step 2: Do not commit unless the user explicitly requests it**

Expected:
- The work remains uncommitted unless the user later asks for a commit.

## Self-Review Checklist

- The plan only covers phase one and does not sneak in replacement named agents.
- Every file path is exact.
- The instruction rewrite is fully specified and does not rely on placeholders.
- The deletion scope is explicit.
- Validation covers lint, typecheck, and scope verification.
- The plan respects the repository rule against committing unless explicitly requested.