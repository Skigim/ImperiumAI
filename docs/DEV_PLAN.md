# Development Plan

Project Imperium should be built in phases with explicit checkpoints so the architecture matures alongside game capability without drifting away from the kernel-first runtime model.

Two rules apply across every phase:

- the kernel remains the only scheduler that decides what can run each tick
- validation starts early and continues through the roadmap instead of waiting for a final hardening pass

## Phase 0: Compatibility Filter And Predecessor Study

Use this phase to study predecessor bots and extract practical lessons before implementing major systems.

Targets to review:

- Overmind
- TooAngel
- Hivemind

Questions to answer during study:

- how each bot structures room autonomy versus empire control
- how scheduling and CPU throttling are handled
- how memory schemas evolve over time
- what abstractions stayed useful versus what became overhead
- what failure modes appear during shard-scale play
- which ideas are still compatible with current Screeps behavior versus version-sensitive leftovers

Deliverables:

- architecture notes
- naming conventions
- memory schema principles
- a shortlist of patterns worth copying and patterns to avoid
- a compatibility filter that marks each borrowed idea as accepted, rejected, or unresolved
- a predecessor reference document in [docs/PREDECESSOR_FINDINGS.md](docs/PREDECESSOR_FINDINGS.md)

## Phase 1: Kernel Foundation And Runtime Validation

Goals:

- scheduler loop with explicit priorities
- CPU governor with baseline and burst handling
- process registry and runtime contracts
- basic profiling and runtime logging
- early scenario validation for CPU pressure, reset continuity, and bounded deferral

Deliverables:

- kernel can select and defer work based on budget
- runtime metrics are visible enough to guide tuning
- essential work survives pressure while lower-value work is explicitly deferred

## Phase 2: Memory And Model Stabilization

Goals:

- versioned root memory
- typed process records
- room-scoped and empire-scoped memory boundaries
- migration strategy for schema changes
- model contracts for room budgets, backlog state, and phase-local diagnostics

Deliverables:

- memory access is centralized and typed
- schema evolution is deliberate instead of ad hoc
- room and empire contracts are explicit enough to support later scheduling and recovery decisions

## Phase 3: Room Execution Domains Under Kernel Budgets

Goals:

- establish rooms as semi-autonomous execution domains
- room process lifecycle and room-local context
- bounded room-local orchestration within kernel-issued budgets
- backlog and degraded-mode reporting from rooms back to the kernel

Deliverables:

- each owned room can be reasoned about as an execution unit
- room-local failures are isolated and observable
- rooms make local decisions without becoming independent schedulers

## Phase 4: Minimal Task And Logistics Foundation

Goals:

- small concrete task contracts
- task assignment and reservation model
- movement and execution bookkeeping
- minimal energy flow tracking and hauling prioritization
- enough logistics structure to describe actual work demand before workforce rules harden

Deliverables:

- harvest, haul, build, and upgrade tasks
- task and logistics demand can be measured and audited
- no giant monolithic role hierarchy

## Phase 5: Spawning And Workforce Bootstrapping

Goals:

- spawn process structure
- creep lifecycle metadata
- early workforce bootstrapping rules driven by validated task and logistics demand

Deliverables:

- controlled spawn pipeline
- enough workers to maintain a minimal economy loop
- workforce decisions remain grounded in task demand rather than ad hoc role expansion

## Phase 6: Defense And Recovery

Goals:

- threat detection
- safe mode policy
- defender spawning policy
- post-attack recovery routines
- degraded-mode rules for rooms under military or CPU pressure

Deliverables:

- rooms can detect, respond to, and recover from common threats
- recovery behavior is explicit rather than improvised during failure states

## Phase 7: Empire Coordination

Goals:

- scouting and intel network
- inter-room logistics
- claim, remote, and expansion decisions
- high-level strategic processes that consume room-reported state instead of bypassing room-local ownership

Deliverables:

- empire-level reasoning layered on top of stable room autonomy
- coordination remains above rooms instead of replacing room-local control

## Phase 8: Optimization And Hardening

Goals:

- bucket-aware burst workloads
- long-tail performance profiling
- memory cleanup and migration tooling
- regression tests for critical policies and contracts

Deliverables:

- stable shard operation under constrained CPU
- clearer operational guardrails for future features
- consolidated performance and regression coverage for systems that were already being validated in earlier phases
