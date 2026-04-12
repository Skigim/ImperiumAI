# Project Imperium Gameplay Context Skills

**Date:** 2026-04-12

## Goal

Define a small set of Project Imperium gameplay-context skills that work within the existing orchestrator-first development model. These skills should provide repo-specific Screeps gameplay knowledge on demand without reviving a fixed specialist agent roster or duplicating the existing superpowers process skills.

## Scope

This design defines the first gameplay-context skill subset and their role in the current workspace workflow.

In scope:
- define the initial gameplay-context skill set
- define naming and folder conventions for those skills
- define what belongs inside gameplay-context skills versus superpowers skills
- define the content boundaries for the economy and logistics skills
- define how these skills should be discovered and used by the orchestrator

Out of scope:
- implementing the skills themselves
- changing the existing orchestrator-first workspace model
- reviving a fixed `.agent.md` gameplay roster
- defining combat, expansion, or industry skill content beyond future extension guidance

## Problem Statement

Project Imperium needs localized gameplay knowledge that the primary orchestrator can load on demand during design and implementation work.

The current workspace model already prefers:
- a single primary orchestrator
- ad hoc delegation when useful
- high-level repository instructions
- localized subsystem guidance instead of stuffing detailed Screeps doctrine into `.github/copilot-instructions.md`

The previous exploration showed that economy and logistics knowledge is too specific and too version-sensitive to leave implicit, but it does not need a revived fixed roster of specialized agents.

The repository therefore needs a gameplay-context layer that:
- stays compatible with the orchestrator-first model
- remains clearly distinct from the superpowers process skill set
- captures verified Screeps gameplay constraints and Imperium-specific design rules
- stays narrow enough to load only when relevant

## Design Overview

Project Imperium will add gameplay-context skills under the same workspace skill structure already used by the existing skills. The difference is not file layout but nomenclature and responsibility.

The existing `superpowers` skill family continues to own process discipline such as brainstorming, research, planning, debugging, and execution workflows. The new gameplay-context skills own domain-specific Screeps knowledge for this repository.

The initial skill subset contains two skills:
- `imperium-economy-context`
- `imperium-logistics-context`

These skills are reference-first. They do not replace process skills, do not implement mini workflow engines, and do not compete with the orchestrator. Their job is to give the orchestrator a compact, discoverable knowledge surface when a task depends on Imperium-specific gameplay assumptions.

## Naming And Structure

### File Structure

Gameplay-context skills use the same folder convention as the existing workspace skills:

```text
.github/skills/<skill-name>/SKILL.md
```

This preserves consistency with the current skill library and avoids introducing a second customization layout for closely related artifacts.

### Nomenclature

Gameplay-context skills use an `imperium-` prefix.

Examples:
- `imperium-economy-context`
- `imperium-logistics-context`

This naming scheme creates a visible distinction from the existing process-oriented superpowers skills while still fitting the same discovery and loading model.

The naming split is intentional:
- `superpowers:*` means process, workflow, and execution discipline
- `imperium-*` means repository-local gameplay doctrine and design context

This is clearer than reviving role-style names and clearer than generic names like `gameplay-economy-context`, which would not mark the content as Project Imperium-specific.

## Relationship To Existing Skills

Gameplay-context skills complement the current skill set instead of overlapping with it.

### Superpowers Skills Continue To Own

- brainstorming and design process
- external research process
- implementation planning
- test-driven development
- debugging and review workflows
- execution and completion workflows

### Imperium Gameplay Skills Own

- Imperium-specific Screeps gameplay boundaries
- domain definitions and invariants
- verified runtime constraints that materially affect design choices
- subsystem-specific failure modes
- concise guidance about what information the orchestrator should gather before making gameplay decisions

Gameplay-context skills should not restate generic workflow discipline already captured in the superpowers skills.

Gameplay-context skills must explicitly cross-reference companion gameplay-context skills when the design surface crosses domain boundaries.

## Initial Skill Set

### `imperium-economy-context`

Purpose:
- provide room and empire economy design context for Project Imperium

When it should be used:
- room energy policy design
- reserve threshold design
- spawn-service prioritization
- controller upgrade pressure decisions
- recovery planning after workforce or energy collapse
- deciding economy phase transitions

What it should contain:
- economy definition in Imperium terms
- core economic priorities and invariants
- verified Screeps constraints relevant to room energy behavior
- economy phase model from bootstrap through terminal-backed operation
- known failure and recovery modes
- quick-reference heuristics for orchestrator use
- handoff expectations listing the context to gather before relying on the skill
- explicit companion-skill directives for logistics-dependent design questions

What it should not contain:
- detailed hauling topology
- movement and pathing tactics
- implementation mechanics or TypeScript structure guidance
- process instructions already owned by superpowers skills

### `imperium-logistics-context`

Purpose:
- provide transport and routing design context for Project Imperium

When it should be used:
- source-to-sink transport design
- hauling demand modeling
- salvage pickup design
- container, storage, link, or terminal routing decisions
- bounded movement-cost and path-reuse considerations
- degraded logistics service design under CPU or workforce pressure

What it should contain:
- logistics definition in Imperium terms
- supply and demand surfaces for resource movement
- verified Screeps transfer, withdraw, pickup, and structure-routing constraints
- logistics topology patterns appropriate for Imperium phases
- known logistics failure modes
- quick-reference transport priorities for orchestrator use
- handoff expectations listing the context to gather before relying on the skill
- explicit companion-skill directives for economy-dependent policy questions

