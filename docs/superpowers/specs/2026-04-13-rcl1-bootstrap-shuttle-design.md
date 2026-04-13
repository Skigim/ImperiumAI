# Project Imperium RCL1 Bootstrap Shuttle Design

**Date:** 2026-04-13

## Goal

Refine Project Imperium's early-room operating model so the room uses a deterministic bootstrap shuttle economy from RCL1 through the fully charged RCL2 five-extension envelope, then transitions into local stationary harvesting with builder support.

The design must support:
- explicit room-local coordination without introducing a new multi-process orchestration framework yet
- balanced source staffing during shuttle mining to reduce source-side traffic
- fixed source and slot assignments for spawned bootstrap shuttles
- serialized extension construction during early RCL2 using the same WCMM worker line
- a strict bootstrap exit gate that requires the full 550-energy service envelope to be built and charged before stationary mining begins
- a clean handoff from shuttle mining into local stationary miners plus source-assigned bootstrap builders

## Scope

This design defines the room-local bootstrap control model, state contracts, and worker behavior for the earliest home-room economy.

In scope:
- RCL1 shuttle bootstrap behavior
- the RCL2 extension buildout sub-phase
- room-local labor request, slot claim, and fetch request contracts
- worker behavior for shuttles, overflow build haulers, stationary miners, and bootstrap builders
- the bootstrap exit condition and local stationary transition
- failure handling and validation requirements for the bootstrap redesign

Out of scope:
- remote expansion behavior
- generic colony-wide task arbitration
- post-container local hauling optimization
- long-term role taxonomies beyond the bootstrap contracts defined here
- storage, links, terminals, and post-RCL2 economy policy

## Problem Statement

The current early-room design assumes a broad bootstrap phase that persists until the room reaches the initial RCL2 extension envelope and then shifts into source hardening. That is directionally correct, but it is underspecified for the fine-grained bootstrap behavior that actually gets the room to that handoff point efficiently and predictably.

Project Imperium needs a more explicit bootstrap operating model that answers four questions clearly:
- how the room decides which source needs the next worker
- how source-side positions are assigned and persisted
- how RCL2 extension construction is performed without introducing a separate role tree too early
- exactly when bootstrap ends and stationary source hardening begins

The design must remain architecture-consistent with the current codebase. That means preserving a single room-local economy orchestrator for now, but giving it explicit internal contracts so it can behave like separate room mapping, economy, spawn, and logistics subsystems without requiring a broader kernel rewrite.

## Design Overview

Project Imperium will keep a single room-local economy process, but internally it will behave like four explicit subsystems:
- Room mapper: discovers sources, caches walkable slots, and stores spatial context
- Economy selector: decides which source needs labor next
- Spawn planner: chooses the bootstrap body template and spawn timing
- Logistics coordinator: owns slot claims, assignment persistence, and direct energy handoffs for overflow build haulers

These remain submodules inside one room process rather than separate kernel processes. This preserves the user's requested operating model while staying close to the current repository architecture.

The early-room lifecycle becomes a strict phased sequence:
1. RCL1 shuttle bootstrap
2. RCL2 extension buildout
3. bootstrap exit charge
4. local stationary transition

Bootstrap mode no longer ends merely because the room has unlocked or built five extensions. It persists until the room has:
- reached RCL2
- completed all five RCL2 extensions
- fully charged spawn plus all five extensions to the 550-energy envelope

Only after that charge condition is satisfied does the room switch to local stationary miners and source-assigned bootstrap builders.

## Phase Model

### Phase 1: RCL1 Shuttle Bootstrap

At RCL1, the room uses a hard-capped shuttle economy built on the `WORK, CARRY, MOVE, MOVE` body template.

Bootstrap rules:
- the room caps total live and pending shuttle workers at four
- new labor requests target the least-staffed source
- staffing should stay balanced across sources rather than filling one source first
- slot reservation occurs as soon as the spawn starts building the creep
- each spawned shuttle keeps its assigned source and source-side slot until death

Worker priority in this phase is:
1. harvest assigned source
2. fill spawn
3. upgrade controller if spawn is already full

This model intentionally uses only one body template in the opening phase. The room does not introduce separate harvesters, haulers, or builders while the room is still in the capped RCL1 bootstrap window.

### Phase 2: RCL2 Extension Buildout

When the controller reaches RCL2, the room enters the extension buildout phase.

Buildout rules:
- the hard cap of four workers is removed
- the spawn planner creates another WCMM worker whenever the room has 250 available energy
- the room process ensures exactly one extension construction site exists at a time
- extension construction becomes the top priority for bootstrap labor

Worker classification in this phase depends on source-slot availability:
- if an unclaimed source slot exists, the new WCMM becomes a shuttle and receives a fixed source-plus-slot assignment
- if all source slots are already claimed, the new WCMM becomes an overflow build hauler

