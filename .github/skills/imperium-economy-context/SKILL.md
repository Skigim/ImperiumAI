---
name: imperium-economy-context
description: Use when designing room energy policy, reserve thresholds, recovery rules, spawn-service priorities, or controller upgrade pressure for Project Imperium.
---

# Imperium Economy Context

## Overview

Economy in Project Imperium defines what the room's energy system must achieve: room survival, spawn service, reserve stability, recovery sequencing, and sustainable upgrade pressure.

**Core principle:** Economy owns policy targets and phase intent. It does not own the physical hauling or routing used to satisfy those targets.

## When to Use

Use this skill when work involves:
- room energy policy
- reserve thresholds or reserve bands
- spawn and extension service priorities
- controller upgrade pressure
- workforce-loss recovery policy for when reserves should fund recovery and when survival outranks growth
- deciding economy phase transitions

Do not use this skill by itself when:
- the question requires naming or optimizing physical energy paths
- the question assigns work to containers, links, storage, or terminals as routing components
- the question is about how energy moves rather than what the room must sustain

**REQUIRED COMPANION SKILL:** If any part of the task depends on hauling topology, transport routing, source collection layout, or storage, link, or terminal routing needed to satisfy economy targets, you MUST load `imperium-logistics-context` before proceeding.

## Core Rules

- Economy continuity outranks speculative growth.
- Reserve policy must be explicit rather than implied by current storage contents.
- `Room.energyAvailable` and `Room.energyCapacityAvailable` are the primary room-service surfaces for spawn throughput.
- Upgrade pressure is discretionary when reserve stability or spawn service is not proven.
- Every economy phase must define a degraded mode for CPU pressure, workforce shortage, or post-loss recovery with explicit spawn-service and reserve targets for that degraded mode.

## Policy Versus Routing Boundary

- Economy owns reserve bands, service targets, upgrade pressure, and phase transitions.
- Logistics owns the physical flow that satisfies those targets.
- If the answer requires drawing the path from supply surface to sink, you are in logistics territory and must load `imperium-logistics-context`.
- If the answer decides what energy tier is protected, what service level is mandatory, or when growth pauses, stay in economy context.

## Verified Constraints

- Sources regenerate every 300 ticks.
- Source output depends on room control state: owned or reserved rooms provide 3000 energy per source cycle, while unreserved rooms drop to 1500.
- `Room.energyAvailable` reports current spawn and extension serviceable energy.
- `Room.energyCapacityAvailable` reports the maximum spawn and extension service envelope.
- Controller downgrade pressure is exposed through `StructureController.ticksToDowngrade`.
- Storage becomes available at RCL 4 and materially changes reserve policy options.

## Phase Model

- Bootstrap economy: prioritize survival, spawn service, and extension fill over aggressive upgrading.
- Container economy: stabilize source-side capture and reduce dropped-energy waste before raising upgrade pressure.
- Storage economy: define explicit reserve bands and distinguish buffer energy from spendable energy.
- Link-assisted economy: treat link energy as a service-path optimization, not a replacement for reserve policy.
- Terminal-backed economy: keep terminal use subordinate to room stability unless the task is explicitly empire-scoped.

## Failure Modes

- spawn starvation caused by over-prioritizing controller upgrades
- extension underfill during creep replacement windows
- reserve collapse hidden by transient harvest income
- unstable recovery after workforce loss because survival and growth are not separated
- assuming transport capacity exists without checking logistics support

## Quick Reference

- First question: can the room keep spawns and extensions supplied reliably?
- Second question: what reserve band separates stable spend from emergency buffer?
- Third question: is controller upgrading competing with survival service?
- Fourth question: does the current economy phase have an explicit degraded mode?

## Handoff Expectations

Before relying on this skill, gather:
- room controller level
- current `Room.energyAvailable`
- current `Room.energyCapacityAvailable`
- visible storage, container, link, and terminal state if present
- visible controller downgrade state
- whether the question is room-local or empire-scoped

If the room is not live yet, start with target RCL, assumed ownership state, and acceptable failure tolerance for the policy being designed.

If the room is live and the problem looks like reserve drain rather than missing policy, load `imperium-logistics-context` before assuming economy policy is the root cause.