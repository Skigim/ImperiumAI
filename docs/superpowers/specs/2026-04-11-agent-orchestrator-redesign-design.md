# Project Imperium Agent Orchestrator Redesign

**Date:** 2026-04-11

## Goal

Replace the current named workspace agent roster with a single orchestrator model centered on [../../../.github/copilot-instructions.md](../../../.github/copilot-instructions.md). The default Copilot model will remain the primary coordinator, and any subagents will be invoked ad hoc from that primary agent using task-specific prompts and explicit repository context.

## Scope

This design covers phase one only.

In scope:
- Rework [../../../.github/copilot-instructions.md](../../../.github/copilot-instructions.md) into the sole orchestration control surface.
- Remove the current `.agent.md` roster under [../../../.github/agents](../../../.github/agents).
- Preserve the imported skills system and explicitly align the orchestrator instructions with it.
- Keep Screeps guidance at a high level in the main instructions.

Out of scope:
- Creating the replacement named subagents.
- Building reusable prompt libraries beyond what the primary orchestrator needs to know conceptually.
- Encoding detailed Screeps APIs or subsystem-specific implementation patterns in the main instructions.

## Problem Statement

The current workspace setup uses a fixed roster of named agents with predeclared handoffs. That model is narrower than the intended workflow.

The desired workflow is different in three ways:
- The primary Copilot agent should act as the high-level orchestrator instead of defaulting into a specialized role model.
- Skills must be treated as the first process layer before exploration, planning, or edits.
- Subagents should be disposable specialists invoked with custom prompts and curated context, rather than long-lived named roles with static responsibilities.

## Design Overview

Phase one establishes a single-controller model.

The workspace instruction file becomes the authoritative source for:
- how the primary agent behaves,
- when and how it delegates,
- what repository constraints always apply, and
- how skills interact with orchestration.

The orchestrator remains responsible for user interaction, workflow control, synthesis, and final decisions. Delegation is permitted, but delegated work is bounded and prompt-driven. The orchestrator does not depend on pre-existing named specialists to route tasks.

## Architecture

### Primary Agent Role

The default Copilot model acts as the Project Imperium orchestrator.

Its responsibilities are to:
- evaluate applicable local skills before acting,
- classify the task as research, planning, implementation, review, or mixed,
- decide whether delegation is useful,
- package the correct context for delegated work,
- integrate results back into a coherent user-facing workflow.

The orchestrator is not prohibited from implementing changes directly, but it is responsible for deciding whether direct work or delegated work is more appropriate.

### Delegation Model

Delegation is ad hoc, not roster-driven.

Each delegated task must include:
- the specific objective,
- the relevant repository context,
- the architecture boundaries that matter,
- any Screeps or CPU constraints that apply,
- the exact expected deliverable or output format.

Delegation is preferred for:
- focused research,
- targeted code review,
- isolated implementation chunks,
- Screeps compatibility checks.

Delegation is not preferred for:
- user-facing planning,
- approval checkpoints,
- cross-cutting tradeoff decisions,
- final synthesis of multiple findings.

### Skills Integration

Skills remain first-class process controls.

The orchestrator must treat local skills as mandatory workflow constraints when they apply. This means the instructions file should reinforce, not compete with, the imported skills setup. The orchestrator’s role is to respect skills first, then decide whether a task stays local or gets delegated.

### High-Level Screeps Guidance

The main instruction file should keep Screeps guidance high level.

It should state that:
- CPU budget is a primary design constraint,
- per-tick work should remain bounded,
- scheduling and deferral are preferred over eager whole-tick processing,
- version-sensitive Screeps assumptions must be verified before being relied on.

Detailed API knowledge and subsystem-specific patterns should be deferred to later localized prompts or future agent definitions.

## Proposed Instruction File Structure

The redesigned [../../../.github/copilot-instructions.md](../../../.github/copilot-instructions.md) should contain these sections:

1. **Critical workflow rules**
   - Primary Copilot acts as orchestrator.
   - Local skills are checked first.
   - Existing named agents are not part of the active workflow.

2. **Delegation policy**
   - Ad hoc subagents are allowed.
   - Delegated prompts must be explicit, contextualized, and bounded.
   - Final synthesis stays with the primary orchestrator.

3. **Repository architecture constraints**
   - Preserve kernel/platform/domain/process/policy/task/model/utils boundaries.
   - Avoid cross-layer shortcuts.

4. **High-level Screeps constraints**
   - CPU-aware design.
   - Bounded per-tick work.
   - Verify version-sensitive API assumptions.

5. **Validation expectations**
   - Run the narrowest relevant project check after changes.
   - Prefer meaningful verification over blanket validation when the task is focused.

## Transition Plan

Phase one transition is intentionally simple:
- remove all current `.agent.md` files under [../../../.github/agents](../../../.github/agents),
- update [../../../.github/copilot-instructions.md](../../../.github/copilot-instructions.md) to encode the new orchestrator behavior,
- keep the imported skills untouched,
- validate the resulting workspace configuration with targeted checks.

This removes ambiguity about whether the old named agents are still part of the intended workflow.

## Error Handling And Risk Control

The main risk is replacing one rigid workflow with instructions that are too vague. To avoid that, the instruction file should be explicit about:
- when delegation is appropriate,
- what context a delegated prompt must include,
- which responsibilities always remain with the orchestrator,
- how skills take precedence over ad hoc execution.

Another risk is overloading the main instruction file with Screeps detail. This design avoids that by limiting the shared guidance to CPU, bounded tick work, and API caution.

## Validation

Phase one should be validated by checking that:
- the workspace instructions still parse cleanly and read coherently,
- the old `.agent.md` files are removed,
- repository validation commands still pass,
- no imported skill files are modified to support the redesign.

At minimum, the change should be checked with the narrowest relevant project validations, such as lint and typecheck.

## Expected Outcome

After phase one:
- Project Imperium has one clear orchestration model,
- the primary Copilot agent is the authoritative coordinator,
- skills remain the first workflow layer,
- ad hoc subagent delegation is allowed without relying on a fixed roster,
- the repository is ready for future reintroduction of named agents one at a time.

## Notes

This spec intentionally does not require a git commit. The repository-wide instruction set outside this spec prohibits committing unless explicitly requested.