Shuttles remain capable of harvesting from their assigned source. Overflow build haulers do not own a harvesting slot and instead participate in extension construction by requesting energy from delivery-state shuttles.

### Phase 3: Bootstrap Exit Charge

Once the fifth extension is completed, the room stops discretionary bootstrap work and charges the entire spawn-service envelope.

In this phase:
- all bootstrap workers prioritize filling spawn and extensions
- upgrading and extension building are suppressed
- bootstrap mode remains active until the room is fully charged to the 550-energy envelope

The purpose of this phase is to ensure the room does not claim bootstrap completion before it can actually exercise the structural spawn capacity it just built.

### Phase 4: Local Stationary Transition

Once the RCL2 five-extension envelope is both built and full, the room leaves shuttle bootstrap and transitions into local source hardening.

Transition rules:
- spawn one full-power stationary miner for each local source
- each stationary miner takes ownership of a single source and remains the dedicated extractor for that source
- remaining workers are split evenly between the two local sources as bootstrap builders
- source bootstrap builders prioritize container construction first, then roads

Until a source container exists, stationary miners drop harvested energy and builders pick it up. After the container exists, builders consume from the container instead of self-harvesting.

## Contracts And Persistent State

The bootstrap redesign requires four room-local state groups.

### 1. Spatial Cache

Owned by the room mapper:
- discovered local source ids
- per-source walkable slot coordinates
- per-source spawn-to-source distance
- optional future container or road anchor positions

This state changes only when the room is first scanned or when topology must be invalidated.

### 2. Bootstrap Labor State

Owned by the room-local bootstrap controller:
- current bootstrap phase
- active extension construction intent
- whether five extensions have been built
- whether spawn plus five extensions are fully charged
- stationary transition progress

This prevents the room from inferring bootstrap state from scattered room observations each tick.

### 3. Assignment And Logistics State

Owned by the logistics coordinator:
- claimed source slots keyed by source and coordinate
- pending spawn claims reserved at spawn start
- per-creep assignment records containing:
  - assigned source id
  - assigned slot, if any
  - assignment class
  - current delivery or fetch mode
- active fetch requests from empty overflow build haulers
- temporary shuttle reroute targets for direct handoff

The authoritative coordination state remains room-local even if creeps also carry minimal runtime fields in their own memory.

### 4. Spawn Intent State

Owned by the spawn planner:
- current room-local labor request
- requested assignment class
- target source id
- reserved slot if applicable
- selected body template
- handshake status between spawn planning and logistics reservation

The design does not require a generic job queue. A single active room-local spawn intent is sufficient for the bootstrap phase.

## Decision Loop And Priority Rules

Each room tick should run the bootstrap controller in a fixed order.

### 1. Refresh Room Facts

The room process:
- discovers local sources
- initializes or refreshes slot caches if missing
- recomputes source staffing counts from live assignments plus pending spawn claims
- identifies the active bootstrap phase

### 2. Maintain Construction Intent

Construction management is serialized.

Rules:
- no extension site is queued during the RCL1 capped shuttle phase
- during the RCL2 extension buildout phase, exactly one extension construction site exists at a time
- if the active extension finishes and fewer than five extensions exist, the next single site is created
- during the local stationary transition, each source queues container work before road work

### 3. Generate Spawn Intent

RCL1 rules:
- if total live and pending shuttle workers is below four, request one WCMM shuttle
- target the least-staffed source
- reserve the first unclaimed slot for that source as soon as spawn starts

RCL2 extension buildout rules:
- if room energy reaches 250, request another WCMM worker
- if any source slot remains unclaimed, the worker spawns as a shuttle
- otherwise the worker spawns as an overflow build hauler

Local stationary transition rules:
- first ensure one stationary miner is spawned per local source
- then direct remaining and newly spawned labor into source-assigned bootstrap builders split evenly across the two local sources

### 4. Execute Worker Priorities By Assignment Class

#### Shuttle Worker

When empty:
- move to assigned slot
- harvest assigned source

When full:
- during RCL1, fill spawn first and upgrade only if spawn is already full
- during RCL2 extension buildout, satisfy an assigned reroute for an active fetch request first, then build the queued extension site if no fetch request is active
- during bootstrap exit charge, fill spawn and extensions only

If no overflow build hauler is currently requesting energy during RCL2 buildout, shuttles may build the active extension site directly.

#### Overflow Build Hauler

When empty:
- broadcast a fetch request
- wait for logistics to match the hauler with the nearest delivery-state shuttle
- receive energy through direct handoff or pickup if transfer is represented as dropped energy

When carrying energy:
- build the active extension construction site
- if no extension site exists and the room is still inside late bootstrap, fill room energy sinks as a fallback

