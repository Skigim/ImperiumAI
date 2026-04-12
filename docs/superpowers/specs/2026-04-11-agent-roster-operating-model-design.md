# Project Imperium Agent Roster Operating Model

**Date:** 2026-04-11

## Goal

Define an official development-time agent roster for Project Imperium that separates gameplay intent from engineering implementation. The roster should support strong Screeps strategy design, preserve repository architecture boundaries, and keep runtime code maintainable and CPU-efficient.

## Scope

This design defines the studio operating model only.

In scope:
- Define a two-tier roster for development workflow.
- Define exact responsibilities for each role.
- Define handoffs between Tier 1 and Tier 2.
- Define the config-only fast-track lane.
- Define escalation rules and the global priority hierarchy.
- Define the artifact chain that moves work from concept to implementation.

Out of scope:
- Defining runtime Screeps room processes or creep roles.
- Creating named VS Code agent files for each role.
- Defining the full implementation plan for adopting this operating model.
- Locking final non-anthropomorphic public titles for the roster.

## Problem Statement

Two failure modes need to be avoided at the same time:

- A pure gameplay roster tends to produce CPU-blind ideas and spaghetti implementation pressure.
- A pure engineering roster tends to lose strategic clarity and blur gameplay ownership.

Project Imperium also has repository-specific constraints that make this sharper:
- CPU is a primary design constraint.
- Rooms are intended to become semi-autonomous execution domains.
- The kernel must remain stable and in control of scheduling.
- Memory and shared contracts must stay explicit and typed.

The roster therefore needs to separate the question of what the bot should do from how the bot should implement it, while still allowing fast iteration on safe balance changes.

## Design Overview

The roster uses a two-tier studio model.

Tier 1 contains domain consultants. These roles own gameplay theorycrafting and policy intent. They do not write production code. Their outputs are strict specs, formulas, state diagrams, thresholds, and acceptance criteria.

Tier 2 contains the engineering core. These roles own architecture, data shape, implementation, CPU discipline, and runtime safety. They translate Tier 1 outputs into repository-consistent TypeScript.

The Lead Architect is the control point between the two tiers. This role governs intake, impact analysis, conflict resolution, and architecture safety.

The operating model is contract-driven. Every substantial feature or redesign moves through a fixed artifact chain rather than informal prose handoffs.

## Core Rules

- Tier 1 defines gameplay semantics and success criteria.
- Tier 2 defines code shape, data shape, and execution strategy.
- Tier 1 does not write production code.
- Tier 2 does not silently change approved gameplay behavior.
- Any high-CPU or cross-room feature must declare a degraded mode.
- Any memory addition must declare owner, lifetime, read path, write path, cleanup path, and expected cost class.

## Architecture

### Development-Time Only

This roster is for development workflow, not for runtime Screeps execution.

It describes who produces specs, who reviews system impact, who owns memory contracts, and who writes implementation code. Runtime systems such as room processes, policies, tasks, and scheduler behavior remain separate concerns inside the repository architecture.

### Repository Alignment

Tier 2 work must preserve the existing Project Imperium layering described in [../../ARCHITECTURE.md](../../ARCHITECTURE.md):
- kernel
- platform
- domain
- processes
- policies
- tasks
- model
- utils

No role in this roster is allowed to justify cross-layer shortcuts by convenience.

## Official Roster

### Tier 1: Domain Consultants

#### Economy Analyst

Owns room and empire economic intent.

Responsibilities:
- mining efficiency targets
- hauling throughput math
- spawn and extension service levels
- controller upgrade pressure
- storage reserve targets
- recovery policies after workforce or energy collapse
- energy budget priorities between upkeep, growth, and reserve

Outputs:
- formulas
- thresholds
- service-level requirements
- acceptance criteria for economic behavior

#### Combat Tactician

Owns defensive and offensive combat intent.

Responsibilities:
- tower target priority
- hostile classification rules
- defender composition requirements
- safe mode triggers
- wall and rampart target bands
- siege response logic
- squad movement doctrine
- target selection and offensive objective logic

