# Project Imperium

Project Imperium is a fresh-start Screeps AI workspace intended to grow into an OS-style bot architecture rather than a feature-complete script pile.

The design target is Shard 3 with a constrained 20 CPU baseline and opportunistic use of bucket burst capacity. The initial repository is intentionally light on game logic and heavy on structure so future work can be added without fighting early architectural debt.

## Current Scope

This scaffold includes:

- a TypeScript Screeps project skeleton
- a minimal runnable entrypoint that exports `loop`
- a kernel-oriented folder layout
- typed root memory scaffolding
- linting and formatting configuration
- build and deploy placeholders
- architecture and roadmap documentation

It does not yet include advanced room logic, role systems, economy logic, combat logic, or empire coordination.

## Architecture Direction

Project Imperium is organized around these layers:

- `kernel`: main loop, scheduler, CPU governor, process contracts, profiling/logging entrypoints
- `platform`: wrappers around raw Screeps APIs such as memory, caching, logging, and utilities
- `domain`: room and empire state models such as economy, spawning, creeps, defense, and intel
- `processes`: long-lived execution units such as room, spawn, creep, and empire processes
- `policies`: decision policies for CPU, defense, spawning, and economy
- `tasks`: concrete creep work packages such as harvest, haul, build, and upgrade
- `model`: shared types, ids, contracts, and memory schema definitions
- `utils`: low-level generic helpers that do not belong to game-specific layers

## Getting Started

### Install

```bash
npm install
```

### Build

```bash
npm run build
```

### Type-check

```bash
npm run typecheck
```

### Lint

```bash
npm run lint
```

### Format

```bash
npm run format
```

### Deploy Placeholder

```bash
npm run deploy
```

The current deploy script is a placeholder only. It prints expected integration points but does not upload code.

## Screeps Configuration

Use these templates as the starting point for deployment configuration:

- `.env.example`
- `.screeps.example.json`

Recommended initial target:

- server: official Screeps server
- shard: `shard3`
- branch: your development branch

Do not commit live credentials.

## Extending The Architecture

The intended flow for future work is:

1. stabilize kernel scheduling and CPU accounting
2. define the memory schema and process contracts more deeply
3. introduce semi-autonomous room execution domains
4. add spawning, task execution, economy, and defense in phases
5. layer empire coordination on top of room-local autonomy

Start with [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the system model and [docs/DEV_PLAN.md](docs/DEV_PLAN.md) for the phased roadmap.