#### Stationary Miner

Behavior:
- move to the assigned prime mining tile
- harvest continuously
- drop energy until the source container exists
- mine into the container once it is complete

#### Bootstrap Builder In Stationary Transition

When empty:
- withdraw from the source container if present
- otherwise pick up dropped energy produced by that source's stationary miner

When carrying energy:
- build that source's container first
- after container completion, build roads for that source

Bootstrap builders in this phase do not self-harvest while stationary miners remain active.

### 5. Resolve Logistics Handshakes

Direct handoff rules:
- empty overflow build haulers emit fetch requests
- logistics scans local bootstrap workers and matches the request to the nearest shuttle currently in a delivery state
- the matched shuttle receives a temporary reroute target for the handoff
- once transfer succeeds or the request is canceled, the reroute is cleared

Slot claim rules:
- slot claims are created at spawn start
- slot claims are released on spawn cancellation or creep death
- slot claims do not move during normal operation because shuttle assignments remain fixed until death

## Failure Handling

The bootstrap controller must remain simple but must not wedge itself under ordinary failures.

Required behaviors:
- if a reserved slot becomes unavailable before spawn completes, logistics selects the next unclaimed slot for the same source if possible
- if the spawn is interrupted or canceled, any pending slot claim is released immediately
- if a creep dies, its assignment record and slot claim are released on the next room tick
- if a shuttle dies while matched to an overflow build hauler fetch request, cleanup must also clear the associated shuttle reroute and reset that overflow build hauler to unresolved fetch-request state
- if that dead shuttle leaves a source slot hole, the economy selector should treat the newly open slot as replacement demand and request another source-assigned shuttle according to the active bootstrap phase rules
- if an overflow build hauler has an unresolved fetch request, it remains pending rather than improvising unrelated work
- if the active extension site disappears unexpectedly, the room recreates a single replacement site on the next tick
- during the bootstrap exit charge phase, nonessential work remains suppressed until the full 550-energy envelope is charged
- during the stationary transition, builders never revert to self-harvesting while stationary miners for their sources are alive

## CPU Bounds

This design is intentionally permissive for bootstrap-only behaviors that would be too expensive later, but it still keeps core work bounded.

Required bounds:
- source discovery and slot caching are memoized rather than recomputed every tick
- spawn-to-source distance is cached once per source unless invalidated
- staffing counts are derived from assignment records and pending claims instead of broad repeated inference
- fetch matching scans only the local bootstrap workforce
- extension construction remains serialized to one site at a time

The fetch-request model is acceptable here specifically because the room is still in a low-scale bootstrap phase.

## Verification Strategy

Validation should focus on model, policy, and process behavior.

### Model Coverage

Add or extend tests for:
- bootstrap phase state transitions
- room-local assignment records
- source slot claim persistence and release
- fetch request and reroute record shapes

### Policy Coverage

Add or extend tests for:
- least-staffed source selection during RCL1
- immediate slot reservation when spawn starts
- RCL1 cap of four workers
- RCL2 uncapped WCMM spawning
- overflow build-hauler selection when all slots are claimed
- bootstrap exit requiring RCL2 plus five built extensions plus a full 550-energy envelope
- stationary-miner-first ordering after bootstrap exit

### Process Coverage

Add or extend tests for:
- single active extension construction site creation
- fetch-request to shuttle-reroute matching
- slot release on creep death and spawn cancellation
- dead-rerouted-shuttle cleanup that clears both the source slot claim and the overflow hauler reroute state
- replacement demand generation when shuttle death reopens a claimed source slot
- shuttle fallback to direct building when no overflow fetch request exists
- bootstrap builders picking up dropped energy before container completion
- container-first then roads sequencing during local stationary transition

## Implementation Guidance

Implement this as a room-local bootstrap subsystem inside the existing room economy process.

Guidelines:
- add explicit room-local contracts and memory first
- keep the runtime behavior phase-local and explicit rather than relying on generic worker heuristics
- avoid broadening the implementation into a generic job system or colony-wide planner
- preserve the architectural option to split room mapper, economy selector, spawn planner, and logistics coordinator into standalone processes later if the kernel grows into that shape

## Relationship To Existing Early-RCL Design

This design refines the previously approved early-RCL source commissioning model rather than replacing its broader direction.

The specific change is that bootstrap is now more detailed and lasts longer than the earlier high-level design implied. The room does not transition out of bootstrap merely because the five-extension envelope exists. It remains in bootstrap through:
- the capped RCL1 shuttle phase
- the uncapped RCL2 extension buildout phase
- the full-envelope charging phase

Only after the five-extension envelope is both complete and fully charged does the room begin the local stationary-miner and bootstrap-builder handoff that leads into source hardening.