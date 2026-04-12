# Project Imperium Early RCL Source Commissioning Design

**Date:** 2026-04-12

## Goal

Define the early-room operating model for Project Imperium from RCL 1 through RCL 3 using an explicit source commissioning pipeline instead of a generic worker economy.

The design must support:
- aggressive early progression without overcommitting to fragile steady-state assumptions
- stationary mining as soon as the room can legally spawn the required miner bodies
- serialized remote expansion beginning during RCL 2 after local source hardening
- graceful backward transitions when structural capacity, workforce, route viability, or security collapse
- bounded CPU behavior using cached policy state, cheap invalidation checks, and scheduled reevaluation

## Scope

This design defines the room-local policy and state model for early source activation and recovery.

In scope:
- RCL 1 through RCL 3 room operating phases
- the commissioning lifecycle for local and remote sources
- source admission, demotion, hysteresis, and recovery rules
- the unit contracts for bootstrap builders, stationary miners, route haulers, and fallback general labor
- the room policy order that arbitrates survival, commissioning, and controller progression
- source and room memory-model requirements for the architecture
- implementation constraints that materially affect runtime correctness and CPU cost

Out of scope:
- exact creep body templates and spawn math formulas
- military response policy beyond remote suspension inputs
- multi-room empire coordination beyond room-local remote source selection
- storage, links, terminals, or post-RCL-3 economy design
- code implementation details below the architecture and contract level

## Problem Statement

Project Imperium needs an early-game economy model that is more explicit than a generic worker loop and more resilient than a one-way bootstrap sequence.

The room should not treat a source as "active" merely because a creep can stand near it. Instead, a source should become operational through a staged commissioning sequence with explicit infrastructure and logistics handoffs. That sequence must work for local and remote sources, must begin remote expansion early enough to avoid wasting available source income, and must remain compatible with the repository's kernel-first, CPU-bounded architecture.

The design must also recover cleanly from loss. If a room loses extensions, route safety, or workforce, the source model cannot remain stuck waiting for bodies or logistics assumptions that are no longer legal. The same state machine that promotes a source into operation must also demote it back into degraded or suspended states when the room's structural envelope collapses.

## Design Overview

Project Imperium will use a staged source commissioning model for RCL 1 through RCL 3.

At RCL 1, the room operates in pure bootstrap mode using general room labor to keep spawn service alive and push the controller. At RCL 2, the room does not immediately pivot into remote play. Instead, it first completes all five extensions to unlock a 550-energy structural spawn envelope. That envelope is the first moment when the room can legally spawn the initial 5 WORK stationary miners needed for pinned source operation.

Once all five RCL 2 extensions are complete, the room fully commissions its local sources before expanding outward. Each source moves through explicit states: candidate, container setup, stationary activation, road completion, and logistics registration. Only once both local sources are fully active does the room begin remote expansion, and that expansion is serialized one source at a time using nearest-source-first path distance rather than room-first scoring.

At RCL 3, the room keeps the same commissioning model while adding tower energy as a routine local service obligation. Remote work remains defeasible before local continuity. The architecture is intentionally bidirectional: a room can commission forward into stationary and logistics-active operation, or degrade backward into fallback local labor and remote suspension when structural assumptions stop being true.

## Room Operating Model

### Phase 1: Bootstrap To RCL 2 Envelope

At RCL 1 and early RCL 2, the room operates with general labor only.

The room policy priorities are:
- keep spawn and extension service alive
- maintain enough harvest flow to avoid economic stall
- spend remaining labor on controller progression and extension completion

No source is allowed to assume stationary operation that depends on a body the room cannot legally reproduce. The full RCL 2 extension buildout is therefore a hard gate for the first 5 WORK stationary miners.

### Phase 2: Local Source Hardening

Once all five initial extensions are built, the room transitions into local source hardening.

Both home-room sources are commissioned before any remote source work begins. Each local source must reach fully active status before the room treats it as a logistics stop.

