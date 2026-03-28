# Predecessor Findings

This document captures design inputs from predecessor Screeps bots without turning them into unexamined architectural commitments.

Each finding should be treated as one of three categories:

- accepted: compatible with current Project Imperium goals and current Screeps assumptions
- rejected: useful historical context, but not a direction to copy
- unresolved: interesting, but needs more validation before it shapes the architecture

## Overmind

Scope reviewed:

- colony and room-local ownership patterns
- directive and task-oriented decomposition
- profiling and observability emphasis

Accepted:

- strong observability and profiling infrastructure
- room-local ownership with empire-level arbitration layered above it
- explicit workload decomposition instead of giant all-purpose room logic

Rejected:

- adopting predecessor abstractions directly without remapping them onto Imperium's existing layers

Unresolved:

- how much of the directive-style control flow still maps cleanly onto current Screeps constraints without creating overlap between policies and processes

Version-sensitive assumptions to watch:

- any mechanics or runtime behavior inferred from older Screeps versions must be revalidated before adoption

## TooAngel

Scope reviewed:

- operational resilience under failure states
- spawn prioritization and recovery behavior
- logistics and maintenance practices

Accepted:

- explicit recovery routines instead of assuming happy-path room operation
- priority-driven spawning behavior
- heavy attention to maintenance, traps, and failure detection as operational concerns

Rejected:

- letting feature growth harden into a role-heavy structure before task demand and logistics contracts are stable

Unresolved:

- which detailed maintenance or tactical behaviors are worth reproducing before the core runtime contracts are mature

Version-sensitive assumptions to watch:

- pathing, spawning, or combat heuristics that depend on older game expectations rather than current observed behavior

## Hivemind

Scope reviewed:

- full-automation posture
- configurable operational boundaries
- modern TypeScript-era repository structure

Accepted:

- keeping automation scope explicit instead of letting implicit behavior sprawl across the bot
- treating configuration and policy boundaries as first-class design concerns

Rejected:

- assuming a broad automation surface is valuable before kernel scheduling, memory contracts, and room runtime boundaries are proven

Unresolved:

- which specific configuration surfaces should exist early versus which should wait until runtime costs are measurable

Version-sensitive assumptions to watch:

- any feature assumptions that are documented at a product level but not traced back to current engine behavior

## Imperium Synthesis

Accepted patterns for Project Imperium:

- kernel-owned scheduling and explicit CPU budgeting
- room-local ownership with empire-level coordination above it
- strong observability, profiling, and degraded-mode thinking
- explicit task and logistics contracts before role expansion
- typed memory and process contracts that make evolution deliberate

Rejected patterns for Project Imperium:

- monolithic role hierarchies as the primary behavior model
- undocumented scheduling behavior or hidden execution ownership
- feature-heavy abstraction growth before runtime validation exists
- importing predecessor bot assumptions without a compatibility filter

Watch later:

- richer directive-style orchestration if it can be mapped cleanly onto the existing process and policy layers
- broader automation configuration once kernel costs and room execution patterns are measurable
- advanced maintenance or tactical routines after the recovery and defense foundations are in place