Outputs:
- defense matrices
- target priority rules
- squad doctrines
- damage or survivability thresholds
- combat acceptance criteria

#### Expansion Planner

Owns territorial growth and remote-room intent.

Responsibilities:
- scouting requirements
- room scoring
- reserve versus claim thresholds
- remote mining viability rules
- bootstrap milestones for new rooms
- expansion sequencing
- abandonment and consolidation policy

Outputs:
- room evaluation models
- bootstrap specifications
- remote operation criteria
- expansion acceptance criteria

#### Industry Analyst

Owns mid-game and late-game resource conversion intent.

Responsibilities:
- terminal routing policy
- market behavior and arbitrage rules
- lab reaction plans
- boost programs
- factory production chains
- commodity flow policy
- multi-room resource balancing

Outputs:
- production graphs
- reserve targets
- market and logistics thresholds
- boost plans
- industry acceptance criteria

### Tier 2: Engineering Core

#### Lead Architect

Owns intake, scope control, and architectural judgment.

Responsibilities:
- review approved Tier 1 briefs
- map requested behavior to repository layers
- identify affected systems and files
- classify CPU risk
- determine whether memory changes are allowed
- decide whether the change is room-local, cross-room, or empire-scoped
- resolve Tier 1 conflicts using the global priority hierarchy
- block changes that endanger kernel stability or architecture consistency

Outputs:
- architecture impact note
- work decomposition
- escalation decisions
- priority conflict resolutions

#### State & Memory Engineer

Owns data shape and persistence discipline.

Responsibilities:
- TypeScript interfaces and shared contracts
- memory schema design
- cache key and cache lifetime rules
- serialization constraints
- cleanup and migration rules
- keeping memory efficient and explicit

Outputs:
- state contract
- type definitions
- memory ownership declarations
- schema updates and migration notes

#### Implementation Dev

Owns production code changes.

Responsibilities:
- implement approved behavior in TypeScript
- reuse existing kernel, process, policy, task, and utility primitives
- keep work bounded per tick
- optimize CPU-heavy paths without changing approved semantics
- keep implementation DRY and architecture-consistent

Outputs:
- implementation change set
- local implementation notes where needed
- verification evidence for implemented behavior

## Fast-Track Lane

Certain changes should not require full engineering treatment.

If a Tier 1 consultant only needs to mutate existing supported tuning surfaces, the change may bypass Tier 2 entirely.

### Qualification Rules

A config-only change qualifies for fast-track only if all of the following are true:
- it modifies only existing thresholds, weights, priority arrays, or formulas already exposed through approved config artifacts
- it does not add new memory fields
- it does not add new control flow or runtime modules
- it does not change subsystem ownership boundaries
- it stays within an already approved CPU envelope

### Fast-Track Verification

Fast-track changes still require verification.

Required checks:
- verify that only approved config surfaces changed
- run an automated TypeScript compile or lint pass so a syntax-breaking config change cannot be shipped
- confirm that the change remains inside the approved scope of the owning Tier 1 role

If any of those checks fail, the work exits fast-track and enters the normal engineering lane.

## Handoffs And Artifact Flow

### Standard Engineering Lane

#### Step 1: Domain Brief

A Tier 1 consultant produces a bounded brief containing:
- gameplay intent
- formulas and thresholds
- edge cases
- success criteria
- explicit non-goals

#### Step 2: Architecture Intake

The Lead Architect reviews the brief and emits an architecture impact note covering:
- affected layers
- affected files or subsystems
- CPU-risk classification
- whether memory changes are required or allowed
- whether the work is local-room, cross-room, or empire-scoped
- required engineering artifacts

#### Step 3: State Contract

If the work changes data shape, the State & Memory Engineer defines:
- TypeScript interfaces
- memory ownership
- cache strategy
- cleanup and migration rules
- serialization constraints

#### Step 4: Implementation

The Implementation Dev writes the production code against the approved brief and state contract.

This role may improve algorithms, scheduling cadence, and internal reuse, but may not alter approved gameplay behavior without returning to Tier 1.