This phase exists to:
- pin local extraction to explicit stationary miners
- establish source containers
- build reliable roads from source to the room's logistics path
- convert local upkeep from general builder debt into normal route servicing

### Phase 3: Serialized Remote Expansion During RCL 2-RCL 3 Push

After both local sources are fully active, the room opens remote expansion while continuing to push the controller toward RCL 3.

Remote selection is source-first and distance-first. The room targets the nearest viable remote source by path cost, not the richest remote room as a whole. A nearby single-source opportunity outranks a farther two-source room if it is faster to integrate.

Only one remote source is commissioned at a time in the initial design. The state machine must preserve enough structure that future parallel commissioning can be added later without redesigning the lifecycle.

### Phase 4: RCL 3 Service Stabilization

At RCL 3, the room adds tower fueling to the local survival floor.

The room still preserves the same arbitration order:
- local survival and recovery
- in-flight local source completion
- serialized remote commissioning
- controller progression and discretionary work

Remote work remains the first expandable tier to shed under pressure.

## Source Commissioning Lifecycle

Each source, local or remote, is represented as an explicit operational node that moves through a staged lifecycle.

### States

- `bootstrap-candidate`: source identified but not yet assigned commissioning labor
- `container-bootstrap`: bootstrap builders are establishing the source container
- `stationary-online`: a stationary miner has taken ownership of the mining position and is feeding the container
- `road-bootstrap`: bootstrap builders are drawing from the live container to build roads back toward the room's logistics spine
- `logistics-active`: the source is a registered logistics stop with steady-state hauling and upkeep
- `degraded-local`: source remains part of the local survival floor but must be served by fallback general labor rather than its preferred stationary-plus-logistics model
- `suspended`: source is intentionally out of service because the room cannot currently support or justify it

### Forward Activation Flow

The commissioning path is:
- select source as `bootstrap-candidate`
- assign up to three bootstrap builders based on walkable access around the source
- enter `container-bootstrap` while builders mine locally and complete the container
- spawn and attach the stationary miner once the structural envelope supports the planned miner body and the source container is live
- enter `stationary-online` when the miner owns the prime tile and continuous harvest can feed the container
- retask bootstrap builders to consume from the container and build the road segment back toward the room logistics path
- enter `road-bootstrap` until the road network is complete
- register the source as a logistics stop and enter `logistics-active`

### Backward Recovery Flow

The lifecycle is intentionally reversible.

When structural capacity, infrastructure, workforce, or route viability collapse, the room may demote a source:
- `logistics-active` to `degraded-local` for local sources that still belong to the room survival floor
- `logistics-active` to `suspended` for remote sources that are currently expandable rather than essential
- `stationary-online` to `degraded-local` or `suspended` when the miner contract is no longer structurally legal
- any commissioning state back to `bootstrap-candidate` or `suspended` when setup fails and must later restart cleanly

This allows the room to recover from hostile disruption, extension loss, workforce collapse, or route invalidation without getting stuck waiting for no-longer-legal assumptions.

## Admission, Demotion, And Hysteresis Rules

### Structural Versus Transient Triggers

Source-state validity must distinguish between structural invalidation and transient turbulence.

Structural triggers may cause immediate demotion because they invalidate the plan itself. Examples:
- `Room.energyCapacityAvailable` drops below the required body envelope for the current miner or commissioning plan
- the source container is destroyed or never completed
- the prime mining tile becomes unusable for the assigned operating mode
- the road or route plan becomes strategically invalid for a sustained reason
- the room loses the ownership or security assumptions required for the current operating mode

Transient triggers do not demote on first sight. Examples:
- `Room.energyAvailable` dips because spawning just spent energy
- a short-lived haul miss or delayed refill cycle occurs
- a single hostile scout appears briefly in the remote room
- a creep dies while an eligible replacement is already pending
- temporary movement congestion delays normal path usage

Transient triggers raise pressure markers rather than flipping source state immediately.

