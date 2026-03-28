# Architecture Overview

Project Imperium is intended to evolve into an OS-style Screeps AI with a strong separation between execution control, platform services, domain state, and concrete game behavior.

The initial scaffold keeps the architecture explicit without prematurely building complex frameworks.

## Core Intent

The architecture is designed around four assumptions:

1. CPU is the primary hard constraint.
2. Rooms should become semi-autonomous execution domains.
3. Empire-level coordination should sit above room-local control, not replace it.
4. The kernel should decide what runs each tick and what budget each process receives.

## Layer Definitions

### Kernel

The kernel owns the top-level loop behavior:

- bootstrap and runtime initialization
- scheduler orchestration
- CPU budgeting and governor rules
- per-process and per-room budget issuance
- process registry contracts
- profiling and runtime visibility

This is where the system answers: what can afford to run this tick?

### Platform

The platform layer wraps raw APIs and low-level technical services:

- memory access patterns
- cache helpers
- logging adapters
- pathing wrappers
- serialization helpers

This isolates environment concerns from decision-making logic.

### Domain

The domain layer models Screeps state in terms relevant to the bot:

- room state
- economy state
- spawn state
- creep state
- defense state
- intel state

This is where raw game objects should gradually be translated into bot-oriented state views.

### Processes

Processes are long-lived execution units scheduled by the kernel. Early expected examples:

- room process
- spawn process
- creep process
- empire process

A process should have a clear scope, stable identity, and bounded runtime expectations. Processes own execution within that scope, but their priority and budget still come from kernel scheduling decisions.

### Policies

Policies encapsulate decision rules without owning execution themselves. Expected areas include:

- CPU policy
- spawn policy
- economy policy
- defense policy

This makes strategic decisions easier to tune without entangling them with scheduling concerns. Policies decide thresholds, priorities, and preferences; they do not become hidden schedulers.

### Tasks

Tasks are concrete units of creep work such as:

- harvest
- haul
- build
- upgrade

They should remain small and composable rather than growing into a giant monolithic role system. The task layer is the concrete workload substrate that spawning and workforce policies should consume.

### Model

The model layer centralizes shared contracts:

- ids
- memory schema
- process contracts
- task contracts
- common typed records

This is the backbone that keeps cross-layer communication explicit.

## CPU-Aware Scheduling Rationale

Project Imperium targets a 20 CPU baseline on Shard 3. That means the architecture cannot assume every desired subsystem runs fully every tick.

The scheduler should be able to:

- prioritize essential work
- defer lower-value work when under pressure
- take advantage of bucket burst capacity when available
- measure execution cost over time

Under pressure, the system should degrade explicitly:

- essential work continues first
- nonessential work is deferred
- rooms may operate in reduced-service modes when the kernel issues smaller budgets

In practice, this means the kernel must think in terms of service degradation and bounded work queues, not just happy-path execution.

## Semi-Autonomous Rooms

Rooms are intended to become semi-autonomous execution domains.

Rooms are semi-autonomous in decision scope, but not sovereign over tick scheduling. The kernel remains the sole authority over when and how much room work executes.

That implies:

- room-local state should be understandable in isolation
- room processes should be able to make many decisions without empire-wide coordination
- room processes should sequence bounded local work inside kernel-issued budgets rather than running an independent scheduler
- empire logic should provide direction, arbitration, and resource routing where needed
- rooms should report backlog, degraded mode, and unmet demand upward when budgets are insufficient
- failures in one room should not destabilize the whole bot

This approach should make the system easier to scale, profile, and recover after resets.

## Current State

The current repository only implements a minimal kernel skeleton, typed memory root, and placeholder layer entrypoints. The goal of this phase is architectural clarity, not game capability.