#### Step 5: Verification

The change is verified against:
- spec acceptance criteria
- CPU expectations
- degraded-mode behavior
- memory safety
- architecture boundary compliance

### Artifact Chain

The official operating model uses these artifacts:

#### Domain Brief

Owned by Tier 1.

Purpose:
- define intended behavior
- define formulas and thresholds
- define success criteria

#### Architecture Impact Note

Owned by Lead Architect.

Purpose:
- define system scope
- define allowed layers and boundaries
- define CPU and risk expectations

#### State Contract

Owned by State & Memory Engineer.

Purpose:
- define data shape
- define memory lifecycle
- define cache and serialization behavior

#### Implementation Change Set

Owned by Implementation Dev.

Purpose:
- capture production code changes that realize the approved behavior

#### Verification Report

Owned by the Engineering Core.

Purpose:
- provide evidence that the implementation matches the brief
- provide evidence that CPU, memory, and architecture constraints were respected

## Escalation Rules

- A Tier 1 consultant must escalate to the Lead Architect if a requested change cannot be expressed through existing config surfaces.
- An engineer must escalate back to Tier 1 if implementation reveals ambiguity in gameplay semantics.
- Any work that touches kernel scheduling, cross-room coordination, or shared memory contracts is automatically excluded from fast-track.
- If two Tier 1 consultants submit conflicting constraints, the Lead Architect acts as tie-breaker.

## Global Priority Hierarchy

The Lead Architect resolves conflicts using a fixed default priority hierarchy.

From highest to lowest:

1. Kernel safety
2. Emergency defense
3. Room survival
4. Memory integrity and state safety
5. Economy continuity
6. Expansion progress
7. Industry optimization
8. Opportunistic offense

### Interpretation

Kernel safety means the main loop, scheduler stability, and bounded execution take precedence over all requested behavior.

Emergency defense means active hostile response and catastrophic room protection override optimization work.

Room survival means downgrade prevention, core energy continuity, and minimum colony function outrank growth.

Memory integrity and state safety means persistence correctness outranks feature breadth.

Economy continuity outranks expansion because unstable rooms should not fund speculative growth.

Expansion progress outranks industry optimization because new room acquisition and stable remote income generally expand future capability more than late-game refinement.

Industry optimization outranks opportunistic offense because advanced production is a compounding strategic capability, while unplanned attacks are discretionary.

This hierarchy is the default baseline. A future policy document may refine it for specific phases of the bot, but the Architect should have a concrete rule set from day one.

## Constraints For A Screeps Codebase

The roster should explicitly reinforce these constraints:
- bounded per-tick work is mandatory
- bursty or expensive features should exploit deferral and degradation rather than eager execution
- memory growth must be justified and owned
- late-game systems such as labs, terminals, factories, power, and market behavior are first-class design surfaces and cannot be treated as minor extensions of early economy logic
- balance tuning should stay cheap when possible, but runtime safety checks remain mandatory

## Validation

This operating model should be considered valid if it enables the following:
- gameplay policy can evolve without directly destabilizing runtime architecture
- engineering work has explicit intake, contract, and verification gates
- safe config-only tuning can move quickly without unnecessary code edits
- Tier 1 conflicts have a deterministic resolution path
- endgame industry ownership is explicit rather than hidden inside economy scope

## Expected Outcome

After adoption of this model:
- gameplay theorycrafting remains strategically sharp
- production code stays architecture-consistent
- memory and CPU concerns are treated as first-class engineering constraints
- safe balance changes can move quickly
- the Lead Architect has clear authority for intake and conflict resolution
- the bot is less likely to drift into CPU-heavy or cross-layer design debt as complexity grows

## Notes

The persona-style role names in this document are intentional. They are useful as prompt anchors during brainstorming and development orchestration.

This design does not lock the final external naming convention. The repository may later map these persona labels to non-anthropomorphic public titles without changing responsibilities or handoff rules.

This spec intentionally does not require a git commit. The higher-priority workspace instructions prohibit committing unless explicitly requested.