### Health Record And Debounce Fields

Each source record must include a small health record rather than binary validity flags.

Minimum fields:
- last structurally valid tick
- last serviced tick
- route-risk score
- hostile-presence streak
- logistics-starvation streak
- pending-replacement flag
- reactivation cooldown-until tick

These fields provide hysteresis so the room does not thrash between active and degraded modes because of short-lived disturbances.

### Demotion Rules

Local sources demote only when the room can no longer legally sustain their assigned operating mode or when service failure persists beyond a grace window.

Remote sources demote more aggressively than local sources, but still with debounce logic. A brief scout sighting increases route risk but does not suspend the source immediately. Suspension requires either:
- structural invalidation
- sustained hostile or route risk over the configured debounce window
- repeated service failure beyond the acceptable streak threshold

### Reactivation Rules

Reactivation also uses hysteresis.

A suspended source cannot reactivate the instant the triggering condition disappears. It must:
- clear the configured cooldown
- pass the current structural validity checks
- show stable route or security conditions over the recovery window

This avoids repeated spawn-abandon loops for remotes under noisy but temporary disruption.

### Evaluation Cadence

Strategic source validation must not perform full recomputation every tick.

The model uses two layers:
- cheap per-tick execution that consumes cached source state and updates lightweight pressure counters
- bounded strategic reevaluation on modulus cadence or on cheap property-diff invalidation

Recommended shape:
- structural envelope and room capability review every 10 ticks, plus immediately when a cached cheap property diff detects a structural change
- active remote route and hostile-risk review every 5 to 10 ticks depending on the room pressure posture
- commissioning progress checks at the room policy cadence rather than full rescans of all room structures each tick

In Screeps, so-called event-driven invalidation still relies on polling. That means all immediate invalidation paths must be based on O(1) property diffs or cached record comparisons rather than repeated expensive searches.

Good examples:
- comparing `room.energyCapacityAvailable` against a cached prior value
- comparing cached controller level or source-state prerequisites against current scalar values

Bad examples:
- repeatedly running broad structure searches every tick just to discover missing extensions
- rescanning all roads or containers every tick to infer whether a commissioning record might be stale

## Unit Contracts

### Bootstrap Builders

Bootstrap builders exist only to commission a source.

Their contract is:
- travel to the target source
- harvest locally when necessary to establish initial build energy
- place and complete the source container
- yield the prime mining tile once the stationary miner is imminent or the container is live
- draw from the completed container to build roads back toward the room logistics spine

The room may assign up to three bootstrap builders based on walkable source access.

They are finite setup labor only. Once the road network is complete, they return to the general room labor pool.

### Prime Tile Yield Invariant

Source commissioning must reserve the prime mining tile.

When the container is live or the stationary miner is incoming, bootstrap builders must path around the designated mining position so the miner can take ownership immediately. Road completion work is not allowed to block miner activation.

### Stationary Miners

Stationary miners exist only for commissioned-source extraction.

Their contract is:
- occupy the designated mining position
- harvest continuously
- deposit into the source container

The room only admits stationary operation if the current structural spawn envelope can legally reproduce the assigned miner body. If that envelope collapses, the source plan is invalidated and the source demotes.

### Route Haulers

Route haulers exist to move energy and maintain the route they already consume.

Their contract is:
- service registered logistics stops
- move energy along the assigned route
- use a single WORK part to maintain roads and containers encountered on that route

Steady-state road and container upkeep belongs to these haulers rather than to persistent source-side builders.

### Transit Bleed Requirement

Because route haulers spend part of their carried energy payload on road and container upkeep, hauled energy is not equal to delivered energy.

The room's economy and logistics math must therefore size hauling throughput against net delivered energy after expected maintenance bleed, especially for long remotes. Otherwise the room will under-size hauler demand and silently starve sinks despite nominally sufficient pickup throughput.

### General Room Labor

General room labor is the fallback recovery substrate.

