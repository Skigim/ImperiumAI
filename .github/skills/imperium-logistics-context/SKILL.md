---
name: imperium-logistics-context
description: Use when designing hauling topology, transport routing, salvage flow, source collection, or storage, link, and terminal energy movement for Project Imperium.
---

# Imperium Logistics Context

## Overview

Logistics in Project Imperium defines how resources physically move from supply surfaces to demand surfaces with bounded CPU and explicit degradation behavior.

**Core principle:** Logistics owns transport execution assumptions and routing patterns. It does not set reserve bands, service-level policy, or economy-phase intent on its own.

## When to Use

Use this skill when work involves:
- source-to-sink transport design
- hauling topology
- salvage pickup and recovery routing
- source collection layout
- container, storage, link, or terminal movement assumptions
- movement-cost or path-reuse considerations that affect hauling viability

Do not use this skill by itself when the task is about:
- reserve bands
- controller upgrade pressure
- room service targets
- economy phase changes
- recovery policy priorities

**REQUIRED COMPANION SKILL:** Before answering any question about what logistics should prioritize, how service should degrade, or whether a routing choice matches room goals, you MUST load `imperium-economy-context` first. Do not infer reserve bands or service targets from room state alone.

## Core Rules

- Logistics must keep source, transfer path, and sink ownership explicit.
- Prefer bounded, auditable movement work over implicit full-room hauling behavior.
- Treat salvage as a valid supply surface when it meaningfully reduces waste or recovery time.
- Movement assumptions are part of logistics design because path reuse and route churn materially affect CPU cost.
- Every logistics pattern must define how service degrades under workforce shortage or CPU pressure.

## Verified Constraints

- Energy can be collected through harvest, pickup, and withdraw depending on the source surface.
- `pickup`, `withdraw`, and `transfer` all rely on adjacent-range execution and have different valid targets.
- Containers are walkable and automatically absorb dropped resources on their tile.
- Links unlock at RCL 5, hold 800 energy, lose 3 percent on transfer, and incur cooldown based on linear distance.
- Terminals unlock at RCL 6 and transport cost depends on `Game.market.calcTransactionCost`.
- `moveTo` path reuse and pathfinding choices materially affect hauling CPU cost and route stability.

## Supply And Demand Surfaces

- Supply surfaces: source harvest, dropped energy, containers, tombstones, ruins, storage, links, terminals.
- Demand surfaces: spawns, extensions, controller feeders, reserve buffers, storage hubs, and terminal export paths when in scope.

## Topology Patterns

- Bootstrap routing: direct source-to-spawn or source-to-extension movement with minimal state.
- Container-fed routing: stabilize source-side capture before scaling service expectations.
- Storage hub routing: separate ingress, reserve holding, and outgoing service.
- Link-assisted routing: use links for same-room service compression only after economy policy has defined the service commitments they support; do not treat links as a substitute for all hauling.
- Terminal routing: treat terminal flow as higher-order transport only when the room economy is already stable.

## Failure Modes

- stranded energy because pickup and withdraw surfaces are not ranked explicitly
- salvage decay loss because transport work ignores ruins or tombstones during recovery
- sink starvation caused by route churn or low-value detours
- over-hauling because supply and demand priorities are not phase-aware
- routing design that assumes service commitments not yet ratified by economy policy
- pretending routing is solved without checking the economy targets logistics is meant to satisfy

## Quick Reference

- Prerequisite: confirm `imperium-economy-context` has already defined the active reserve and service targets for this room. If policy is missing or changing, load it first.
- First question: what is the active supply surface?
- Second question: what sink must be served first?
- Third question: which routing pattern fits the current room phase?
- Fourth question: what degrades first under CPU or workforce pressure?

## Handoff Expectations

Before relying on this skill, confirm that economy policy has already defined reserve and service expectations for this room. If that is missing or in flux, load `imperium-economy-context` before proceeding.

Before relying on this skill, gather:
- visible source count and collection surfaces
- visible dropped resources, containers, tombstones, and ruins if relevant
- visible storage, links, and terminal state if present
- target sinks that require service
- whether the question is room-local or cross-room