What it should not contain:
- reserve policy
- controller-upgrade philosophy
- expansion policy
- implementation mechanics or TypeScript structure guidance
- process instructions already owned by superpowers skills

## Verified Gameplay Context To Capture

The gameplay-context skills should encode only the subset of verified Screeps information that materially shapes gameplay decisions for the relevant subsystem.

### Economy-Relevant Verified Context

- sources regenerate every 300 ticks
- source energy capacity differs by room control state, including lower output in unreserved rooms
- `Room.energyAvailable` and `Room.energyCapacityAvailable` are the room-level spawn-service surfaces for spawns and extensions
- controller downgrade pressure is observable through `StructureController.ticksToDowngrade`
- storage begins at RCL 4 and changes reserve policy options substantially

### Logistics-Relevant Verified Context

- energy intake can come from harvest, dropped resources, containers, tombstones, ruins, storage, links, and terminals depending on phase
- `pickup`, `withdraw`, and `transfer` have adjacent-range constraints and different valid targets
- containers are walkable and automatically absorb dropped resources on their tile
- links unlock at RCL 5, have 800 capacity, lose 3% energy on transfer, and incur cooldown based on distance
- terminals unlock at RCL 6 and transport cost depends on `Game.market.calcTransactionCost`
- movement and path reuse decisions materially affect CPU cost and hauling viability

## Skill Content Shape

Each gameplay-context skill should follow the same broad structure used by existing workspace skills.

Minimum recommended sections:
- `Overview`
- `When to Use`
- subsystem core rules or invariants
- verified gameplay constraints
- subsystem patterns or phase model
- common failure modes
- `Quick Reference`
- handoff expectations

When a gameplay-context skill depends on adjacent subsystem knowledge, the `SKILL.md` must include a hard directive telling the orchestrator to load the companion skill before proceeding.

Example directives:
- in `imperium-economy-context`: if designing the physical transport routing or hauling topology required to satisfy economic thresholds, the orchestrator must also load `imperium-logistics-context`
- in `imperium-logistics-context`: if deciding reserve bands, service-level targets, or economy-phase policy for a transport design, the orchestrator must also load `imperium-economy-context`

The `description` field must remain discovery-focused. It should describe when to load the skill and include concrete gameplay trigger terms. It should not summarize a workflow.

Supporting files should only be added if a compact `SKILL.md` is no longer sufficient. The default assumption is one folder, one `SKILL.md`, matching the existing skills.

## Boundaries And Guardrails

### Keep Them Reference-First

These skills are not intended to become hidden workflow engines.

They should answer questions like:
- what constraints matter here?
- what failure modes should the orchestrator watch for?
- what facts must be known before making a design choice?

They should not answer by replacing brainstorming, planning, or implementation workflows.

### Keep Them Localized

Detailed Screeps subsystem doctrine should live in these skills rather than being expanded into `.github/copilot-instructions.md`.

This preserves the current instruction model:
- global workflow stays concise
- domain detail stays loadable on demand

### Keep Economy And Logistics Separate

The split between economy and logistics is deliberate.

Economy owns:
- reserve bands
- service levels
- upgrade pressure
- recovery states
- economy phase transitions

Logistics owns:
- transport topology
- hauling demand and routing
- salvage handling
- source-side collection patterns
- storage, link, and terminal movement assumptions

This separation keeps policy ownership distinct from transfer execution assumptions.

### Require Explicit Cross-Referencing

Separation is not isolation.

Economy and logistics frequently overlap at the interface between policy and execution. Because of that, gameplay-context skills must not rely on the orchestrator to infer adjacent-domain knowledge implicitly.

If a subsystem question materially depends on a companion domain, the active skill must contain an explicit load-companion directive.

Examples:
- `imperium-economy-context` must direct the orchestrator to load `imperium-logistics-context` when the work involves hauling topology, transport routing, source collection layout, or the physical means of meeting reserve and service targets
- `imperium-logistics-context` must direct the orchestrator to load `imperium-economy-context` when the work involves reserve policy, service thresholds, controller pressure tradeoffs, or economy-phase decisions that determine what logistics is supposed to serve

This rule exists to prevent the orchestrator from hallucinating transport mechanics from economic policy alone, or inventing policy targets from transport context alone.

## Future Extension

If the pattern works, the same naming and structure convention can be extended later with additional gameplay-context skills such as:
- `imperium-combat-context`
- `imperium-expansion-context`
- `imperium-industry-context`

Those future skills should follow the same rule set:
- same folder structure
- `imperium-` nomenclature
- reference-first content
- strict separation from superpowers process responsibilities

## Acceptance Criteria

This design is successful when:
- gameplay-context knowledge is represented as workspace skills rather than a revived fixed gameplay agent roster
- the gameplay-context skills use the same structural conventions as the existing skills
- the naming scheme clearly distinguishes gameplay-context skills from the superpowers process skills
- the first skill subset is limited to economy and logistics
- the boundaries between economy context, logistics context, and superpowers workflow context are explicit
- the economy and logistics skills explicitly direct the orchestrator to load each other when a design question crosses the policy and execution boundary
- the orchestrator can load localized gameplay knowledge without increasing the global instruction footprint