At RCL 1 and in degraded-local states, these units keep spawn service alive, rebuild lost extensions, and push the controller until the room regains the structural envelope needed for stationary operation.

Generalists are not the preferred steady-state economy, but they are the correct survival mode when the commissioning model is temporarily unaffordable.

## Policy Arbitration Order

Room policy must arbitrate early-game work in a fixed order:
- local survival and rebuild
- completion of in-flight local source commissioning
- serialized remote source commissioning
- controller progression and other discretionary work

Once RCL 3 is reached, tower fueling becomes part of the local survival floor rather than discretionary spend.

Remote work is always defeasible before local recovery.

## Memory Model And Process Boundaries

### Room Record

The room process owns the top-level operating posture and cheap invalidation inputs.

Its room-scoped record should cache:
- current operating phase
- last known structural spawn envelope
- whether all five RCL 2 extensions are complete
- whether local source hardening is complete
- the currently active commissioning slot, if any
- local recovery mode
- cheap property-diff fields used for immediate structural invalidation

### Source Record

Each source gets its own explicit room-local record.

Minimum contents:
- source identity
- local or remote classification
- commissioning state
- designated mining tile
- container position
- road target or logistics spine anchor
- assigned unit intents or reservations
- health record with streaks, cooldowns, and last-valid timestamps
- required structural envelope for the current miner plan
- route throughput assumptions, including expected maintenance bleed

### Logistics Stop Record

Logistics stops are explicit derived operational nodes, not implied merely by the existence of a container.

A source becomes a logistics stop only after road completion and state promotion to `logistics-active`.

### Process Ownership

The room process remains the orchestrator for early commissioning.

It:
- evaluates source records on the bounded review cadence
- updates source state using cheap invalidation and hysteresis rules
- emits demand to narrower systems such as spawning and logistics

Future spawn or logistics processes may consume these records, but they do not own source truth. Source truth belongs to room-scoped policy and model records, which preserves the repository's separation between kernel scheduling, domain state, policies, and shared model contracts.

## Failure And Recovery Expectations

The design must handle at least these failure modes explicitly:
- extension loss that collapses the structural spawn envelope below the assigned stationary miner body cost
- local workforce loss that forces local sources back into fallback service
- hostile disruption that suspends a remote only after debounce rather than on first contact
- route churn or upkeep debt that lowers delivered throughput below planned service commitments
- builder pathing mistakes that block the stationary miner from taking the prime tile

In all of these cases, the room should degrade using the same commissioning state machine rather than through special-case disaster logic.

## Testing And Validation Intent

Implementation should validate the architecture with targeted scenario tests and simulation-style checks rather than relying only on happy-path live play.

Minimum scenarios to validate:
- RCL 1 to RCL 2 progression into the first legal 5 WORK stationary miner
- local source commissioning completion for both home sources
- first remote source activation after local hardening
- extension destruction that drops the room from a 550-plus envelope back to 300 and forces demotion into fallback labor
- brief hostile sighting that does not suspend a remote because hysteresis absorbs it
- sustained hostile or route failure that does suspend the remote and later reactivates it only after cooldown and renewed stability
- hauling throughput checks that account for road and container upkeep bleed on long routes

## Open Implementation Constraints

The final implementation must preserve these architectural constraints:
- source-state validity must be derived from structural capability, not remembered optimism
- event-like invalidation must come from cheap property diffs and cached scalar checks, not expensive per-tick rescans
- commissioning remains serialized by default, but the state model must not block future parallel source activation
- stationary mining cannot be activated if bootstrap labor still occupies the prime mining tile
- route-hauler throughput calculations must use net delivered energy rather than gross extracted energy

## Recommendation

Use this design as the baseline early-game economy model for Project Imperium.

It preserves aggressive RCL 1 through RCL 3 progression, enables early remote expansion without collapsing local continuity, and gives the room a reversible operating model that can degrade and recover under real Screeps pressure without wasting CPU on broad rescans or state thrash.